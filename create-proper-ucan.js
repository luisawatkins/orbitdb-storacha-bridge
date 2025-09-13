#!/usr/bin/env node
/**
 * Create a proper UCAN delegation from Storacha credentials
 * Then test authentication with ONLY the UCAN (no private key/proof needed)
 * 
 * UPDATED: Now uses @storacha/client instead of @web3-storage/w3up-client
 */

import 'dotenv/config'
import * as Client from '@storacha/client'
import { StoreMemory } from '@storacha/client/stores/memory'
import { Signer } from '@storacha/client/principal/ed25519'
import * as Proof from '@storacha/client/proof'
import * as Delegation from '@ucanto/core/delegation'
import { promises as fs } from 'fs'

async function createProperUCAN() {
  console.log('🚀 Creating Proper UCAN from Storacha Credentials')
  console.log('=' .repeat(60))
  
  // Step 1: Check if we have the necessary Storacha credentials
  const storachaKey = process.env.STORACHA_KEY || process.env.NEXT_PUBLIC_STORACHA_PRIVATE_KEY
  const storachaProof = process.env.STORACHA_PROOF || process.env.NEXT_PUBLIC_STORACHA_DELEGATION
  
  console.log(`📋 Storacha Key: ${storachaKey ? 'Present' : 'Missing'}`)
  console.log(`📋 Storacha Proof: ${storachaProof ? 'Present' : 'Missing'}`)
  
  if (!storachaKey || !storachaProof) {
    console.error('❌ Missing Storacha credentials!')
    console.error('   Need: STORACHA_KEY and STORACHA_PROOF in .env')
    return null
  }
  
  try {
    console.log('\\n🔐 Step 1: Initialize Storacha client with existing credentials...')
    
    // Initialize the "authority" client (the one that can create delegations)
    const authorityPrincipal = Signer.parse(storachaKey)
    const store = new StoreMemory()
    const authorityClient = await Client.create({ principal: authorityPrincipal, store })
    
    console.log(`   ✅ Authority identity: ${authorityPrincipal.did()}`)
    
    // Add the existing proof to get space access
    const proof = await Proof.parse(storachaProof)
    const space = await authorityClient.addSpace(proof)
    await authorityClient.setCurrentSpace(space.did())
    
    console.log(`   ✅ Space connected: ${space.did()}`)
    
    console.log('\\n🎯 Step 2: Create a new identity for delegation (recipient)...')
    
    // Create a NEW identity that will receive the delegation
    const recipientPrincipal = await Signer.generate()
    console.log(`   ✅ Recipient identity: ${recipientPrincipal.did()}`)
    
    console.log('\\n📜 Step 3: Create UCAN delegation...')
    
    // Define the capabilities we want to delegate
    const capabilities = [
      'space/blob/add',
      'space/index/add', 
      'upload/add',
      'upload/list',    // Add listing capability
      'store/add',
      'filecoin/offer'
    ]
    
    console.log(`   📋 Delegating capabilities: ${capabilities.join(', ')}`)
    console.log(`   🎯 To recipient: ${recipientPrincipal.did()}`)
    console.log(`   ⏰ Expires in: 24 hours`)
    
    // Create the delegation
    const expiration = Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
    
    const delegation = await authorityClient.createDelegation(
      recipientPrincipal,  // Pass the principal object, not the DID string
      capabilities,
      { expiration }
    )
    
    console.log('   ✅ UCAN delegation created!')
    
    console.log('\\n💾 Step 4: Export UCAN delegation...')
    
    // Archive the delegation
    const archive = await delegation.archive()
    if (!archive.ok) {
      throw new Error('Failed to archive delegation')
    }
    
    // Save as base64 token (like w3 CLI does)
    const delegationToken = Buffer.from(archive.ok).toString('base64')
    console.log(`   📏 Delegation size: ${delegationToken.length} characters`)
    console.log(`   📋 Delegation preview: ${delegationToken.substring(0, 100)}...`)
    
    // Print full base64 token in parallel
    console.log('\n🔗 FULL BASE64 DELEGATION TOKEN:')
    console.log('=' .repeat(80))
    console.log(delegationToken)
    console.log('=' .repeat(80))
    
    // Also save the base64 token to a separate file for easy copying
    const recipientKey = recipientPrincipal.toArchive()
    await Promise.all([
      fs.writeFile('ucan-delegation.car', archive.ok),
      fs.writeFile('recipient-key.txt', JSON.stringify(recipientKey, null, 2)),
      fs.writeFile('delegation-token.txt', delegationToken)
    ])
    
    console.log('   💾 Saved to: ucan-delegation.car')
    console.log('   🔑 Recipient key saved to: recipient-key.txt')
    console.log('   📋 Base64 token saved to: delegation-token.txt')
    
    console.log('\\n🧪 Step 5: Test authentication with ONLY the UCAN...')
    
    // Now test if we can authenticate with ONLY the delegation
    await testUCANOnlyAuthentication(delegationToken, recipientPrincipal)
    
    return {
      delegation: delegationToken,
      recipientPrincipal,
      spaceDID: space.did()
    }
    
  } catch (error) {
    console.error('❌ Error creating UCAN:', error.message)
    console.error(error.stack)
    return null
  }
}

async function testUCANOnlyAuthentication(delegationToken, recipientPrincipal) {
  console.log('\\n🔬 Testing UCAN-only authentication...')
  
  try {
    // Create a NEW client session using ONLY the recipient identity and delegation
    const store = new StoreMemory()
    const client = await Client.create({ 
      principal: recipientPrincipal, 
      store 
    })
    
    console.log(`   🤖 Client identity: ${recipientPrincipal.did()}`)
    
    // Parse the delegation token
    const delegationBytes = Buffer.from(delegationToken, 'base64')
    const delegation = await Delegation.extract(delegationBytes)
    
    if (!delegation.ok) {
      throw new Error('Failed to extract delegation from token')
    }
    
    console.log('   ✅ Delegation parsed successfully')
    console.log(`   📋 Capabilities: ${delegation.ok.capabilities.length}`)
    
    // Add the delegation as a space
    const space = await client.addSpace(delegation.ok)
    await client.setCurrentSpace(space.did())
    
    console.log(`   ✅ Space connected via UCAN: ${space.did()}`)
    
    console.log('\\n📤 Step 6: Test file upload with UCAN authentication...')
    
    // Create a test file
    const testContent = `Hello from UCAN! Uploaded at ${new Date().toISOString()}`
    const testFile = new File([testContent], 'ucan-test.txt', {
      type: 'text/plain'
    })
    
    console.log(`   📄 Test file: ${testFile.name} (${testFile.size} bytes)`)
    
    // Try to upload using ONLY UCAN authentication
    const result = await client.uploadFile(testFile)
    
    console.log('   ✅ Upload successful with UCAN-only authentication!')
    console.log(`   🔗 Uploaded CID: ${result}`)
    console.log(`   🌐 IPFS URL: https://w3s.link/ipfs/${result}`)
    
    console.log('\\n🎉 SUCCESS! UCAN-only authentication works!')
    console.log('\\n📋 Summary:')
    console.log('   ✅ Created UCAN delegation from Storacha credentials')
    console.log('   ✅ Authenticated with ONLY the UCAN token')
    console.log('   ✅ Uploaded file without original private key/proof')
    console.log('   ✅ No Storacha credentials needed for the upload!')
    
    return true
    
  } catch (error) {
    console.error('❌ UCAN-only authentication failed:', error.message)
    console.error(error.stack)
    return false
  }
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
  createProperUCAN()
    .then(result => {
      if (result) {
        console.log('\\n🚀 Next Steps:')
        console.log('   1. Use the delegation token in your OrbitDB bridge')
        console.log('   2. The recipient identity can be temporary or persistent')
        console.log('   3. No original Storacha credentials needed for operations')
        console.log('\\n💡 This proves UCAN delegation works as intended!')
      } else {
        console.log('\\n💥 Failed to create proper UCAN delegation')
      }
    })
    .catch(console.error)
}

export { createProperUCAN }
