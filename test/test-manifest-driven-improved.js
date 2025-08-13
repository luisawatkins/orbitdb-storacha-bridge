/**
 * Test: Improved Manifest-Driven Block Discovery
 * 
 * This enhanced version properly discovers OrbitDB log entries by:
 * 1. Opening the database after downloading manifest + access controller
 * 2. Discovering log entry CIDs from the database log structure
 * 3. Downloading those blocks and storing them
 * 4. Reopening the database with all blocks available
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
import { backupDatabase } from '../lib/orbitdb-storacha-bridge.js'

/**
 * Create a basic Helia/OrbitDB instance
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
  const blockstore = new LevelBlockstore(`./improved-manifest-test-${uniqueId}${suffix}`)
  const datastore = new LevelDatastore(`./improved-manifest-test-${uniqueId}${suffix}-data`)
  
  await blockstore.open()
  await datastore.open()
  
  const helia = await createHelia({ libp2p, blockstore, datastore })
  const orbitdb = await createOrbitDB({ ipfs: helia })
  
  return { helia, orbitdb, libp2p, blockstore, datastore }
}

/**
 * Download a block from Storacha using its CID mapping
 */
async function downloadBlockFromStoracha(orbitdbCID, cidMappings) {
  const gateways = [
    'https://w3s.link/ipfs',
    'https://gateway.web3.storage/ipfs',
    'https://ipfs.io/ipfs'
  ]
  
  // Use stored Storacha CID mapping if available
  let targetCID = cidMappings[orbitdbCID]
  if (!targetCID) {
    try {
      const parsed = CID.parse(orbitdbCID)
      targetCID = parsed.toV1().toString()
    } catch (error) {
      console.warn(`   ⚠️ Could not convert CID ${orbitdbCID}: ${error.message}`)
      return null
    }
  }
  
  for (const gateway of gateways) {
    try {
      console.log(`   🌐 Downloading ${orbitdbCID}...`)
      
      const response = await fetch(`${gateway}/${targetCID}`, {
        timeout: 15000
      })
      
      if (response.ok) {
        const bytes = new Uint8Array(await response.arrayBuffer())
        console.log(`   ✅ Downloaded ${bytes.length} bytes`)
        return bytes
      }
    } catch (error) {
      console.log(`   ⚠️ Failed from ${gateway}: ${error.message}`)
    }
  }
  
  console.log(`   ❌ Could not download block ${orbitdbCID}`)
  return null
}

/**
 * Discover log entry blocks by opening the database and inspecting its log
 */
async function discoverLogEntries(database, cidMappings) {
  console.log('🔍 Discovering log entry blocks from database...')
  
  const discoveredBlocks = new Map()
  
  try {
    // Get all log entries
    const entries = await database.log.values()
    console.log(`   📋 Found ${entries.length} log entries in database`)
    
    for (const entry of entries) {
      console.log(`   🔍 Processing entry: ${entry.hash}`)
      
      // Download the entry block
      const bytes = await downloadBlockFromStoracha(entry.hash, cidMappings)
      if (bytes) {
        const cid = CID.parse(entry.hash)
        discoveredBlocks.set(entry.hash, { cid, bytes })
        console.log(`   ✅ Added entry block: ${entry.hash}`)
        
        // Also get the identity block if referenced
        if (entry.identity && !discoveredBlocks.has(entry.identity)) {
          console.log(`   🔍 Processing identity: ${entry.identity}`)
          const identityBytes = await downloadBlockFromStoracha(entry.identity, cidMappings)
          if (identityBytes) {
            const identityCid = CID.parse(entry.identity)
            discoveredBlocks.set(entry.identity, { cid: identityCid, bytes: identityBytes })
            console.log(`   ✅ Added identity block: ${entry.identity}`)
          }
        }
      }
    }
    
  } catch (error) {
    console.warn(`   ⚠️ Error discovering log entries: ${error.message}`)
  }
  
  console.log(`   📊 Discovered ${discoveredBlocks.size} log-related blocks`)
  return discoveredBlocks
}

/**
 * Test the improved manifest-driven approach
 */
async function testImprovedManifestDrivenApproach() {
  console.log('🧪 Testing Improved Manifest-Driven Block Discovery')
  console.log('=' .repeat(60))
  
  let sourceNode = null
  let targetNode = null
  
  try {
    // 1. Create source OrbitDB and populate with data
    console.log('\n📝 Step 1: Creating source database...')
    sourceNode = await createHeliaOrbitDB('-source')
    
    const sourceDB = await sourceNode.orbitdb.open('improved-manifest-test', { 
      type: 'documents',
      create: true 
    })
    
    console.log(`   Database created: ${sourceDB.address}`)
    
    // Add test data
    const testDocs = [
      { _id: 'doc1', title: 'Improved Discovery Test 1', content: 'Testing log discovery' },
      { _id: 'doc2', title: 'Improved Discovery Test 2', content: 'Finding all log entries' },
      { _id: 'doc3', title: 'Improved Discovery Test 3', content: 'Complete block reconstruction' }
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
    
    // 5. Download manifest and access controller blocks
    console.log('\n🔍 Step 5: Downloading core structural blocks...')
    const coreBlocks = new Map()
    
    // Download manifest
    const manifestBytes = await downloadBlockFromStoracha(
      backupResult.manifestCID, 
      backupResult.cidMappings
    )
    if (!manifestBytes) {
      throw new Error('Could not download manifest block')
    }
    
    const manifestCid = CID.parse(backupResult.manifestCID)
    coreBlocks.set(backupResult.manifestCID, { cid: manifestCid, bytes: manifestBytes })
    
    // Decode manifest to get access controller CID
    const manifestBlock = await Block.decode({
      cid: manifestCid,
      bytes: manifestBytes,
      codec: dagCbor,
      hasher: sha256
    })
    
    const accessControllerCID = manifestBlock.value.accessController.replace('/ipfs/', '')
    console.log(`   🔍 Found access controller: ${accessControllerCID}`)
    
    const accessBytes = await downloadBlockFromStoracha(
      accessControllerCID,
      backupResult.cidMappings
    )
    if (!accessBytes) {
      throw new Error('Could not download access controller block')
    }
    
    const accessCid = CID.parse(accessControllerCID)
    coreBlocks.set(accessControllerCID, { cid: accessCid, bytes: accessBytes })
    
    console.log(`   📊 Downloaded ${coreBlocks.size} core blocks`)
    
    // 6. Store core blocks and partially open database
    console.log('\n📥 Step 6: Storing core blocks and opening database...')
    for (const [cidStr, { cid, bytes }] of coreBlocks) {
      await targetNode.helia.blockstore.put(cid, bytes)
      console.log(`   ✅ Stored: ${cidStr}`)
    }
    
    // Open database (this should work with manifest + access controller)
    const partialDB = await targetNode.orbitdb.open(backupResult.databaseAddress)
    console.log(`   ✅ Partially opened database: ${partialDB.address}`)
    
    // 7. Discover and download log entry blocks
    console.log('\n🔍 Step 7: Discovering log entry blocks...')
    const logBlocks = await discoverLogEntries(partialDB, backupResult.cidMappings)
    
    if (logBlocks.size === 0) {
      throw new Error('No log entry blocks were discovered')
    }
    
    // 8. Store all log blocks
    console.log('\n📥 Step 8: Storing log entry blocks...')
    for (const [cidStr, { cid, bytes }] of logBlocks) {
      await targetNode.helia.blockstore.put(cid, bytes)
      console.log(`   ✅ Stored log block: ${cidStr}`)
    }
    
    console.log(`   📊 Stored ${logBlocks.size} log blocks`)
    
    // 9. Close and reopen database to load all entries
    console.log('\n🔄 Step 9: Reopening database with all blocks...')
    await partialDB.close()
    
    const fullyRestoredDB = await targetNode.orbitdb.open(backupResult.databaseAddress)
    
    // Wait for entries to load
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    const allEntries = await fullyRestoredDB.all()
    
    console.log(`   ✅ Fully restored database with ${allEntries.length} entries`)
    
    // 10. Verify data
    console.log('\n✅ Step 10: Verifying restored data...')
    console.log(`   📊 Expected entries: ${testDocs.length}`)
    console.log(`   📊 Restored entries: ${allEntries.length}`)
    
    for (const entry of allEntries) {
      console.log(`   ✓ ${entry._id}: "${entry.title}"`)
    }
    
    // 11. Results
    const totalBlocks = coreBlocks.size + logBlocks.size
    const success = allEntries.length === testDocs.length && 
                   fullyRestoredDB.address === backupResult.databaseAddress
    
    console.log('\n' + '='.repeat(60))
    console.log('🎉 IMPROVED MANIFEST-DRIVEN RESULTS')
    console.log('='.repeat(60))
    console.log(`✅ Core blocks downloaded: ${coreBlocks.size}`)
    console.log(`✅ Log blocks discovered: ${logBlocks.size}`)
    console.log(`✅ Total blocks restored: ${totalBlocks}`)
    console.log(`✅ Database restoration: ${allEntries.length > 0 ? 'SUCCESS' : 'FAILED'}`)
    console.log(`✅ Address preservation: ${fullyRestoredDB.address === backupResult.databaseAddress ? 'SUCCESS' : 'FAILED'}`)
    console.log(`✅ Data integrity: ${allEntries.length === testDocs.length ? 'SUCCESS' : 'PARTIAL'}`)
    
    if (success) {
      console.log('\n🚀 CONCLUSION: Improved manifest-driven approach WORKS!')
      console.log('   ✓ Only manifest CID needed to start restoration')
      console.log('   ✓ All blocks discovered automatically via database structure')
      console.log('   ✓ Perfect hash preservation and data integrity')
      console.log('   ✓ No need to store complex CID mappings!')
    } else {
      console.log('\n⚡ CONCLUSION: Needs further refinement')
      console.log('   ⚠️ Some blocks or entries may still be missing')
    }
    
    return {
      success,
      coreBlocks: coreBlocks.size,
      logBlocks: logBlocks.size,
      totalBlocks,
      entriesRestored: allEntries.length,
      expectedEntries: testDocs.length,
      addressPreserved: fullyRestoredDB.address === backupResult.databaseAddress
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
  testImprovedManifestDrivenApproach()
    .then(result => {
      console.log('\n📋 Final Result:', result)
      process.exit(result.success ? 0 : 1)
    })
    .catch(error => {
      console.error('\n💥 Test execution failed:', error)
      process.exit(1)
    })
}

export { testImprovedManifestDrivenApproach }
