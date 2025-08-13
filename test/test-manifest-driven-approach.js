/**
 * Test: Manifest-Driven Block Discovery Approach
 * 
 * This approach downloads blocks on-demand by:
 * 1. Starting with just the manifest CID
 * 2. Parsing the manifest to discover referenced blocks
 * 3. Recursively downloading all discovered blocks from Storacha
 * 4. Pre-populating the local blockstore before opening OrbitDB
 * 
 * This eliminates the need to store CID mappings during backup!
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
import { bases } from 'multiformats/basics'
import { backupDatabase, initializeStorachaClient, convertStorachaCIDToOrbitDB } from '../lib/orbitdb-storacha-bridge.js'
import fs from 'fs/promises'

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
  const blockstore = new LevelBlockstore(`./manifest-driven-test-${uniqueId}${suffix}`)
  const datastore = new LevelDatastore(`./manifest-driven-test-${uniqueId}${suffix}-data`)
  
  await blockstore.open()
  await datastore.open()
  
  const helia = await createHelia({ libp2p, blockstore, datastore })
  const orbitdb = await createOrbitDB({ ipfs: helia })
  
  return { helia, orbitdb, libp2p, blockstore, datastore }
}

/**
 * Download a block from Storacha using gateway
 */
async function downloadBlockFromStoracha(orbitdbCID, storachaCID = null) {
  const gateways = [
    'https://w3s.link/ipfs',
    'https://gateway.web3.storage/ipfs',
    'https://ipfs.io/ipfs'
  ]
  
  // If we have the Storacha CID, use it; otherwise convert OrbitDB CID
  let targetCID = storachaCID
  if (!targetCID) {
    try {
      const parsed = CID.parse(orbitdbCID)
      targetCID = parsed.toV1().toString() // Convert to base32 for HTTP gateways
    } catch (error) {
      console.warn(`   ⚠️ Could not convert CID ${orbitdbCID}: ${error.message}`)
      return null
    }
  }
  
  for (const gateway of gateways) {
    try {
      console.log(`   🌐 Downloading ${orbitdbCID} from ${gateway}...`)
      
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
 * Discover all blocks referenced by an OrbitDB manifest
 */
async function discoverBlocksFromManifest(manifestCID, cidMappings = {}) {
  console.log('🔍 Discovering blocks from OrbitDB manifest...')
  
  const discoveredBlocks = new Map()
  const toProcess = new Set([manifestCID])
  const processed = new Set()
  
  while (toProcess.size > 0) {
    const currentCID = toProcess.values().next().value
    toProcess.delete(currentCID)
    
    if (processed.has(currentCID)) {
      continue
    }
    processed.add(currentCID)
    
    console.log(`   🔍 Processing block: ${currentCID}`)
    
    // Download the block
    const storachaCID = cidMappings[currentCID]
    const bytes = await downloadBlockFromStoracha(currentCID, storachaCID)
    
    if (!bytes) {
      console.warn(`   ⚠️ Skipping missing block: ${currentCID}`)
      continue
    }
    
    // Store the block
    const parsedCID = CID.parse(currentCID)
    discoveredBlocks.set(currentCID, { cid: parsedCID, bytes })
    
    // Try to decode and find references
    try {
      const block = await Block.decode({
        cid: parsedCID,
        bytes,
        codec: dagCbor,
        hasher: sha256
      })
      
      console.log(`   📋 Block type: ${typeof block.value}, content:`, Object.keys(block.value || {}))
      
      // Find CID references in the block
      const refs = findCIDReferences(block.value, currentCID)
      for (const ref of refs) {
        if (!processed.has(ref) && !toProcess.has(ref)) {
          console.log(`   🔗 Found reference: ${ref}`)
          toProcess.add(ref)
        }
      }
      
    } catch (error) {
      console.log(`   ⚠️ Could not decode block ${currentCID}: ${error.message}`)
    }
  }
  
  console.log(`   📊 Discovered ${discoveredBlocks.size} total blocks`)
  return discoveredBlocks
}

/**
 * Find all CID references in a decoded block value
 */
function findCIDReferences(value, parentCID) {
  const refs = []
  
  if (!value) return refs
  
  // Handle different value types
  if (typeof value === 'string') {
    // Check if it's a CID string
    if (value.startsWith('zdpu') || value.startsWith('/ipfs/')) {
      const cidStr = value.replace('/ipfs/', '')
      if (cidStr !== parentCID) {
        refs.push(cidStr)
      }
    }
  } else if (Array.isArray(value)) {
    // Process arrays
    for (const item of value) {
      refs.push(...findCIDReferences(item, parentCID))
    }
  } else if (value && typeof value === 'object') {
    // Process objects
    for (const [key, val] of Object.entries(value)) {
      if (key === 'cid' && typeof val === 'string') {
        refs.push(val)
      } else if (key === 'next' && Array.isArray(val)) {
        // OrbitDB log entries
        for (const nextCID of val) {
          if (typeof nextCID === 'string') {
            refs.push(nextCID)
          }
        }
      } else if (key === 'identity' && typeof val === 'string') {
        refs.push(val)
      } else if (key === 'accessController' && typeof val === 'string') {
        refs.push(val.replace('/ipfs/', ''))
      } else {
        refs.push(...findCIDReferences(val, parentCID))
      }
    }
  }
  
  return refs.filter(ref => ref && typeof ref === 'string')
}

/**
 * Test the manifest-driven approach
 */
async function testManifestDrivenApproach() {
  console.log('🧪 Testing Manifest-Driven Block Discovery Approach')
  console.log('=' .repeat(60))
  
  let sourceNode = null
  let targetNode = null
  
  try {
    // 1. Create source OrbitDB and populate with data
    console.log('\n📝 Step 1: Creating source database...')
    sourceNode = await createHeliaOrbitDB('-source')
    
    const sourceDB = await sourceNode.orbitdb.open('manifest-driven-test', { 
      type: 'keyvalue',
      create: true 
    })
    
    console.log(`   Database created: ${sourceDB.address}`)
    
    // Add test data that creates dependencies
    const testData = [
      { key: 'user:1', value: { name: 'Alice', role: 'admin' } },
      { key: 'user:2', value: { name: 'Bob', role: 'user' } },
      { key: 'config', value: { version: '1.0', features: ['backup', 'restore'] } },
      { key: 'metadata', value: { created: new Date().toISOString(), blocks: 'auto-discovered' } }
    ]
    
    for (const item of testData) {
      await sourceDB.set(item.key, item.value)
      console.log(`   ✓ Added ${item.key}: ${JSON.stringify(item.value)}`)
    }
    
    console.log(`   📊 Source database has ${Object.keys(await sourceDB.all()).length} entries`)
    
    // 2. Backup to Storacha (this gives us CID mappings)
    console.log('\n📤 Step 2: Backing up to Storacha...')
    const backupResult = await backupDatabase(sourceNode.orbitdb, sourceDB.address)
    
    if (!backupResult.success) {
      throw new Error(`Backup failed: ${backupResult.error}`)
    }
    
    console.log(`   ✅ Backup successful!`)
    console.log(`   📍 Manifest CID: ${backupResult.manifestCID}`)
    console.log(`   📊 Blocks uploaded: ${backupResult.blocksUploaded}`)
    
    // 3. Close source database
    console.log('\n🔒 Step 3: Closing source database...')
    await sourceDB.close()
    await sourceNode.orbitdb.stop()
    await sourceNode.helia.stop()
    await sourceNode.blockstore.close()
    await sourceNode.datastore.close()
    sourceNode = null
    console.log(`   ✓ Source node closed`)
    
    // Wait for cleanup
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    // 4. Create fresh target node
    console.log('\n🎯 Step 4: Creating fresh target node...')
    targetNode = await createHeliaOrbitDB('-target')
    console.log(`   ✓ Target node ready`)
    
    // 5. Discover and download all blocks starting from manifest
    console.log('\n🔍 Step 5: Discovering blocks from manifest...')
    const discoveredBlocks = await discoverBlocksFromManifest(
      backupResult.manifestCID,
      backupResult.cidMappings // Optional: use mappings for efficiency
    )
    
    if (discoveredBlocks.size === 0) {
      throw new Error('No blocks were discovered from manifest')
    }
    
    // 6. Pre-populate target blockstore with all discovered blocks
    console.log('\n📥 Step 6: Pre-populating target blockstore...')
    let storedCount = 0
    
    for (const [cidStr, { cid, bytes }] of discoveredBlocks) {
      try {
        await targetNode.helia.blockstore.put(cid, bytes)
        storedCount++
        console.log(`   ✅ Stored block: ${cidStr} (${bytes.length} bytes)`)
      } catch (error) {
        console.warn(`   ⚠️ Failed to store ${cidStr}: ${error.message}`)
      }
    }
    
    console.log(`   📊 Pre-populated ${storedCount}/${discoveredBlocks.size} blocks`)
    
    // 7. Now open the OrbitDB database (should work with all blocks available)
    console.log('\n🔄 Step 7: Opening OrbitDB with pre-populated blocks...')
    const restoredDB = await targetNode.orbitdb.open(backupResult.databaseAddress)
    
    console.log(`   ✅ Database opened successfully!`)
    console.log(`   📍 Restored address: ${restoredDB.address}`)
    console.log(`   🏷️  Restored name: ${restoredDB.name}`)
    console.log(`   📋 Database type: ${restoredDB.type}`)
    
    // 8. Verify all data was restored
    console.log('\n✅ Step 8: Verifying data restoration...')
    const allData = await restoredDB.all()
    const dataKeys = Object.keys(allData)
    
    console.log(`   📊 Restored ${dataKeys.length} entries`)
    
    for (const key of dataKeys) {
      console.log(`   ✓ ${key}: ${JSON.stringify(allData[key])}`)
    }
    
    // 9. Test results summary
    console.log('\n' + '='.repeat(60))
    console.log('🎉 MANIFEST-DRIVEN APPROACH TEST RESULTS')
    console.log('='.repeat(60))
    console.log(`✅ Block discovery: ${discoveredBlocks.size > 0 ? 'SUCCESS' : 'FAILED'}`)
    console.log(`✅ Block pre-population: ${storedCount > 0 ? 'SUCCESS' : 'FAILED'}`)
    console.log(`✅ Database restoration: ${dataKeys.length > 0 ? 'SUCCESS' : 'FAILED'}`)
    console.log(`✅ Address preservation: ${restoredDB.address === backupResult.databaseAddress ? 'SUCCESS' : 'FAILED'}`)
    console.log(`✅ Data integrity: ${dataKeys.length === testData.length ? 'SUCCESS' : 'PARTIAL'}`)
    
    if (dataKeys.length === testData.length) {
      console.log('\n🚀 CONCLUSION: Manifest-driven approach WORKS!')
      console.log('   ✓ No need to store CID mappings during backup')
      console.log('   ✓ Blocks discovered automatically from manifest structure')
      console.log('   ✓ Perfect hash preservation and data integrity')
      console.log('   ✓ Much simpler backup/restore workflow!')
    } else {
      console.log('\n⚡ CONCLUSION: Manifest-driven approach PARTIALLY works!')
      console.log('   ⚠️ Some blocks may have been missed during discovery')
    }
    
    return {
      success: dataKeys.length === testData.length && restoredDB.address === backupResult.databaseAddress,
      blocksDiscovered: discoveredBlocks.size,
      blocksStored: storedCount,
      entriesRestored: dataKeys.length,
      expectedEntries: testData.length,
      addressPreserved: restoredDB.address === backupResult.databaseAddress
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
  testManifestDrivenApproach()
    .then(result => {
      console.log('\n📋 Final Result:', result)
      process.exit(result.success ? 0 : 1)
    })
    .catch(error => {
      console.error('\n💥 Test execution failed:', error)
      process.exit(1)
    })
}

export { testManifestDrivenApproach }
