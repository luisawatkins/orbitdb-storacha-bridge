/**
 * OrbitDB Storacha Bridge UCAN Demo
 * 
 * Demonstrates complete OrbitDB database backup and restoration via Storacha/Filecoin
 * using UCAN-based authentication instead of traditional key/proof credentials.
 */

import 'dotenv/config'
import { 
  backupDatabaseWithUCAN, 
  restoreDatabaseFromSpaceWithUCAN,
  OrbitDBStorachaBridgeUCAN
} from '../lib/ucan-bridge.js'

// Import utilities
import { 
  createHeliaOrbitDB,
  cleanupOrbitDBDirectories
} from '../lib/utils.js'

/**
 * Test complete OrbitDB backup and restore workflow using UCAN
 */
async function testOrbitDBStorachaBridgeUCAN() {
  console.log('🚀 Testing OrbitDB Storacha Bridge with UCAN Authentication')
  console.log('=' .repeat(70))
  
  let sourceNode, targetNode
  
  try {
    // Step 1: Create source database with sample data
    console.log('\\n📡 Step 1: Creating source database...')
    sourceNode = await createHeliaOrbitDB('-ucan-source')
    
    const sourceDB = await sourceNode.orbitdb.open('ucan-bridge-demo', { type: 'events' })
    
    // Add sample data
    const sampleData = [
      'Hello from OrbitDB with UCAN!',
      'This data will survive UCAN backup and restore',
      'Perfect hash preservation with UCAN test',
      'UCAN-based identity recovery demonstration',
      'Decentralized authorization without API keys!'
    ]
    
    for (const content of sampleData) {
      const hash = await sourceDB.add(content)
      console.log(`   📝 Added: ${hash.substring(0, 16)}... - "${content}"`)
    }
    
    console.log(`\\n📊 Source database created:`)
    console.log(`   Name: ${sourceDB.name}`)
    console.log(`   Address: ${sourceDB.address}`)
    console.log(`   Entries: ${(await sourceDB.all()).length}`)
    
    // Step 2: Backup database to Storacha using UCAN
    console.log('\\n📤 Step 2: Backing up database to Storacha with UCAN...')
    
    const backupOptions = {
      // UCAN authentication options
      ucanFile: process.env.STORACHA_UCAN_FILE,
      ucanToken: process.env.STORACHA_UCAN_TOKEN,
      agentDID: process.env.STORACHA_AGENT_DID,
      spaceDID: process.env.STORACHA_SPACE_DID,
    }
    
    const backupResult = await backupDatabaseWithUCAN(
      sourceNode.orbitdb, 
      sourceDB.address, 
      backupOptions
    )
    
    if (!backupResult.success) {
      throw new Error(`UCAN Backup failed: ${backupResult.error}`)
    }
    
    console.log(`✅ UCAN Backup completed successfully!`)
    console.log(`   📋 Manifest CID: ${backupResult.manifestCID}`)
    console.log(`   📊 Blocks uploaded: ${backupResult.blocksUploaded}/${backupResult.blocksTotal}`)
    console.log(`   📦 Block types:`, backupResult.blockSummary)
    
    // Close source database
    await sourceDB.close()
    await sourceNode.orbitdb.stop()
    await sourceNode.helia.stop()
    await sourceNode.blockstore.close()
    await sourceNode.datastore.close()
    
    console.log('\\n🧹 Source database closed and cleaned up')
    
    // Step 3: Create target node and restore from space using UCAN
    console.log('\\n🔄 Step 3: Creating target node...')
    targetNode = await createHeliaOrbitDB('-ucan-target')
    
    console.log('\\n📥 Step 4: Restoring database from Storacha space with UCAN...')
    
    const restoreOptions = {
      // UCAN authentication options
      ucanFile: process.env.STORACHA_UCAN_FILE,
      ucanToken: process.env.STORACHA_UCAN_TOKEN,
      agentDID: process.env.STORACHA_AGENT_DID,
      spaceDID: process.env.STORACHA_SPACE_DID,
    }
    
    const restoreResult = await restoreDatabaseFromSpaceWithUCAN(
      targetNode.orbitdb, 
      restoreOptions
    )
    
    if (!restoreResult.success) {
      throw new Error(`UCAN Restore failed: ${restoreResult.error}`)
    }
    
    console.log(`✅ UCAN Restore completed successfully!`)
    console.log(`   📋 Restored database: ${restoreResult.name}`)
    console.log(`   📍 Address: ${restoreResult.address}`)
    console.log(`   📊 Entries recovered: ${restoreResult.entriesRecovered}`)
    console.log(`   🔄 Blocks restored: ${restoreResult.blocksRestored}`)
    console.log(`   🎯 Address match: ${restoreResult.addressMatch}`)
    
    // Display restored entries
    console.log('\\n📄 Restored entries:')
    for (let i = 0; i < restoreResult.entries.length; i++) {
      const entry = restoreResult.entries[i]
      console.log(`   ${i + 1}. ${entry.hash.substring(0, 16)}... - "${entry.value}"`)
    }
    
    const originalCount = sampleData.length
    const restoredCount = restoreResult.entriesRecovered
    
    console.log('\\n🎉 SUCCESS! OrbitDB Storacha Bridge UCAN test completed!')
    console.log(`   📊 Original entries: ${originalCount}`)
    console.log(`   📊 Restored entries: ${restoredCount}`)
    console.log(`   📋 Manifest CID: ${restoreResult.manifestCID}`)
    console.log(`   📍 Address preserved: ${restoreResult.addressMatch}`)
    console.log(`   🌟 100% data integrity: ${originalCount === restoredCount && restoreResult.addressMatch}`)
    console.log(`   🔐 UCAN Authentication: ✅ SUCCESS`)
    
    return {
      success: true,
      manifestCID: restoreResult.manifestCID,
      originalEntries: originalCount,
      restoredEntries: restoredCount,
      addressMatch: restoreResult.addressMatch,
      blocksUploaded: backupResult.blocksUploaded,
      blocksRestored: restoreResult.blocksRestored,
      authMethod: 'UCAN'
    }
    
  } catch (error) {
    console.error('\\n💥 UCAN Test failed:', error.message)
    return {
      success: false,
      error: error.message
    }
  } finally {
    // Cleanup
    console.log('\\n🧹 Cleaning up...')
    
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
    console.log('\\n🧹 Final cleanup - removing OrbitDB directories...')
    await cleanupOrbitDBDirectories()
  }
}

/**
 * Test UCAN Bridge Class Interface
 */
async function testUCANBridgeClass() {
  console.log('\\n🔧 Testing UCAN Bridge Class Interface')
  console.log('=' .repeat(50))
  
  let sourceNode, targetNode
  
  try {
    // Initialize UCAN Bridge
    const bridge = new OrbitDBStorachaBridgeUCAN({
      ucanFile: process.env.STORACHA_UCAN_FILE,
      ucanToken: process.env.STORACHA_UCAN_TOKEN,
      agentDID: process.env.STORACHA_AGENT_DID,
      spaceDID: process.env.STORACHA_SPACE_DID,
    })
    
    // Listen for progress events
    bridge.on('uploadProgress', (progress) => {
      console.log(`   📤 Upload Progress: ${progress.percentage}% (${progress.current}/${progress.total})`)
    })
    
    bridge.on('downloadProgress', (progress) => {
      console.log(`   📥 Download Progress: ${progress.percentage}% (${progress.current}/${progress.total})`)
    })
    
    // Create source database
    sourceNode = await createHeliaOrbitDB('-ucan-class-source')
    const sourceDB = await sourceNode.orbitdb.open('ucan-class-demo', { type: 'keyvalue' })
    
    await sourceDB.set('greeting', 'Hello UCAN World!')
    await sourceDB.set('framework', 'OrbitDB with Storacha')
    await sourceDB.set('auth', 'UCAN-based authentication')
    
    console.log(`📊 Source database: ${sourceDB.address}`)
    
    // Backup using class interface
    console.log('\\n📤 Backing up with UCAN Bridge class...')
    const backupResult = await bridge.backup(sourceNode.orbitdb, sourceDB.address)
    
    if (!backupResult.success) {
      throw new Error(`Class backup failed: ${backupResult.error}`)
    }
    
    console.log(`✅ Class backup successful: ${backupResult.blocksUploaded} blocks`)
    
    // Close source
    await sourceDB.close()
    await sourceNode.orbitdb.stop()
    await sourceNode.helia.stop()
    await sourceNode.blockstore.close()
    await sourceNode.datastore.close()
    
    // Create target and restore
    targetNode = await createHeliaOrbitDB('-ucan-class-target')
    
    console.log('\\n📥 Restoring with UCAN Bridge class...')
    const restoreResult = await bridge.restoreFromSpace(targetNode.orbitdb)
    
    if (!restoreResult.success) {
      throw new Error(`Class restore failed: ${restoreResult.error}`)
    }
    
    console.log(`✅ Class restore successful: ${restoreResult.entriesRecovered} entries`)
    console.log(`   📍 Restored to: ${restoreResult.address}`)
    
    return {
      success: true,
      method: 'class-interface',
      entries: restoreResult.entriesRecovered
    }
    
  } catch (error) {
    console.error('❌ Class test failed:', error.message)
    return {
      success: false,
      error: error.message
    }
  } finally {
    // Cleanup nodes
    if (sourceNode) {
      try {
        await sourceNode.orbitdb.stop()
        await sourceNode.helia.stop()
        await sourceNode.blockstore.close()
        await sourceNode.datastore.close()
      } catch (error) {
        console.warn(`Source cleanup warning: ${error.message}`)
      }
    }
    
    if (targetNode) {
      try {
        await targetNode.orbitdb.stop()
        await targetNode.helia.stop()
        await targetNode.blockstore.close()
        await targetNode.datastore.close()
      } catch (error) {
        console.warn(`Target cleanup warning: ${error.message}`)
      }
    }
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('🔐 OrbitDB Storacha Bridge - UCAN Authentication Demo')
  console.log('=' .repeat(70))
  
  // Check for UCAN credentials
  const hasUCANFile = !!process.env.STORACHA_UCAN_FILE
  const hasUCANToken = !!process.env.STORACHA_UCAN_TOKEN
  
  if (!hasUCANFile && !hasUCANToken) {
    console.error('❌ Missing UCAN credentials!')
    console.error('   Set either STORACHA_UCAN_FILE or STORACHA_UCAN_TOKEN in your .env file')
    console.error('   See docs/UCAN_SETUP.md for instructions')
    process.exit(1)
  }
  
  console.log('🔐 UCAN Configuration:')
  console.log(`   📁 UCAN File: ${hasUCANFile ? '✅' : '❌'}`)
  console.log(`   🎫 UCAN Token: ${hasUCANToken ? '✅' : '❌'}`)
  console.log(`   🤖 Agent DID: ${process.env.STORACHA_AGENT_DID || 'auto-detect'}`)
  console.log(`   🚀 Space DID: ${process.env.STORACHA_SPACE_DID || 'auto-detect'}`)
  
  // Run both tests
  Promise.resolve()
    .then(async () => {
      const functionResult = await testOrbitDBStorachaBridgeUCAN()
      const classResult = await testUCANBridgeClass()
      
      console.log('\\n🏁 Final Results:')
      console.log(`   Function Interface: ${functionResult.success ? '✅' : '❌'}`)
      console.log(`   Class Interface: ${classResult.success ? '✅' : '❌'}`)
      
      const overallSuccess = functionResult.success && classResult.success
      
      if (overallSuccess) {
        console.log('\\n🎉 UCAN Demo completed successfully!')
        process.exit(0)
      } else {
        console.error('\\n❌ UCAN Demo failed!')
        process.exit(1)
      }
    })
    .catch((error) => {
      console.error('\\n💥 UCAN Demo crashed:', error.message)
      process.exit(1)
    })
}

export { testOrbitDBStorachaBridgeUCAN, testUCANBridgeClass }
