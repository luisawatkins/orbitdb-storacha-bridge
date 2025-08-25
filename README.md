# OrbitDB Storacha Bridge

> **OrbitDB database backup and restoration via Storacha/Filecoin**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-22+-green.svg)](https://nodejs.org/)
[![CI/CD Pipeline](https://github.com/NiKrause/orbitdb-storacha-bridge/actions/workflows/ci.yml/badge.svg)](https://github.com/NiKrause/orbitdb-storacha-bridge/actions/workflows/ci.yml)
[![ESLint](https://img.shields.io/badge/ESLint-passing-brightgreen.svg)](https://github.com/NiKause/orbitdb-storacha-bridge/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/orbitdb-storacha-bridge.svg)](https://www.npmjs.com/package/orbitdb-storacha-bridge)

**🎯 Perfect OrbitDB backups to Filecoin in 3 lines of code**

```javascript
const backup = await backupDatabase(orbitdb, dbAddress, { storachaKey, storachaProof })
const restored = await restoreDatabaseFromSpace(newOrbitdb, { storachaKey, storachaProof })
console.log(`${restored.entriesRecovered} entries restored perfectly!`)
```

## Table of Contents

- [What This Does](#what-this-does)
- [Installation](#installation)
- [Environment Setup](#environment-setup)
- [Quick Start](#quick-start)
- [API Reference](#api-reference)
  - [Core Functions](#core-functions)
  - [Class Interface](#class-interface)
  - [Options](#options)
- [Examples](#examples)
- [How It Works](#how-it-works)
- [Testing](#testing)
- [Technical Details](#technical-details)
- [Contributing](#contributing)
- [License](#license)

## What This Does

Backup and restore **complete OrbitDB databases** to **Storacha/Filecoin** within browser and NodeJS. Right now a Storacha space contains one full backup. For another backup - another space is needed!

## Installation

**For using in your project:**
```bash
npm install orbitdb-storacha-bridge
```

**For local development/contributing:**
```bash
git clone https://github.com/NiKrause/orbitdb-storacha-bridge.git
cd orbitdb-storacha-bridge
npm install
cp .env.example .env
# Add your Storacha credentials to .env
```

## Environment Setup

Get Storacha credentials from [web3.storage](https://web3.storage):

```env
STORACHA_KEY=your_private_key_here
STORACHA_PROOF=your_proof_here
```

## Quick Start

### Basic Usage

```javascript
// If installed via npm
import { backupDatabase, restoreDatabaseFromSpace } from 'orbitdb-storacha-bridge'

// If using locally/developing
// import { backupDatabase, restoreDatabaseFromSpace } from './lib/orbitdb-storacha-bridge.js'

// Backup database
const backup = await backupDatabase(orbitdb, '/orbitdb/zdpu...', {
  storachaKey: process.env.STORACHA_KEY,
  storachaProof: process.env.STORACHA_PROOF
})
console.log(`Backed up ${backup.blocksUploaded} blocks`)

// Restore (discovers all files in space automatically)
const restore = await restoreDatabaseFromSpace(targetOrbitdb, {
  storachaKey: process.env.STORACHA_KEY,
  storachaProof: process.env.STORACHA_PROOF
})
console.log(`Restored ${restore.entriesRecovered} entries`)
```

### Demo

```bash
# If installed via npm and in the package directory
npm run demo                     # Complete backup/restore demonstration

# If using locally/developing
node examples/demo.js            # Complete backup/restore demonstration
node examples/backup-demo.js     # Individual backup demonstration
node examples/restore-demo.js    # Individual restore demonstration
```

#### Individual Demos

**Backup Demo** (`examples/backup-demo.js`)
- Creates a sample OrbitDB database
- Backs it up to your Storacha space
- Shows backup progress and results

**Restore Demo** (`examples/restore-demo.js`)
- Uses a Storacha space as single source for a backup restore.
- Restores the database with perfect hash preservation
- Verifies data integrity and functionality
- No CID parameters needed - uses mapping-independent restore!

**Complete Demo** (`examples/demo.js`)
- Runs both backup and restore in sequence
- Shows the complete backup/restore cycle
- Perfect for testing the full workflow

## API Reference

### Core Functions

```javascript
// Backup database to Storacha
await backupDatabase(orbitdb, databaseAddress, options)

// Restore from space (recommended - no mappings needed)
await restoreDatabaseFromSpace(orbitdb, options)

// Traditional restore (requires stored CID mappings)
await restoreDatabase(orbitdb, manifestCID, cidMappings, options)

// List files in Storacha space
await listStorachaSpaceFiles(options)

// Clear entire Storacha space
await clearStorachaSpace(options)
```

### Class Interface

```javascript
// If installed via npm
import { OrbitDBStorachaBridge } from 'orbitdb-storacha-bridge'

// If using locally/developing  
// import { OrbitDBStorachaBridge } from './lib/orbitdb-storacha-bridge.js'

const bridge = new OrbitDBStorachaBridge({
  storachaKey: process.env.STORACHA_KEY,
  storachaProof: process.env.STORACHA_PROOF
})

await bridge.backup(orbitdb, databaseAddress)
await bridge.restoreFromSpace(targetOrbitdb)
```

### Options

#### Required Options

**All operations require Storacha credentials:**

- **`storachaKey`** - Your Storacha private key (required)
- **`storachaProof`** - Your Storacha proof (required)

These can be provided either:
- As environment variables: `STORACHA_KEY` and `STORACHA_PROOF`
- Or passed directly in the options object

#### Optional Options

The bridge supports these optional configuration options with their defaults:

```javascript
const DEFAULT_OPTIONS = {
  timeout: 30000,           // Timeout in milliseconds
  retries: 3,              // Number of retry attempts
  gateway: 'https://w3s.link',  // IPFS gateway URL
  validateIntegrity: true,  // Whether to validate data integrity
  includeIdentity: true     // Whether to include identity blocks
}
```

#### Additional Options for `listStorachaSpaceFiles()`

- **`size`** - Maximum number of files to list (default: 1000000)
- **`cursor`** - Pagination cursor for large result sets
- **`pre`** - Prefix filter for file names

## Examples

### With Environment Variables

```javascript
// Set in .env file:
// STORACHA_KEY=your_private_key_here  
// STORACHA_PROOF=your_proof_here

const backup = await backupDatabase(orbitdb, '/orbitdb/zdpu...')
const restore = await restoreDatabaseFromSpace(targetOrbitdb)
```

### With Explicit Options

```javascript
const options = {
  storachaKey: 'your_private_key_here',
  storachaProof: 'your_proof_here',
  timeout: 60000,  // Optional: extend timeout
  retries: 5       // Optional: more retries
}

const backup = await backupDatabase(orbitdb, '/orbitdb/zdpu...', options)
const restore = await restoreDatabaseFromSpace(targetOrbitdb, options)
```

### Using the Class Interface

```javascript
const bridge = new OrbitDBStorachaBridge({
  storachaKey: process.env.STORACHA_KEY,
  storachaProof: process.env.STORACHA_PROOF,
  timeout: 45000  // Optional customization
})

const backup = await bridge.backup(orbitdb, databaseAddress)
const restore = await bridge.restoreFromSpace(targetOrbitdb)
```

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