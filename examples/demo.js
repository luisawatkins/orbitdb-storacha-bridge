/**
 * CID Bridge Replication: OrbitDB reconstruction with CID format bridging
 * Upload blocks to Storacha, then download and bridge CID formats for OrbitDB
 */

import 'dotenv/config'
import * as Client from '@web3-storage/w3up-client'
import { StoreMemory } from '@web3-storage/w3up-client/stores/memory'
import { Signer } from '@web3-storage/w3up-client/principal/ed25519'
import * as Proof from '@web3-storage/w3up-client/proof'
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
  
  const blockstore = new LevelBlockstore(`./cid-bridge-test${suffix}`)
  const datastore = new LevelDatastore(`./cid-bridge-test${suffix}-data`)
  
  await blockstore.open()
  await datastore.open()
  
  const helia = await createHelia({ libp2p, blockstore, datastore })
  const orbitdb = await createOrbitDB({ ipfs: helia })
  
  return { helia, orbitdb, libp2p, blockstore, datastore }
}

/**
 * Convert Storacha CID to OrbitDB CID format
 */
function convertStorachaCIDToOrbitDB(storachaCID) {
  const storachaParsed = CID.parse(storachaCID)
  
  // Create CIDv1 with dag-cbor codec using the same multihash
  const orbitdbCID = CID.createV1(0x71, storachaParsed.multihash) // 0x71 = dag-cbor
  
  // Return in base58btc format (zdpu prefix)
  return orbitdbCID.toString(bases.base58btc)
}

/**
 * Extract all blocks from an OrbitDB database
 */
async function extractDatabaseBlocks(database) {
  console.log(`🔍 Extracting all blocks from database: ${database.name}`)
  
  const blocks = new Map()
  const blockSources = new Map()
  
  // 1. Get all log entries
  const entries = await database.log.values()
  console.log(`   Found ${entries.length} log entries`)
  
  for (const entry of entries) {
    try {
      const entryBytes = await database.log.storage.get(entry.hash)
      if (entryBytes) {
        const entryCid = CID.parse(entry.hash)
        blocks.set(entry.hash, { cid: entryCid, bytes: entryBytes })
        blockSources.set(entry.hash, 'log_entry')
        console.log(`   ✓ Entry block: ${entry.hash}`)
      }
    } catch (error) {
      console.warn(`   ⚠️ Failed to get entry ${entry.hash}: ${error.message}`)
    }
  }
  
  // 2. Get database manifest
  const addressParts = database.address.split('/')
  const manifestCID = addressParts[addressParts.length - 1]
  
  try {
    const manifestBytes = await database.log.storage.get(manifestCID)
    if (manifestBytes) {
      const manifestParsedCid = CID.parse(manifestCID)
      blocks.set(manifestCID, { cid: manifestParsedCid, bytes: manifestBytes })
      blockSources.set(manifestCID, 'manifest')
      console.log(`   ✓ Manifest block: ${manifestCID}`)
      
      // Decode manifest to get access controller
      try {
        const manifestBlock = await Block.decode({
          cid: manifestParsedCid,
          bytes: manifestBytes,
          codec: dagCbor,
          hasher: sha256
        })
        
        console.log(`   📋 Manifest content:`)
        console.log(`      Name: ${manifestBlock.value.name}`)
        console.log(`      Type: ${manifestBlock.value.type}`)
        console.log(`      Access Controller: ${manifestBlock.value.accessController}`)
        
        // Get access controller block
        if (manifestBlock.value.accessController) {
          const accessControllerCID = manifestBlock.value.accessController.replace('/ipfs/', '')
          try {
            const accessBytes = await database.log.storage.get(accessControllerCID)
            if (accessBytes) {
              const accessParsedCid = CID.parse(accessControllerCID)
              blocks.set(accessControllerCID, { cid: accessParsedCid, bytes: accessBytes })
              blockSources.set(accessControllerCID, 'access_controller')
              console.log(`   ✓ Access controller: ${accessControllerCID}`)
            }
          } catch (error) {
            console.warn(`   ⚠️ Could not get access controller: ${error.message}`)
          }
        }
        
      } catch (error) {
        console.warn(`   ⚠️ Could not decode manifest: ${error.message}`)
      }
    }
  } catch (error) {
    console.warn(`   ⚠️ Could not get manifest: ${error.message}`)
  }
  
  // 3. Get identity blocks referenced by entries
  console.log(`   🔍 Extracting identity blocks...`)
  const identityBlocks = new Set()
  
  for (const entry of entries) {
    if (entry.identity) {
      identityBlocks.add(entry.identity)
    }
  }
  
  for (const identityHash of identityBlocks) {
    try {
      const identityBytes = await database.log.storage.get(identityHash)
      if (identityBytes) {
        const identityParsedCid = CID.parse(identityHash)
        blocks.set(identityHash, { cid: identityParsedCid, bytes: identityBytes })
        blockSources.set(identityHash, 'identity')
        console.log(`   ✓ Identity block: ${identityHash}`)
      }
    } catch (error) {
      console.warn(`   ⚠️ Could not get identity ${identityHash}: ${error.message}`)
    }
  }
  
  console.log(`   📊 Extracted ${blocks.size} total blocks`)
  return { blocks, blockSources, manifestCID }
}

/**
 * Upload individual blocks directly to Storacha/IPFS
 */
async function uploadBlocksToStoracha(blocks, client) {
  console.log(`📤 Uploading ${blocks.size} blocks directly to Storacha...`)
  
  const uploadResults = []
  const cidMappings = new Map() // Track original CID → uploaded CID mappings
  
  for (const [hash, blockData] of blocks) {
    try {
      // Create a File from the block bytes
      const blockFile = new File([blockData.bytes], hash, {
        type: 'application/octet-stream'
      })
      
      console.log(`   📤 Uploading block ${hash} (${blockData.bytes.length} bytes)...`)
      
      // Upload directly to Storacha
      const result = await client.uploadFile(blockFile)
      const uploadedCID = result.toString()
      
      console.log(`   ✅ Uploaded: ${hash} → ${uploadedCID}`)
      
      // Store CID mapping
      cidMappings.set(hash, uploadedCID)
      
      uploadResults.push({
        originalHash: hash,
        uploadedCID,
        size: blockData.bytes.length
      })
      
    } catch (error) {
      console.error(`   ❌ Failed to upload block ${hash}: ${error.message}`)
      uploadResults.push({
        originalHash: hash,
        error: error.message,
        size: blockData.bytes.length
      })
    }
  }
  
  const successful = uploadResults.filter(r => r.uploadedCID)
  const failed = uploadResults.filter(r => r.error)
  
  console.log(`   📊 Upload summary:`)
  console.log(`      Total blocks: ${blocks.size}`)
  console.log(`      Successful: ${successful.length}`)
  console.log(`      Failed: ${failed.length}`)
  
  return { uploadResults, successful, failed, cidMappings }
}

/**
 * Download blocks from Storacha and bridge CID formats for OrbitDB
 */
async function downloadAndBridgeBlocks(cidMappings, client, targetBlockstore) {
  console.log(`📥 Downloading and bridging ${cidMappings.size} blocks for OrbitDB...`)
  
  const bridgedBlocks = []
  
  for (const [originalCID, storachaCID] of cidMappings) {
    try {
      console.log(`   📥 Downloading ${storachaCID}...`)
      
      // Download block from Storacha  
      const response = await fetch(`https://w3s.link/ipfs/${storachaCID}`)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const blockBytes = new Uint8Array(await response.arrayBuffer())
      console.log(`   ✅ Downloaded ${blockBytes.length} bytes`)
      
      // Convert Storacha CID to OrbitDB format
      const bridgedCID = convertStorachaCIDToOrbitDB(storachaCID)
      console.log(`   🌉 Bridged CID: ${storachaCID} → ${bridgedCID}`)
      
      // Verify the bridged CID matches the original
      if (bridgedCID === originalCID) {
        console.log(`   ✅ CID bridge successful: ${bridgedCID}`)
      } else {
        console.warn(`   ⚠️ CID bridge mismatch: expected ${originalCID}, got ${bridgedCID}`)
      }
      
      // Store block in target blockstore under OrbitDB CID format
      const parsedBridgedCID = CID.parse(bridgedCID)
      await targetBlockstore.put(parsedBridgedCID, blockBytes)
      console.log(`   💾 Stored in blockstore as: ${bridgedCID}`)
      
      bridgedBlocks.push({
        originalCID,
        storachaCID,
        bridgedCID,
        size: blockBytes.length,
        match: bridgedCID === originalCID
      })
      
    } catch (error) {
      console.error(`   ❌ Failed to download/bridge ${storachaCID}: ${error.message}`)
      bridgedBlocks.push({
        originalCID,
        storachaCID,
        error: error.message
      })
    }
  }
  
  const successful = bridgedBlocks.filter(b => b.bridgedCID)
  const failed = bridgedBlocks.filter(b => b.error)
  const matches = successful.filter(b => b.match)
  
  console.log(`   📊 Bridge summary:`)
  console.log(`      Total blocks: ${cidMappings.size}`)
  console.log(`      Downloaded: ${successful.length}`)
  console.log(`      Failed: ${failed.length}`)
  console.log(`      CID matches: ${matches.length}`)
  
  return { bridgedBlocks, successful, failed, matches }
}

/**
 * Test CID bridge replication
 */
async function testCIDBridgeReplication() {
  console.log('🚀 Testing CID Bridge Replication via Storacha')
  console.log('=' .repeat(60))
  
  let sourceNode, targetNode
  
  try {
    // Step 1: Initialize Storacha client
    console.log('\n🌉 Step 1: Initializing Storacha client...')
    const principal = Signer.parse(process.env.STORACHA_KEY)
    const store = new StoreMemory()
    const client = await Client.create({ principal, store })
    
    const proof = await Proof.parse(process.env.STORACHA_PROOF)
    const space = await client.addSpace(proof)
    await client.setCurrentSpace(space.did())
    
    console.log(`✅ Storacha client initialized with space: ${space.did()}`)
    
    // Step 2: Create source database
    console.log('\n📡 Step 2: Creating source database...')
    sourceNode = await createHeliaOrbitDB('-source')
    
    const sourceDB = await sourceNode.orbitdb.open('cid-bridge-test', { type: 'events' })
    
    // Add sample data
    const entries = [
      'CID Bridge Test 1',
      'CID Bridge Test 2', 
      'CID Bridge Test 3',
      'CID Bridge Test 4'
    ]
    
    for (const content of entries) {
      const hash = await sourceDB.add(content)
      console.log(`   📝 Added: ${hash} - ${content}`)
    }
    
    console.log(`\n📊 Source database created:`)
    console.log(`   Name: ${sourceDB.name}`)
    console.log(`   Address: ${sourceDB.address}`)
    console.log(`   Entries: ${(await sourceDB.all()).length}`)
    
    // Step 3: Extract all blocks
    console.log('\n🔍 Step 3: Extracting database blocks...')
    const { blocks, blockSources, manifestCID } = await extractDatabaseBlocks(sourceDB)
    
    console.log(`\n📋 Block summary by type:`)
    const sourceTypes = {}
    for (const [hash, source] of blockSources) {
      sourceTypes[source] = (sourceTypes[source] || 0) + 1
    }
    for (const [type, count] of Object.entries(sourceTypes)) {
      console.log(`   ${type}: ${count} blocks`)
    }
    
    // Step 4: Upload blocks to Storacha
    console.log('\n📤 Step 4: Uploading blocks to Storacha...')
    const { successful, cidMappings } = await uploadBlocksToStoracha(blocks, client)
    
    if (successful.length === 0) {
      throw new Error('No blocks were successfully uploaded')
    }
    
    console.log(`\n✅ Upload completed: ${successful.length}/${blocks.size} blocks uploaded`)
    
    // Close source database
    await sourceDB.close()
    await sourceNode.orbitdb.stop()
    await sourceNode.helia.stop()
    await sourceNode.blockstore.close()
    await sourceNode.datastore.close()
    
    console.log('\n🧹 Source database closed and cleaned up')
    
    // Step 5: Create target node and download/bridge blocks
    console.log('\n🔄 Step 5: Creating target node...')
    targetNode = await createHeliaOrbitDB('-target')
    
    console.log('\n🌉 Step 6: Downloading and bridging blocks...')
    const { successful: bridged, matches } = await downloadAndBridgeBlocks(cidMappings, client, targetNode.blockstore)
    
    if (bridged.length === 0) {
      throw new Error('No blocks were successfully bridged')
    }
    
    console.log(`\n✅ Bridge completed: ${bridged.length}/${cidMappings.size} blocks bridged`)
    console.log(`   🎯 Perfect CID matches: ${matches.length}/${bridged.length}`)
    
    if (matches.length < bridged.length) {
      throw new Error('Some CID bridges failed - reconstruction will fail')
    }
    
    // Step 7: Reconstruct database
    console.log('\n📥 Step 7: Reconstructing OrbitDB database...')
    const databaseAddress = `/orbitdb/${manifestCID}`
    console.log(`   🔍 Opening database at: ${databaseAddress}`)
    
    const reconstructedDB = await targetNode.orbitdb.open(databaseAddress)
    
    console.log(`   ✅ Database opened successfully!`)
    console.log(`      Name: ${reconstructedDB.name}`)
    console.log(`      Address: ${reconstructedDB.address}`)
    console.log(`      Type: ${reconstructedDB.type}`)
    
    // Wait for OrbitDB to load entries
    console.log(`   ⏳ Waiting for entries to load...`)
    await new Promise(resolve => setTimeout(resolve, 3000))
    
    const reconstructedEntries = await reconstructedDB.all()
    console.log(`   📊 Reconstructed ${reconstructedEntries.length} entries`)
    
    // Show reconstructed entries
    for (let i = 0; i < reconstructedEntries.length; i++) {
      const entry = reconstructedEntries[i]
      console.log(`      ${i + 1}. ${entry.hash}: "${entry.value}"`)
    }
    
    const originalCount = entries.length
    const reconstructedCount = reconstructedEntries.length
    const addressMatch = reconstructedDB.address === sourceDB.address
    
    console.log('\n🎉 SUCCESS! CID Bridge Replication completed!')
    console.log(`   📊 Original entries: ${originalCount}`)
    console.log(`   📊 Reconstructed entries: ${reconstructedCount}`)
    console.log(`   📍 Address preserved: ${addressMatch}`)
    console.log(`   🌉 Blocks bridged: ${bridged.length}`)
    console.log(`   🎯 Perfect CID matches: ${matches.length}`)
    
    return {
      success: true,
      manifestCID,
      originalEntries: originalCount,
      reconstructedEntries: reconstructedCount,
      blocksUploaded: successful.length,
      blocksBridged: bridged.length,
      addressMatch,
      perfectBridge: matches.length === bridged.length
    }
    
  } finally {
    // Cleanup
    console.log('\n🧹 Cleaning up...')
    
    if (targetNode) {
      try {
        await targetNode.orbitdb.stop()
        await targetNode.helia.stop()
        await targetNode.blockstore.close()
        await targetNode.datastore.close()
        console.log('   ✅ Target node cleaned up')
      } catch (error) {
        console.warn(`   ⚠️ Target cleanup warning: ${error.message}`)
      }
    }
  }
}

// Run test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testCIDBridgeReplication()
    .then((result) => {
      if (result?.success) {
        console.log('\n🎉 CID Bridge Replication Test: SUCCESS!')
        console.log(`   📋 Manifest CID: ${result.manifestCID}`)
        console.log(`   📊 ${result.originalEntries} entries → ${result.reconstructedEntries} entries`)
        console.log(`   📤 ${result.blocksUploaded} blocks uploaded to Storacha`)
        console.log(`   🌉 ${result.blocksBridged} blocks bridged via CID conversion`)
        console.log(`   📍 Address preserved: ${result.addressMatch}`)
        console.log(`   🎯 Perfect CID bridge: ${result.perfectBridge}`)
        process.exit(0)
      } else {
        console.log('\n❌ CID Bridge Replication Test: FAILED!')
        process.exit(1)
      }
    })
    .catch((error) => {
      console.error('\n💥 Test failed:', error.message)
      console.error('Stack trace:', error.stack)
      process.exit(1)
    })
}

export { testCIDBridgeReplication, convertStorachaCIDToOrbitDB }
