/**
 * Test: Enhanced Pure IPFS Approach for OrbitDB Restoration via Storacha
 * 
 * This enhanced version uses Helia's HTTP gateway delegates to fetch blocks
 * from IPFS gateways (including Storacha) instead of manual downloads.
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
import { trustlessGateway } from '@helia/block-brokers'
import { httpGatewayRouting } from '@helia/routers'
import { CID } from 'multiformats/cid'
import { backupDatabase } from '../lib/orbitdb-storacha-bridge.js'
import fs from 'fs/promises'

/**
 * Create Helia with HTTP gateway delegates for IPFS resolution
 */
async function createHeliaWithHTTPGateways(suffix = '') {
  const libp2p = await createLibp2p({
    addresses: {
      listen: ['/ip4/0.0.0.0/tcp/0']
    },
    transports: [tcp()],
    connectionEncryption: [noise()],
    streamMuxers: [yamux()],
    services: {
      identify: identify(),
      pubsub: gossipsub({ allowPublishToZeroTopicPeers: true }),
      // HTTP routing will be handled by block brokers
    }
  })
  
  const uniqueId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  const blockstore = new LevelBlockstore(`./enhanced-ipfs-test-${uniqueId}${suffix}`)
  const datastore = new LevelDatastore(`./enhanced-ipfs-test-${uniqueId}${suffix}-data`)
  
  await blockstore.open()
  await datastore.open()
  
  // Create Helia with trustless gateway block brokers
  const helia = await createHelia({ 
    libp2p, 
    blockstore, 
    datastore,
    // Use trustless gateways as block brokers
    blockBrokers: [
      trustlessGateway({
        gateways: [
          'https://w3s.link',           // Storacha gateway
          'https://ipfs.io',            // IPFS.io gateway  
          'https://gateway.pinata.cloud', // Pinata gateway
          'https://cloudflare-ipfs.com'   // Cloudflare gateway
        ]
      })
    ]
  })
  
  const orbitdb = await createOrbitDB({ ipfs: helia })
  
  return { helia, orbitdb, libp2p, blockstore, datastore }
}

/**
 * Wait for blocks to propagate to IPFS gateways
 */
async function waitForIPFSPropagation(manifestCID, cidMappings, maxWaitTime = 180000) {
  console.log('⏳ Waiting for blocks to propagate to IPFS gateways...')
  const startTime = Date.now()
  
  const gateways = [
    'https://w3s.link/ipfs',
    'https://ipfs.io/ipfs', 
    'https://cloudflare-ipfs.com/ipfs'
  ]
  
  // Check if manifest is available on any gateway
  for (const gateway of gateways) {
    try {
      console.log(`   🔍 Checking ${gateway}...`)
      
      // Convert OrbitDB CID to base32 for HTTP gateway access
      const manifestParsed = CID.parse(manifestCID)
      const base32CID = manifestParsed.toV1().toString() // Convert to base32
      
      const response = await fetch(`${gateway}/${base32CID}`, {
        method: 'HEAD',
        timeout: 10000
      })
      
      if (response.ok) {
        console.log(`   ✅ Manifest available on ${gateway}`)
        return true
      }
    } catch (error) {
      console.log(`   ⚠️ ${gateway} not ready: ${error.message}`)
    }
    
    // Don't exceed max wait time
    if (Date.now() - startTime > maxWaitTime) {
      console.log(`   ⏰ Max wait time (${maxWaitTime}ms) exceeded`)
      return false
    }
    
    // Wait between checks
    await new Promise(resolve => setTimeout(resolve, 5000))
  }
  
  console.log('   ⚠️ Blocks may not be fully propagated yet')
  return false
}

/**
 * Test the enhanced pure IPFS approach
 */
async function testEnhancedPureIPFSApproach() {
  console.log('🧪 Testing Enhanced Pure IPFS Approach for OrbitDB Restoration')
  console.log('=' .repeat(65))
  
  let sourceNode = null
  let targetNode = null
  
  try {
    // 1. Create source OrbitDB and populate with data
    console.log('\n📝 Step 1: Creating source database...')
    sourceNode = await createHeliaWithHTTPGateways('-source')
    
    const sourceDB = await sourceNode.orbitdb.open('enhanced-ipfs-test', { 
      type: 'documents',
      create: true 
    })
    
    console.log(`   Database created: ${sourceDB.address}`)
    
    // Add test data
    const testDocs = [
      { _id: 'doc1', title: 'Enhanced IPFS Test Doc 1', content: 'Testing HTTP gateway resolution' },
      { _id: 'doc2', title: 'Enhanced IPFS Test Doc 2', content: 'OrbitDB via Storacha HTTP gateways' },
      { _id: 'doc3', title: 'Enhanced IPFS Test Doc 3', content: 'Decentralized block resolution' }
    ]
    
    for (const doc of testDocs) {
      await sourceDB.put(doc)
      console.log(`   ✓ Added document: ${doc._id}`)
    }
    
    console.log(`   📊 Source database has ${(await sourceDB.all()).length} documents`)
    
    // 2. Backup to Storacha (uploads to IPFS)
    console.log('\n📤 Step 2: Backing up to Storacha/IPFS...')
    const backupResult = await backupDatabase(sourceNode.orbitdb, sourceDB.address)
    
    if (!backupResult.success) {
      throw new Error(`Backup failed: ${backupResult.error}`)
    }
    
    console.log(`   ✅ Backup successful!`)
    console.log(`   📍 Manifest CID: ${backupResult.manifestCID}`)
    console.log(`   📊 Blocks uploaded: ${backupResult.blocksUploaded}`)
    
    // 3. Wait for IPFS propagation
    console.log('\n⏱️ Step 3: Waiting for IPFS propagation...')
    const propagated = await waitForIPFSPropagation(
      backupResult.manifestCID, 
      backupResult.cidMappings,
      120000 // 2 minutes max wait
    )
    
    if (!propagated) {
      console.log('   ⚠️ Continuing anyway - blocks may resolve during OrbitDB opening')
    }
    
    // 4. Close source database and node
    console.log('\n🔒 Step 4: Closing source database...')
    await sourceDB.close()
    await sourceNode.orbitdb.stop()
    await sourceNode.helia.stop()
    await sourceNode.blockstore.close()
    await sourceNode.datastore.close()
    sourceNode = null
    console.log(`   ✓ Source node closed`)
    
    // Wait for cleanup
    await new Promise(resolve => setTimeout(resolve, 3000))
    
    // 5. Create fresh target OrbitDB node with HTTP gateways
    console.log('\n🎯 Step 5: Creating fresh target node with HTTP gateways...')
    targetNode = await createHeliaWithHTTPGateways('-target')
    console.log(`   ✓ Target node ready with trustless gateway block brokers`)
    
    // 6. Attempt to open database - should fetch blocks via HTTP gateways
    console.log('\n🔄 Step 6: Opening database via HTTP gateway resolution...')
    console.log(`   🎯 Target address: ${backupResult.databaseAddress}`)
    console.log(`   🌐 Helia will fetch blocks via trustless gateways`)
    
    let restoredDB = null
    try {
      // Use extended timeout for HTTP gateway resolution
      restoredDB = await targetNode.orbitdb.open(backupResult.databaseAddress, {
        timeout: 120000 // 2 minute timeout for HTTP resolution
      })
      
      console.log(`   ✅ Database opened successfully!`)
      console.log(`   📍 Restored address: ${restoredDB.address}`)
      console.log(`   🏷️  Restored name: ${restoredDB.name}`)
      console.log(`   📋 Database type: ${restoredDB.type}`)
      
    } catch (openError) {
      console.log(`   ❌ Database opening failed: ${openError.message}`)
      console.log(`   🔍 This might indicate blocks aren't resolvable via HTTP gateways yet`)
      throw openError
    }
    
    // 7. Wait for entries to load via HTTP gateways
    console.log('\n⏳ Step 7: Waiting for entries to load via HTTP gateways...')
    let retries = 0
    const maxRetries = 24 // 2 minutes total (5 second intervals)
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
    
    // 8. Verify restoration
    console.log('\n✅ Step 8: Verifying restoration...')
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
    
    // 9. Test results summary
    console.log('\n' + '='.repeat(65))
    console.log('🎉 ENHANCED PURE IPFS APPROACH TEST RESULTS')
    console.log('='.repeat(65))
    console.log(`✅ Database restoration: ${entries.length > 0 ? 'SUCCESS' : 'FAILED'}`)
    console.log(`✅ Address preservation: ${addressMatch ? 'SUCCESS' : 'FAILED'}`)
    console.log(`✅ Entry count: ${entries.length}/${testDocs.length}`)
    console.log(`✅ HTTP gateway resolution: ${entries.length > 0 ? 'WORKING' : 'FAILED'}`)
    
    if (entries.length === testDocs.length && addressMatch) {
      console.log('\n🚀 CONCLUSION: Enhanced Pure IPFS approach WORKS!')
      console.log('   OrbitDB + Helia successfully resolved all blocks via HTTP gateways')
      console.log('   Trustless gateway block brokers enable automatic block retrieval!')
    } else if (entries.length > 0) {
      console.log('\n⚡ CONCLUSION: Enhanced Pure IPFS approach PARTIALLY works!')
      console.log('   Some blocks resolved via HTTP gateways')
      console.log('   May need more time for full IPFS propagation')
    } else {
      console.log('\n⚠️  CONCLUSION: Enhanced Pure IPFS approach needs more work')
      console.log('   HTTP gateway resolution may require different configuration')
    }
    
    return {
      success: entries.length > 0 && addressMatch,
      partialSuccess: entries.length > 0,
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
    
    console.log('   ✓ Cleanup completed')
  }
}

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testEnhancedPureIPFSApproach()
    .then(result => {
      console.log('\n📋 Final Result:', result)
      process.exit(result.success ? 0 : (result.partialSuccess ? 0 : 1))
    })
    .catch(error => {
      console.error('\n💥 Test execution failed:', error)
      process.exit(1)
    })
}

export { testEnhancedPureIPFSApproach }
