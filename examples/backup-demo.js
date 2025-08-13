/**
 * OrbitDB Storacha Bridge - Backup Demo
 * 
 * Demonstrates how to backup an OrbitDB database to Storacha
 */

import 'dotenv/config'
import { backupDatabase, createHeliaOrbitDB } from '../lib/orbitdb-storacha-bridge.js'

async function runBackupDemo() {
  console.log('🚀 OrbitDB Storacha Bridge - Backup Demo')
  console.log('=' .repeat(50))
  
  let sourceNode
  
  try {
    // Step 1: Create OrbitDB instance
    console.log('\n📡 Creating OrbitDB instance...')
    sourceNode = await createHeliaOrbitDB('-backup-demo')
    
    // Step 2: Create and populate database
    console.log('\n📊 Creating database...')
    const database = await sourceNode.orbitdb.open('backup-demo-db', { type: 'events' })
    
    const sampleEntries = [
      'First backup entry',
      'Second backup entry',
      'Third backup entry'
    ]
    
    for (const entry of sampleEntries) {
      const hash = await database.add(entry)
      console.log(`   ✓ Added: ${hash} - "${entry}"`)
    }
    
    console.log(`\n📋 Database created:`)
    console.log(`   Name: ${database.name}`)
    console.log(`   Address: ${database.address}`)
    console.log(`   Entries: ${(await database.all()).length}`)
    
    // Step 3: Backup to Storacha
    console.log('\n💾 Starting backup...')
    const backupResult = await backupDatabase(sourceNode.orbitdb, database.address)
    
    if (backupResult.success) {
      console.log('\n🎉 Backup completed successfully!')
      console.log(`📋 Manifest CID: ${backupResult.manifestCID}`)
      console.log(`📊 Blocks uploaded: ${backupResult.blocksUploaded}/${backupResult.blocksTotal}`)
      console.log(`📈 Block breakdown:`)
      for (const [type, count] of Object.entries(backupResult.blockSummary)) {
        console.log(`   ${type}: ${count} blocks`)
      }
      
      // Save backup info for restoration demo
      console.log('\n💾 Backup information (save this for restore):')
      console.log('Manifest CID:', backupResult.manifestCID)
      console.log('Database Address:', backupResult.databaseAddress)
      console.log('CID Mappings (sample):', Object.keys(backupResult.cidMappings).slice(0, 2))
      
    } else {
      console.error('\n❌ Backup failed:', backupResult.error)
      process.exit(1)
    }
    
  } catch (error) {
    console.error('\n💥 Demo failed:', error.message)
    console.error(error.stack)
    process.exit(1)
    
  } finally {
    // Cleanup
    if (sourceNode) {
      try {
        await sourceNode.orbitdb.stop()
        await sourceNode.helia.stop()
        await sourceNode.blockstore.close()
        await sourceNode.datastore.close()
        console.log('\n🧹 Cleanup completed')
      } catch (error) {
        console.warn('⚠️ Cleanup warning:', error.message)
      }
    }
  }
}

// Run demo
runBackupDemo()
