# deContact-Style Identity Examples

This directory contains examples demonstrating how to use **deContact's seed phrase approach** for both OrbitDB and Storacha operations. This enables a unified identity system where a single seed phrase controls both decentralized database access and decentralized storage.

## Overview

The deContact project uses BIP39 seed phrases to generate deterministic DID identities for OrbitDB. These examples extend that approach to also generate deterministic Ed25519 identities for Storacha, creating a complete self-sovereign identity solution.

## Key Benefits

✅ **Single Source of Truth**: One seed phrase → Both OrbitDB DID + Storacha identity  
✅ **Cross-Device Sync**: Same seed phrase works on any device  
✅ **Self-Sovereign**: No external credential dependencies  
✅ **Deterministic**: Same seed always generates same identities  
✅ **Secure**: Uses proven BIP39 + Ed25519 cryptography  

## Examples

### 1. Basic Identity Generation (`decontact-style-identity.js`)

Demonstrates the core identity generation approach:
- Generate BIP39 seed phrase
- Create master seed (deContact style)
- Generate deterministic Storacha Ed25519 identity
- Generate deterministic OrbitDB DID identity
- Create UCAN delegation for Storacha
- Upload test file using seed-derived identity

```bash
# Run basic identity example
node examples/decontact-style-identity.js
```

**Output:**
```
🚀 deContact-Style Identity Generation for Storacha
============================================================

🌱 Step 1: Generate seed phrase (like deContact onboarding)
   🔤 Seed phrase: abandon abandon abandon ... art
   🔑 Master seed: a7f2c8e1...

🆔 Step 2: Create deterministic identities from seed
🔐 Creating deterministic Storacha identity from seed...
   ✅ Storacha identity: did:key:z6MkhaXgBZDvotDkL...
🆔 Creating DID identity for OrbitDB...
   ✅ DID identity: z6MkhaXgBZDvotDkL...

📋 Identity Summary:
   🔵 OrbitDB DID: did:key:z6MkhaXgBZDvotDkL...
   🟢 Storacha DID: did:key:z6MkqHBSjPNn4Po5xOzm...
   ✅ Both identities derived from same seed phrase!

📜 Step 3: Create UCAN delegation
   🚀 Authority space: did:key:z6Mkf...
   🎯 Delegating to: did:key:z6MkqHBSjPNn4Po5xOzm...
   ✅ UCAN delegation created!

📤 Step 4: Test file upload
   📄 Uploading file: seed-identity-test.txt (156 bytes)
   ✅ File uploaded successfully!
   🔗 CID: bafkreibm5xh7jr2ktdh...
   🌐 IPFS URL: https://w3s.link/ipfs/bafkreibm5xh7jr2ktdh...

🎉 SUCCESS! Complete demonstration:
   ✅ Seed phrase generated: 12 words
   ✅ Deterministic Storacha identity: did:key:z6MkqHBSjPNn4Po5xOzm...
   ✅ UCAN delegation created
   ✅ File uploaded: bafkreibm5xh7jr2ktdh...
   ✅ Same seed can be used on any device!

🔄 Cross-Device Recovery:
   To recover this identity on another device:
   1. Use seed phrase: abandon abandon abandon ... art
   2. Generate same master seed with password: 'password'
   3. Derive Storacha identity with derivation index: 1
   4. Result: did:key:z6MkqHBSjPNn4Po5xOzm...
```

### 2. Complete OrbitDB Backup (`seed-to-orbitdb-backup.js`)

Full demonstration including OrbitDB database backup and restore:
- Generate unified identities from seed phrase
- Create OrbitDB database with sample data
- Backup database to Storacha using seed-derived identity  
- Simulate "new device" and restore using same seed
- Verify data integrity

```bash
# Run complete backup/restore example
node examples/seed-to-orbitdb-backup.js
```

**Key Flow:**
1. **Phase 1**: Identity Generation from Seed
2. **Phase 2**: OrbitDB Database Creation  
3. **Phase 3**: Backup Database to Storacha
4. **Phase 4**: Simulate Cross-Device Recovery

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
# Additional dependencies for examples
npm install @scure/bip39 key-did-provider-ed25519 key-did-resolver @orbitdb/identity-provider-did
```

### 2. Configure Environment

Create `.env` file with your Storacha credentials:

```env
# Required for delegation and uploads
STORACHA_KEY=your_storacha_private_key
STORACHA_PROOF=your_storacha_proof

# Optional: Use specific seed phrase for testing
DEMO_SEED_PHRASE="abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art"
```

**Get Storacha Credentials:**
1. Sign up at [web3.storage](https://web3.storage)
2. Create API key and get delegation proof
3. Add to `.env` file

### 3. Run Examples

```bash
# Basic identity generation only
node examples/decontact-style-identity.js

# Complete OrbitDB backup/restore demo
node examples/seed-to-orbitdb-backup.js
```

## Technical Details

### Seed Derivation

The examples use deContact's exact approach for seed handling:

```javascript
// 1. Generate BIP39 mnemonic (12 words)
const seedPhrase = generateMnemonic()

// 2. Create master seed with password (same as deContact)
const masterSeed = mnemonicToSeedSync(seedPhrase, 'password').toString('hex')

// 3. Convert to 32-bit seed (same as deContact)
const seed32 = createHash('sha256').update(Buffer.from(masterSeed, 'hex')).digest()

// 4. Create DID identity for OrbitDB
const didProvider = new Ed25519Provider(seed32)

// 5. Create Storacha identity with derivation
const derivedSeed = new Uint8Array(32)
derivedSeed.set(seed32)
derivedSeed[31] ^= 1  // Derivation index for Storacha
const storachaPrincipal = Signer.fromSeed(derivedSeed)
```

### Identity Mapping

From a single seed phrase, you get:

| System | Identity Type | Derivation | Example |
|--------|---------------|------------|---------|
| OrbitDB | DID (Ed25519) | Index 0 | `did:key:z6MkhaXgBZDvotDkL...` |
| Storacha | Ed25519 Principal | Index 1 | `did:key:z6MkqHBSjPNn4Po5xOzm...` |

### UCAN Delegation

The examples create UCAN delegations that:
- Grant upload/download capabilities to seed-derived identity
- Expire after 30 days (configurable)
- Enable operations without original Storacha credentials
- Support cross-device usage with same seed

## Integration with deContact

These examples show exactly how deContact could integrate Storacha:

```javascript
// In deContact's identity system
const masterSeed = generateMasterSeed(seedPhrase, 'password')

// Existing: OrbitDB DID identity  
const orbitdbIdentity = await getIdentityAndCreateOrbitDB('ed25519', masterSeed, helia)

// New: Storacha identity from same seed
const storachaIdentity = await createStorachaIdentityFromSeed(masterSeed, 1)

// New: File upload capability
const uploadResult = await storachaIdentity.uploadFile(fileData)
```

This enables deContact users to:
- Backup their address books to Storacha/Filecoin
- Share files using the same identity system
- Sync data across devices using seed phrases
- Maintain self-sovereign control over all data

## Error Handling

If examples fail:

1. **Missing Dependencies**: Run `npm install @scure/bip39 key-did-provider-ed25519 key-did-resolver @orbitdb/identity-provider-did`

2. **Missing Credentials**: Add `STORACHA_KEY` and `STORACHA_PROOF` to `.env`

3. **Permission Errors**: Check that delegation includes required capabilities:
   - `space/blob/add`
   - `space/index/add` 
   - `upload/add`
   - `upload/list`
   - `store/add`
   - `filecoin/offer`

4. **Network Issues**: Examples use public IPFS gateway - ensure internet connectivity

## Next Steps

After running these examples, you can:

1. **Integrate into deContact**: Add Storacha identity generation to deContact's existing seed management
2. **Build Applications**: Use this pattern for any app needing unified OrbitDB + Storacha identity
3. **Extend Capabilities**: Add more derivation indices for additional services
4. **Production Deploy**: Replace demo credentials with production Storacha setup

The examples prove that deContact's seed phrase approach is perfect for Storacha integration! 🎉
