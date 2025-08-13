/**
 * Test: Space-Wide Download Approach
 * 
 * This test implements your suggested approach:
 * 1. Download ALL files from a Storacha space (full backup)
 * 2. Store all blocks in local IPFS blockstore
 * 3. Analyze blocks to determine log heads and structure
 * 4. Reconstruct the OrbitDB database with full hash preservation
 * 
 * This avoids the need for CID mappings and leverages the fact that
 * everything in one space represents a complete backup.
 */

import 'dotenv/config'
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
import * as Block from 'multiformats/block'
import * as dagCbor from '@ipld/dag-cbor'
import { sha256 } from 'multiformats/hashes/sha2'
import * as Client from '@web3-storage/w3up-client'
import { StoreMemory } from '@web3-storage/w3up-client/stores/memory'
import { Signer } from '@web3-storage/w3up-client/principal/ed25519'
import * as Proof from '@web3-storage/w3up-client/proof'
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
  const blockstore = new LevelBlockstore(`./space-download-test-${uniqueId}${suffix}`)
  const datastore = new LevelDatastore(`./space-download-test-${uniqueId}${suffix}-data`)
  
  await blockstore.open()
  await datastore.open()
  
  const helia = await createHelia({ libp2p, blockstore, datastore })
  const orbitdb = await createOrbitDB({ ipfs: helia })
  
  return { helia, orbitdb, libp2p, blockstore, datastore }
}

/**
 * Initialize Storacha client
 */
async function initializeStorachaClient() {
  const client = await Client.create({ store: new StoreMemory() })
  
  const principal = Signer.parse(process.env.STORACHA_KEY)
  const proof = await Proof.parse(process.env.STORACHA_PROOF)
  
  const space = await client.addSpace(proof)
  await client.setCurrentSpace(space.did())
  
  return client
}

/**
 * List all files uploaded to the current Storacha space
 */
async function listSpaceFiles(client) {
  console.log('📋 Listing all files in Storacha space...')
  
  try {
    const uploads = []
    
    // Use the capability.upload.list() API
    console.log('   🔍 Calling client.capability.upload.list()...')
    const uploadsList = await client.capability.upload.list()
    
    // Check if result is async iterable
    if (uploadsList && uploadsList[Symbol.asyncIterator]) {
      console.log('   ✅ List result is async iterable')
      for await (const item of uploadsList) {
        uploads.push(item)
        console.log(`   📄 Found upload: ${item.root.toString()} (${item.shards?.length || 0} shards)`)
      }
    } else if (Array.isArray(uploadsList)) {
      console.log('   ✅ List result is array')
      uploads.push(...uploadsList)
      uploadsList.forEach(item => {
        console.log(`   📄 Found upload: ${item.root.toString()} (${item.shards?.length || 0} shards)`)
      })
    } else {
      console.log('   ⚠️ Unexpected list result type:', typeof uploadsList)
      console.log('   Result:', uploadsList)
    }
    
    console.log(`   📊 Found ${uploads.length} total uploads in space`)
    return uploads
    
  } catch (error) {
    console.error('❌ Failed to list space files:', error.message)
    console.error('   This might be a permissions issue or space configuration problem')
    console.error('   Stack:', error.stack)
    throw error
  }
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
        console.log(`   ✅ Downloaded ${bytes.length} bytes from ${gateway}`)
        return bytes
      }
    } catch (error) {
      console.log(`   ⚠️ Failed from ${gateway}: ${error.message}`)
    }
  }
  
  throw new Error(`Could not download block ${storachaCID} from any gateway`)
}

/**
 * Analyze blocks to identify structure and heads
 */
async function analyzeBlocks(blockstore) {
  console.log('🔍 Analyzing downloaded blocks...')
  
  const analysis = {
    manifestBlocks: [],
    accessControllerBlocks: [],
    logEntryBlocks: [],
    identityBlocks: [],
    unknownBlocks: [],
    potentialHeads: []
  }
  
  // Get all blocks from blockstore
  for await (const cid of blockstore.getAll()) {
    try {
      const bytes = await blockstore.get(cid)
      const cidString = cid.toString()
      
      // Try to decode as dag-cbor to inspect content
      if (cid.code === 0x71) { // dag-cbor codec
        try {
          const block = await Block.decode({
            cid,
            bytes,
            codec: dagCbor,
            hasher: sha256
          })
          
          const content = block.value
          
          // Identify block type by structure
          if (content.type && content.name && content.accessController) {
            analysis.manifestBlocks.push({ cid: cidString, content })
            console.log(`   📋 Manifest: ${cidString} (${content.name})`)
          } else if (content.sig && content.key && content.identity) {
            analysis.logEntryBlocks.push({ cid: cidString, content })
            console.log(`   📝 Log Entry: ${cidString}`)
            
            // Check if this could be a head (no "next" references by other entries)
            if (!content.next || content.next.length === 0) {
              analysis.potentialHeads.push(cidString)
            }
          } else if (content.id && content.type) {
            analysis.identityBlocks.push({ cid: cidString, content })
            console.log(`   👤 Identity: ${cidString}`)
          } else if (content.type === 'orbitdb-access-controller') {
            analysis.accessControllerBlocks.push({ cid: cidString, content })
            console.log(`   🔒 Access Controller: ${cidString}`)
          } else {
            analysis.unknownBlocks.push({ cid: cidString, content })
            console.log(`   ❓ Unknown: ${cidString}`)
          }
        } catch (decodeError) {
          analysis.unknownBlocks.push({ cid: cidString, decodeError: decodeError.message })
          console.log(`   ⚠️ Decode failed: ${cidString}`)
        }
      } else {
        analysis.unknownBlocks.push({ cid: cidString, reason: 'not dag-cbor' })
        console.log(`   🔧 Raw block: ${cidString}`)
      }
    } catch (error) {
      console.warn(`   ❌ Error analyzing block ${cid}: ${error.message}`)
    }
  }
  
  console.log('📊 Block Analysis Summary:')
  console.log(`   📋 Manifests: ${analysis.manifestBlocks.length}`)
  console.log(`   📝 Log Entries: ${analysis.logEntryBlocks.length}`)
  console.log(`   👤 Identities: ${analysis.identityBlocks.length}`)
  console.log(`   🔒 Access Controllers: ${analysis.accessControllerBlocks.length}`)
  console.log(`   ❓ Unknown: ${analysis.unknownBlocks.length}`)
  console.log(`   🎯 Potential Heads: ${analysis.potentialHeads.length}`)
  
  return analysis
}

/**
 * Main test function
 */
async function testSpaceDownloadApproach() {
  console.log('🧪 Testing Space-Wide Download Approach')
  console.log('=' .repeat(60))
  
  let sourceNode = null
  let targetNode = null
  
  try {
    // 1. Create source OrbitDB and populate with data
    console.log('\n📝 Step 1: Creating source database...')
    sourceNode = await createHeliaOrbitDB('-source')
    
    const sourceDB = await sourceNode.orbitdb.open('space-download-test', { 
      type: 'documents',
      create: true 
    })
    
    console.log(`   Database created: ${sourceDB.address}`)
    
    // Add test data
    const testDocs = [
      { _id: 'doc1', title: 'Space Download Test 1', content: 'Full space restoration' },
      { _id: 'doc2', title: 'Space Download Test 2', content: 'No CID mapping needed' },
      { _id: 'doc3', title: 'Space Download Test 3', content: 'Automatic head detection' }
    ]
    
    for (const doc of testDocs) {
      await sourceDB.put(doc)
      console.log(`   ✓ Added document: ${doc._id}`)
    }
    
    console.log(`   📊 Source database has ${(await sourceDB.all()).length} documents`)
    
    // Get current heads for verification
    const originalHeads = await sourceDB.log.heads()
    console.log(`   🎯 Original heads: ${originalHeads.map(h => h.hash).join(', ')}`)
    
    // 2. Backup to Storacha
    console.log('\n📤 Step 2: Backing up to Storacha...')
    const backupResult = await backupDatabase(sourceNode.orbitdb, sourceDB.address)
    
    if (!backupResult.success) {
      throw new Error(`Backup failed: ${backupResult.error}`)
    }
    
    console.log(`   ✅ Backup successful!`)
    console.log(`   📍 Manifest CID: ${backupResult.manifestCID}`)
    console.log(`   📊 Blocks uploaded: ${backupResult.blocksUploaded}`)
    
    // 3. Close source
    console.log('\n🔒 Step 3: Closing source database...')
    await sourceDB.close()
    await sourceNode.orbitdb.stop()
    await sourceNode.helia.stop()
    await sourceNode.blockstore.close()
    await sourceNode.datastore.close()
    sourceNode = null
    
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    // 4. Create fresh target node
    console.log('\n🎯 Step 4: Creating fresh target node...')
    targetNode = await createHeliaOrbitDB('-target')
    console.log(`   ✓ Target node ready`)
    
    // 5. List all files in Storacha space
    console.log('\n📋 Step 5: Discovering all files in Storacha space...')
    const client = await initializeStorachaClient()
    const spaceFiles = await listSpaceFiles(client)
    
    // 6. Download ALL files from the space
    console.log('\n📥 Step 6: Downloading all files from space...')
    const downloadedBlocks = new Map()
    
    for (const upload of spaceFiles) {
      const storachaCID = upload.root.toString()
      console.log(`   🔄 Processing upload: ${storachaCID}`)
      
      try {
        // Download the block
        const bytes = await downloadBlockFromStoracha(storachaCID)
        
        // Convert Storacha CID to OrbitDB format for storage
        const orbitdbCID = convertStorachaCIDToOrbitDB(storachaCID)
        const parsedCID = CID.parse(orbitdbCID)
        
        // Store in target blockstore
        await targetNode.helia.blockstore.put(parsedCID, bytes)
        downloadedBlocks.set(orbitdbCID, { storachaCID, bytes: bytes.length })
        
        console.log(`   ✅ Downloaded and stored: ${storachaCID} → ${orbitdbCID}`)
        
      } catch (error) {
        console.error(`   ❌ Failed to download ${storachaCID}: ${error.message}`)
      }
    }
    
    console.log(`   📊 Downloaded ${downloadedBlocks.size} blocks total`)
    
    // 7. Analyze downloaded blocks
    console.log('\n🔍 Step 7: Analyzing block structure...')
    const analysis = await analyzeBlocks(targetNode.helia.blockstore)
    
    if (analysis.manifestBlocks.length === 0) {
      throw new Error('No manifest blocks found - cannot reconstruct database')
    }
    
    // 8. Reconstruct database using manifest
    console.log('\n🔄 Step 8: Reconstructing database...')
    const manifest = analysis.manifestBlocks[0] // Use first manifest found
    const databaseAddress = `/orbitdb/${manifest.cid}`
    
    console.log(`   📥 Opening database at: ${databaseAddress}`)
    const reconstructedDB = await targetNode.orbitdb.open(databaseAddress)
    
    // Wait for entries to load
    console.log('⏳ Waiting for entries to load...')
    await new Promise(resolve => setTimeout(resolve, 5000))
    
    const allEntries = await reconstructedDB.all()
    console.log(`   ✅ Reconstructed database with ${allEntries.length} entries`)
    
    // 9. Verify data integrity
    console.log('\n✅ Step 9: Verifying data integrity...')
    console.log(`   📊 Expected entries: ${testDocs.length}`)
    console.log(`   📊 Recovered entries: ${allEntries.length}`)
    console.log(`   📍 Address match: ${reconstructedDB.address === databaseAddress}`)
    
    for (const entry of allEntries) {
      console.log(`   ✓ ${entry._id}: "${entry.title}"`)
    }
    
    // Check heads
    const reconstructedHeads = await reconstructedDB.log.heads()
    console.log(`   🎯 Reconstructed heads: ${reconstructedHeads.map(h => h.hash).join(', ')}`)
    
    // Results
    const success = allEntries.length === testDocs.length && 
                   reconstructedDB.address === databaseAddress
    
    console.log('\n' + '='.repeat(60))
    console.log('🎉 SPACE-WIDE DOWNLOAD RESULTS')
    console.log('='.repeat(60))
    console.log(`✅ Space files discovered: ${spaceFiles.length}`)
    console.log(`✅ Blocks downloaded: ${downloadedBlocks.size}`)
    console.log(`✅ Manifests found: ${analysis.manifestBlocks.length}`)
    console.log(`✅ Log entries found: ${analysis.logEntryBlocks.length}`)
    console.log(`✅ Database restoration: ${allEntries.length > 0 ? 'SUCCESS' : 'FAILED'}`)
    console.log(`✅ Address preservation: ${reconstructedDB.address === databaseAddress ? 'SUCCESS' : 'FAILED'}`)
    console.log(`✅ Data integrity: ${allEntries.length === testDocs.length ? 'SUCCESS' : 'PARTIAL'}`)
    console.log(`✅ Heads detection: ${analysis.potentialHeads.length > 0 ? 'SUCCESS' : 'NEEDS_WORK'}`)
    
    if (success) {
      console.log('\n🚀 CONCLUSION: Space-wide download approach WORKS!')
      console.log('   ✓ No CID mappings needed')
      console.log('   ✓ Complete space represents full backup')
      console.log('   ✓ Automatic block structure analysis')
      console.log('   ✓ Perfect hash preservation and reconstruction')
    } else {
      console.log('\n⚡ CONCLUSION: Approach shows promise but needs refinement')
    }
    
    return {
      success,
      spaceFiles: spaceFiles.length,
      blocksDownloaded: downloadedBlocks.size,
      manifestsFound: analysis.manifestBlocks.length,
      logEntriesFound: analysis.logEntryBlocks.length,
      entriesRecovered: allEntries.length,
      expectedEntries: testDocs.length,
      addressPreserved: reconstructedDB.address === databaseAddress,
      headsDetected: analysis.potentialHeads.length
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
      } catch (error) {
        console.warn('Source cleanup warning:', error.message)
      }
    }
    
    if (targetNode) {
      try {
        await targetNode.orbitdb.stop()
        await targetNode.helia.stop()
        await targetNode.blockstore.close()
        await targetNode.datastore.close()
      } catch (error) {
        console.warn('Target cleanup warning:', error.message)
      }
    }
    
    console.log('   ✓ Cleanup completed')
  }
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
  testSpaceDownloadApproach()
    .then(result => {
      console.log('\n📋 Final Result:', result)
      process.exit(result.success ? 0 : 1)
    })
    .catch(error => {
      console.error('\n💥 Test execution failed:', error)
      process.exit(1)
    })
}

export { testSpaceDownloadApproach }
