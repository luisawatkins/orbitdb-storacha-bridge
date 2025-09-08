# OrbitDB Storacha Bridge

> **OrbitDB database backup and restoration via Storacha/Filecoin**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-22+-green.svg)](https://nodejs.org/)
[![CI/CD Pipeline](https://github.com/NiKrause/orbitdb-storacha-bridge/actions/workflows/ci.yml/badge.svg)](https://github.com/NiKrause/orbitdb-storacha-bridge/actions/workflows/ci.yml)
[![ESLint](https://img.shields.io/badge/ESLint-passing-brightgreen.svg)](https://github.com/NiKause/orbitdb-storacha-bridge/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/orbitdb-storacha-bridge.svg)](https://www.npmjs.com/package/orbitdb-storacha-bridge)

## 🎯  OrbitDB backups and restore to Filecoin in 3 lines of code

Simple backup and restore functionality for OrbitDB databases using Storacha/Filecoin.

## Table of Contents

- [What This Does](#what-this-does)
- [RoadMap](#roadmap)
- [Installation](#installation)
- [Environment Setup](#environment-setup)
- [Demo](#demo)
- [How It Works](#how-it-works)
- [Testing](#testing)
- [Technical Details](#technical-details)
- [Contributing](#contributing)
- [License](#license)

## What This Does

So far mainly, "Backup and restore between **OrbitDB databases** and **Storacha/Filecoin** with or without identity preservation. Works in both Node.js and browser environments (the latter at this time only without identity preservation)

## RoadMap

- [x] backup/restore between OrbitDB and Storacha in NodeJS via Storacha key and proof credential (hash and identity preserving)
- [ ] backup/restore between OrbitDB and Storacha in browser (StorachaIntegration.svelte) (hash and identity preserving)
- [x] backup/restore between OrbitDB and Storacha in browser (StorachaIntegration.svelte) (entries only - into new OrbitDB with new identity)
- [x] OrbitDB CAR file storage (OrbitDB CustomStorage)
- [ ] backup/restore between OrbitDB and Storacha in NodeJS via UCAN and privatekey (hash and identity preserving)
- [ ] OrbitDB Storacha storage (OrbitDB CustomStorage) in NodeJS - storage ok - but OrbitDB CustomStore doesn't store the Manifest.Initial-sync therefore difficult
- [ ] OrbitDB Storacha storage (OrbitDB CustomStorage) in NodeJS (entries only - initial sync)

> **Note:** Currently, each Storacha space contains one full backup. For multiple backups, use separate spaces.

Read more: [Bridging OrbitDB with Storacha: Decentralized Database Backups](https://medium.com/@akashjana663/bridging-orbitdb-with-storacha-decentralized-database-backups-44c7bee5c395)

## Installation

Install the package via npm.

## Environment Setup

Get Storacha credentials from [web3.storage](https://web3.storage) and set up your environment variables for STORACHA_KEY and STORACHA_PROOF.

## Demo

**NodeJS Demo Scripts:**

- `node examples/demo.js` - Complete backup/restore cycle
- `node examples/backup-demo.js` - Backup demonstration only  
- `node examples/restore-demo.js` - Restore demonstration only

**Storacha Svelte components**

- [`StorachaAuth.svelte`](src/components/StorachaAuth.svelte) ([view on GitHub](https://github.com/NiKrause/orbitdb-storacha-bridge/blob/HEAD/src/components/StorachaAuth.svelte))  
    use this component when authenticating against Storacha with three different authentication methods: 
    1. Storacha credentials (Storacha-Key and Storacha Proof)
    2. UCAN (a UCAN which was delegated from another Storacha DID) + a corresponding private key
    3. Email (create a new Storacha account and space by email confirmation)

- [`StorachaTest.svelte`](src/components/StorachaTest.svelte) ([view on GitHub](https://github.com/NiKrause/orbitdb-storacha-bridge/blob/HEAD/src/components/StorachaTest.svelte)) 
    use the component in order to demonstrate a collaboration between Alice & Bob both working with independent OrbitDB todo db's.
    Alice creates an OrbitDB and a DID from a generated mnemonic seed, creates todo items and creates a backup to Storacha by extracting then entries from IPFS storage and uploading them to Storacha.
    Bob creates another OrbitDB with the same or a new seed connects to the same Storacha space as Alice and restores the Todo Items in his own OrbitDB.

    Remark: Alice & Bob's OrbitDB's in this scenario are independent db's with two different OrbitDB addresses and therefore cannot replicate records peer-to-peer! 
    If you want to achieve peer-to-peer replication between both db's (no restore would be required), in such case you'd need to open the db on Bob's side with Alice /orbitdb/address 


**Svelte App Demonstations & Components**
- `node` [`scripts/svelte-backup-restore.js`](scripts/svelte-backup-restore.js) - A script creating a example Svelte app in a sub directory which adds StorachaAuth.svelte and StorachaTest.svelte


## How It Works

1. **Extract Blocks** - Separates OrbitDB database into individual components (log entries, manifest, identities, access controls)
2. **Upload to Storacha** - Each block uploaded separately to IPFS/Filecoin via Storacha
3. **Smart Discovery** - Lists all files in Storacha space using SDK APIs
4. **CID Bridging** - Converts between Storacha CIDs (`bafkre*`) and OrbitDB CIDs (`zdpu*`)
5. **Reconstruct Database** - Reassembles blocks and opens database with original identity

## Testing

Ensure you have Storacha credentials in your `.env` file.
Use npm test commands to run various test suites including integration tests and verbose output.

### CAR Storage Tests

The `car-storage.test.js` suite provides comprehensive validation of the CAR (Content Addressable Archive) storage layer that enables persistent file-based storage for OrbitDB databases. The **Full OrbitDB Integration with Persistence** test demonstrates complete database lifecycle management: creating an OrbitDB instance with CAR storage, adding todo entries, persisting to CAR files, closing the database, reopening with a new OrbitDB instance, and verifying all data is perfectly recovered. This test validates that CAR storage can serve as a reliable persistence layer for OrbitDB's entry, heads, and index storage, ensuring data survives across application restarts.

## Technical Details

**CID Format Conversion:**

- OrbitDB: `zdpu*` (base58btc, dag-cbor codec)
- Storacha: `bafkre*` (base32, raw codec)
- Same content hash, different encoding

**Block Types Handled:**

- Log entries (actual data)
- Database manifests (metadata)
- Access controllers (permissions)
- Identity blocks (cryptographic proofs)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Submit a pull request

## License

MIT License

## Troubleshooting

### Common Issues

#### Authentication Errors

Invalid credentials or proof errors can be resolved by verifying your `.env` file contains valid Storacha credentials.

#### Restore Fails with "No files found"

When no files are found in Storacha space, run a backup first, verify you're using the correct Storacha space, and check that backup completed successfully.

#### Database Reconstruction Issues

When no manifest blocks are found, enable fallback mode or use custom database name. This creates a new database with recovered data (addresses won't match original).

#### Network/Timeout Issues

Request timeout errors can be resolved by increasing timeout, checking internet connection, or trying different IPFS gateway.

### Recovery Modes

The library supports two restoration approaches:

1. **Normal Restore** (default): Preserves original database structure, addresses, and hashes
2. **Fallback Restore**: Creates new database with recovered data when normal restore fails

Use fallback when:
- Original database structure is corrupted
- You only need the data, not the exact database identity
- Normal restore consistently fails

### Return Values

#### Backup Results

Backup operations return success status, blocks uploaded count, total size, upload time, database address, and manifest information.

#### Restore Results

Restore operations return success status, database instance, entries recovered count, method used, preservation flags, and metadata.

## Use Cases

### Database Migration
Move OrbitDB databases between different environments or nodes using backup and restore operations.

### Disaster Recovery
Recover from data loss with automatic fallback mode to create new database with all recoverable data.

### Long-term Archival
Archive databases to Filecoin for permanent storage and later restoration.

## Performance Guidelines

### Optimal Settings by Database Size

| Database Size | batchSize | maxConcurrency | Expected Time |
|---------------|-----------|----------------|---------------|
| Small (< 1MB) | 5         | 2              | < 30s         |
| Medium (1-10MB) | 10      | 3              | 1-5 min       |
| Large (> 10MB) | 20       | 5              | 5+ min        |

### Memory Usage
- Each block kept in memory during processing
- Large databases may require Node.js memory limits

### Network Considerations
- Upload speed depends on your internet connection
- Download uses IPFS gateways (may vary in performance)
- Consider timeout increases for slow connections

## Migration Guide

### From OrbitDB v1 to v2
This library works with OrbitDB v2. For v1 databases:
1. Upgrade OrbitDB to v2
2. Migrate database format
3. Use this bridge for backup

### From Other Backup Solutions
If migrating from custom backup solutions:
1. Ensure OrbitDB database is accessible
2. Run backup operation
3. Test restore on separate OrbitDB instance
4. Verify data integrity before switching
