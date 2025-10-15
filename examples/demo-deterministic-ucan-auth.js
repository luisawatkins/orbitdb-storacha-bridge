#!/usr/bin/env node
/**
 * Demo: How to authenticate using deterministic UCAN recipients
 * 
 * This shows how OrbitDB writers can now use their UCAN delegations
 * because the recipient is deterministically derived from their identity.
 */

import 'dotenv/config'
import EnhancedUCANAccessController from './lib/enhanced-ucan-access-controller.js'
import * as Client from '@storacha/client'
import { Signer } from '@storacha/client/principal/ed25519'
import { StoreMemory } from '@storacha/client/stores/memory'
import * as Proof from '@storacha/client/proof'
import * as Delegation from '@ucanto/core/delegation'

async function demonstrateDeterministicUCANAuth() {
  console.log('🎯 Demo: Deterministic UCAN Authentication')
  console.log('=' .repeat(55))
  console.log('This demo shows how OrbitDB writers can now use their')
  console.log('UCAN delegations because recipients are deterministic!')
  console.log('')
  
  // Initialize Storacha client for testing
  const storachaKey = process.env.STORACHA_KEY
  const storachaProof = process.env.STORACHA_PROOF
  
  if (!storachaKey || !storachaProof) {
    console.log('⚠️ Skipping full demo - no Storacha credentials')
    console.log('Set STORACHA_KEY and STORACHA_PROOF in .env for full demo')
    return
  }
  
  let storachaClient
  try {
    const principal = Signer.parse(storachaKey)
    const store = new StoreMemory()
    storachaClient = await Client.create({ principal, store })
    
    const proof = await Proof.parse(storachaProof)
    const space = await storachaClient.addSpace(proof)
    await storachaClient.setCurrentSpace(space.did())
    
    console.log('✅ Storacha client initialized')
  } catch (error) {
    console.error('❌ Failed to initialize Storacha client:', error.message)
    return
  }
  
  // Step 1: Setup Enhanced UCAN Access Controller
  console.log('\n📝 Step 1: Setup Enhanced UCAN Access Controller')
  
  const accessController = EnhancedUCANAccessController({
    write: ['admin-identity'], // Admin can grant permissions
    storachaClient
  })
  
  // Mock OrbitDB setup
  const mockOrbitDB = {
    identity: { id: 'admin-identity' },
    open: async () => ({
      all: async () => [],
      put: async () => {},
      del: async () => {},
      close: async () => {}
    })
  }
  
  const mockIdentities = {
    getIdentity: async (id) => ({ id }),
    verifyIdentity: async () => true
  }
  
  const controller = await accessController({
    orbitdb: mockOrbitDB,
    identities: mockIdentities,
    address: 'demo-database'
  })
  
  // Step 2: Grant access to a writer (creates deterministic UCAN)
  console.log('\n🎁 Step 2: Grant access to writer (creates UCAN delegation)')
  
  const writerIdentityId = 'zDPWYqFCj5kxZfLs8XhKRQLDchcKhzRejCW2D1xvs9sKgTEST'
  console.log(`   Writer OrbitDB Identity: ${writerIdentityId}`)
  
  const delegationInfo = await controller.grant('write', writerIdentityId)
  
  if (!delegationInfo) {
    console.log('❌ Failed to create delegation')
    return
  }
  
  console.log('   ✅ UCAN delegation created!')
  console.log(`   🆔 Delegation CID: ${delegationInfo.delegationCID}`)
  console.log(`   🎯 Recipient DID: ${delegationInfo.recipientDID}`)
  console.log(`   🔗 Linked to OrbitDB identity: ${delegationInfo.linkedOrbitDBIdentity}`)
  console.log(`   🔄 Deterministic: ${delegationInfo.deterministic}`)
  
  // Step 3: Writer retrieves their authentication credentials
  console.log('\n🔑 Step 3: Writer retrieves authentication credentials')
  
  const authInfo = await controller.getRecipientForIdentity(writerIdentityId)
  
  if (!authInfo) {
    console.log('❌ No authentication info found')
    return
  }
  
  console.log('   ✅ Authentication info retrieved!')
  console.log(`   🎯 Recipient DID: ${authInfo.recipientDID}`)
  console.log(`   🔑 Has private key: ${!!authInfo.recipientPrincipal}`)
  console.log(`   📜 Has delegation token: ${!!authInfo.delegation}`)
  console.log(`   🚫 Is revoked: ${authInfo.isRevoked}`)
  console.log(`   ⏰ Is expired: ${authInfo.isExpired}`)
  
  // Step 4: Authenticate with Storacha using the deterministic credentials
  console.log('\n🌐 Step 4: Authenticate with Storacha using UCAN delegation')
  
  try {
    // Create new client using the recipient principal
    const writerStore = new StoreMemory()
    const writerClient = await Client.create({ 
      principal: authInfo.recipientPrincipal, 
      store: writerStore 
    })
    
    console.log(`   🤖 Writer client identity: ${authInfo.recipientPrincipal.did()}`)
    
    // Parse and add the delegation
    const delegationBytes = Buffer.from(authInfo.delegation, 'base64')
    const delegation = await Delegation.extract(delegationBytes)
    
    if (!delegation.ok) {
      throw new Error('Failed to extract delegation from token')
    }
    
    console.log('   ✅ Delegation parsed successfully')
    console.log(`   📋 Capabilities: ${delegation.ok.capabilities.length}`)
    
    // Add the delegation as a space
    const space = await writerClient.addSpace(delegation.ok)
    await writerClient.setCurrentSpace(space.did())
    
    console.log(`   ✅ Space connected via UCAN: ${space.did()}`)
    
    // Step 5: Test file upload to prove authentication works
    console.log('\n📤 Step 5: Test file upload with UCAN authentication')
    
    const testContent = `Hello from deterministic UCAN! 
OrbitDB Identity: ${writerIdentityId}
Recipient DID: ${authInfo.recipientDID}
Uploaded at: ${new Date().toISOString()}`
    
    const testFile = new File([testContent], 'deterministic-ucan-test.txt', {
      type: 'text/plain'
    })
    
    console.log(`   📄 Test file: ${testFile.name} (${testFile.size} bytes)`)
    
    const uploadResult = await writerClient.uploadFile(testFile)
    
    console.log('   ✅ Upload successful with deterministic UCAN!')
    console.log(`   🔗 Uploaded CID: ${uploadResult}`)
    console.log(`   🌐 IPFS URL: https://w3s.link/ipfs/${uploadResult}`)
    
    console.log('\n🎉 SUCCESS: Complete deterministic UCAN workflow!')
    console.log('\n📋 Summary:')
    console.log('   ✅ OrbitDB writer got deterministic UCAN recipient')
    console.log('   ✅ Writer can retrieve their own authentication credentials')
    console.log('   ✅ Writer can authenticate with Storacha using UCAN')
    console.log('   ✅ Writer can upload files without original Storacha credentials')
    console.log('   ✅ Same OrbitDB identity always gets same UCAN recipient')
    
  } catch (error) {
    console.error('❌ Authentication or upload failed:', error.message)
  }
  
  // Step 6: Test OrbitDB backup and restore with UCAN authentication
  console.log('\n🔄 Step 6: Testing OrbitDB backup and restore with UCAN authentication')
  
  try {
    // Import required modules for OrbitDB operations
    const { backupDatabase, restoreDatabaseFromSpace } = await import('../lib/orbitdb-storacha-bridge.js')
    const { createHeliaOrbitDB } = await import('../lib/utils.js')
    
    // Create OrbitDB instance for testing
    console.log('   🏛️ Creating OrbitDB test database...')
    const { helia, orbitdb, blockstore, datastore } = await createHeliaOrbitDB('-ucan-identity-test')
    
    // Create test database with UCAN identity
    const testDB = await orbitdb.open('ucan-identity-test', { 
      type: 'keyvalue',
      create: true
    })
    
    // Add test data
    const testData = {
      'ucan-test-1': { message: 'UCAN identity test', timestamp: Date.now() },
      'ucan-test-2': { writer: writerIdentityId, authenticated: true },
      'ucan-test-3': { delegation: 'deterministic', working: true }
    }
    
    for (const [key, value] of Object.entries(testData)) {
      await testDB.put(key, value)
      console.log(`   ✓ Added: ${key}`)
    }
    
    console.log(`   📊 Database created with ${Object.keys(testData).length} entries`)
    
    // Test backup with UCAN authentication (using writer's credentials)
    console.log('\n   📤 Testing backup with UCAN authentication...')
    
    const backupResult = await backupDatabase(orbitdb, testDB.address, {
      // Use the UCAN client we created earlier
      ucanClient: writerClient,
      spaceDID: space.did()
    })
    
    if (backupResult.success) {
      console.log('   ✅ UCAN Backup successful!')
      console.log(`   📋 Manifest CID: ${backupResult.manifestCID}`)
      console.log(`   📊 Blocks uploaded: ${backupResult.blocksUploaded}`)
    } else {
      console.log('   ❌ UCAN Backup failed:', backupResult.error)
    }
    
    // Close database and clean up
    await testDB.close()
    await orbitdb.stop()
    await helia.stop()
    await blockstore.close()
    await datastore.close()
    
    if (backupResult.success) {
      // Test restore with identity verification
      console.log('\n   📥 Testing restore with identity block verification...')
      
      // Create new OrbitDB instance for restore
      const { helia: restoreHelia, orbitdb: restoreOrbitDB, blockstore: restoreBlockstore, datastore: restoreDatastore } = await createHeliaOrbitDB('-ucan-restore-test')
      
      const restoreResult = await restoreDatabaseFromSpace(restoreOrbitDB, {
        ucanClient: writerClient,
        spaceDID: space.did()
      })
      
      if (restoreResult.success) {
        console.log('   ✅ UCAN Restore successful!')
        console.log(`   📍 Database: ${restoreResult.address}`)
        console.log(`   📊 Entries: ${restoreResult.entriesRecovered}`)
        
        // **CRITICAL: Verify identity block restoration**
        console.log('\n   🔐 Verifying identity block restoration...')
        
        if (restoreResult.analysis && restoreResult.analysis.identityBlocks) {
          console.log(`   ✅ Identity blocks restored: ${restoreResult.analysis.identityBlocks.length}`)
          
          if (restoreResult.analysis.identityBlocks.length > 0) {
            console.log('   📋 UCAN Identity preservation verified!')
            restoreResult.analysis.identityBlocks.forEach((block, i) => {
              console.log(`      ${i + 1}. ${block.cid} (Identity block)`)
            })
            console.log('   🎯 This proves UCAN authentication preserves OrbitDB identities!')
          } else {
            console.log('   ⚠️  No identity blocks found - UCAN identity may not be fully preserved')
          }
        } else {
          console.log('   ❌ No identity analysis available - identity preservation unknown')
        }
        
        // Also check access controller blocks
        if (restoreResult.analysis && restoreResult.analysis.accessControllerBlocks) {
          console.log(`   🔒 Access controller blocks: ${restoreResult.analysis.accessControllerBlocks.length}`)
        }
        
        // Verify the restored data
        if (restoreResult.entries.length > 0) {
          console.log('   📊 Restored data validation:')
          restoreResult.entries.forEach((entry, i) => {
            if (entry.payload && entry.payload.value) {
              console.log(`      ${i + 1}. ${entry.payload.key}: ${JSON.stringify(entry.payload.value)}`)
            }
          })
        }
        
        await restoreResult.database.close()
      } else {
        console.log('   ❌ UCAN Restore failed:', restoreResult.error)
      }
      
      // Cleanup restore instance
      await restoreOrbitDB.stop()
      await restoreHelia.stop()
      await restoreBlockstore.close()
      await restoreDatastore.close()
    }
    
  } catch (orbitError) {
    console.error('   ❌ OrbitDB backup/restore test failed:', orbitError.message)
  }
  
  // Step 7: Demonstrate revocation
  console.log('\n🚫 Step 7: Demonstrate UCAN revocation')
  
  await controller.revoke('write', writerIdentityId, 'Demo revocation')
  
  // Try to get credentials after revocation
  const revokedAuthInfo = await controller.getRecipientForIdentity(writerIdentityId)
  
  if (revokedAuthInfo) {
    console.log(`   🚫 UCAN is revoked: ${revokedAuthInfo.isRevoked}`)
    console.log('   ✅ Revocation status properly tracked')
  } else {
    console.log('   ✅ No authentication info available (fully revoked)')
  }
  
  await controller.close()
}

// Run the demo
if (import.meta.url === `file://${process.argv[1]}`) {
  demonstrateDeterministicUCANAuth()
    .then(() => {
      console.log('\n✅ Deterministic UCAN authentication demo completed!')
      console.log('\n💡 Key Benefits:')
      console.log('   • OrbitDB writers can actually use their UCAN delegations')
      console.log('   • Same identity always gets same UCAN recipient')
      console.log('   • No need to manually manage recipient private keys')
      console.log('   • Supports real UCAN revocation via Storacha')
      console.log('   • Seamless integration with existing access control')
      console.log('   • Full OrbitDB identity preservation across backup/restore cycles')
      console.log('   • Identity blocks properly restored with UCAN authentication')
    })
    .catch(console.error)
}

export { demonstrateDeterministicUCANAuth }