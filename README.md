# OrbitDB Storacha Bridge

> **OrbitDB database backup, restoration, replication, UCANs and more via Storacha/Filecoin**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-22+-green.svg)](https://nodejs.org/)
[![CI/CD Pipeline](https://github.com/NiKrause/orbitdb-storacha-bridge/actions/workflows/ci.yml/badge.svg)](https://github.com/NiKrause/orbitdb-storacha-bridge/actions/workflows/ci.yml)
[![ESLint](https://img.shields.io/badge/ESLint-passing-brightgreen.svg)](https://github.com/NiKause/orbitdb-storacha-bridge/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/orbitdb-storacha-bridge.svg)](https://www.npmjs.com/package/orbitdb-storacha-bridge)


## Table of Contents

- [What we want to accomplish](#what-we-want-to-accomplish)
- [What This Does](#what-this-does)
- [RoadMap](#roadmap)
- [Installation](#installation)
- [Environment Setup](#environment-setup)
- [Demo](#demo)
- [How It Works](#how-it-works)
- [Testing](#testing)
- [Contributing](#contributing)
- [License](#license)


## What we want to accomplish

If Alice & Bob are working with the same OrbitDB:

- without 24/7 internet connection between their browsers and also
- without a signalling or relay node (or network) which is live pinning their OrbitDB changes (e.g. via OrbitDB-Voyager or other custom OrbitDB node instance)

... so both can backup and restore their work to a Storacha space via

- a complete Storacha backup / restore or
- an OrbitDB CustomStorage (for the entries, index and identities - no Manifest here so far) 

In theory and a perfect world Alice & Bob don't need to restore anything if they are connected directly via peer-to-peer and attached 24/7 OrbitDB pinning nodes. If Alice looses her data, Bob would still have them and Alice could anytime resync from Bob (that is current state of technologie of OrbitDB)

Storacha full backup and restore is only for certain emergencies e.g. when both Alice & Bob lose their data or devices. Then a new Alice or Bob or even Peter can restore their work from Storacha. It is happing that networks block IP's, ports and protocols e.g. to WebRTC or Websocket gateways etc. in such case it would be desirable to have a possibility to restore an OrbitDB directly from IPFS and push/upload back to it via Storacha/Filecoin.

## What This Does

Backup and restore between **OrbitDB databases** and **Storacha/Filecoin** with or without full hash and identity preservation (both valid approaches). Works in both Node.js and browser environments (in browsers at this time only without the full hash identity preservation by restoring db entries only [Issue #4](../../issues/4))

Furthermore, a [`StorachaTest.svelte`](src/components/StorachaTest.svelte) and a [`StorachaAuth.svelte`](src/components/StorachaAuth.svelte) which demonstrate a typical basic OrbitDB Todo example workflow between two OrbitDB instances (with two separate libp2p, IPFS nodes running in the browser - Alice & Bob)

The [`scripts/svelte-backup-restore.js`](scripts/svelte-backup-restore.js) script is setting up a complete example Svelte App with StorachaTest.svelte and StorachaAuth.svelte - which is already uploaded here: [https://w3s.link/ipfs/bafybeie4oba7njnmhaljszu5smh2rkxviduabuoxuql7rzr3xnfptcydka](https://w3s.link/ipfs/bafybeie4oba7njnmhaljszu5smh2rkxviduabuoxuql7rzr3xnfptcydka)

Additionally exists a [`StorachaIntegration.svelte`](src/components/StorachaIntegration.svelte) which authenticates with Storacha, creates backups and restores for any OrbitDB Svelte app. (but has the above stated 'issue'). Since this isn't always an issue, StorachaTest.svelte is demonstrating a different approach when dealing with the entries in the oplog only and recreating/restoring the OrbitDB by adding a dbconfig object separately. This way the exact same db can be restored.

Implemented but untested: 
  - UCAN authentication (instead of Storacha key and proof credentials) and 
  - StorachaStorage (a OrbitDB CustomStorage) where it will be possible to reactively store an orbitdb live on Storacha as a permanent backup while other peers are replicating as normal.

## RoadMap

- [x] backup/restore between OrbitDB and Storacha in NodeJS via Storacha key and proof credential (hash and identity preserving)
- [ ] backup/restore between OrbitDB and Storacha in browser (StorachaIntegration.svelte) (hash and identity preserving) - [Issue #4](../../issues/4)
- [x] backup/restore between OrbitDB and Storacha in browser ([`StorachaTest.svelte`](src/components/StorachaTest.svelte)) (entries only - without manifest and identity preservation into new OrbitDB)
  - [x] using Storacha Credentials by [`StorachaAuth.svelte`](src/components/StorachaAuth.svelte)
  - [ ] using UCAN + privatekey (implemented but untested)
  - [ ] by creating a new account via an email confirmation (implemented but untested)
- [x] OrbitDB CAR file storage (OrbitDB CustomStorage)
- [ ] backup/restore between OrbitDB and Storacha in NodeJS via UCAN and privatekey (hash and identity preserving)
- [ ] OrbitDB Storacha storage (OrbitDB CustomStorage) in NodeJS - storage ok - but OrbitDB CustomStore doesn't store the Manifest. Initial-sync therefore difficult but manageable by a standard restore of the orbitdb-storacha-bridge function!
- [ ] OrbitDB Storacha storage (OrbitDB CustomStorage) in NodeJS (entries only - initial sync)

> **Note:** Currently, each Storacha space contains one full backup. For multiple backups, use separate spaces.

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

## Video Demo

**Storacha Backup via Storacha Credentials Setup Demo**
[📹 Watch the demonstration video](docs/media/orbitdb-storacha-bridge-key-proof-credtials.mov)


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


