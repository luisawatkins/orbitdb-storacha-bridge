/**
 * OrbitDB Storacha Bridge - Main Library
 * 
 * Provides complete OrbitDB database backup and restoration via Storacha/Filecoin
 * with 100% hash preservation and identity recovery.
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
 * Default configuration options
 */
const DEFAULT_OPTIONS = {
  timeout: 30000,
  retries: 3,
  gateway: 'https://w3s.link',
  validateIntegrity: true,
  includeIdentity: true
}

/**
 * Create a Helia/OrbitDB instance with specified suffix
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
  const blockstore = new LevelBlockstore(`./orbitdb-bridge-${uniqueId}${suffix}`)
  const datastore = new LevelDatastore(`./orbitdb-bridge-${uniqueId}${suffix}-data`)
  
  await blockstore.open()
  await datastore.open()
  
  const helia = await createHelia({ libp2p, blockstore, datastore })
  const orbitdb = await createOrbitDB({ ipfs: helia })
  
  return { helia, orbitdb, libp2p, blockstore, datastore }
}

/**
 * Convert Storacha CID format to OrbitDB CID format
 * 
 * @param {string} storachaCID - Storacha CID (bafkre... format)
 * @returns {string} - OrbitDB CID (zdpu... format)
 */
export function convertStorachaCIDToOrbitDB(storachaCID) {
  const storachaParsed = CID.parse(storachaCID)
  
  // Create CIDv1 with dag-cbor codec using the same multihash
  const orbitdbCID = CID.createV1(0x71, storachaParsed.multihash) // 0x71 = dag-cbor
  
  // Return in base58btc format (zdpu prefix)
  return orbitdbCID.toString(bases.base58btc)
}

/**
 * Extract manifest CID from OrbitDB address
 * 
 * @param {string} databaseAddress - OrbitDB address (/orbitdb/zdpu...)
 * @returns {string} - Manifest CID
 */
export function extractManifestCID(databaseAddress) {
  return databaseAddress.split('/').pop()
}

/**
 * Extract all blocks from an OrbitDB database
 * 
 * @param {Object} database - OrbitDB database instance
 * @returns {Promise<Object>} - { blocks, blockSources, manifestCID }
 */
export async function extractDatabaseBlocks(database) {
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
 * Initialize Storacha client with credentials
 * 
 * @param {string} storachaKey - Storacha private key
 * @param {string} storachaProof - Storacha proof
 * @returns {Promise<Object>} - Initialized Storacha client
 */
async function initializeStorachaClient(storachaKey, storachaProof) {
  const principal = Signer.parse(storachaKey)
  const store = new StoreMemory()
  const client = await Client.create({ principal, store })
  
  const proof = await Proof.parse(storachaProof)
  const space = await client.addSpace(proof)
  await client.setCurrentSpace(space.did())
  
  return client
}

/**
 * Upload individual blocks directly to Storacha/IPFS
 * 
 * @param {Map} blocks - Map of blocks to upload
 * @param {Object} client - Storacha client
 * @returns {Promise<Object>} - Upload results and CID mappings
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
 * 
 * @param {Map} cidMappings - Mapping of original → uploaded CIDs
 * @param {Object} client - Storacha client (unused, kept for compatibility)
 * @param {Object} targetBlockstore - Target blockstore to store blocks
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} - Bridge results
 */
async function downloadAndBridgeBlocks(cidMappings, client, targetBlockstore, options = {}) {
  const config = { ...DEFAULT_OPTIONS, ...options }
  console.log(`📥 Downloading and bridging ${cidMappings.size} blocks for OrbitDB...`)
  
  const bridgedBlocks = []
  
  for (const [originalCID, storachaCID] of cidMappings) {
    try {
      console.log(`   📥 Downloading ${storachaCID}...`)
      
      // Download block from Storacha  
      const response = await fetch(`${config.gateway}/ipfs/${storachaCID}`, {
        timeout: config.timeout
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const blockBytes = new Uint8Array(await response.arrayBuffer())
      console.log(`   ✅ Downloaded ${blockBytes.length} bytes`)
      
      // Convert Storacha CID to OrbitDB format
      const bridgedCID = convertStorachaCIDToOrbitDB(storachaCID)
      console.log(`   🌉 Bridged CID: ${storachaCID} → ${bridgedCID}`)
      
      // Verify the bridged CID matches the original
      const match = bridgedCID === originalCID
      if (match) {
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
        match
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
 * Backup an OrbitDB database to Storacha
 * 
 * @param {Object} orbitdb - OrbitDB instance
 * @param {string} databaseAddress - Database address or name
 * @param {Object} options - Backup options
 * @returns {Promise<Object>} - Backup result
 */
export async function backupDatabase(orbitdb, databaseAddress, options = {}) {
  const config = { ...DEFAULT_OPTIONS, ...options }
  
  console.log('🚀 Starting OrbitDB Database Backup to Storacha')
  console.log(`📍 Database: ${databaseAddress}`)
  
  try {
    // Initialize Storacha client
    const client = await initializeStorachaClient(
      config.storachaKey || process.env.STORACHA_KEY,
      config.storachaProof || process.env.STORACHA_PROOF
    )
    
    // Open the database
    const database = typeof databaseAddress === 'string' && databaseAddress.startsWith('/orbitdb/') 
      ? await orbitdb.open(databaseAddress)
      : await orbitdb.open(databaseAddress)
    
    // Extract all blocks
    const { blocks, blockSources, manifestCID } = await extractDatabaseBlocks(database)
    
    // Upload blocks to Storacha
    const { successful, cidMappings } = await uploadBlocksToStoracha(blocks, client)
    
    if (successful.length === 0) {
      throw new Error('No blocks were successfully uploaded')
    }
    
    // Get block summary
    const blockSummary = {}
    for (const [hash, source] of blockSources) {
      blockSummary[source] = (blockSummary[source] || 0) + 1
    }
    
    console.log('✅ Backup completed successfully!')
    
    return {
      success: true,
      manifestCID,
      databaseAddress: database.address,
      databaseName: database.name,
      blocksTotal: blocks.size,
      blocksUploaded: successful.length,
      blockSummary,
      cidMappings: Object.fromEntries(cidMappings)
    }
    
  } catch (error) {
    console.error('❌ Backup failed:', error.message)
    return {
      success: false,
      error: error.message
    }
  }
}

/**
 * Restore an OrbitDB database from Storacha
 * 
 * @param {Object} orbitdb - Target OrbitDB instance
 * @param {string} manifestCID - Manifest CID from backup
 * @param {Object} cidMappings - Optional CID mappings (if available)
 * @param {Object} options - Restore options
 * @returns {Promise<Object>} - Restore result
 */
export async function restoreDatabase(orbitdb, manifestCID, cidMappings = null, options = {}) {
  const config = { ...DEFAULT_OPTIONS, ...options }
  
  console.log('🔄 Starting OrbitDB Database Restore from Storacha')
  console.log(`📍 Manifest CID: ${manifestCID}`)
  
  // Create temporary Helia/OrbitDB instance for restoration
  let heliaNode = null
  
  try {
    // Initialize Storacha client (if we need to discover CID mappings)
    const client = await initializeStorachaClient(
      config.storachaKey || process.env.STORACHA_KEY,
      config.storachaProof || process.env.STORACHA_PROOF
    )
    
    // If no CID mappings provided, we need to discover them
    // This is a simplified version - in practice you'd store mappings during backup
    if (!cidMappings) {
      throw new Error('CID mappings required for restore. Store them during backup.')
    }
    
    // Convert object back to Map if needed
    const mappings = cidMappings instanceof Map 
      ? cidMappings 
      : new Map(Object.entries(cidMappings))
    
    // Download and bridge blocks
    const { successful, matches } = await downloadAndBridgeBlocks(
      mappings, 
      client, 
      orbitdb.ipfs.blockstore, 
      config
    )
    
    if (successful.length === 0) {
      throw new Error('No blocks were successfully restored')
    }
    
    if (matches.length < successful.length) {
      throw new Error('Some CID bridges failed - reconstruction may fail')
    }
    
    // Reconstruct database
    const databaseAddress = `/orbitdb/${manifestCID}`
    console.log(`📥 Opening database at: ${databaseAddress}`)
    
    const reconstructedDB = await orbitdb.open(databaseAddress)
    
    // Wait for entries to load
    console.log('⏳ Waiting for entries to load...')
    await new Promise(resolve => setTimeout(resolve, config.timeout / 10))
    
    const reconstructedEntries = await reconstructedDB.all()
    
    console.log('✅ Restore completed successfully!')
    
    return {
      success: true,
      database: reconstructedDB,
      manifestCID,
      address: reconstructedDB.address,
      name: reconstructedDB.name,
      type: reconstructedDB.type,
      entriesRecovered: reconstructedEntries.length,
      blocksRestored: successful.length,
      addressMatch: reconstructedDB.address === databaseAddress,
      entries: reconstructedEntries.map(e => ({ hash: e.hash, value: e.value }))
    }
    
  } catch (error) {
    console.error('❌ Restore failed:', error.message)
    return {
      success: false,
      error: error.message
    }
  } finally {
    // Cleanup temporary resources
    if (heliaNode) {
      try {
        await heliaNode.orbitdb.stop()
        await heliaNode.helia.stop()
        await heliaNode.blockstore.close()
        await heliaNode.datastore.close()
      } catch (error) {
        console.warn('⚠️ Cleanup warning:', error.message)
      }
    }
  }
}

/**
 * OrbitDBStorachaBridge class for advanced usage
 */
export class OrbitDBStorachaBridge {
  constructor(options = {}) {
    this.config = { ...DEFAULT_OPTIONS, ...options }
  }
  
  async backup(orbitdb, databaseAddress, options = {}) {
    return await backupDatabase(orbitdb, databaseAddress, { ...this.config, ...options })
  }
  
  async restore(orbitdb, manifestCID, cidMappings, options = {}) {
    return await restoreDatabase(orbitdb, manifestCID, cidMappings, { ...this.config, ...options })
  }
  
  extractManifestCID(databaseAddress) {
    return extractManifestCID(databaseAddress)
  }
  
  convertCID(storachaCID) {
    return convertStorachaCIDToOrbitDB(storachaCID)
  }
}

// Export all utilities
export { 
  createHeliaOrbitDB,
  initializeStorachaClient
}
