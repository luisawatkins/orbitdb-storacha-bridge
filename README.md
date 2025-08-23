# OrbitDB Storacha Bridge

> **OrbitDB database backup and restoration via Storacha/Filecoin**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-22+-green.svg)](https://nodejs.org/)
[![CI/CD Pipeline](https://github.com/your-org/orbitdb-storacha-bridge/actions/workflows/ci.yml/badge.svg)](https://github.com/NiKrause/orbitdb-storacha-bridge/actions/workflows/ci.yml)
[![ESLint](https://img.shields.io/badge/ESLint-passing-brightgreen.svg)](https://github.com/NiKause/orbitdb-storacha-bridge/actions/workflows/ci.yml)
## What This Does

Backup and restore **complete OrbitDB databases** to **Storacha/Filecoin** with perfect data integrity.

## 🚀 Quick Start

### Installation

```bash
npm install
cp .env.example .env
# Add your Storacha credentials to .env
```

### Basic Usage

```javascript
import { backupDatabase, restoreDatabaseFromSpace } from './lib/orbitdb-storacha-bridge.js'

// Backup database
const backup = await backupDatabase(orbitdb, '/orbitdb/zdpu...')
console.log(`Backed up ${backup.blocksUploaded} blocks`)

// Restore (discovers all files in space automatically)
const restore = await restoreDatabaseFromSpace(targetOrbitdb)
console.log(`Restored ${restore.entriesRecovered} entries`)
```

### Demo

```bash
node examples/demo.js  # Complete backup/restore demonstration
npm test              # Run test suite
```

## 🏗️ How It Works

1. **Extract Blocks** - Separates OrbitDB database into individual components (log entries, manifest, identities, access controls)
2. **Upload to Storacha** - Each block uploaded separately to IPFS/Filecoin via Storacha
3. **Smart Discovery** - Lists all files in Storacha space using SDK APIs
4. **CID Bridging** - Converts between Storacha CIDs (`bafkre*`) and OrbitDB CIDs (`zdpu*`) 
5. **Reconstruct Database** - Reassembles blocks and opens database with original identity

## 📚 API

### Core Functions

```javascript
// Backup database to Storacha
await backupDatabase(orbitdb, databaseAddress, options?)

// Restore from space (recommended - no mappings needed)
await restoreDatabaseFromSpace(orbitdb, options?)

// Traditional restore (requires stored CID mappings)
await restoreDatabase(orbitdb, manifestCID, cidMappings?, options?)

// List files in Storacha space
await listStorachaSpaceFiles(options?)

// Clear entire Storacha space
await clearStorachaSpace(options?)
```

### Class Interface

```javascript
import { OrbitDBStorachaBridge } from './lib/orbitdb-storacha-bridge.js'

const bridge = new OrbitDBStorachaBridge({
  storachaKey: process.env.STORACHA_KEY,
  storachaProof: process.env.STORACHA_PROOF
})

await bridge.backup(orbitdb, databaseAddress)
await bridge.restoreFromSpace(targetOrbitdb)
```

## 🔧 Environment Setup

Get Storacha credentials from [web3.storage](https://web3.storage):

```env
STORACHA_KEY=your_private_key_here
STORACHA_PROOF=your_proof_here
```

## 🧪 Testing

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

## 📊 Technical Details

**CID Format Conversion:**
- OrbitDB: `zdpu*` (base58btc, dag-cbor codec)
- Storacha: `bafkre*` (base32, raw codec)
- Same content hash, different encoding

**Block Types Handled:**
- Log entries (actual data)
- Database manifests (metadata)
- Access controllers (permissions)
- Identity blocks (cryptographic proofs)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Submit a pull request

## 📜 License

MIT License

---

**🎯 Perfect OrbitDB backups to Filecoin in 3 lines of code**

```javascript
const backup = await backupDatabase(orbitdb, dbAddress)
const restored = await restoreDatabaseFromSpace(newOrbitdb)
console.log(`${restored.entriesRecovered} entries restored perfectly!`)
```
