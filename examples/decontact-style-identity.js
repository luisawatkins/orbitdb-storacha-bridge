#!/usr/bin/env node

/**
 * deContact-Style Identity Generation for Storacha
 * 
 * UPDATED: Now uses @storacha/client instead of @web3-storage/w3up-client
 * 
 * This example demonstrates how to use deContact's approach:
 * 1. Generate mnemonic seed phrase (BIP39)
 * 2. Create master seed from mnemonic
 * 3. Generate deterministic Ed25519 identity for Storacha
 * 4. Create DID identity for OrbitDB
 * 5. Create UCAN delegation for Storacha access
 * 6. Upload files using deterministic Storacha identity
 * 
 * This approach ensures:
 * - Single seed phrase controls both OrbitDB and Storacha identities
 * - Cross-device synchronization using same seed phrase
 * - Self-sovereign identity without external credential dependencies
 * 
 * Note: For OrbitDB database backup demonstration, see seed-to-orbitdb-backup.js
 */

import 'dotenv/config'
import { generateMnemonic, mnemonicToSeedSync } from '@scure/bip39'
import { wordlist as english } from '@scure/bip39/wordlists/english'
import { createHash } from 'crypto'
import { Signer } from '@storacha/client/principal/ed25519'
import * as ed25519 from '@ucanto/principal/ed25519'
import * as Client from '@storacha/client'
import { StoreMemory } from '@storacha/client/stores/memory'
import * as Proof from '@storacha/client/proof'
import { Ed25519Provider } from 'key-did-provider-ed25519'
import * as KeyDIDResolver from 'key-did-resolver'
import * as Delegation from '@ucanto/core/delegation'
import OrbitDBIdentityProviderDID from '@orbitdb/identity-provider-did'

/**
 * Convert 64-bit seed to 32-bit seed (same as deContact)
 */
function convertTo32BitSeed(origSeed) {
    const hash = createHash('sha256')
    hash.update(Buffer.from(origSeed, 'hex'))
    return hash.digest()
}

// Convert Uint8Array to hex (browser-safe)
function toHex(u8) {
    return Array.from(u8).map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Generate master seed from mnemonic (same as deContact)
 */
function generateMasterSeed(mnemonicSeedphrase, password = 'password') {
    return toHex(mnemonicToSeedSync(mnemonicSeedphrase, password))
}

/**
 * Generate deterministic Storacha identity from deContact-style seed
 * 
 * This creates a truly deterministic Ed25519 identity from the seed.
 * The same seed will always produce the same identity/DID.
 */
async function createStorachaIdentityFromSeed(masterSeed) {
    console.log('🔐 Creating deterministic Storacha identity from seed...')
    
    const seed32 = convertTo32BitSeed(masterSeed)
    const ucantoPrincipal = await ed25519.derive(seed32)
    const principal = Signer.from(ucantoPrincipal.toArchive())
    
    console.log(`   ✅ Storacha identity: ${principal.did()}`)
    console.log(`   📝 Note: Deterministic identity created from seed (same seed = same identity)`)
    
    return {
        principal,
        did: principal.did(),
        privateKey: principal.toArchive(),
        seed: seed32
    }
}

/**
 * Generate proper OrbitDB identity from seed using official DID provider
 */
async function createOrbitDBIdentityFromSeed(masterSeed) {
    console.log('🆔 Creating proper OrbitDB identity with DID provider...')
    
    const seed32 = convertTo32BitSeed(masterSeed)
    
    // Import OrbitDB identity modules
    const { Identities, useIdentityProvider } = await import('@orbitdb/core')
    
    // Set up DID resolver and register the official DID provider
    const keyDidResolver = KeyDIDResolver.getResolver()
    OrbitDBIdentityProviderDID.setDIDResolver(keyDidResolver)
    useIdentityProvider(OrbitDBIdentityProviderDID)
    
    console.log(`   ✅ Official DID provider registered with OrbitDB`)
    
    // Create OrbitDB identities instance
    const identities = await Identities()
    
    // Create DID provider from seed
    const didProvider = new Ed25519Provider(seed32)
    
    // Use the official OrbitDB DID identity provider
    const identity = await identities.createIdentity({ 
        provider: OrbitDBIdentityProviderDID({ 
            didProvider: didProvider 
        }) 
    })
    
    console.log(`   ✅ OrbitDB identity created: ${identity.id}`)
    console.log(`   🔑 Identity type: ${identity.type}`)
    console.log(`   📝 Note: True deterministic OrbitDB identity from seed`)
    
    return {
        identity,
        identities,
        didProvider,
        did: identity.id,
        seed: seed32
    }
}

/**
 * Create UCAN delegation using existing Storacha credentials
 */
async function createStorachaDelegation(storachaIdentity, authorityCredentials) {
    console.log('📜 Creating UCAN delegation for seed-derived identity...')
    
    try {
        // Initialize authority client
        const authorityPrincipal = Signer.parse(authorityCredentials.key)
        const authorityStore = new StoreMemory()
        const authorityClient = await Client.create({ 
            principal: authorityPrincipal, 
            store: authorityStore 
        })
        
        // Add existing proof
        const proof = await Proof.parse(authorityCredentials.proof)
        const space = await authorityClient.addSpace(proof)
        await authorityClient.setCurrentSpace(space.did())
        
        console.log(`   🚀 Authority space: ${space.did()}`)
        console.log(`   🎯 Delegating to: ${storachaIdentity.did}`)
        
        // Create delegation for 30 days
        const expiration = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60)
        const capabilities = [
            'space/blob/add',
            'space/index/add',
            'upload/add',
            'upload/list',
            'store/add',
            'filecoin/offer'
        ]
        
        const delegation = await authorityClient.createDelegation(
            storachaIdentity.principal,
            capabilities,
            { expiration }
        )
        
        // Archive as base64 token
        const archive = await delegation.archive()
        if (!archive.ok) {
            throw new Error('Failed to archive delegation')
        }
        
        const delegationToken = Buffer.from(archive.ok).toString('base64')
        
        console.log('   ✅ UCAN delegation created!')
        console.log(`   📏 Token length: ${delegationToken.length} characters`)
        
        return {
            delegation: delegationToken,
            spaceDID: space.did(),
            capabilities,
            expiresAt: new Date(expiration * 1000)
        }
        
    } catch (error) {
        console.error('   ❌ Delegation failed:', error.message)
        throw error
    }
}

/**
 * Test file upload using seed-derived Storacha identity
 */
async function testFileUploadWithSeedIdentity(storachaIdentity, delegation) {
    console.log('📤 Testing file upload with seed-derived identity...')
    
    try {
        // Initialize UCAN-authenticated client directly (no internal helpers)
        const store = new StoreMemory()
        const principal = Signer.from(storachaIdentity.privateKey)
        const client = await Client.create({ principal, store })

        // Parse delegation token and add space
        const delegationBytes = Buffer.from(delegation.delegation, 'base64')
        const extracted = await Delegation.extract(delegationBytes)
        if (!extracted.ok) throw new Error('Failed to extract delegation from token')
        const space = await client.addSpace(extracted.ok)
        await client.setCurrentSpace(space.did())

        // Create test file
        const testContent = `Hello from seed-derived identity!
Uploaded at: ${new Date().toISOString()}
Storacha DID: ${storachaIdentity.did}
Space: ${delegation.spaceDID}`

        const testFile = new File([testContent], 'seed-identity-test.txt', {
            type: 'text/plain'
        })

        console.log(`   📄 Uploading file: ${testFile.name} (${testFile.size} bytes)`)

        // Upload file
        const result = await client.uploadFile(testFile)

        console.log('   ✅ File uploaded successfully!')
        console.log(`   🔗 CID: ${result}`)
        console.log(`   🌐 IPFS URL: https://w3s.link/ipfs/${result}`)

        return {
            cid: result.toString(),
            url: `https://w3s.link/ipfs/${result}`,
            uploader: storachaIdentity.did
        }
        
    } catch (error) {
        console.error('   ❌ File upload failed:', error.message)
        throw error
    }
}

/**
 * Main demonstration
 */
async function main() {
    console.log('🚀 deContact-Style Identity Generation for Storacha')
    console.log('=' .repeat(60))
    
    try {
        // Check if we have authority credentials for delegation
        const authorityKey = process.env.STORACHA_KEY
        const authorityProof = process.env.STORACHA_PROOF
        
        if (!authorityKey || !authorityProof) {
            console.log('⚠️  Missing STORACHA_KEY and STORACHA_PROOF in .env')
            console.log('💡 Add these to enable delegation and file uploads')
            console.log('   This demo will show identity generation only')
        }
        
        console.log('\n🌱 Step 1: Generate seed phrase (like deContact onboarding)')
        
        // Generate or use existing seed phrase
        const seedPhrase = process.env.DEMO_SEED_PHRASE || generateMnemonic(english)
        console.log(`   🔤 Seed phrase: ${seedPhrase}`)
        
        // Generate master seed (deContact style)
        const masterSeed = generateMasterSeed(seedPhrase, 'password')
        console.log(`   🔑 Master seed: ${masterSeed.substring(0, 16)}...`)
        
        console.log('\n🆔 Step 2: Create deterministic identities from seed')
        
        // Create Storacha identity from seed
        const storachaIdentity = await createStorachaIdentityFromSeed(masterSeed)
        
        // Create OrbitDB DID identity from seed (for comparison)
        const orbitdbIdentity = await createOrbitDBIdentityFromSeed(masterSeed)
        
        console.log('\n📋 Identity Summary:')
        console.log(`   🔵 OrbitDB DID: ${orbitdbIdentity.did}`)
        console.log(`   🟢 Storacha DID: ${storachaIdentity.did}`)
        console.log('   ✅ Both identities derived from same seed phrase!')
        
        if (authorityKey && authorityProof) {
            console.log('\n📜 Step 3: Create UCAN delegation')
            
            const delegation = await createStorachaDelegation(storachaIdentity, {
                key: authorityKey,
                proof: authorityProof
            })
            
            console.log('\n📤 Step 4: Test file upload')
            
            const uploadResult = await testFileUploadWithSeedIdentity(storachaIdentity, delegation)
            
            console.log('\n🎉 SUCCESS! Complete demonstration:')
            console.log(`   ✅ Seed phrase generated: ${seedPhrase.split(' ').length} words`)
            console.log(`   ✅ Deterministic Storacha identity: ${storachaIdentity.did}`)
            console.log(`   ✅ UCAN delegation created`)
            console.log(`   ✅ File uploaded: ${uploadResult.cid}`)
            console.log(`   ✅ Same seed can be used on any device!`)
            
        } else {
            console.log('\n💡 Next Steps:')
            console.log('   1. Add STORACHA_KEY and STORACHA_PROOF to .env')
            console.log('   2. Run this script again to test full delegation flow')
            console.log('   3. Use same seed phrase on different device to verify deterministic identity')
        }
        
        console.log('\n🔄 Cross-Device Recovery:')
        console.log('   To recover this identity on another device:')
        console.log(`   1. Use seed phrase: ${seedPhrase}`)
        console.log(`   2. Generate same master seed with password: 'password'`)
        console.log(`   3. Derive Storacha identity with derivation index: 1`)
        console.log(`   4. Result: ${storachaIdentity.did}`)
        
        return {
            seedPhrase,
            masterSeed,
            storachaIdentity,
            orbitdbIdentity
        }
        
    } catch (error) {
        console.error('\n❌ Demo failed:', error.message)
        console.error(error.stack)
        process.exit(1)
    }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error)
}

export { 
    main,
    generateMasterSeed,
    convertTo32BitSeed,
    createStorachaIdentityFromSeed,
    createOrbitDBIdentityFromSeed,
    createStorachaDelegation 
}
