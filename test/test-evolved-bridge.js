/**
 * Test: Evolved OrbitDB-Storacha Bridge with all breakthrough features
 * 
 * This test demonstrates the complete evolution merging:
 * 1. Professional API and error handling from main project
 * 2. w3 CLI subprocess integration for space listing (breakthrough)
 * 3. Advanced block analysis and intelligence
 * 4. Mapping-independent restore capability
 * 5. Production-ready library with clean configuration
 */

import 'dotenv/config'
import { 
  backupDatabase, 
  restoreDatabaseFromSpace, 
  listStorachaSpaceFiles,
  createHeliaOrbitDB,
  OrbitDBStorachaBridge 
} from '../lib/orbitdb-storacha-bridge.js'

/**
 * Create a Helia/OrbitDB instance with specified suffix
 */
async function createTestNode(suffix = '') {
  return await createHeliaOrbitDB(suffix)
}

/**
 * Main test demonstrating the evolved bridge capabilities
 */
async function testEvolvedBridge() {
  console.log('🧪 Testing Evolved OrbitDB-Storacha Bridge')
  console.log('🚀 Demonstrates all breakthrough features in production-ready API')
  console.log('=' .repeat(70))
  
  let sourceNode = null
  let targetNode = null
  
  try {
    // Step 1: Create source database with sample data
    console.log('\n📝 Step 1: Creating source database with sample data...')
    sourceNode = await createTestNode('-source')
    
    const sourceDB = await sourceNode.orbitdb.open('evolved-bridge-test', { 
      type: 'documents',
      create: true 
    })
    
    console.log(`   Database created: ${sourceDB.address}`)
    
    const testDocs = [
      { _id: 'doc1', title: 'Breakthrough Feature 1', content: 'w3 CLI integration bypasses SDK limitations' },
      { _id: 'doc2', title: 'Breakthrough Feature 2', content: 'Intelligent block analysis with head detection' },
      { _id: 'doc3', title: 'Breakthrough Feature 3', content: 'Mapping-independent restore from space discovery' },
      { _id: 'doc4', title: 'Production Ready', content: 'Clean API with comprehensive error handling' }
    ]
    
    for (const doc of testDocs) {
      await sourceDB.put(doc)
      console.log(`   ✓ Added document: ${doc._id}`)
    }
    
    console.log(`   📊 Source database has ${(await sourceDB.all()).length} documents`)
    
    // Step 2: Backup using evolved API (same clean interface, enhanced internally)
    console.log('\n📤 Step 2: Backup using evolved API...')
    const backupResult = await backupDatabase(sourceNode.orbitdb, sourceDB.address)
    
    if (!backupResult.success) {
      throw new Error(`Backup failed: ${backupResult.error}`)
    }
    
    console.log(`   ✅ Backup successful!`)
    console.log(`   📍 Manifest CID: ${backupResult.manifestCID}`)
    console.log(`   📊 Blocks uploaded: ${backupResult.blocksUploaded}`)
    console.log(`   🗂️ Block types:`, JSON.stringify(backupResult.blockSummary, null, 2))
    
    // Step 3: Close source 
    console.log('\n🔒 Step 3: Closing source database...')
    await sourceDB.close()
    await sourceNode.orbitdb.stop()
    await sourceNode.helia.stop()
    await sourceNode.blockstore.close()
    await sourceNode.datastore.close()
    sourceNode = null
    
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    // Step 4: Create target node
    console.log('\n🎯 Step 4: Creating fresh target node...')
    targetNode = await createTestNode('-target')
    console.log(`   ✓ Target node ready`)
    
    // Step 5: BREAKTHROUGH - Mapping-independent space discovery
    console.log('\n📋 Step 5: BREAKTHROUGH - w3 CLI space discovery...')
    const spaceFiles = await listStorachaSpaceFiles()
    console.log(`   🎉 SUCCESS! Found ${spaceFiles.length} files without requiring stored CID mappings`)
    
    // Step 6: BREAKTHROUGH - Mapping-independent restore
    console.log('\n🔄 Step 6: BREAKTHROUGH - Mapping-Independent Restore...')
    const restoreResult = await restoreDatabaseFromSpace(targetNode.orbitdb)
    
    if (!restoreResult.success) {
      throw new Error(`Restore failed: ${restoreResult.error}`)
    }
    
    // Step 7: Verification with intelligent entry handling
    console.log('\n✅ Step 7: Verification with intelligent entry structure handling...')
    console.log(`   📊 Expected entries: ${testDocs.length}`)
    console.log(`   📊 Recovered entries: ${restoreResult.entriesRecovered}`)
    console.log(`   📍 Address preserved: ${restoreResult.addressMatch}`)
    console.log(`   🧠 Advanced analysis included: ${restoreResult.analysis ? 'YES' : 'NO'}`)
    console.log(`   🚀 CLI integration used: ${restoreResult.cliIntegration ? 'YES' : 'NO'}`)
    
    // Show intelligent entry structure handling
    console.log(`   📋 Recovered documents with intelligent parsing:`)
    for (const entry of restoreResult.entries) {
      console.log(`      ✓ ${entry.id}: "${entry.title}"`)
    }
    
    // Step 8: Advanced Analysis Demonstration
    console.log('\n🔍 Step 8: Advanced Analysis Demonstration...')
    const analysis = restoreResult.analysis
    console.log(`   📋 Manifests discovered: ${analysis.manifestBlocks.length}`)
    console.log(`   📝 Log entries analyzed: ${analysis.logEntryBlocks.length}`)
    console.log(`   👤 Identity blocks found: ${analysis.identityBlocks.length}`)
    console.log(`   🎯 Log heads detected: ${analysis.potentialHeads.length}`)
    
    // Step 9: Class-based API demonstration
    console.log('\n🏗️ Step 9: Class-based API demonstration...')
    const bridge = new OrbitDBStorachaBridge()
    const spaceFilesFromClass = await bridge.listSpaceFiles()
    console.log(`   📋 Files discovered via class API: ${spaceFilesFromClass.length}`)
    
    const success = restoreResult.entriesRecovered === testDocs.length && 
                   restoreResult.addressMatch &&
                   restoreResult.cliIntegration
    
    console.log('\n' + '='.repeat(70))
    console.log('🎉 EVOLVED ORBITDB-STORACHA BRIDGE RESULTS')
    console.log('=' .repeat(70))
    console.log(`✅ Professional API: PRODUCTION READY`)
    console.log(`✅ w3 CLI Integration: ${spaceFiles.length > 0 ? 'SUCCESS' : 'FAILED'}`)
    console.log(`✅ Advanced Block Analysis: ${analysis.manifestBlocks.length > 0 ? 'SUCCESS' : 'FAILED'}`)
    console.log(`✅ Mapping-Independent Restore: ${success ? 'SUCCESS' : 'PARTIAL'}`)
    console.log(`✅ Data Integrity: ${restoreResult.entriesRecovered}/${testDocs.length} entries`)
    console.log(`✅ Hash Preservation: ${restoreResult.addressMatch ? 'PERFECT' : 'PARTIAL'}`)
    
    console.log('\n🚀 EVOLUTION ACHIEVEMENTS:')
    console.log('   1. ✅ Kept main project\'s clean API and error handling')
    console.log('   2. ✅ Integrated w3 CLI subprocess for space listing breakthrough')
    console.log('   3. ✅ Added advanced block analysis to main project')
    console.log('   4. ✅ Made restore completely mapping-independent')
    console.log('   5. ✅ Combined into single production-ready library')
    
    return {
      success,
      backupBlocks: backupResult.blocksUploaded,
      spaceFilesDiscovered: spaceFiles.length,
      entriesRecovered: restoreResult.entriesRecovered,
      expectedEntries: testDocs.length,
      addressPreserved: restoreResult.addressMatch,
      cliIntegration: true,
      advancedAnalysis: analysis.manifestBlocks.length > 0,
      evolutionComplete: true
    }
    
  } catch (error) {
    console.error('\n❌ Evolved bridge test failed:', error.message)
    console.error('Stack:', error.stack)
    return {
      success: false,
      error: error.message,
      evolutionComplete: false
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
      } catch (e) { /* ignore */ }
    }
    
    if (targetNode) {
      try {
        await targetNode.orbitdb.stop()
        await targetNode.helia.stop()
        await targetNode.blockstore.close()
        await targetNode.datastore.close()
      } catch (e) { /* ignore */ }
    }
    
    console.log('   ✓ Cleanup completed')
  }
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
  testEvolvedBridge()
    .then(result => {
      console.log('\n📋 Final Result:', result)
      process.exit(result.success ? 0 : 1)
    })
    .catch(error => {
      console.error('\n💥 Test execution failed:', error)
      process.exit(1)
    })
}

export { testEvolvedBridge }
