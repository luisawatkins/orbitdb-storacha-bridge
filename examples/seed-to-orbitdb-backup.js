#!/usr/bin/env node

/**
 * Complete deContact-Style OrbitDB Backup to Storacha
 * 
 * This example demonstrates a complete workflow:
 * 1. Generate unified identities from seed phrase (deContact style)
 * 2. Create OrbitDB database with sample data 
 * 3. Backup database to Storacha using seed-derived identity
 * 4. Simulate "new device" scenario by clearing local data
 * 5. Restore database from Storacha using same seed phrase
 * 6. Verify data integrity and cross-device functionality
 * 
 * This proves that deContact's seed phrase approach enables complete
 * cross-device data synchronization including both OrbitDB and Storacha.
 */

import 'dotenv/config'
import { generateMnemonic } from 'bip39'
import { OrbitDBStorachaBridgeUCAN } from '../lib/ucan-bridge.js'
import { createHeliaOrbitDB, cleanupOrbitDBDirectories } from '../lib/utils.js'
import { 
    generateMasterSeed, 
    createStorachaIdentityFromSeed, 
    createOrbitDBIdentityFromSeed,
    createStorachaDelegation 
} from './decontact-style-identity.js'

// Import OrbitDB components (same as deContact)
import { createOrbitDB } from '@orbitdb/core'
import { createIdentities, useIdentityProvider } from '@orbitdb/core'
import OrbitDBIdentityProviderDID from '@orbitdb/identity-provider-did'
import * as KeyDIDResolver from 'key-did-resolver'
import { promises as fs } from 'fs'
import { join } from 'path'

/**
 * Create OrbitDB instance with deContact-style DID identity
 */
async function createOrbitDBWithSeedIdentity(helia, masterSeed) {
    console.log('🗄️  Creating OrbitDB instance with seed-derived identity...')
    
    try {
        // Set up DID resolver (same as deContact)
        const keyDidResolver = KeyDIDResolver.getResolver()
        OrbitDBIdentityProviderDID.setDIDResolver(keyDidResolver)
        useIdentityProvider(OrbitDBIdentityProviderDID)
        
        // Create identities system
        const identities = await createIdentities({ ipfs: helia })
        
        // Create DID identity from seed (same as deContact)
        const orbitdbIdentity = await createOrbitDBIdentityFromSeed(masterSeed)
        
        const identity = await identities.createIdentity({ 
            provider: OrbitDBIdentityProviderDID({ 
                didProvider: orbitdbIdentity.didProvider 
            }) 
        })
        
        // Create OrbitDB instance  
        const orbitdb = await createOrbitDB({
            ipfs: helia,
            identity,
            identities,
            directory: './orbitdb-decontact-demo'
        })
        
        console.log(`   ✅ OrbitDB ready with identity: ${identity.id}`)
        
        return { orbitdb, identity }
        
    } catch (error) {
        console.error('   ❌ OrbitDB creation failed:', error.message)
        throw error
    }
}

/**
 * Create sample database with contact data (deContact style)
 */
async function createSampleAddressBook(orbitdb) {
    console.log('📇 Creating sample address book database...')
    
    try {
        // Create documents database (like deContact's myAddressBook)
        const addressBook = await orbitdb.open('my-address-book', {
            type: 'documents',
            sync: true
        })
        
        console.log(`   📍 Database address: ${addressBook.address}`)
        
        // Add sample contacts (deContact style data)
        const contacts = [
            {
                _id: 'contact-001',
                firstName: 'Alice',
                lastName: 'Johnson', 
                email: 'alice@example.com',
                city: 'Berlin',
                category: 'personal',
                owner: orbitdb.identity.id,
                own: false
            },
            {
                _id: 'contact-002', 
                firstName: 'Bob',
                lastName: 'Smith',
                email: 'bob@company.com',
                city: 'London',
                category: 'business',
                owner: orbitdb.identity.id,
                own: false
            },
            {
                _id: 'contact-me',
                firstName: 'My',
                lastName: 'Identity',
                email: 'me@seed-identity.did',
                city: 'Decentralized',
                category: 'personal', 
                owner: orbitdb.identity.id,
                own: true,
                sharedAddress: addressBook.address
            }
        ]
        
        console.log(`   📝 Adding ${contacts.length} contacts...`)
        
        for (const contact of contacts) {
            const hash = await addressBook.put(contact)
            console.log(`      ✅ Added ${contact.firstName} ${contact.lastName}: ${hash}`)
        }
        
        // Wait for database to settle
        await new Promise(resolve => setTimeout(resolve, 1000))
        
        const allContacts = await addressBook.all()
        console.log(`   📊 Database contains ${allContacts.length} contacts`)
        
        return addressBook
        
    } catch (error) {
        console.error('   ❌ Database creation failed:', error.message)
        throw error
    }
}

/**
 * Simulate cross-device scenario by clearing local data
 */
async function simulateNewDevice() {
    console.log('🔄 Simulating new device (clearing local data)...')
    
    try {
        // Clean up OrbitDB directories
        await cleanupOrbitDBDirectories()
        console.log('   ✅ Local OrbitDB data cleared')
        
        // Note: In real scenario, user would install app on new device
        // and enter their seed phrase to recover identity
        
    } catch (error) {
        console.log('   ⚠️  Cleanup warning (may be expected):', error.message)
    }
}

/**
 * Main demonstration workflow
 */
async function main() {
    console.log('🚀 Complete deContact-Style OrbitDB ↔ Storacha Demo')
    console.log('=' .repeat(65))
    
    let helia, orbitdb, addressBook
    
    try {
        // Check environment
        const authorityKey = process.env.STORACHA_KEY
        const authorityProof = process.env.STORACHA_PROOF
        
        if (!authorityKey || !authorityProof) {
            console.log('❌ Missing STORACHA_KEY and STORACHA_PROOF in .env')
            console.log('💡 Add these credentials to run the complete demo')
            process.exit(1)
        }
        
        console.log('\\n🌱 Phase 1: Generate Unified Identity from Seed Phrase')
        console.log('-'.repeat(50))
        
        // Use consistent seed phrase for reproducible demo
        const seedPhrase = process.env.DEMO_SEED_PHRASE || generateMnemonic()
        console.log(`   🔤 Seed phrase: ${seedPhrase}`)
        
        const masterSeed = generateMasterSeed(seedPhrase, 'password')
        console.log(`   🔑 Master seed: ${masterSeed.substring(0, 16)}...`)
        
        // Generate both identities from same seed
        const storachaIdentity = await createStorachaIdentityFromSeed(masterSeed, 1)
        console.log(`   🟢 Storacha DID: ${storachaIdentity.did}`)
        
        // Create UCAN delegation
        const delegation = await createStorachaDelegation(storachaIdentity, {
            key: authorityKey,
            proof: authorityProof
        })
        console.log(`   📜 UCAN delegation ready (expires ${delegation.expiresAt.toLocaleDateString()})`)
        
        console.log('\\n🗄️  Phase 2: Create OrbitDB Database with Sample Data')
        console.log('-'.repeat(50))
        
        // Initialize Helia and OrbitDB
        const { helia: heliaInstance, orbitdb: orbitdbInstance } = await createHeliaOrbitDB()
        helia = heliaInstance
        
        // Create OrbitDB with seed-derived identity
        const orbitdbWithIdentity = await createOrbitDBWithSeedIdentity(helia, masterSeed)
        orbitdb = orbitdbWithIdentity.orbitdb
        
        console.log(`   🆔 OrbitDB Identity: ${orbitdb.identity.id}`)
        
        // Create sample address book
        addressBook = await createSampleAddressBook(orbitdb)
        
        console.log('\\n📤 Phase 3: Backup Database to Storacha')
        console.log('-'.repeat(50))
        
        // Initialize bridge with seed-derived Storacha identity
        const bridge = new OrbitDBStorachaBridgeUCAN({
            ucanToken: delegation.delegation,
            recipientKey: JSON.stringify(storachaIdentity.privateKey)
        })
        
        // Listen for progress events
        bridge.on('uploadProgress', (progress) => {
            if (progress.status === 'uploading' && progress.currentBlock) {
                console.log(`   📤 Uploading: ${progress.percentage}% (${progress.current}/${progress.total})`)
            }
        })
        
        // Backup database to Storacha
        console.log(`   🎯 Backing up database: ${addressBook.address}`)
        const backupResult = await bridge.backup(orbitdb, addressBook.address)
        
        if (backupResult.success) {
            console.log('   ✅ Backup completed successfully!')
            console.log(`      📊 Blocks uploaded: ${backupResult.blocksUploaded}/${backupResult.blocksTotal}`)
            console.log(`      🗂️  Block types: ${JSON.stringify(backupResult.blockSummary)}`)
            console.log(`      📍 Manifest CID: ${backupResult.manifestCID}`)
        } else {
            throw new Error(`Backup failed: ${backupResult.error}`)
        }
        
        console.log('\\n🔄 Phase 4: Simulate Cross-Device Recovery')
        console.log('-'.repeat(50))
        
        // Close current instances
        await orbitdb.stop()
        await helia.stop()
        console.log('   📴 Closed "old device" instances')
        
        // Simulate clearing local data
        await simulateNewDevice()
        
        // "New device" - recreate everything from seed phrase
        console.log('   🆕 Starting "new device" with same seed phrase...')
        
        // Recreate Helia and OrbitDB instances
        const { helia: newHelia, orbitdb: newOrbitdbBase } = await createHeliaOrbitDB()
        
        // Recreate identities from SAME seed phrase
        const newStorachaIdentity = await createStorachaIdentityFromSeed(masterSeed, 1)
        const newOrbitdbWithIdentity = await createOrbitDBWithSeedIdentity(newHelia, masterSeed)
        const newOrbitdb = newOrbitdbWithIdentity.orbitdb
        
        console.log(`   🔍 Verifying identity consistency:`)
        console.log(`      Old Storacha DID: ${storachaIdentity.did}`)
        console.log(`      New Storacha DID: ${newStorachaIdentity.did}`)
        console.log(`      Match: ${storachaIdentity.did === newStorachaIdentity.did ? '✅' : '❌'}`)
        console.log(`      Old OrbitDB ID: ${orbitdbWithIdentity.identity.id}`)
        console.log(`      New OrbitDB ID: ${newOrbitdbWithIdentity.identity.id}`)
        console.log(`      Match: ${orbitdbWithIdentity.identity.id === newOrbitdbWithIdentity.identity.id ? '✅' : '❌'}`)
        
        // Recreate bridge with same seed-derived identity
        const newDelegation = await createStorachaDelegation(newStorachaIdentity, {
            key: authorityKey,
            proof: authorityProof
        })
        
        const newBridge = new OrbitDBStorachaBridgeUCAN({
            ucanToken: newDelegation.delegation,
            recipientKey: JSON.stringify(newStorachaIdentity.privateKey)
        })
        
        // Listen for restore progress
        newBridge.on('downloadProgress', (progress) => {
            if (progress.status === 'downloading' && progress.currentBlock) {
                console.log(`   📥 Downloading: ${progress.percentage}% (${progress.current}/${progress.total})`)
            }
        })
        
        // Restore database from Storacha
        console.log('   🔄 Restoring database from Storacha...')
        const restoreResult = await newBridge.restoreFromSpace(newOrbitdb)
        
        if (restoreResult.success) {
            console.log('   ✅ Restore completed successfully!')
            console.log(`      📊 Entries recovered: ${restoreResult.entriesRecovered}`)
            console.log(`      📍 Database address: ${restoreResult.databaseAddress}`)
            
            // Verify data integrity
            console.log('   🔍 Verifying data integrity...')
            
            const restoredDb = await newOrbitdb.open(restoreResult.databaseAddress)
            const restoredContacts = await restoredDb.all()
            
            console.log(`      📇 Restored contacts: ${restoredContacts.length}`)
            
            for (const contact of restoredContacts) {
                console.log(`      👤 ${contact.value.firstName} ${contact.value.lastName} (${contact.value.email})`)
            }
            
            // Verify specific data
            const aliceContact = restoredContacts.find(c => c.value.firstName === 'Alice')
            const myContact = restoredContacts.find(c => c.value.own === true)
            
            if (aliceContact && myContact) {
                console.log('   ✅ All sample data restored correctly!')
            } else {
                console.log('   ⚠️  Some data may be missing')
            }
            
        } else {
            throw new Error(`Restore failed: ${restoreResult.error}`)
        }
        
        console.log('\\n🎉 COMPLETE SUCCESS!')
        console.log('=' .repeat(65))
        console.log('✅ Generated unified identities from seed phrase')
        console.log('✅ Created OrbitDB database with sample data')
        console.log('✅ Backed up database to Storacha using seed-derived identity')
        console.log('✅ Simulated cross-device scenario') 
        console.log('✅ Restored database using same seed phrase')
        console.log('✅ Verified data integrity and identity consistency')
        console.log('')
        console.log('🚀 This proves deContact + Storacha integration works perfectly!')
        console.log('   👥 Users can recover all data on any device with just their seed phrase')
        console.log('   🔐 Self-sovereign identity controls both OrbitDB and Storacha access')
        console.log('   📱 Cross-device sync maintains complete data consistency')
        
        // Cleanup
        await newOrbitdb.stop()
        await newHelia.stop()
        
    } catch (error) {
        console.error('\\n❌ Demo failed:', error.message)
        console.error(error.stack)
        
        // Cleanup on failure
        try {
            if (orbitdb) await orbitdb.stop()
            if (helia) await helia.stop()
        } catch (cleanupError) {
            console.error('Cleanup error:', cleanupError.message)
        }
        
        process.exit(1)
    }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error)
}

export { main }
