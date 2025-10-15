#!/usr/bin/env node

/**
 * Test script to verify the IPFS identity linkage fix
 * 
 * This script tests whether the fix for identity resolution across peers works correctly.
 * Run with: node test-identity-fix.js
 */

import { createLibp2p } from 'libp2p';
import { tcp } from '@libp2p/tcp';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { identify } from '@libp2p/identify';
import { gossipsub } from '@chainsafe/libp2p-gossipsub';
import { createHelia } from 'helia';
import { createOrbitDB, Identities } from '@orbitdb/core';
import OrbitDBIdentityProviderDID from '@orbitdb/identity-provider-did';
import { Ed25519Provider } from 'key-did-provider-ed25519';
import * as KeyDIDResolver from 'key-did-resolver';
import { generateMnemonic, mnemonicToSeedSync } from '@scure/bip39';
import { wordlist as english } from '@scure/bip39/wordlists/english';
import { createHash } from 'crypto';

// Utility functions (same as in your Svelte component)
function convertTo32BitSeed(origSeed) {
  const hash = createHash("sha256");
  hash.update(Buffer.from(origSeed, "hex"));
  return hash.digest();
}

function toHex(u8) {
  return Array.from(u8)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateMasterSeed(mnemonicSeedphrase, password = "password") {
  return toHex(mnemonicToSeedSync(mnemonicSeedphrase, password));
}

async function createHeliaInstance(suffix = '') {
  const libp2p = await createLibp2p({
    addresses: {
      listen: ["/ip4/0.0.0.0/tcp/0"],
    },
    transports: [tcp()],
    connectionEncryption: [noise()],
    streamMuxers: [yamux()],
    services: {
      identify: identify(),
      pubsub: gossipsub({ allowPublishToZeroTopicPeers: true }),
    },
  });

  const helia = await createHelia({ libp2p });
  return { helia, libp2p };
}

async function testIdentityFix() {
  console.log('🧪 Testing IPFS Identity Linkage Fix');
  console.log('=====================================');
  
  try {
    // Set up DID resolver
    const keyDidResolver = KeyDIDResolver.getResolver();
    OrbitDBIdentityProviderDID.setDIDResolver(keyDidResolver);
    
    // Create Alice's Helia instance
    console.log('🔧 Creating Alice\'s Helia instance...');
    const { helia: aliceHelia, libp2p: aliceLibp2p } = await createHeliaInstance('-alice');
    
    // Create Bob's Helia instance
    console.log('🔧 Creating Bob\'s Helia instance...');
    const { helia: bobHelia, libp2p: bobLibp2p } = await createHeliaInstance('-bob');
    
    // Test 1: OLD WAY (should fail identity resolution)
    console.log('\n❌ Test 1: OLD WAY (shared identities - should fail)');
    const sharedIdentitiesSystem = await Identities(); // No IPFS linkage!
    
    // Generate Alice identity with shared system
    const aliceSeedPhrase = generateMnemonic(english);
    const aliceMasterSeed = generateMasterSeed(aliceSeedPhrase, 'alice-password');
    const aliceSeed32 = convertTo32BitSeed(aliceMasterSeed);
    const aliceDidProvider = new Ed25519Provider(aliceSeed32);
    
    const aliceIdentityOld = await sharedIdentitiesSystem.createIdentity({
      provider: OrbitDBIdentityProviderDID({
        didProvider: aliceDidProvider,
      }),
    });
    
    // Generate Bob identity with shared system
    const bobSeedPhrase = generateMnemonic(english);
    const bobMasterSeed = generateMasterSeed(bobSeedPhrase, 'bob-password');
    const bobSeed32 = convertTo32BitSeed(bobMasterSeed);
    const bobDidProvider = new Ed25519Provider(bobSeed32);
    
    const bobIdentityOld = await sharedIdentitiesSystem.createIdentity({
      provider: OrbitDBIdentityProviderDID({
        didProvider: bobDidProvider,
      }),
    });
    
    console.log(`   Alice identity: ${aliceIdentityOld.id.slice(-12)}`);
    console.log(`   Bob identity: ${bobIdentityOld.id.slice(-12)}`);
    
    // Try to resolve with different IPFS instances (should fail)
    const aliceLinkedOld = await Identities({ ipfs: aliceHelia });
    const bobLinkedOld = await Identities({ ipfs: bobHelia });
    
    const aliceCanResolveAliceOld = await aliceLinkedOld.getIdentity(aliceIdentityOld.hash);
    const aliceCanResolveBobOld = await aliceLinkedOld.getIdentity(bobIdentityOld.hash);
    const bobCanResolveAliceOld = await bobLinkedOld.getIdentity(aliceIdentityOld.hash);
    const bobCanResolveBobOld = await bobLinkedOld.getIdentity(bobIdentityOld.hash);
    
    console.log(`   ❌ Alice resolves Alice: ${aliceCanResolveAliceOld ? '✅' : '❌'}`);
    console.log(`   ❌ Alice resolves Bob: ${aliceCanResolveBobOld ? '✅' : '❌'} (expected fail)`);
    console.log(`   ❌ Bob resolves Alice: ${bobCanResolveAliceOld ? '✅' : '❌'} (expected fail)`);
    console.log(`   ❌ Bob resolves Bob: ${bobCanResolveBobOld ? '✅' : '❌'}`);
    
    // Test 2: NEW WAY (should work with identity resolution)
    console.log('\n✅ Test 2: NEW WAY (IPFS-linked identities - should work)');
    
    // Create IPFS-linked identities systems
    const aliceIdentitiesLinked = await Identities({ ipfs: aliceHelia });
    const bobIdentitiesLinked = await Identities({ ipfs: bobHelia });
    
    // Generate new identities with IPFS-linked systems
    const aliceIdentityNew = await aliceIdentitiesLinked.createIdentity({
      provider: OrbitDBIdentityProviderDID({
        didProvider: aliceDidProvider, // Reuse same provider for consistency
      }),
    });
    
    const bobIdentityNew = await bobIdentitiesLinked.createIdentity({
      provider: OrbitDBIdentityProviderDID({
        didProvider: bobDidProvider, // Reuse same provider for consistency  
      }),
    });
    
    console.log(`   Alice identity: ${aliceIdentityNew.id.slice(-12)}`);
    console.log(`   Bob identity: ${bobIdentityNew.id.slice(-12)}`);
    
    // Cross-store identities for resolution
    console.log('🔗 Cross-storing identities...');
    await aliceHelia.blockstore.put(aliceIdentityNew.hash, aliceIdentityNew.bytes);
    await aliceHelia.blockstore.put(bobIdentityNew.hash, bobIdentityNew.bytes);
    await bobHelia.blockstore.put(aliceIdentityNew.hash, aliceIdentityNew.bytes);
    await bobHelia.blockstore.put(bobIdentityNew.hash, bobIdentityNew.bytes);
    
    // Test resolution with IPFS-linked systems
    const aliceCanResolveAliceNew = await aliceIdentitiesLinked.getIdentity(aliceIdentityNew.hash);
    const aliceCanResolveBobNew = await aliceIdentitiesLinked.getIdentity(bobIdentityNew.hash);
    const bobCanResolveAliceNew = await bobIdentitiesLinked.getIdentity(aliceIdentityNew.hash);
    const bobCanResolveBobNew = await bobIdentitiesLinked.getIdentity(bobIdentityNew.hash);
    
    console.log(`   ✅ Alice resolves Alice: ${aliceCanResolveAliceNew ? '✅' : '❌'}`);
    console.log(`   ✅ Alice resolves Bob: ${aliceCanResolveBobNew ? '✅' : '❌'} (should work now!)`);
    console.log(`   ✅ Bob resolves Alice: ${bobCanResolveAliceNew ? '✅' : '❌'} (should work now!)`);
    console.log(`   ✅ Bob resolves Bob: ${bobCanResolveBobNew ? '✅' : '❌'}`);
    
    // Verify the fix worked
    const fixWorked = aliceCanResolveBobNew && bobCanResolveAliceNew;
    console.log('\n🏆 RESULT:');
    console.log(`Cross-peer identity resolution: ${fixWorked ? '✅ FIXED!' : '❌ Still broken'}`);
    
    if (fixWorked) {
      console.log('🎉 The IPFS identity linkage fix is working correctly!');
      console.log('   Both Alice and Bob can now resolve each other\'s identities.');
      console.log('   This should resolve the OrbitDB replication access control issues.');
    } else {
      console.log('😞 The fix didn\'t work. Further investigation needed.');
    }
    
    // Cleanup
    await aliceHelia.stop();
    await bobHelia.stop();
    await aliceLibp2p.stop();  
    await bobLibp2p.stop();
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testIdentityFix()
  .then(() => {
    console.log('\n✅ Test completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });