# OrbitDB Storacha Bridge

> **OrbitDB database backup and restoration via Storacha/Filecoin**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-22+-green.svg)](https://nodejs.org/)
[![CI/CD Pipeline](https://github.com/NiKrause/orbitdb-storacha-bridge/actions/workflows/ci.yml/badge.svg)](https://github.com/NiKrause/orbitdb-storacha-bridge/actions/workflows/ci.yml)
[![ESLint](https://img.shields.io/badge/ESLint-passing-brightgreen.svg)](https://github.com/NiKause/orbitdb-storacha-bridge/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/orbitdb-storacha-bridge.svg)](https://www.npmjs.com/package/orbitdb-storacha-bridge)

## 🎯  OrbitDB backups and restore to Filecoin in 3 lines of code

```javascript
const bridge = new OrbitDBStorachaBridge({ storachaKey, storachaProof })
const backup = await bridge.backup(orbitdb, dbAddress)
const restored = await bridge.restoreFromSpace(newOrbitdb)
console.log(`${restored.entriesRecovered} entries restored perfectly!`)
```

## Table of Contents

- [What This Does](#what-this-does)
- [Installation](#installation)
- [Environment Setup](#environment-setup)
- [Quick Start](#quick-start)
- [API Reference](#api-reference)
- [Advanced Examples](#advanced-examples)
- [Demo](#demo)
- [How It Works](#how-it-works)
- [Testing](#testing)
- [Technical Details](#technical-details)
- [Contributing](#contributing)
- [License](#license)

## What This Does

Backup and restore **OrbitDB databases** to **Storacha/Filecoin** with or without identity preservation. Works in both Node.js and browser environments.

**Key Features:**

- 🔄 Hash preservation and identity recovery
- 🌐 Works in Node.js and browsers
- 📦 One Storacha space = one complete database backup
- 🚀 Automatic block discovery and CID format conversion
- 📊 Progress tracking and event emission

> **Note:** Currently, each Storacha space contains one full backup. For multiple backups, use separate spaces.

Read more: [Bridging OrbitDB with Storacha: Decentralized Database Backups](https://medium.com/@akashjana663/bridging-orbitdb-with-storacha-decentralized-database-backups-44c7bee5c395)

## Installation

```bash
npm install orbitdb-storacha-bridge
```

## Environment Setup

Get Storacha credentials from [web3.storage](https://web3.storage):

```env
STORACHA_KEY=your_private_key_here
STORACHA_PROOF=your_proof_here
```

## Quick Start

### Using the Class Interface (Recommended)

```javascript
import { OrbitDBStorachaBridge } from 'orbitdb-storacha-bridge'

// Initialize with credentials
const bridge = new OrbitDBStorachaBridge({
  storachaKey: process.env.STORACHA_KEY,
  storachaProof: process.env.STORACHA_PROOF
})

// Optional: Listen for progress events
bridge.on('uploadProgress', (progress) => {
  console.log(`Upload: ${progress.percentage}% (${progress.current}/${progress.total})`)
})

bridge.on('downloadProgress', (progress) => {
  console.log(`Download: ${progress.percentage}% (${progress.current}/${progress.total})`)
})

// Backup database
const backup = await bridge.backup(orbitdb, '/orbitdb/zdpu...')
console.log(`✅ Backed up ${backup.blocksUploaded} blocks`)

// Restore (discovers all files in space automatically)
const restore = await bridge.restoreFromSpace(targetOrbitdb)
console.log(`✅ Restored ${restore.entriesRecovered} entries`)
```

### Using Simple Functions

```javascript
import { backupDatabase, restoreDatabaseFromSpace } from 'orbitdb-storacha-bridge'

const options = {
  storachaKey: process.env.STORACHA_KEY,
  storachaProof: process.env.STORACHA_PROOF
}

const backup = await backupDatabase(orbitdb, '/orbitdb/zdpu...', options)
const restore = await restoreDatabaseFromSpace(targetOrbitdb, options)
```

## API Reference

### OrbitDBStorachaBridge Class (Primary Interface)

```javascript
import { OrbitDBStorachaBridge } from 'orbitdb-storacha-bridge'

const bridge = new OrbitDBStorachaBridge({
  storachaKey: process.env.STORACHA_KEY,
  storachaProof: process.env.STORACHA_PROOF,
  timeout: 30000  // Optional: timeout in milliseconds
})

// Core methods
await bridge.backup(orbitdb, databaseAddress)
await bridge.restoreFromSpace(orbitdb)

// Utility methods
await bridge.listSpaceFiles()
const analysis = await bridge.analyzeBlocks(blockstore, downloadedBlocks)
const orbitdbCID = bridge.convertCID(storachaCID)
```

**Progress Events:**

```javascript
bridge.on('uploadProgress', ({ percentage, current, total }) => {
  console.log(`Upload: ${percentage}% (${current}/${total})`)
})

bridge.on('downloadProgress', ({ percentage, current, total }) => {
  console.log(`Download: ${percentage}% (${current}/${total})`)
})
```

### Simple Functions (Alternative Interface)

```javascript
import { 
  backupDatabase, 
  restoreDatabaseFromSpace,
  listStorachaSpaceFiles,
  clearStorachaSpace
} from 'orbitdb-storacha-bridge'

// All functions accept options as the last parameter
const options = { storachaKey, storachaProof }

await backupDatabase(orbitdb, databaseAddress, options)
await restoreDatabaseFromSpace(orbitdb, options)
await listStorachaSpaceFiles(options)
await clearStorachaSpace(options)
```

### Configuration Options

```javascript
{
  // Required credentials
  storachaKey: string,      // Your Storacha private key from web3.storage
  storachaProof: string,    // Your delegation proof from web3.storage
  
  // Performance tuning
  timeout: 30000,           // Request timeout in milliseconds (default: 30s)
  gateway: 'https://w3s.link', // IPFS gateway URL for downloads
  batchSize: 10,            // Number of blocks to process per batch
  maxConcurrency: 3,        // Maximum concurrent upload operations
  
  // Fallback/Recovery options
  fallbackDatabaseName: string, // Custom name when fallback reconstruction is needed
                               // Default: 'restored-{timestamp}'
  forceFallback: false      // Force fallback mode even if manifest is found
                           // Use when normal restore fails or for data-only recovery
}
```

**When to use fallback options:**

- `forceFallback`: Enable when you need data recovery without preserving identity, db address and access controller e.g. when a successful restore results in an empty db and could not be read successfully
- `fallbackDatabaseName`: Set a meaningful name for recovered databases (e.g., 'emergency-backup-2024')

## Demo

Run the complete demonstration:

```bash
npm install 
npm run demo                     # Complete backup/restore demonstration
```

**Individual Demo Scripts:**

- `examples/demo.js` - Complete backup/restore cycle
- `examples/backup-demo.js` - Backup demonstration only  
- `examples/restore-demo.js` - Restore demonstration only

**What the Demo Shows:**

- ✅ Creates a sample OrbitDB database with test data
- ✅ Backs up the complete database to Storacha/Filecoin
- ✅ Restores the database with perfect hash preservation
- ✅ Verifies data integrity and identity recovery
- ✅ Shows progress tracking and performance metrics

## How It Works

1. **Extract Blocks** - Separates OrbitDB database into individual components (log entries, manifest, identities, access controls)
2. **Upload to Storacha** - Each block uploaded separately to IPFS/Filecoin via Storacha
3. **Smart Discovery** - Lists all files in Storacha space using SDK APIs
4. **CID Bridging** - Converts between Storacha CIDs (`bafkre*`) and OrbitDB CIDs (`zdpu*`)
5. **Reconstruct Database** - Reassembles blocks and opens database with original identity

## Testing

### Prerequisites

Ensure you have Storacha credentials in your `.env` file:

```bash
cp .env.example .env
# Add your STORACHA_KEY and STORACHA_PROOF
```

### Run Tests

```bash
# Run all tests (includes automatic space clearing)
npm test

# Run only integration tests
npm run test:integration

# Run tests with verbose output
npm run test:verbose

# Manually clear Storacha space before testing
npm run clear-space
```

### Test Features

The comprehensive test suite validates:

- ✅ **Data Integrity** - Exact same data in/out of backup/restore cycles
- ✅ **Perfect Identity Recovery** - OrbitDB addresses preserved exactly
- ✅ **All Block Types** - Log entries, manifests, access controllers, identities
- ✅ **CID Format Conversion** - Accurate Storacha ↔ OrbitDB format bridging
- ✅ **Mapping-Independent Restore** - Space discovery without stored mappings
- ✅ **Automatic Cleanup** - Tests clean up OrbitDB directories and Storacha space

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
```
Error: Invalid credentials or proof
```
**Solution:** Verify your `.env` file contains valid Storacha credentials:
```bash
STORACHA_KEY=your_private_key_here
STORACHA_PROOF=your_proof_here
```

#### Restore Fails with "No files found"
```
Error: No files found in Storacha space
```
**Solutions:**
- Run a backup first: `npm run demo` or use `examples/backup-demo.js`
- Verify you're using the correct Storacha space
- Check that backup completed successfully

#### Database Reconstruction Issues
```
Error: No manifest blocks found
```
**Solutions:**
- Enable fallback mode: `{ forceFallback: true }`
- Use custom database name: `{ fallbackDatabaseName: 'my-recovery-db' }`
- This creates a new database with recovered data (addresses won't match original)

#### Network/Timeout Issues
```
Error: Request timeout
```
**Solutions:**
- Increase timeout: `{ timeout: 60000 }` (60 seconds)
- Check internet connection
- Try different IPFS gateway: `{ gateway: 'https://ipfs.io' }`

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
```javascript
const backup = await bridge.backup(orbitdb, databaseAddress)
// Returns:
{
  success: true,
  blocksUploaded: 42,
  totalSize: 15420,
  uploadTime: 2.3,
  databaseAddress: '/orbitdb/zdpu...',
  manifest: { /* database metadata */ }
}
```

#### Restore Results
```javascript
const restore = await bridge.restoreFromSpace(orbitdb)
// Returns:
{
  success: true,
  database: OrbitDBInstance,
  entriesRecovered: 25,
  entriesCount: 25,
  method: 'normal-reconstruction', // or 'fallback-reconstruction'
  preservedHashes: true,
  preservedAddress: true,
  metadata: { /* restoration details */ }
}
```

## Use Cases

### Database Migration
Move OrbitDB databases between different environments or nodes:
```javascript
// Source environment
await bridge.backup(sourceOrbitdb, databaseAddress)

// Target environment  
const restored = await bridge.restoreFromSpace(targetOrbitdb)
```

### Disaster Recovery
Recover from data loss with automatic fallback:
```javascript
const restored = await bridge.restoreFromSpace(orbitdb, {
  forceFallback: true,
  fallbackDatabaseName: 'emergency-recovery-2024'
})
// Creates new database with all recoverable data
```

### Long-term Archival
Archive databases to Filecoin for permanent storage:
```javascript
// Archive
await bridge.backup(orbitdb, databaseAddress)

// Later restore (months/years later)
await bridge.restoreFromSpace(newOrbitdb)
```

## Performance Guidelines

### Optimal Settings by Database Size

| Database Size | batchSize | maxConcurrency | Expected Time |
|---------------|-----------|----------------|---------------|
| Small (< 1MB) | 5         | 2              | < 30s         |
| Medium (1-10MB) | 10      | 3              | 1-5 min       |
| Large (> 10MB) | 20       | 5              | 5+ min        |

### Memory Usage
- Each block kept in memory during processing
- Large databases may require Node.js memory limits: `node --max-old-space-size=4096`

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
2. Run backup: `bridge.backup(orbitdb, address)`
3. Test restore on separate OrbitDB instance
4. Verify data integrity before switching
