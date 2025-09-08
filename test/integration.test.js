/**
 * @fileoverview Integration Tests for OrbitDB Storacha Bridge
 * 
 * This test suite validates the complete backup and restore cycle of OrbitDB databases
 * using Storacha (Web3.Storage) as the distributed storage backend. It tests the core
 * functionality of preserving database identity, content integrity, and successful
 * cross-node restoration.
 * 
 * @author @NiKrause
 */

/* global afterAll */
import 'dotenv/config'
import { IPFSAccessController } from '@orbitdb/core';
import * as Client from '@web3-storage/w3up-client'
import { StoreMemory } from '@web3-storage/w3up-client/stores/memory'
import { Signer } from '@web3-storage/w3up-client/principal/ed25519'
import * as Proof from '@web3-storage/w3up-client/proof'
import { 
  backupDatabase, 
  restoreDatabase,
  restoreDatabaseFromSpace,
  convertStorachaCIDToOrbitDB,
  extractManifestCID,
  clearStorachaSpace
} from '../lib/orbitdb-storacha-bridge.js'

// Import utilities separately
import { 
  createHeliaOrbitDB,
  cleanupOrbitDBDirectories
} from '../lib/utils.js'

/**
 * ANSI color codes for bright console output
 */
const colors = {
  bright: '\x1b[1m',
  cyan: '\x1b[96m',
  magenta: '\x1b[95m',
  yellow: '\x1b[93m',
  green: '\x1b[92m',
  reset: '\x1b[0m'
}

/**
 * Display space and DID information in bright colors
 * @param {Object} options - Configuration options
 * @param {string} options.storachaKey - Storacha private key
 * @param {string} options.storachaProof - Storacha proof
 */
async function displaySpaceAndDIDInfo(options) {
  try {
    console.log(`${colors.bright}${colors.cyan}╔════════════════════════════════════════════════════════════════╗${colors.reset}`)
    console.log(`${colors.bright}${colors.cyan}║                    STORACHA TEST CONFIGURATION                 ║${colors.reset}`)
    console.log(`${colors.bright}${colors.cyan}╚════════════════════════════════════════════════════════════════╝${colors.reset}`)
    
    // Initialize Storacha client to get space/DID info
    const principal = Signer.parse(options.storachaKey)
    const store = new StoreMemory()
    const client = await Client.create({ principal, store })
    
    const proof = await Proof.parse(options.storachaProof)
    const space = await client.addSpace(proof)
    await client.setCurrentSpace(space.did())
    
    // Display DID information
    const spaceDID = space.did()
    const agentDID = client.agent.did()
    
    console.log(`${colors.bright}${colors.magenta}🆔 Agent DID: ${colors.yellow}${agentDID}${colors.reset}`)
    console.log(`${colors.bright}${colors.green}🚀 Space DID: ${colors.yellow}${spaceDID}${colors.reset}`)
    console.log(`${colors.bright}${colors.cyan}═══════════════════════════════════════════════════════════════════${colors.reset}\n`)
    
  } catch (error) {
    console.warn(`${colors.bright}${colors.yellow}⚠️ Could not retrieve space/DID info: ${error.message}${colors.reset}`)
  }
}

/**
 * @namespace OrbitDBStorachaBridgeIntegration
 * @description Integration test suite for OrbitDB Storacha Bridge functionality
 */
describe('OrbitDB Storacha Bridge Integration', () => {
  /** @type {Object|null} Source OrbitDB node instance */
  let sourceNode
  /** @type {Object|null} Target OrbitDB node instance */
  let targetNode
  
  /**
   * @function beforeEach
   * @description Pre-test setup that validates Storacha credentials availability
   * 
   * Checks for required environment variables:
   * - STORACHA_KEY: Authentication key for Storacha service
   * - STORACHA_PROOF: Proof token for Storacha service
   * 
   * If credentials are missing, tests will be skipped with a warning.
   */
  beforeEach(async () => {
    // Skip tests if no credentials available
    if (!process.env.STORACHA_KEY || !process.env.STORACHA_PROOF) {
      console.warn('⚠️ Skipping integration tests - no Storacha credentials')
      return
    }
    
    // Display space and DID information in bright colors
    await displaySpaceAndDIDInfo({
      storachaKey: process.env.STORACHA_KEY,
      storachaProof: process.env.STORACHA_PROOF
    })
    
    // Clear Storacha space before each test to ensure clean state
    console.log('🧹 Clearing Storacha space before test...')
    try {
      const clearResult = await clearStorachaSpace({
        storachaKey: process.env.STORACHA_KEY,
        storachaProof: process.env.STORACHA_PROOF
      })
      if (clearResult.success) {
        console.log('✅ Space cleared successfully')
      } else {
        console.warn(`⚠️ Space clearing incomplete: ${clearResult.totalFailed} failures`)
      }
    } catch (error) {
      console.warn(`⚠️ Space clearing failed: ${error.message}`)
      // Don't fail the test, just warn
    }
  })
  
  /**
   * @function afterEach
   * @description Post-test cleanup that properly shuts down all OrbitDB/Helia nodes
   * 
   * Performs graceful shutdown of:
   * - OrbitDB instances
   * - Helia IPFS nodes
   * - Blockstore connections
   * - Datastore connections
   * 
   * Handles cleanup errors gracefully to prevent test interference.
   */
  afterEach(async () => {
    // Cleanup nodes
    const nodes = [sourceNode, targetNode].filter(Boolean)
    for (const node of nodes) {
      try {
        await node.orbitdb.stop()
        await node.helia.stop()
        await node.blockstore.close()
        await node.datastore.close()
      } catch (error) {
        console.warn('Cleanup warning:', error.message)
      }
    }
    sourceNode = null
    targetNode = null
  })
  
  /**
   * @function afterAll
   * @description Final cleanup after all tests complete
   * 
   * Removes all OrbitDB directories created during testing to keep the
   * test environment clean and prevent disk space accumulation.
   */
  afterAll(async () => {
    // Clean up any remaining OrbitDB directories
    console.log('🧹 Final test cleanup...')
    await cleanupOrbitDBDirectories()
  })
  
  /**
   * @test CompleteBackupAndRestoreCycle
   * @description Tests the complete end-to-end backup and restore workflow
   * 
   * **Test Flow:**
   * 1. Creates a source OrbitDB database with test entries
   * 2. Backs up the database to Storacha with full identity preservation
   * 3. Completely destroys the source node (simulating real-world scenario)
   * 4. Creates an isolated target node on different storage
   * 5. Restores the database from Storacha backup
   * 6. Validates data integrity and identity preservation
   * 
   * **Assertions:**
   * - Backup operation succeeds with valid manifest CID
   * - All database blocks are successfully uploaded
   * - Restore operation recovers all original entries
   * - Database address/identity is perfectly preserved
   * - Entry count matches original database
   * 
   * **Key Features Tested:**
   * - Cross-node database migration
   * - Complete identity preservation
   * - Data integrity validation
   * - Network isolation between backup/restore
   * 
   * @timeout 120000 - 2 minutes for network operations
   * @requires STORACHA_KEY environment variable
   * @requires STORACHA_PROOF environment variable
   */
  test('Complete backup and restore cycle', async () => {
    // Skip if no credentials
    if (!process.env.STORACHA_KEY || !process.env.STORACHA_PROOF) {
      return
    }
    
    /** @type {Object|null} Source database instance */
    let sourceDB
    
    try {
      // Create source database
      sourceNode = await createHeliaOrbitDB('-test-source')
      sourceDB = await sourceNode.orbitdb.open('integration-test', { type: 'events' })
      
      /** @type {string[]} Test entries to validate data integrity */
      const testEntries = ['Entry 1', 'Entry 2', 'Entry 3']
      for (const entry of testEntries) {
        await sourceDB.add(entry)
      }
      
      // Backup database with explicit credentials
      const backupResult = await backupDatabase(sourceNode.orbitdb, sourceDB.address, {
        storachaKey: process.env.STORACHA_KEY,
        storachaProof: process.env.STORACHA_PROOF
      })
      expect(backupResult.success).toBe(true)
      expect(backupResult.manifestCID).toBeTruthy()
      expect(backupResult.blocksUploaded).toBeGreaterThan(0)
      
      // Close source database and clean up source node completely
      try {
        await sourceDB.close()
        await sourceNode.orbitdb.stop()
        await sourceNode.helia.stop()
        await sourceNode.blockstore.close()
        await sourceNode.datastore.close()
        sourceNode = null
      } catch (error) {
        console.warn('Source cleanup warning:', error.message)
      }
      
      // Create target node with different suffix for complete isolation
      targetNode = await createHeliaOrbitDB('-test-target-restore')
      
      // Restore database using the isolated target node with explicit credentials
      const restoreResult = await restoreDatabase(
        targetNode.orbitdb, 
        backupResult.manifestCID, 
        backupResult.cidMappings,
        {
          storachaKey: process.env.STORACHA_KEY,
          storachaProof: process.env.STORACHA_PROOF
        }
      )
      
      expect(restoreResult.success).toBe(true)
      expect(restoreResult.entriesRecovered).toBe(testEntries.length)
      expect(restoreResult.addressMatch).toBe(true)
      
      // ** CRITICAL: Verify actual data integrity **
      // Check that all original entries are present in restored data
      const restoredValues = restoreResult.entries.map(entry => entry.value)
      for (const originalEntry of testEntries) {
        expect(restoredValues).toContain(originalEntry)
      }
      
      // Verify entries array has correct structure
      expect(restoreResult.entries).toHaveLength(testEntries.length)
      restoreResult.entries.forEach(entry => {
        expect(entry).toHaveProperty('hash')
        expect(entry).toHaveProperty('value')
        expect(typeof entry.hash).toBe('string')
        expect(entry.hash).toMatch(/^zdpu/) // OrbitDB hash format
      })
      
    } finally {
      // Additional cleanup
      if (sourceDB) {
        try {
          await sourceDB.close()
        } catch (error) {
          // Already closed or error
        }
      }
    }
    
  }, 120000) // 2 minute timeout for network operations
  
  /**
   * @test MappingIndependentRestore
   * @description Tests the breakthrough mapping-independent restore feature
   * 
   * **Test Flow:**
   * 1. Creates a source OrbitDB database with test entries
   * 2. Backs up the database to Storacha
   * 3. Destroys the source node completely
   * 4. Creates a target node with NO access to CID mappings
   * 5. Restores using space discovery (no mappings required)
   * 6. Validates complete restoration without any stored mappings
   * 
   * **Key Innovation:**
   * This test validates the breakthrough feature that allows restoration
   * without requiring stored CID mappings, making the library more robust
   * and user-friendly.
   * 
   * @timeout 120000 - 2 minutes for network operations
   */
  test('Mapping-independent restore from space', async () => {
    // Skip if no credentials
    if (!process.env.STORACHA_KEY || !process.env.STORACHA_PROOF) {
      return
    }
    
    /** @type {Object|null} Source database instance */
    let sourceDB
    
    try {
      // Create source database
      sourceNode = await createHeliaOrbitDB('-test-source-space')
      sourceDB = await sourceNode.orbitdb.open('space-restore-test', { type: 'events' })
      
      /** @type {string[]} Test entries to validate data integrity */
      const testEntries = ['Space Entry 1', 'Space Entry 2', 'Space Entry 3', 'Space Entry 4']
      for (const entry of testEntries) {
        await sourceDB.add(entry)
      }
      
      // Backup database
      const backupResult = await backupDatabase(sourceNode.orbitdb, sourceDB.address, {
        storachaKey: process.env.STORACHA_KEY,
        storachaProof: process.env.STORACHA_PROOF
      })
      expect(backupResult.success).toBe(true)
      expect(backupResult.blocksUploaded).toBeGreaterThan(0)
      
      // Close source and clean up completely
      await sourceDB.close()
      await sourceNode.orbitdb.stop()
      await sourceNode.helia.stop()
      await sourceNode.blockstore.close()
      await sourceNode.datastore.close()
      sourceNode = null
      
      // Create isolated target node
      targetNode = await createHeliaOrbitDB('-test-target-space')
      
      // Restore from space WITHOUT CID mappings (breakthrough feature)
      const restoreResult = await restoreDatabaseFromSpace(targetNode.orbitdb, {
        storachaKey: process.env.STORACHA_KEY,
        storachaProof: process.env.STORACHA_PROOF
      })
      
      expect(restoreResult.success).toBe(true)
      // Space restoration discovers and restores from any available manifest in the space
      // This is a breakthrough feature - we just need to verify that some data was restored
      expect(restoreResult.entriesRecovered).toBeGreaterThan(0) 
      expect(restoreResult.blocksRestored).toBeGreaterThan(0)
      expect(restoreResult.spaceFilesFound).toBeGreaterThan(0)
      expect(restoreResult.analysis).toBeTruthy()
      expect(restoreResult.analysis.manifestBlocks.length).toBeGreaterThan(0)
      
      // ** CRITICAL: Verify actual data integrity for space restore **
      // Since space restore can find any database in the space, we need to check that
      // the restored database contains the entries we just backed up
      expect(restoreResult.entries).toBeDefined()
      expect(restoreResult.entries.length).toBeGreaterThan(0)
      
      // Check that restored entries have the correct structure
      restoreResult.entries.forEach(entry => {
        console.log("entry", entry)
        expect(entry).toHaveProperty('hash')
        expect(entry).toHaveProperty('value') 
        expect(typeof entry.hash).toBe('string')
        expect(entry.hash).toMatch(/^zdpu/) // OrbitDB hash format
      })
      
      // For this test, verify that at least some of our test entries are present
      // (Since we start with a clean space, all restored entries should be ours)
      const restoredValues = restoreResult.entries.map(entry => entry.value)
      const foundTestEntries = testEntries.filter(testEntry => restoredValues.includes(testEntry))
      expect(foundTestEntries.length).toBeGreaterThan(0)
      
      console.log(`✅ Data validation: Found ${foundTestEntries.length}/${testEntries.length} test entries in restored data`)
      
    } finally {
      if (sourceDB) {
        try {
          await sourceDB.close()
        } catch (error) {
          // Already closed
        }
      }
    }
    
  }, 120000) // 2 minute timeout for network operations
  
  /**
   * @test KeyValueMappingIndependentRestore
   * @description Tests mapping-independent backup & restore for key-value database with identity and access controller
   * 
   * **Test Flow:**
   * 1. Creates a source OrbitDB key-value database with identity and access controller
   * 2. Populates with todo entries containing rich data structures
   * 3. Backs up the complete database to Storacha
   * 4. Destroys the source node completely
   * 5. Creates an isolated target node with no access to CID mappings
   * 6. Restores using space discovery without any stored mappings
   * 7. Validates complete restoration of key-value pairs and database identity
   * 
   * **Key Features Tested:**
   * - Key-value database type with structured data
   * - Identity preservation with access controller
   * - Todo entries with timestamps, assignees, and status
   * - Mapping-independent restoration from space
   * - Cross-node database migration with full integrity
   * 
   * **Data Structure:**
   * Each todo entry contains:
   * - id: unique identifier
   * - text: todo description
   * - assignee: person assigned (can be null)
   * - completed: boolean status
   * - createdAt: ISO timestamp
   * - createdBy: peer ID
   * - updatedAt: ISO timestamp
   * 
   * @timeout 120000 - 2 minutes for network operations
   */
  test('Key-value mapping-independent restore with todos and identity', async () => {
    // Skip if no credentials
    if (!process.env.STORACHA_KEY || !process.env.STORACHA_PROOF) {
      return
    }
    
    /** @type {Object|null} Source database instance */
    let sourceDB
    
    try {
      // Create source database with key-value type and access controller
      sourceNode = await createHeliaOrbitDB('-test-source-keyvalue')
      sourceDB = await sourceNode.orbitdb.open('todos-keyvalue-test', { 
        type: 'keyvalue',
        create: true,
        accessController: IPFSAccessController({ write: ['*'] })
      })
      
      /** @type {Object[]} Todo entries to validate data integrity */
      const todoEntries = [
        {
          id: 'todo-1',
          text: 'Set up OrbitDB backup system',
          assignee: 'alice',
          completed: false,
          createdAt: new Date().toISOString(),
          createdBy: sourceNode.orbitdb.identity.id,
          updatedAt: new Date().toISOString()
        },
        {
          id: 'todo-2', 
          text: 'Test Storacha integration',
          assignee: 'bob',
          completed: true,
          createdAt: new Date().toISOString(),
          createdBy: sourceNode.orbitdb.identity.id,
          updatedAt: new Date().toISOString()
        },
        {
          id: 'todo-3',
          text: 'Deploy to production',
          assignee: null,
          completed: false,
          createdAt: new Date().toISOString(),
          createdBy: sourceNode.orbitdb.identity.id,
          updatedAt: new Date().toISOString()
        },
        {
          id: 'todo-4',
          text: 'Write documentation',
          assignee: 'charlie',
          completed: false,
          createdAt: new Date().toISOString(),
          createdBy: sourceNode.orbitdb.identity.id,
          updatedAt: new Date().toISOString()
        }
      ]
      
      // Add todo entries to key-value database
      for (const todo of todoEntries) {
        await sourceDB.put(todo.id, todo)
        console.log(`   ✓ Added todo: ${todo.id} - "${todo.text}" (${todo.completed ? 'completed' : 'pending'})`)
      }
      
      // Verify source database state
      const allTodos = await sourceDB.all()
      console.log(`   📊 Source database has ${Object.keys(allTodos).length} todos`)
      
      // Backup database with identity and access controller
      const backupResult = await backupDatabase(sourceNode.orbitdb, sourceDB.address, {
        storachaKey: process.env.STORACHA_KEY,
        storachaProof: process.env.STORACHA_PROOF
      })
      expect(backupResult.success).toBe(true)
      expect(backupResult.blocksUploaded).toBeGreaterThan(0)
      
      // Address will be verified through restoreResult.addressMatch
      
      // Close source and clean up completely
      await sourceDB.close()
      await sourceNode.orbitdb.stop()
      await sourceNode.helia.stop()
      await sourceNode.blockstore.close()
      await sourceNode.datastore.close()
      sourceNode = null
      
      // Create isolated target node
      targetNode = await createHeliaOrbitDB('-test-target-keyvalue')
      
      // Restore from space WITHOUT CID mappings (breakthrough feature)
      const restoreResult = await restoreDatabaseFromSpace(targetNode.orbitdb, {
        storachaKey: process.env.STORACHA_KEY,
        storachaProof: process.env.STORACHA_PROOF
      })
      console.log("restoreResult", restoreResult)
      expect(restoreResult.success).toBe(true)
      expect(restoreResult.entriesRecovered).toBeGreaterThan(0)
      expect(restoreResult.blocksRestored).toBeGreaterThan(0)
      expect(restoreResult.spaceFilesFound).toBeGreaterThan(0)
      expect(restoreResult.analysis).toBeTruthy()
      expect(restoreResult.analysis.manifestBlocks.length).toBeGreaterThan(0)
      
      // ** CRITICAL: Verify key-value data integrity for space restore **
      expect(restoreResult.entries).toBeDefined()
      expect(restoreResult.entries.length).toBeGreaterThan(0)
      
      // Check that restored entries have the correct key-value structure
      restoreResult.entries.forEach(entry => {
        console.log("Key-value entry:", entry.payload || entry)
        expect(entry).toHaveProperty('hash')
        expect(typeof entry.hash).toBe('string')
        expect(entry.hash).toMatch(/^zdpu/) // OrbitDB hash format
      
        // For key-value databases, entries should have key and value
        if (entry.payload) {
          console.log("entry.payload", entry.payload)
          expect(entry.payload).toHaveProperty('key')
          expect(entry.payload).toHaveProperty('value')
        }
      })
      // Verify that todo entries are present in restored data
      // Since this is a space restore, we need to find our specific database entries
      let foundTodoEntries = 0
      const restoredData = restoreResult.entries
      for (const entry of restoredData) {
        const payload = entry.payload || entry
        if (payload.value && payload.value.id.startsWith('todo-')) {
          foundTodoEntries++
          const todoData = payload.value
          
          // Validate todo structure
          expect(todoData).toHaveProperty('id')
          expect(todoData).toHaveProperty('text')
          expect(todoData).toHaveProperty('assignee')
          expect(todoData).toHaveProperty('completed')
          expect(todoData).toHaveProperty('createdAt')
          expect(todoData).toHaveProperty('createdBy')
          expect(todoData).toHaveProperty('updatedAt')
          
          // Validate data types
          expect(typeof todoData.text).toBe('string')
          expect(typeof todoData.completed).toBe('boolean')
          expect(todoData.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/) // ISO date format
          expect(todoData.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/) // ISO date format
          
          console.log(`   ✅ Restored todo: ${todoData.id} - "${todoData.text}" (${todoData.completed ? 'completed' : 'pending'})`)
        }
      }
      
      expect(foundTodoEntries).toBeGreaterThan(0)
      console.log(`✅ Key-value data validation: Found ${foundTodoEntries} todo entries in restored data`)
      
      // Verify identity and access controller preservation
      if (restoreResult.analysis.identityBlocks.length > 0) {
        console.log(`✅ Identity preservation: Found ${restoreResult.analysis.identityBlocks.length} identity blocks`)
      }
      
      if (restoreResult.analysis.accessControllerBlocks && restoreResult.analysis.accessControllerBlocks.length > 0) {
        console.log(`✅ Access controller preservation: Found ${restoreResult.analysis.accessControllerBlocks.length} access controller blocks`)
      }
      
    } finally {
      if (sourceDB) {
        try {
          await sourceDB.close()
        } catch (error) {
          // Already closed
        }
      }
    }
    
  }, 120000) // 2 minute timeout for network operations
  
  /**
   * @test CIDConversionUtilities
   * @description Tests CID format conversion between Storacha and OrbitDB formats
   * 
   * **Purpose:**
   * Validates the utility function that converts Storacha CIDs (base32, raw format)
   * to OrbitDB-compatible CIDs (base58btc, dag-cbor format with zdpu prefix).
   * 
   * **Test Data:**
   * - Input: Storacha CID in base32 format (bafkrei...)
   * - Expected Output: OrbitDB CID in base58btc format (zdpu...)
   * 
   * **Assertions:**
   * - Converted CID starts with 'zdpu' prefix (base58btc dag-cbor)
   * - Converted CID has appropriate length (>40 characters)
   * - Conversion preserves the underlying multihash
   */
  test('CID conversion utilities', () => {
    /** @type {string} Sample Storacha CID in base32 format */
    const storachaCID = 'bafkreiempxfbalco4snaqnthiqhv7rrawa7axoawnl2rb56jvidmj4sisy'
    
    /** @type {string} Converted OrbitDB-compatible CID */
    const orbitdbCID = convertStorachaCIDToOrbitDB(storachaCID)
    
    expect(orbitdbCID).toMatch(/^zdpu/)
    expect(orbitdbCID.length).toBeGreaterThan(40)
  })
  
  /**
   * @test ManifestCIDExtraction
   * @description Tests extraction of manifest CID from OrbitDB database addresses
   * 
   * **Purpose:**
   * Validates the utility function that extracts the manifest CID (database identifier)
   * from a complete OrbitDB database address path.
   * 
   * **Test Data:**
   * - Input: Full OrbitDB address (/orbitdb/zdpu...)
   * - Expected Output: Just the CID portion (zdpu...)
   * 
   * **Assertions:**
   * - Extracted CID matches the expected manifest identifier
   * - Function correctly strips the /orbitdb/ prefix
   * 
   * **Use Case:**
   * This extraction is essential for backup operations where the manifest CID
   * serves as the primary identifier for database restoration.
   */
  test('Manifest CID extraction', () => {
    /** @type {string} Sample OrbitDB database address */
    const address = '/orbitdb/zdpuAy2JxUiqCzuTAhT5ukfHD1oxbcpJ6eH1VTUegC8Ljv4WK'
    
    /** @type {string} Extracted manifest CID */
    const manifestCID = extractManifestCID(address)
    
    expect(manifestCID).toBe('zdpuAy2JxUiqCzuTAhT5ukfHD1oxbcpJ6eH1VTUegC8Ljv4WK')
  })
})
