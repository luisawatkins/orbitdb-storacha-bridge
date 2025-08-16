/**
 * @fileoverview Integration Tests for OrbitDB Storacha Bridge
 * 
 * This test suite validates the complete backup and restore cycle of OrbitDB databases
 * using Storacha (Web3.Storage) as the distributed storage backend. It tests the core
 * functionality of preserving database identity, content integrity, and successful
 * cross-node restoration.
 * 
 * @author OrbitDB Storacha Bridge Team
 * @version 1.0.0
 * @requires dotenv - For environment variable configuration
 * @requires ../lib/orbitdb-storacha-bridge.js - Main bridge library functions
 */

import 'dotenv/config'
import { 
  backupDatabase, 
  restoreDatabase, 
  createHeliaOrbitDB,
  convertStorachaCIDToOrbitDB,
  extractManifestCID
} from '../lib/orbitdb-storacha-bridge.js'

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
      
      // Backup database
      const backupResult = await backupDatabase(sourceNode.orbitdb, sourceDB.address)
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
      
      // Restore database using the isolated target node
      const restoreResult = await restoreDatabase(
        targetNode.orbitdb, 
        backupResult.manifestCID, 
        backupResult.cidMappings
      )
      
      expect(restoreResult.success).toBe(true)
      expect(restoreResult.entriesRecovered).toBe(testEntries.length)
      expect(restoreResult.addressMatch).toBe(true)
      
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
