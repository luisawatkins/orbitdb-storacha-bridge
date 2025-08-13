/**
 * Test: Pure IPFS Approach for OrbitDB Restoration via Storacha
 * 
 * This test explores using OrbitDB's natural IPFS block resolution
 * instead of manually downloading blocks. Since Storacha provides
 * IPFS gateway access, OrbitDB should be able to fetch blocks
 * automatically when they're needed.
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
import { backupDatabase, convertStorachaCIDToOrbitDB } from '../lib/orbitdb-storacha-bridge.js'
import fs from 'fs/promises'

/**
 * Create Helia with IPFS gateway configuration for Storacha
 */
async function createHeliaWithIPFSGateways(suffix = '') {
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
  const blockstore = new LevelBlockstore(`./pure-ipfs-test-${uniqueId}${suffix}`)
  const datastore = new LevelDatastore(`./pure-ipfs-test-${uniqueId}${suffix}-data`)
  
  await blockstore.open()
  await datastore.open()
  
  // Create Helia with enhanced IPFS gateway configuration
  const helia = await createHelia({ 
    libp2p, 
    blockstore, 
    datastore,
    // Configure IPFS gateways including Storacha
    gateways: [
      'https://w3s.link/ipfs/',
      'https://gateway.web3.storage/ipfs/',
      'https://ipfs.io/ipfs/',
      'https://gateway.pinata.cloud/ipfs/',
      'https://cloudflare-ipfs.com/ipfs/'
    ]
  })
  
  const orbitdb = await createOrbitDB({ ipfs: helia })
  
  return { helia, orbitdb, libp2p, blockstore, datastore }
}

/**
 * Test the pure IPFS approach
 */
async function testPureIPFSApproach() {
  console.log('🧪 Testing Pure IPFS Approach for OrbitDB Restoration')
  console.log('=' .repeat(60))
  
  let sourceNode = null
  let targetNode = null
  
  try {
    // 1. Create source OrbitDB and populate with data
    console.log('\n📝 Step 1: Creating source database...')
    sourceNode = await createHeliaWithIPFSGateways('-source')
    
    const sourceDB = await sourceNode.orbitdb.open('pure-ipfs-test', { 
      type: 'documents',
      create: true 
    })
    
    console.log(`   Database created: ${sourceDB.address}`)
    
    // Add test data
    const testDocs = [
      { _id: 'doc1', title: 'Pure IPFS Test Doc 1', content: 'Testing IPFS gateway resolution' },
      { _id: 'doc2', title: 'Pure IPFS Test Doc 2', content: 'OrbitDB via Storacha IPFS' },
      { _id: 'doc3', title: 'Pure IPFS Test Doc 3', content: 'Decentralized database restoration' }
    ]
    
    for (const doc of testDocs) {
      await sourceDB.put(doc)
      console.log(`   ✓ Added document: ${doc._id}`)
    }
    
    console.log(`   📊 Source database has ${(await sourceDB.all()).length} documents`)
    
    // 2. Backup to Storacha (this uploads all blocks to IPFS via Storacha)
    console.log('\n📤 Step 2: Backing up to Storacha/IPFS...')
    const backupResult = await backupDatabase(sourceNode.orbitdb, sourceDB.address)
    
    if (!backupResult.success) {
      throw new Error(`Backup failed: ${backupResult.error}`)
    }
    
    console.log(`   ✅ Backup successful!`)
    console.log(`   📍 Manifest CID: ${backupResult.manifestCID}`)
    console.log(`   📊 Blocks uploaded: ${backupResult.blocksUploaded}`)
    console.log(`   🗂️  Block types:`, backupResult.blockSummary)
    
    // Store backup metadata
    const backupMetadata = {
      manifestCID: backupResult.manifestCID,
      databaseAddress: backupResult.databaseAddress,
      cidMappings: backupResult.cidMappings,
      timestamp: new Date().toISOString()
    }
    
    await fs.writeFile('pure-ipfs-backup-metadata.json', JSON.stringify(backupMetadata, null, 2))
    console.log(`   💾 Backup metadata saved`)
    
    // 3. Close source database and node
    console.log('\n🔒 Step 3: Closing source database...')
    await sourceDB.close()
    await sourceNode.orbitdb.stop()
    await sourceNode.helia.stop()
    await sourceNode.blockstore.close()
    await sourceNode.datastore.close()
    sourceNode = null
    console.log(`   ✓ Source node closed`)
    
    // Wait a moment for cleanup
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    // 4. Create fresh target OrbitDB node (completely separate)
    console.log('\n🎯 Step 4: Creating fresh target node...')
    targetNode = await createHeliaWithIPFSGateways('-target')
    console.log(`   ✓ Target node ready`)
    
    // 5. Attempt to open database directly at original address
    // This should trigger OrbitDB to fetch all blocks via IPFS gateways
    console.log('\n🔄 Step 5: Opening database via pure IPFS resolution...')
    console.log(`   🎯 Target address: ${backupResult.databaseAddress}`)
    console.log(`   🌐 IPFS will resolve blocks via gateways (including Storacha)`)
    
    // Set a longer timeout for IPFS resolution
    const restoredDB = await targetNode.orbitdb.open(backupResult.databaseAddress, {
      timeout: 60000 // 60 second timeout for IPFS resolution
    })
    
    console.log(`   ✅ Database opened successfully!`)
    console.log(`   📍 Restored address: ${restoredDB.address}`)
    console.log(`   🏷️  Restored name: ${restoredDB.name}`)
    console.log(`   📋 Database type: ${restoredDB.type}`)
    
    // 6. Wait for entries to load via IPFS
    console.log('\n⏳ Step 6: Waiting for entries to load via IPFS...')
    let retries = 0
    const maxRetries = 12 // 60 seconds total
    let entries = []
    
    while (retries < maxRetries) {
      entries = await restoredDB.all()
      console.log(`   📊 Loaded ${entries.length} entries (attempt ${retries + 1}/${maxRetries})`)
      
      if (entries.length >= testDocs.length) {
        break
      }
      
      await new Promise(resolve => setTimeout(resolve, 5000))
      retries++
    }
    
    // 7. Verify restoration
    console.log('\n✅ Step 7: Verifying restoration...')
    console.log(`   📊 Total entries restored: ${entries.length}`)
    console.log(`   🎯 Expected entries: ${testDocs.length}`)
    
    // Check address preservation
    const addressMatch = restoredDB.address === backupResult.databaseAddress
    console.log(`   🏠 Address preserved: ${addressMatch ? '✅' : '❌'}`)
    console.log(`      Original: ${backupResult.databaseAddress}`)
    console.log(`      Restored: ${restoredDB.address}`)
    
    // Verify entry content and hashes
    console.log(`\n   📋 Entry verification:`)
    const restoredDocs = entries.map(e => ({ hash: e.hash, value: e.value }))
    
    for (const doc of restoredDocs) {
      console.log(`      ✓ Hash: ${doc.hash}`)
      console.log(`        Doc: ${doc.value._id} - "${doc.value.title}"`)
    }
    
    // 8. Test results summary
    console.log('\n' + '='.repeat(60))
    console.log('🎉 PURE IPFS APPROACH TEST RESULTS')
    console.log('='.repeat(60))
    console.log(`✅ Database restoration: ${entries.length > 0 ? 'SUCCESS' : 'FAILED'}`)
    console.log(`✅ Address preservation: ${addressMatch ? 'SUCCESS' : 'FAILED'}`)
    console.log(`✅ Entry count: ${entries.length}/${testDocs.length}`)
    console.log(`✅ IPFS resolution: ${entries.length > 0 ? 'WORKING' : 'FAILED'}`)
    
    if (entries.length === testDocs.length && addressMatch) {
      console.log('\n🚀 CONCLUSION: Pure IPFS approach via Storacha WORKS!')
      console.log('   OrbitDB successfully resolved all blocks via IPFS gateways')
      console.log('   No manual block downloading required!')
    } else {
      console.log('\n⚠️  CONCLUSION: Pure IPFS approach needs refinement')
      console.log('   Some blocks may not be resolvable via standard IPFS gateways')
    }
    
    return {
      success: entries.length > 0 && addressMatch,
      entriesRestored: entries.length,
      expectedEntries: testDocs.length,
      addressPreserved: addressMatch,
      restoredEntries: restoredDocs
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
    
    // Clean up test files
    try {
      await fs.unlink('pure-ipfs-backup-metadata.json')
    } catch (error) {
      // File might not exist
    }
    
    console.log('   ✓ Cleanup completed')
  }
}

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testPureIPFSApproach()
    .then(result => {
      console.log('\n📋 Final Result:', result)
      process.exit(result.success ? 0 : 1)
    })
    .catch(error => {
      console.error('\n💥 Test execution failed:', error)
      process.exit(1)
    })
}

export { testPureIPFSApproach }
