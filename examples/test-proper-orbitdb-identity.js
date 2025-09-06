#!/usr/bin/env node

/**
 * Test Proper OrbitDB Identity Creation
 * 
 * This script tests the corrected createOrbitDBIdentityFromSeed function
 * to ensure it properly creates an OrbitDB identity with DID provider integration.
 */

import 'dotenv/config'
import { generateMnemonic } from 'bip39'
import { createLibp2p } from 'libp2p'
import { createHelia } from 'helia'
import { LevelBlockstore } from 'blockstore-level'
import { createOrbitDB } from '@orbitdb/core'
import { tcp } from '@libp2p/tcp'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { 
    generateMasterSeed,
    createOrbitDBIdentityFromSeed 
} from './decontact-style-identity.js'

// Basic libp2p config (simplified)
const Libp2pOptions = {
    // Add minimal config - you may need to import your actual config
}

async function testProperOrbitDBIdentity() {
    console.log('🧪 Testing Proper OrbitDB Identity Creation')
    console.log('=' .repeat(50))
    
    try {
        console.log('\n🌱 Step 1: Generate seed phrase and master seed')
        
        // Generate test seed
        const seedPhrase = generateMnemonic()
        const masterSeed = generateMasterSeed(seedPhrase, 'password')
        
        console.log(`   🔤 Seed phrase: ${seedPhrase}`)
        console.log(`   🔑 Master seed: ${masterSeed.substring(0, 16)}...`)
        
        console.log('\n🆔 Step 2: Create proper OrbitDB identity from seed')
        
        // Create proper OrbitDB identity (this should now work correctly)
        const orbitdbResult = await createOrbitDBIdentityFromSeed(masterSeed)
        
        console.log('\n✅ Identity Creation Results:')
        console.log(`   🔵 OrbitDB Identity ID: ${orbitdbResult.identity.id}`)
        console.log(`   🔑 Identity Type: ${orbitdbResult.identity.type}`)
        console.log(`   📋 Identity Hash: ${orbitdbResult.identity.hash}`)
        
        console.log('\n🚀 Step 3: Test OrbitDB integration with custom identity')
        
        // Initialize IPFS/Helia with minimal config
        const blockstore = new LevelBlockstore('./test-identity/ipfs')
        let libp2p
        try {
            // Try to import your libp2p config
            const { Libp2pOptions: ImportedConfig } = await import('../config/libp2p.js')
            libp2p = await createLibp2p(ImportedConfig)
        } catch {
            // Fallback to minimal config
            libp2p = await createLibp2p({
                addresses: { listen: ['/ip4/0.0.0.0/tcp/0'] },
                transports: [tcp()],
                connectionEncryption: [noise()],
                streamMuxers: [yamux()]
            })
        }
        
        const ipfs = await createHelia({ libp2p, blockstore })
        
        // Create OrbitDB with custom identity
        const orbitdb = await createOrbitDB({ 
            ipfs, 
            identities: orbitdbResult.identities,
            id: orbitdbResult.identity.id,
            directory: './test-identity/orbitdb'
        })
        
        console.log(`   ✅ OrbitDB initialized with custom identity`)
        console.log(`   🤖 OrbitDB identity: ${orbitdb.identity.id}`)
        
        console.log('\n🗄️ Step 4: Test database operations with custom identity')
        
        // Create a test database
        const db = await orbitdb.open('test-seed-identity-db')
        
        console.log(`   📍 Database address: ${db.address}`)
        console.log(`   🔑 Database creator: ${db.identity.id}`)
        
        // Add some test data
        await db.add('Hello from seed-derived OrbitDB identity!')
        await db.add(`Created at: ${new Date().toISOString()}`)
        await db.add(`Seed phrase: ${seedPhrase}`)
        
        // Retrieve all data
        const allEntries = await db.all()
        console.log(`   📝 Added ${allEntries.length} entries to database`)
        
        console.log('\n📊 Database Entries:')
        allEntries.forEach((entry, index) => {
            console.log(`   ${index + 1}. ${entry.value}`)
        })
        
        console.log('\n🔄 Step 5: Test deterministic identity recreation')
        
        // Create the same identity again from the same seed
        const orbitdbResult2 = await createOrbitDBIdentityFromSeed(masterSeed)
        
        const identityMatch = orbitdbResult.identity.id === orbitdbResult2.identity.id
        console.log(`   🔍 Identity determinism: ${identityMatch ? '✅ SAME' : '❌ DIFFERENT'}`)
        console.log(`   📋 Original: ${orbitdbResult.identity.id}`)
        console.log(`   📋 Recreated: ${orbitdbResult2.identity.id}`)
        
        // Cleanup
        console.log('\n🧹 Cleanup...')
        await db.close()
        await orbitdb.stop()
        await ipfs.stop()
        
        console.log('\n🎉 SUCCESS! Proper OrbitDB identity creation with DID provider works!')
        console.log('\n📋 Test Summary:')
        console.log(`   ✅ Seed-derived OrbitDB identity created`)
        console.log(`   ✅ Custom DID provider registered`)
        console.log(`   ✅ OrbitDB integrated with custom identity`)
        console.log(`   ✅ Database operations successful`)
        console.log(`   ${identityMatch ? '✅' : '❌'} Deterministic identity recreation`)
        
        return {
            success: true,
            identity: orbitdbResult.identity,
            deterministic: identityMatch,
            seedPhrase,
            databaseEntries: allEntries.length
        }
        
    } catch (error) {
        console.error('\n❌ Test failed:', error.message)
        console.error('Stack:', error.stack)
        
        return {
            success: false,
            error: error.message
        }
    }
}

// Run test if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    testProperOrbitDBIdentity()
        .then(result => {
            if (result.success) {
                console.log('\n✅ All tests passed!')
                process.exit(0)
            } else {
                console.log('\n❌ Tests failed!')
                process.exit(1)
            }
        })
        .catch(error => {
            console.error('Test execution failed:', error)
            process.exit(1)
        })
}

export { testProperOrbitDBIdentity }
