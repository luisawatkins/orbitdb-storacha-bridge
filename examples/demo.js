/**
 * OrbitDB Storacha Bridge Demo - Node.js Edition
 * 
 * Demonstrates complete OrbitDB database backup and restoration via Storacha/Filecoin
 * with 100% hash preservation and identity recovery using the refactored library.
 */

// Import dotenv for Node.js environment variable handling
import 'dotenv/config'
import { 
  backupDatabase, 
  restoreDatabaseFromSpace
} from '../lib/orbitdb-storacha-bridge.js'

// Import utilities separately  
import { 
  createHeliaOrbitDB,
  cleanupOrbitDBDirectories
} from '../lib/utils.js'

/**
 * Test complete OrbitDB backup and restore workflow
 */
async function testOrbitDBStorachaBridge() {
  console.log('🚀 Testing OrbitDB Storacha Bridge')
  console.log('=' .repeat(60))
  
  let sourceNode, targetNode
  
  try {
    // Step 1: Create source database with sample data
    console.log('\n📡 Step 1: Creating source database...')
    sourceNode = await createHeliaOrbitDB('-source')
    
    const sourceDB = await sourceNode.orbitdb.open('bridge-demo', { type: 'events' })
    
    // Add sample data
    const sampleData = [
      'Hello from OrbitDB!',
      'This data will survive backup and restore',
      'Perfect hash preservation test',
      'Identity recovery demonstration'
    ]
    
    for (const content of sampleData) {
      const hash = await sourceDB.add(content)
      console.log(`   📝 Added: ${hash.substring(0, 16)}... - "${content}"`)
    }
    
    console.log(`\n📊 Source database created:`)
    console.log(`   Name: ${sourceDB.name}`)
    console.log(`   Address: ${sourceDB.address}`)
    console.log(`   Entries: ${(await sourceDB.all()).length}`)
    
    // Step 2: Backup database to Storacha
    console.log('\n📤 Step 2: Backing up database to Storacha...')
    
    const backupResult = await backupDatabase(sourceNode.orbitdb, sourceDB.address, {
      storachaKey: process.env.STORACHA_KEY,
      storachaProof: process.env.STORACHA_PROOF
    })
    
    if (!backupResult.success) {
      throw new Error(`Backup failed: ${backupResult.error}`)
    }
    
    console.log(`✅ Backup completed successfully!`)
    console.log(`   📋 Manifest CID: ${backupResult.manifestCID}`)
    console.log(`   📊 Blocks uploaded: ${backupResult.blocksUploaded}/${backupResult.blocksTotal}`)
    console.log(`   📦 Block types:`, backupResult.blockSummary)
    
    // Close source database
    await sourceDB.close()
    await sourceNode.orbitdb.stop()
    await sourceNode.helia.stop()
    await sourceNode.blockstore.close()
    await sourceNode.datastore.close()
    
    console.log('\n🧹 Source database closed and cleaned up')
    
    // Step 3: Create target node and restore from space
    console.log('\n🔄 Step 3: Creating target node...')
    targetNode = await createHeliaOrbitDB('-target')
    
    console.log('\n📥 Step 4: Restoring database from Storacha space...')
    
    const restoreResult = await restoreDatabaseFromSpace(targetNode.orbitdb, {
      storachaKey: process.env.STORACHA_KEY,
      storachaProof: process.env.STORACHA_PROOF
    })
    
    if (!restoreResult.success) {
      throw new Error(`Restore failed: ${restoreResult.error}`)
    }
    
    console.log(`✅ Restore completed successfully!`)
    console.log(`   📋 Restored database: ${restoreResult.name}`)
    console.log(`   📍 Address: ${restoreResult.address}`)
    console.log(`   📊 Entries recovered: ${restoreResult.entriesRecovered}`)
    console.log(`   🔄 Blocks restored: ${restoreResult.blocksRestored}`)
    console.log(`   🎯 Address match: ${restoreResult.addressMatch}`)
    
    // Display restored entries
    console.log('\n📄 Restored entries:')
    for (let i = 0; i < restoreResult.entries.length; i++) {
      const entry = restoreResult.entries[i]
      console.log(`   ${i + 1}. ${entry.hash.substring(0, 16)}... - "${entry.value}"`)
    }
    
    const originalCount = sampleData.length
    const restoredCount = restoreResult.entriesRecovered
    
    console.log('\n🎉 SUCCESS! OrbitDB Storacha Bridge test completed!')
    console.log(`   📊 Original entries: ${originalCount}`)
    console.log(`   📊 Restored entries: ${restoredCount}`)
    console.log(`   📋 Manifest CID: ${restoreResult.manifestCID}`)
    console.log(`   📍 Address preserved: ${restoreResult.addressMatch}`)
    console.log(`   🌟 100% data integrity: ${originalCount === restoredCount && restoreResult.addressMatch}`)
    
    return {
      success: true,
      manifestCID: restoreResult.manifestCID,
      originalEntries: originalCount,
      restoredEntries: restoredCount,
      addressMatch: restoreResult.addressMatch,
      blocksUploaded: backupResult.blocksUploaded,
      blocksRestored: restoreResult.blocksRestored
    }
    
  } catch (error) {
    console.error('\n💥 Test failed:', error.message)
    return {
      success: false,
      error: error.message
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
    
    if (sourceNode) {
      try {
        await sourceNode.orbitdb.stop()
        await sourceNode.helia.stop()
        await sourceNode.blockstore.close()
        await sourceNode.datastore.close()
        console.log('   ✅ Source node cleaned up')
      } catch (error) {
        console.warn(`   ⚠️ Source cleanup warning: ${error.message}`)
      }
    }
    
    // Clean up OrbitDB directories
    console.log('\n🧹 Final cleanup - removing OrbitDB directories...')
    await cleanupOrbitDBDirectories()
  }
}

// Run test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testOrbitDBStorachaBridge()
    .then((result) => {
      if (result?.success) {
        console.log('\n🎉 Demo completed successfully!')
        process.exit(0)
      } else {
        console.error('\n❌ Demo failed!')
        process.exit(1)
      }
    })
    .catch((error) => {
      console.error('\n💥 Demo crashed:', error.message)
      process.exit(1)
    })
}

export { testOrbitDBStorachaBridge }
