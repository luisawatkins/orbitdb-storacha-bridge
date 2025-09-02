# OrbitDB Storacha Bridge

> **OrbitDB database backup and restoration via Storacha/Filecoin**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-22+-green.svg)](https://nodejs.org/)
[![CI/CD Pipeline](https://github.com/NiKrause/orbitdb-storacha-bridge/actions/workflows/ci.yml/badge.svg)](https://github.com/NiKrause/orbitdb-storacha-bridge/actions/workflows/ci.yml)
[![ESLint](https://img.shields.io/badge/ESLint-passing-brightgreen.svg)](https://github.com/NiKause/orbitdb-storacha-bridge/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/orbitdb-storacha-bridge.svg)](https://www.npmjs.com/package/orbitdb-storacha-bridge)

## 🎯 Perfect OrbitDB backups to Filecoin in 3 lines of code

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
  storachaKey: string,      // Required: Storacha private key
  storachaProof: string,    // Required: Storacha proof
  timeout: 30000,           // Optional: timeout in milliseconds
  gateway: 'https://w3s.link', // Optional: IPFS gateway URL
  batchSize: 10,            // Optional: batch size for operations
  maxConcurrency: 3,        // Optional: max concurrent operations
  fallbackDatabaseName: string, // Optional: custom name for fallback
  forceFallback: false      // Optional: force fallback reconstruction
}
```

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
