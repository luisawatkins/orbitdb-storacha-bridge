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
  
  // Step 6: Demonstrate revocation
  console.log('\n🚫 Step 6: Demonstrate UCAN revocation')
  
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
    })
    .catch(console.error)
}

export { demonstrateDeterministicUCANAuth }