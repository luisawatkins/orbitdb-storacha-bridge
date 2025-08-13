/**
 * OrbitDB Storacha Bridge - Restore Demo
 * 
 * Demonstrates how to restore an OrbitDB database from Storacha backup
 * 
 * Prerequisites: Run backup-demo.js first to create a backup
 */

import 'dotenv/config'
import { restoreDatabase, createHeliaOrbitDB, extractManifestCID } from '../lib/orbitdb-storacha-bridge.js'

async function runRestoreDemo() {
  console.log('🔄 OrbitDB Storacha Bridge - Restore Demo')
  console.log('=' .repeat(50))
  
  // You need to provide these values from a previous backup
  // These are example values - replace with your actual backup data
  const BACKUP_MANIFEST_CID = process.argv[2] || 'zdpuAy2JxUiqCzuTAhT5ukfHD1oxbcpJ6eH1VTUegC8Ljv4WK'
  const ORIGINAL_DATABASE_ADDRESS = process.argv[3] || `/orbitdb/${BACKUP_MANIFEST_CID}`
  
  if (!process.argv[2]) {
    console.log('ℹ️  Usage: node restore-demo.js <manifest-cid> [original-address]')
    console.log('ℹ️  Using example CID for demonstration (this will likely fail)')
    console.log('ℹ️  Run backup-demo.js first to get a real backup to restore')
  }
  
  let targetNode
  
  try {
    // Step 1: Create target OrbitDB instance
    console.log('\n📡 Creating target OrbitDB instance...')
    targetNode = await createHeliaOrbitDB('-restore-demo')
    
    console.log(`\n📋 Restore parameters:`)
    console.log(`   Manifest CID: ${BACKUP_MANIFEST_CID}`)
    console.log(`   Original Address: ${ORIGINAL_DATABASE_ADDRESS}`)
    
    // Step 2: Restore from Storacha
    console.log('\n💾 Starting restore from Storacha...')
    const restoreResult = await restoreDatabase(
      targetNode.orbitdb, 
      BACKUP_MANIFEST_CID,
      { 
        timeout: 60000,
        verifyIntegrity: true 
      }
    )
    
    if (restoreResult.success) {
      console.log('\n🎉 Restore completed successfully!')
      console.log(`📋 Database Address: ${restoreResult.databaseAddress}`)
      console.log(`📊 Entries recovered: ${restoreResult.entriesRecovered}`)
      console.log(`🔗 Address match: ${restoreResult.addressMatch ? '✅ Perfect' : '❌ Different'}`)
      console.log(`📈 Block breakdown:`)
      for (const [type, count] of Object.entries(restoreResult.blockSummary || {})) {
        console.log(`   ${type}: ${count} blocks`)
      }
      
      // Step 3: Verify restored database
      console.log('\n🔍 Verifying restored database...')
      
      try {
        const restoredDB = await targetNode.orbitdb.open(restoreResult.databaseAddress)
        const allEntries = await restoredDB.all()
        
        console.log(`\n📊 Database verification:`)
        console.log(`   Name: ${restoredDB.name}`)
        console.log(`   Type: ${restoredDB.type}`)
        console.log(`   Address: ${restoredDB.address}`)
        console.log(`   Total entries: ${allEntries.length}`)
        
        if (allEntries.length > 0) {
          console.log(`\n📄 Sample entries:`)
          for (const [index, entry] of allEntries.slice(0, 3).entries()) {
            console.log(`   ${index + 1}. ${entry.hash} - "${entry.value}"`)
          }
          
          if (allEntries.length > 3) {
            console.log(`   ... and ${allEntries.length - 3} more entries`)
          }
        } else {
          console.log(`   ⚠️  No entries found - database might be empty or restore incomplete`)
        }
        
        // Step 4: Test database operations
        console.log('\n🧪 Testing database operations...')
        
        if (restoredDB.type === 'events') {
          const testEntry = `Test entry added after restore - ${new Date().toISOString()}`
          const hash = await restoredDB.add(testEntry)
          console.log(`   ✅ Added test entry: ${hash}`)
          
          const updatedEntries = await restoredDB.all()
          console.log(`   ✅ Total entries after test: ${updatedEntries.length}`)
        } else {
          console.log(`   ℹ️  Database type '${restoredDB.type}' - skipping write test`)
        }
        
      } catch (error) {
        console.error('   ❌ Database verification failed:', error.message)
      }
      
    } else {
      console.error('\n❌ Restore failed:', restoreResult.error)
      
      if (restoreResult.error?.includes('not found') || restoreResult.error?.includes('404')) {
        console.log('\n💡 Troubleshooting tips:')
        console.log('   • Make sure the manifest CID exists on Storacha/IPFS')
        console.log('   • Check that you\'re using the correct CID from a successful backup')
        console.log('   • Try running backup-demo.js first to create a fresh backup')
        console.log('   • Verify your Storacha credentials are correct')
      }
      
      process.exit(1)
    }
    
  } catch (error) {
    console.error('\n💥 Demo failed:', error.message)
    console.error(error.stack)
    
    if (error.message.includes('credentials') || error.message.includes('auth')) {
      console.log('\n💡 Make sure your .env file contains valid Storacha credentials:')
      console.log('   STORACHA_KEY=your_private_key')
      console.log('   STORACHA_PROOF=your_delegation_proof')
    }
    
    process.exit(1)
    
  } finally {
    // Cleanup
    if (targetNode) {
      try {
        await targetNode.orbitdb.stop()
        await targetNode.helia.stop()
        await targetNode.blockstore.close()
        await targetNode.datastore.close()
        console.log('\n🧹 Cleanup completed')
      } catch (error) {
        console.warn('⚠️ Cleanup warning:', error.message)
      }
    }
  }
}

// Show usage information
function showUsage() {
  console.log('\n📚 OrbitDB Storacha Bridge - Restore Demo')
  console.log('\nThis demo shows how to restore an OrbitDB database from a Storacha backup.')
  console.log('\nUsage:')
  console.log('  node restore-demo.js <manifest-cid> [original-address]')
  console.log('\nExample:')
  console.log('  node restore-demo.js zdpuAy2JxUiqCzuTAhT5ukfHD1oxbcpJ6eH1VTUegC8Ljv4WK')
  console.log('\nPrerequisites:')
  console.log('  1. Run backup-demo.js first to create a backup')
  console.log('  2. Copy the Manifest CID from the backup output')
  console.log('  3. Set up your .env file with Storacha credentials')
  console.log('\nWhat this demo does:')
  console.log('  • Creates a fresh OrbitDB instance')
  console.log('  • Downloads blocks from Storacha using the manifest CID')
  console.log('  • Reconstructs the database with perfect hash preservation')
  console.log('  • Verifies data integrity and database functionality')
  console.log('  • Tests basic database operations on restored data')
}

// Handle help flag
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  showUsage()
  process.exit(0)
}

// Run demo
runRestoreDemo()
