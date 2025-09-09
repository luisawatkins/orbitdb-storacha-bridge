# OrbitDB Storacha Bridge

> **OrbitDB database backup, restoration, replication, UCANs and more via Storacha/Filecoin**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-22+-green.svg)](https://nodejs.org/)
[![CI/CD Pipeline](https://github.com/NiKrause/orbitdb-storacha-bridge/actions/workflows/ci.yml/badge.svg)](https://github.com/NiKrause/orbitdb-storacha-bridge/actions/workflows/ci.yml)
[![ESLint](https://img.shields.io/badge/ESLint-passing-brightgreen.svg)](https://github.com/NiKause/orbitdb-storacha-bridge/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/orbitdb-storacha-bridge.svg)](https://www.npmjs.com/package/orbitdb-storacha-bridge)


## Table of Contents

- [Objective](#Objective)
- [Functionality](#functionality)
- [RoadMap](#roadmap)
- [Installation](#installation)
- [Environment Setup](#environment-setup)
- [Demo](#demo)
- [How It Works](#how-it-works)
- [Testing](#testing)
- [Contributing](#contributing)
- [License](#license)


### **Objective** 

Enable OrbitDB users to reliably back up and restore databases to and from Storacha/Filecoin in scenarios where:

* Continuous peer-to-peer connectivity between browsers is unavailable, and
* No dedicated relay or pinning infrastructure (e.g., OrbitDB-Voyager or custom nodes) is present.

The system provides two recovery mechanisms:

1. **Full Storacha backup/restore** – stores all database components for complete recovery.
2. **Custom OrbitDB storage** – selectively persists entries, index, and identities (manifest handling in progress).

This ensures data availability in cases of device loss, network restrictions (e.g., blocked WebRTC/WebSocket protocols), or simultaneous peer data loss. While native OrbitDB replication is sufficient under constant connectivity and peer availability, Storacha integration extends resilience to disconnected or failure scenarios.

---

### **Functionality** 

Provides bidirectional backup and restoration between **OrbitDB databases** and **Storacha/Filecoin**, with two supported modes:

* **Hash- and identity-preserving** backups (Node.js only, full database fidelity).
* **Entry-only restores** (browser environments, due to current limitations; see [Issue #4](../../issues/4)).

The project includes Svelte components and scripts to demonstrate integration:

* `StorachaTest.svelte` – Example OrbitDB workflow (Alice & Bob) showing entry-only backup/restore.
* `StorachaAuth.svelte` – Authentication with Storacha (via credentials, UCAN, or email).
* `StorachaIntegration.svelte` – Generalized backup/restore integration (identity-preserving mode pending).
* `svelte-backup-restore.js` – Complete demo app bundling the above components.

Additionally, experimental support exists for:

* UCAN-based authentication, and
* Continuous OrbitDB persistence via `StorachaStorage` (OrbitDB `CustomStorage` adapter).

Perfect 👍 Here’s the **Roadmap** section rewritten with clean checkbox formatting, engineering-spec style:

---

### **Roadmap**

* [x] **Node.js backup/restore with Storacha credentials**
  * Full database fidelity (manifest, identities, access controllers, entries).

* [ ] **Browser backup/restore (StorachaIntegration.svelte)**
  * Identity- and hash-preserving mode Blocked by [Issue #4](../../issues/4).

* [x] **Browser backup/restore (StorachaTest.svelte)**
  * Entry-only backups and restore (no manifest, identity not preserved).
  * Includes authentication via `StorachaAuth.svelte`:
    * [x] using credentials (key + proof).
    * [ ] UCAN + private key (implemented, untested).
    * [ ] Email-based account creation (implemented, untested).

* [ ] **Node.js backup/restore with UCAN + private key**
  * Full fidelity (hash and identity preserved).

* [x] **OrbitDB CAR file storage**
  * Persistent content-addressable storage of database components.

* [ ] **OrbitDB Storacha `CustomStorage` adapter (Node.js)**
  * Storage functional.
  * Current limitation: manifests not persisted → initial sync requires standard restore.

* [ ] **OrbitDB Storacha `CustomStorage` adapter (Node.js, entry-only mode)**
  * Initial sync supported through entries-only storage.

> **Note:** Each Storacha space currently holds a single full backup. Multiple independent backups require separate Storacha spaces

Read more: [Bridging OrbitDB with Storacha: Decentralized Database Backups](https://medium.com/@akashjana663/bridging-orbitdb-with-storacha-decentralized-database-backups-44c7bee5c395)

## Installation

Install the package via npm.

## Environment Setup

Get Storacha credentials from [web3.storage](https://web3.storage) and set up your environment variables for STORACHA_KEY and STORACHA_PROOF.

## Demo

### NodeJS Demo Scripts (full backup with Manifest, Identity and AccessController and entries blocks)

- `node` [`examples/demo.js`](examples/demo.js) - Complete backup/restore cycle
- `node` [`examples/backup-demo.js`](examples/backup-demo.js) - Backup demonstration only  
- `node` [`examples/restore-demo.js`](examples/restore-demo.js) - Restore demonstration only

### Storacha Svelte Components

- [`StorachaAuth.svelte`](src/components/StorachaAuth.svelte) 
    Use this component when authenticating against Storacha with three different authentication methods: 
    1. Storacha credentials (Storacha-Key and Storacha Proof)
    2. UCAN (a UCAN which was delegated from another Storacha DID) + a corresponding private key
    3. Email (create a new Storacha account and space by email confirmation)

- [`StorachaTest.svelte`](src/components/StorachaTest.svelte)
    Use this component to demonstrate a collaboration between Alice & Bob both working with independent OrbitDB todo db's.
    Alice creates an OrbitDB and a DID from a generated mnemonic seed, creates todo items and creates a backup to Storacha by extracting the entries from IPFS storage and uploading them to Storacha.
    Bob creates another OrbitDB with the same or a new seed, connects to the same Storacha space as Alice and restores the Todo Items in his own OrbitDB.

    Remark: Alice & Bob's OrbitDB's in this scenario are independent db's with two different OrbitDB addresses and therefore cannot replicate records peer-to-peer! 
    If you want to achieve peer-to-peer replication between both db's (no restore would be required), in such case you'd need to open the db on Bob's side with Alice's /orbitdb/address 

### Svelte App Demonstrations & Components

- `node` [`scripts/svelte-backup-restore.js`] - A script creating an example Svelte app in a subdirectory which adds and demonstrates StorachaAuth.svelte and StorachaTest.svelte

## How It Works

1. **Extract Blocks** - Separates OrbitDB database into individual components (log entries, manifest, identities, access controls)
2. **Upload to Storacha** - Each block is uploaded separately to IPFS/Filecoin via Storacha
3. **Block Discovery** - Lists all files in Storacha space using Storacha SDK APIs
4. **CID Bridging** - Converts between Storacha CIDs (`bafkre*`) and OrbitDB CIDs (`zdpu*`)
5. **Reconstruct Database** - Reassembles blocks and opens database with original identity

## Testing

Ensure you have Storacha credentials in your `.env` file.
Use npm test commands to run various test suites including integration tests and verbose output.

### CAR Storage Tests

The `car-storage.test.js` suite provides comprehensive validation of the CAR (Content Addressable Archive) storage layer that enables persistent file-based storage for OrbitDB databases. The **Full OrbitDB Integration with Persistence** test demonstrates complete database lifecycle management: creating an OrbitDB instance with CAR storage, adding todo entries, persisting to CAR files, closing the database, reopening with a new OrbitDB instance, and verifying all data is perfectly recovered. This test validates that CAR storage can serve as a reliable persistence layer for OrbitDB's entry, heads, and index storage, ensuring data survives across application restarts.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Submit a pull request

## License

MIT License
