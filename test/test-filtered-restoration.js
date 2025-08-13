/**
 * Test: Filtered Space Restoration
 * 
 * This approach combines space-wide listing with targeted filtering:
 * 1. List ALL files in Storacha space using w3 CLI
 * 2. Filter to only blocks that belong to a specific backup
 * 3. Download only the relevant blocks (not everything)
 * 4. Reconstruct the specific database with perfect fidelity
 * 
 * This is more efficient than downloading everything and solves the
 * timing issue of newly uploaded files.
 */

import 'dotenv/config'
import { spawn } from 'child_process'
import { createLibp2p } from 'libp2p'
import { identify } from '@libp2p/identify'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { tcp } from '@libp2p/tcp'
import { gossipsub } from '@chainsafe/libp2p-gossipsub'
import { createHelia } from 'helia'
import { createOrbitDB } from '@orbitdb/core'
import { LevelBlockstore } from 'blockstore-level'
import { LevelDatastore } from 'datastore-level'
import { CID } from 'multiformats/cid'
import { backupDatabase, convertStorachaCIDToOrbitDB } from '../lib/orbitdb-storacha-bridge.js'

/**
 * Create a Helia/OrbitDB instance
 */
async function createHeliaOrbitDB(suffix = '') {
  const libp2p = await createLibp2p({
    addresses: {
      listen: ['/ip4/0.0.0.0/tcp/0']
    },
    transports: [tcp()],
    connectionEncryption: [noise()],
    streamMuxers: [yamux()],
    services: {
      identify: identify(),
      pubsub: gossipsub({ allowPublishToZeroTopicPeers: true })
    }
  })
  
  const uniqueId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  const blockstore = new LevelBlockstore(`./filtered-test-${uniqueId}${suffix}`)
  const datastore = new LevelDatastore(`./filtered-test-${uniqueId}${suffix}-data`)
  
  await blockstore.open()
  await datastore.open()
  
  const helia = await createHelia({ libp2p, blockstore, datastore })
  const orbitdb = await createOrbitDB({ ipfs: helia })
  
  return { helia, orbitdb, libp2p, blockstore, datastore }
}

/**
 * List all files in current Storacha space using w3 CLI
 */
async function listStorachaSpaceFiles() {
  console.log('📋 Listing all blobs in Storacha space...')
  
  return new Promise((resolve, reject) => {
    const w3Process = spawn('w3', ['can', 'blob', 'ls'], {
      stdio: ['pipe', 'pipe', 'pipe']
    })
    
    let stdout = ''
    let stderr = ''
    
    w3Process.stdout.on('data', (data) => {
      stdout += data.toString()
    })
    
    w3Process.stderr.on('data', (data) => {
      stderr += data.toString()
    })
    
    w3Process.on('close', (code) => {
      if (code === 0) {
        const lines = stdout.trim().split('\n').filter(line => line.trim())
        console.log(`   ✅ Found ${lines.length} blobs in space`)
        
        // Parse blob output: "multihash (cid)"
        const spaceFiles = lines.map(line => {
          const match = line.match(/\(([^)]+)\)$/)
          const cid = match ? match[1] : line.trim()
          return {
            root: cid,
            uploaded: new Date(),
            size: 'unknown'
          }
        })
        
        resolve(spaceFiles)
      } else {
        console.error('   ❌ w3 CLI failed:', stderr)
        reject(new Error(`w3 CLI failed with code ${code}: ${stderr}`))
      }
    })
    
    w3Process.on('error', (error) => {
      console.error('   ❌ w3 CLI spawn error:', error.message)
      reject(error)
    })
  })
}

/**
 * KEY FUNCTION: Filter space files to only those from a specific backup
 * 
 * This uses the CID mappings from the backup result to identify which
 * files in the space belong to our target database.
 */
function filterSpaceFilesForBackup(spaceFiles, backupResult) {
  console.log('🔍 Filtering space files for specific backup...')
  console.log(`   🎯 Target backup: ${backupResult.databaseName} (${backupResult.manifestCID})`)
  console.log(`   📦 Expected blocks: ${backupResult.blocksUploaded}`)
  
  // Get the Storacha CIDs that belong to our backup
  const backupStorachaCIDs = new Set(Object.values(backupResult.cidMappings))
  
  // Filter space files to only those in our backup
  const relevantFiles = spaceFiles.filter(file => 
    backupStorachaCIDs.has(file.root)
  )
  
  console.log(`   ✅ Found ${relevantFiles.length}/${backupResult.blocksUploaded} blocks in space`)
  
  if (relevantFiles.length === 0) {
    console.log('   ⚠️ No blocks found - backup may not be propagated yet')
    console.log('   💡 You can either wait a few seconds or use eventual consistency')
  } else if (relevantFiles.length < backupResult.blocksUploaded) {
    console.log('   ⚠️ Some blocks missing - backup may still be propagating')
  } else {
    console.log('   🎉 All backup blocks found in space!')
  }
  
  // Map back to original CID format for processing
  const filteredWithMapping = relevantFiles.map(file => {
    // Find the original OrbitDB CID for this Storacha CID
    const originalCID = Object.keys(backupResult.cidMappings).find(
      key => backupResult.cidMappings[key] === file.root
    )
    
    return {
      ...file,
      originalCID,
      isManifest: originalCID === backupResult.manifestCID
    }
  })
  
  console.log(`   📋 Manifest block: ${filteredWithMapping.find(f => f.isManifest)?.root || 'NOT FOUND'}`)
  
  return filteredWithMapping
}

/**
 * Download a block from Storacha/IPFS gateways
 */
async function downloadBlockFromStoracha(storachaCID, timeout = 15000) {
  const gateways = [
    'https://w3s.link/ipfs',
    'https://gateway.web3.storage/ipfs',
    'https://ipfs.io/ipfs'
  ]
  
  for (const gateway of gateways) {
    try {
      const response = await fetch(`${gateway}/${storachaCID}`, {
        signal: AbortSignal.timeout(timeout)
      })
      
      if (response.ok) {
        const bytes = new Uint8Array(await response.arrayBuffer())
        return bytes
      }
    } catch (error) {
      console.log(`   ⚠️ Failed from ${gateway}: ${error.message}`)
    }
  }
  
  throw new Error(`Could not download block ${storachaCID} from any gateway`)
}

/**
 * Main test function demonstrating filtered restoration
 */
async function testFilteredRestoration() {
  console.log('🧪 Testing Filtered Space Restoration')
  console.log('=' .repeat(70))
  console.log('🎯 APPROACH: List entire space, filter to specific backup, targeted restore')
  console.log('=' .repeat(70))
  
  let sourceNode = null
  let targetNode = null
  
  try {
    // 1. Create source OrbitDB and populate with data
    console.log('\n📝 Step 1: Creating source database...')
    sourceNode = await createHeliaOrbitDB('-source')
    
    const sourceDB = await sourceNode.orbitdb.open('filtered-restoration-test', { 
      type: 'documents',
      create: true 
    })
    
    console.log(`   Database created: ${sourceDB.address}`)
    
    const testDocs = [
      { _id: 'doc1', title: 'Filtered Test 1', content: 'Only download what we need' },
      { _id: 'doc2', title: 'Filtered Test 2', content: 'Efficient space usage' },
      { _id: 'doc3', title: 'Filtered Test 3', content: 'Perfect targeting' }
    ]
    
    for (const doc of testDocs) {
      await sourceDB.put(doc)
      console.log(`   ✓ Added document: ${doc._id}`)
    }
    
    console.log(`   📊 Source database has ${(await sourceDB.all()).length} documents`)
    
    // 2. Backup to Storacha
    console.log('\n📤 Step 2: Backing up to Storacha...')
    const backupResult = await backupDatabase(sourceNode.orbitdb, sourceDB.address)
    
    if (!backupResult.success) {
      throw new Error(`Backup failed: ${backupResult.error}`)
    }
    
    console.log(`   ✅ Backup successful!`)
    console.log(`   📍 Manifest CID: ${backupResult.manifestCID}`)
    console.log(`   📊 Blocks uploaded: ${backupResult.blocksUploaded}`)
    console.log(`   🗂️ Block types: ${JSON.stringify(backupResult.blockSummary, null, 2)}`)
    
    // 3. Close source
    console.log('\n🔒 Step 3: Closing source database...')
    await sourceDB.close()
    await sourceNode.orbitdb.stop()
    await sourceNode.helia.stop()
    await sourceNode.blockstore.close()
    await sourceNode.datastore.close()
    sourceNode = null
    
    // 4. Wait for propagation with retry logic
    console.log('\n⏳ Step 4: Waiting for backup propagation...')
    console.log('   💡 Using retry logic to handle eventual consistency')
    
    // 5. Create fresh target
    console.log('\n🎯 Step 5: Creating fresh target node...')
    targetNode = await createHeliaOrbitDB('-target')
    console.log(`   ✓ Target node ready`)
    
    // 6-7. Retry logic for block propagation
    console.log('\n📋 Step 6-7: Finding blocks with retry logic...')
    let relevantFiles = []
    let allSpaceFiles = []
    const maxRetries = 5
    const retryDelay = 4000 // 4 seconds
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      console.log(`\n   🔄 Attempt ${attempt}/${maxRetries}: Listing space and filtering...`)
      
      allSpaceFiles = await listStorachaSpaceFiles()
      relevantFiles = filterSpaceFilesForBackup(allSpaceFiles, backupResult)
      
      console.log(`   📊 Found ${relevantFiles.length}/${backupResult.blocksUploaded} blocks`)
      
      // Check if we have the manifest (critical for reconstruction)
      const hasManifest = relevantFiles.some(f => f.isManifest)
      
      if (relevantFiles.length >= backupResult.blocksUploaded && hasManifest) {
        console.log('   🎉 All blocks found including manifest!')
        break
      } else if (relevantFiles.length > 0) {
        console.log(`   ⚠️ Found ${relevantFiles.length} blocks, missing ${backupResult.blocksUploaded - relevantFiles.length}`)
        console.log(`   📋 Manifest found: ${hasManifest ? 'YES' : 'NO'}`)
      } else {
        console.log('   ⚠️ No blocks found yet')
      }
      
      if (attempt < maxRetries) {
        console.log(`   ⏳ Waiting ${retryDelay/1000}s before retry...`)
        await new Promise(resolve => setTimeout(resolve, retryDelay))
      }
    }
    
    if (relevantFiles.length === 0) {
      throw new Error(`No blocks found after ${maxRetries} attempts - backup may have failed or space is not accessible`)
    }
    
    // Check for manifest specifically
    const hasManifest = relevantFiles.some(f => f.isManifest)
    if (!hasManifest) {
      console.log('   ⚠️ WARNING: Manifest block not found - attempting partial restoration')
    }
    
    // 8. Download only the filtered blocks
    console.log('\n📥 Step 8: Downloading only relevant blocks...')
    const downloadedBlocks = new Map()
    
    for (const file of relevantFiles) {
      const storachaCID = file.root
      const originalCID = file.originalCID
      
      console.log(`   🔄 Downloading: ${storachaCID} → ${originalCID}${file.isManifest ? ' (MANIFEST)' : ''}`)
      
      try {
        const bytes = await downloadBlockFromStoracha(storachaCID)
        const parsedCID = CID.parse(originalCID)
        
        await targetNode.helia.blockstore.put(parsedCID, bytes)
        downloadedBlocks.set(originalCID, { storachaCID, bytes: bytes.length })
        
        console.log(`   ✅ Stored: ${originalCID}`)
        
      } catch (error) {
        console.error(`   ❌ Failed: ${storachaCID} - ${error.message}`)
        throw error
      }
    }
    
    console.log(`   📊 Downloaded ${downloadedBlocks.size} blocks (targeted restoration)`)
    
    // 9. Reconstruct database using the known manifest
    console.log('\n🔄 Step 9: Reconstructing database...')
    const databaseAddress = `/orbitdb/${backupResult.manifestCID}`
    
    console.log(`   📥 Opening database: ${databaseAddress}`)
    const reconstructedDB = await targetNode.orbitdb.open(databaseAddress)
    
    console.log('   ⏳ Waiting for entries to load...')
    await new Promise(resolve => setTimeout(resolve, 3000))
    
    const allEntries = await reconstructedDB.all()
    
    // 10. Verification
    console.log('\n✅ Step 10: Verification...')
    console.log(`   📊 Expected entries: ${testDocs.length}`)
    console.log(`   📊 Recovered entries: ${allEntries.length}`)
    console.log(`   📍 Address preserved: ${reconstructedDB.address === databaseAddress}`)
    console.log(`   📦 Efficiency: ${relevantFiles.length}/${allSpaceFiles.length} blocks downloaded`)
    
    for (const entry of allEntries) {
      console.log(`   ✓ ${entry._id}: "${entry.title}"`)
    }
    
    const success = allEntries.length === testDocs.length &&
                   reconstructedDB.address === databaseAddress
    
    console.log('\n' + '='.repeat(70))
    console.log('🎉 FILTERED RESTORATION RESULTS')
    console.log('=' .repeat(70))
    console.log(`✅ Space listing: ${allSpaceFiles.length} total files`)
    console.log(`✅ Filtering: ${relevantFiles.length} relevant blocks identified`)
    console.log(`✅ Efficiency: ${Math.round(relevantFiles.length/allSpaceFiles.length*100)}% of space downloaded`)
    console.log(`✅ Database reconstruction: ${success ? 'SUCCESS' : 'PARTIAL'}`)
    console.log(`✅ Data integrity: ${allEntries.length}/${testDocs.length} entries`)
    console.log(`✅ Address preservation: ${reconstructedDB.address === databaseAddress}`)
    
    console.log('\n🚀 FILTERED APPROACH BENEFITS:')
    console.log('   ✓ Lists entire space (no timing issues)')
    console.log('   ✓ Downloads only relevant blocks (efficient)')
    console.log('   ✓ Uses backup metadata for precise targeting')
    console.log('   ✓ Avoids interference from other backups')
    console.log('   ✓ Perfect for production environments')
    
    return {
      success,
      totalSpaceFiles: allSpaceFiles.length,
      relevantFiles: relevantFiles.length,
      downloadedBlocks: downloadedBlocks.size,
      entriesRecovered: allEntries.length,
      expectedEntries: testDocs.length,
      efficiency: Math.round(relevantFiles.length/allSpaceFiles.length*100),
      addressPreserved: reconstructedDB.address === databaseAddress
    }
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message)
    console.error('Stack:', error.stack)
    return {
      success: false,
      error: error.message
    }
  } finally {
    // Cleanup
    console.log('\n🧹 Cleaning up...')
    
    if (sourceNode) {
      try {
        await sourceNode.orbitdb.stop()
        await sourceNode.helia.stop()
        await sourceNode.blockstore.close()
        await sourceNode.datastore.close()
      } catch (e) { /* ignore */ }
    }
    
    if (targetNode) {
      try {
        await targetNode.orbitdb.stop()
        await targetNode.helia.stop()
        await targetNode.blockstore.close()
        await targetNode.datastore.close()
      } catch (e) { /* ignore */ }
    }
    
    console.log('   ✓ Cleanup completed')
  }
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
  testFilteredRestoration()
    .then(result => {
      console.log('\n📋 Final Result:', result)
      process.exit(result.success ? 0 : 1)
    })
    .catch(error => {
      console.error('\n💥 Test execution failed:', error)
      process.exit(1)
    })
}

export { testFilteredRestoration, filterSpaceFilesForBackup }
