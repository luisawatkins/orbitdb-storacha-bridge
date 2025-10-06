#!/usr/bin/env node
/**
 * Test the deterministic UCAN recipient functionality
 * This demonstrates that OrbitDB identities now get consistent UCAN recipients
 */

import 'dotenv/config'
import EnhancedUCANAccessController from './lib/enhanced-ucan-access-controller.js'
import * as Client from '@storacha/client'
import { Signer } from '@storacha/client/principal/ed25519'
import { StoreMemory } from '@storacha/client/stores/memory'
import * as Proof from '@storacha/client/proof'

async function testDeterministicUCAN() {
  console.log('🧪 Testing Deterministic UCAN Recipients')
  console.log('=' .repeat(50))
  
  // Initialize Storacha client for testing
  const storachaKey = process.env.STORACHA_KEY
  const storachaProof = process.env.STORACHA_PROOF
  
  if (!storachaKey || !storachaProof) {
    console.log('⚠️ Skipping Storacha tests - no credentials')
    return testDeterministicLogic()
  }
  
  try {
    const principal = Signer.parse(storachaKey)
    const store = new StoreMemory()
    const client = await Client.create({ principal, store })
    
    const proof = await Proof.parse(storachaProof)
    const space = await client.addSpace(proof)
    await client.setCurrentSpace(space.did())
    
    console.log('✅ Storacha client initialized')
    
    // Test the deterministic recipient creation
    await testDeterministicLogic(client)
    
  } catch (error) {
    console.error('❌ Error:', error.message)
    await testDeterministicLogic()
  }
}

async function testDeterministicLogic(storachaClient = null) {
  console.log('\n📋 Testing Deterministic Recipient Logic...')
  
  // Mock OrbitDB identity IDs
  const testIdentities = [
    'zDPWYqFCj5kxZfLs8XhKRQLDchcKhzRejCW2D1xvs9sKgTSRJ',
    'zDPWYqFCj5kxZfLs8XhKRQLDchcKhzRejCW2D1xvs9sKgXYZ1',
    'zDPWYqFCj5kxZfLs8XhKRQLDchcKhzRejCW2D1xvs9sKgABC2'
  ]
  
  // Create access controller
  const accessController = EnhancedUCANAccessController({
    write: ['*'], // Allow all for testing
    storachaClient
  })
  
  // Mock OrbitDB and identities
  const mockOrbitDB = {
    identity: { id: 'test-owner' },
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
    address: 'test-db-address'
  })
  
  console.log('\n🔬 Testing Deterministic Recipients...')
  
  for (const identityId of testIdentities) {
    console.log(`\n📝 Testing identity: ${identityId.substring(0, 20)}...`)
    
    // Grant access (this will create deterministic recipient)
    const delegationInfo = await controller.grant('write', identityId)
    
    if (delegationInfo) {
      console.log(`   ✅ Created delegation with CID: ${delegationInfo.delegationCID}`)
      console.log(`   🎯 Recipient DID: ${delegationInfo.recipientDID}`)
      console.log(`   🔗 Linked to: ${delegationInfo.linkedOrbitDBIdentity}`)
      console.log(`   🔄 Deterministic: ${delegationInfo.deterministic}`)
      
      // Test that we get the same recipient again
      const recipientInfo = await controller.getRecipientForIdentity(identityId)
      
      if (recipientInfo) {
        console.log(`   ✅ Retrieved same recipient: ${recipientInfo.recipientDID === delegationInfo.recipientDID ? 'YES' : 'NO'}`)
        console.log(`   🔑 Can authenticate: ${!recipientInfo.isRevoked && !recipientInfo.isExpired}`)
      }
    } else {
      console.log(`   ⚠️ No delegation created (probably no Storacha client)`)
    }
  }
  
  console.log('\n📊 Final Stats:')
  const stats = controller.getRevocationStats()
  console.log(`   Writers: ${stats.totalWriters}`)
  console.log(`   Delegations: ${stats.totalDelegations}`)
  console.log(`   Real revocation: ${stats.supportsRealRevocation}`)
  
  await controller.close()
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
  testDeterministicUCAN()
    .then(() => {
      console.log('\n✅ Deterministic UCAN test completed!')
    })
    .catch(console.error)
}

export { testDeterministicUCAN }