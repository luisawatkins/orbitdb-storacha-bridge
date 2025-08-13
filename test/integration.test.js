/**
 * Integration Tests for OrbitDB Storacha Bridge
 */

import 'dotenv/config'
import { 
  backupDatabase, 
  restoreDatabase, 
  createHeliaOrbitDB,
  convertStorachaCIDToOrbitDB,
  extractManifestCID
} from '../lib/orbitdb-storacha-bridge.js'

describe('OrbitDB Storacha Bridge Integration', () => {
  let sourceNode, targetNode
  
  beforeEach(async () => {
    // Skip tests if no credentials available
    if (!process.env.STORACHA_KEY || !process.env.STORACHA_PROOF) {
      console.warn('⚠️ Skipping integration tests - no Storacha credentials')
      return
    }
  })
  
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
  
  test('Complete backup and restore cycle', async () => {
    // Skip if no credentials
    if (!process.env.STORACHA_KEY || !process.env.STORACHA_PROOF) {
      return
    }
    
    let sourceDB
    
    try {
      // Create source database
      sourceNode = await createHeliaOrbitDB('-test-source')
      sourceDB = await sourceNode.orbitdb.open('integration-test', { type: 'events' })
      
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
  
  test('CID conversion utilities', () => {
    const storachaCID = 'bafkreiempxfbalco4snaqnthiqhv7rrawa7axoawnl2rb56jvidmj4sisy'
    const orbitdbCID = convertStorachaCIDToOrbitDB(storachaCID)
    
    expect(orbitdbCID).toMatch(/^zdpu/)
    expect(orbitdbCID.length).toBeGreaterThan(40)
  })
  
  test('Manifest CID extraction', () => {
    const address = '/orbitdb/zdpuAy2JxUiqCzuTAhT5ukfHD1oxbcpJ6eH1VTUegC8Ljv4WK'
    const manifestCID = extractManifestCID(address)
    
    expect(manifestCID).toBe('zdpuAy2JxUiqCzuTAhT5ukfHD1oxbcpJ6eH1VTUegC8Ljv4WK')
  })
})
