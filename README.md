# OrbitDB Storacha Bridge

> **OrbitDB database backup, restoration, replication, UCANs and more via Storacha/Filecoin**


[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-22+-green.svg)](https://nodejs.org/)
[![CI/CD Pipeline](https://github.com/NiKrause/orbitdb-storacha-bridge/actions/workflows/ci.yml/badge.svg)](https://github.com/NiKrause/orbitdb-storacha-bridge/actions/workflows/ci.yml)
[![ESLint](https://img.shields.io/badge/ESLint-passing-brightgreen.svg)](https://github.com/NiKause/orbitdb-storacha-bridge/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/orbitdb-storacha-bridge.svg)](https://www.npmjs.com/package/orbitdb-storacha-bridge)


## Table of Contents

- [OrbitDB Storacha Bridge](#orbitdb-storacha-bridge)
  - [Table of Contents](#table-of-contents)
  - [What we want to accomplish](#what-we-want-to-accomplish)
  - [What This Does](#what-this-does)
  - [RoadMap](#roadmap)
  - [Installation](#installation)
  - [Environment Setup](#environment-setup)
  - [Demo](#demo)
    - [NodeJS Demo Scripts (full backup with Manifest, Identity and AccessController and entries blocks)](#nodejs-demo-scripts-full-backup-with-manifest-identity-and-accesscontroller-and-entries-blocks)
    - [Svelte Components](#svelte-components)
  - [How It Works](#how-it-works)
  - [Logging](#logging)
  - [Testing](#testing)
    - [CAR Storage Tests](#car-storage-tests)
  - [Contributing](#contributing)
  - [License](#license)


## What we want to accomplish

Alice and Bob are working with the same OrbitDB in a local-first, peer-to-peer web or mobile application.
In a perfect world, Alice and Bob wouldn't need any additional decentralized storage, since their data is already distributed among a number of peers, depending on the use case and general peer-to-peer network architecture. If Alice loses her data, Bob would still have a copy, and Alice could resync from Bob or others at any time. This reflects the current state of technology in OrbitDB.

Additionally, relay nodes or networks optionally can run Helia and OrbitDB instances for pinning the db data of Alice and Bob in a decentralized way. There is still a need for a decentralized pinning network for OrbitDBs and possibly referenced media pointing to IPFS CIDs.

OrbitDB-Storacha-Bridge is intended for archiving large OrbitDBs on additional decentralized Storacha/Filecoin storage, which would otherwise take a long time to replicate. Since data modeling in OrbitDB is different from traditional relational databases, it must be thought about differently. Not all users of a local-first peer-to-peer app would ever share the same identical database—we all agree that this isn't feasible. However, for example, an OrbitDB with blog posts would tend to grow large over time, and at some point, the whole blog history must be archived and sharded into separate databases in order to keep replication time short and ensure a good user experience when loading the blog.

Initially, each user hosts their own data on their own device and decides with whom they need or want to replicate the data. This depends strongly on the use case. Each app user typically doesn't want or need to replicate with everyone.

OrbitDB-Storacha-Bridge is also useful for emergency cases, for example, when both Alice and Bob lose their data or devices. In that case, Alice, Bob, or even a new user like Peter can restore the work from Storacha with the same identity or with a new identity. We support UCAN authentication and plan to enable UCAN delegation between OrbitDBs with OrbitDBAccessControllers. Alice could delegate access to the same Storacha backup space to whomever she wants for a defined period.

It has happened in the past that countries, mobile networks, internet providers, corporate networks, or hotels block IP addresses, ports, and protocols — for example, WebRTC or WebSocket/WebTransport gateways. Although libp2p supports many different transport options as backup or alternatives, and such cases are becoming rarer in recent years, it would still be desirable to have an additional option—just to be safe. This would allow users to restore an OrbitDB directly from IPFS and to push or upload database states back to it via Storacha/Filecoin after every db change. This backup option becomes particularly valuable when peer-to-peer connectivity cannot be established due to network restrictions or when internet standards are broken.

Please note: Storacha backup and restore works via Storacha's centralized gateway to Filecoin's decentralized backup storage at the time of writing.

## What This Does

Backup and restore between **OrbitDB databases** and **Storacha/Filecoin** with full hash and identity preservation. Works in both Node.js and browser environments. [See Storacha Integration Widget in Simple Todo Example](https://simple-todo.le-space.de/)

The project includes **Svelte components** for browser-based demos and integration (see [SVELTE-COMPONENTS.md](SVELTE-COMPONENTS.md) for detailed documentation).

**Features:**

- backup/restore between OrbitDB and Storacha in browsers and NodeJS via Storacha key and proof credential
  - full backup per space
  - timestamped backups (multiple backups per space - restore last backup by default)
- Storacha Svelte components for integration into Svelte projects
- UCAN authentication 
- Backup/restore functionality with hash and identity preservation
- OrbitDB CAR file storage [OrbitDB CustomStorage](https://github.com/orbitdb/orbitdb/blob/main/docs/STORAGE.md)

## RoadMap

- [ ] CustomStorage - implement OrbitDB StorachaStorage [OrbitDB CustomStorage issue 23](https://github.com/NiKrause/orbitdb-storacha-bridge/issues/23)
- [ ] Alice when authenticated via a UCAN or Storacha Credentials should be able to delegate/revoke her access rights to Bob (with custom/default capabilities) [via WebAuthN (P-256)](https://github.com/NiKrause/orbitdb-storacha-bridge/issues/16) see: [WebAuthN Upload Wall](https://github.com/NiKrause/ucan-upload-wall/tree/browser-only/web) and [live demo](https://bafybeibdcnp7pr26okzr6kbygcounsz3klyg3vydxwwovmz2ljyzfmprre.ipfs.w3s.link/)


Read more on Medium: [Bridging OrbitDB with Storacha: Decentralized Database Backups](https://medium.com/@akashjana663/bridging-orbitdb-with-storacha-decentralized-database-backups-44c7bee5c395)

## Installation

Install the package via npm. ```npm install orbitdb-storacha-bridge```

## Environment Setup

Get Storacha credentials from [storacha.network quickstart](https://docs.storacha.network/quickstart/), install w3 for the console, get storacha key and proof then set up your environment variables (.env) for STORACHA_KEY and STORACHA_PROOF.

## Demo

### NodeJS Demo Scripts (full backup with Manifest, Identity and AccessController and entries blocks)

- `node` [`examples/demo.js`](examples/demo.js) - Complete backup/restore cycle
- `node` [`examples/backup-demo.js`](examples/backup-demo.js) - Backup demonstration only  
- `node` [`examples/restore-demo.js`](examples/restore-demo.js) - Restore demonstration only
- `node` [`examples/car-backup-demo.js`](examples/car-backup-demo.js) - CAR-based timestamped backups (efficient multi-version backups)
- `node` [`examples/demo-different-identity.js`](examples/demo-different-identity.js) - Different identities with access control enforcement
- `node` [`examples/demo-shared-identities.js`](examples/demo-shared-identities.js) - Shared identity backup/restore scenarios
- `node` [`examples/simple-todo-restore-demo.js`](examples/simple-todo-restore-demo.js) - Simple todo database restore demonstration
- `node` [`examples/ucan-demo.js`](examples/ucan-demo.js) - Complete UCAN-based authentication backup/restore
- `node` [`examples/simple-ucan-auth.js`](examples/simple-ucan-auth.js) - UCAN authentication with existing delegation token
- `node` [`examples/test-ucan-bridge.js`](examples/test-ucan-bridge.js) - Test UCAN bridge integration
- `node` [`examples/test-ucan-list.js`](examples/test-ucan-list.js) - Test UCAN file listing after upload
- `node` [`examples/clear-space.js`](examples/clear-space.js) - Clear all files from Storacha space (utility script)
- `node` [`examples/timestamped-backup-example.js`](examples/timestamped-backup-example.js) - Timestamped backup implementation helper

### Svelte Components

For browser-based integration, this project includes Svelte components for authentication, backup/restore, P2P replication, and WebAuthn biometric authentication. See [**SVELTE-COMPONENTS.md**](SVELTE-COMPONENTS.md) for complete documentation of all available components and demonstrations.

## How It Works

1. **Extract Blocks** - Separates OrbitDB database into individual components (log entries, manifest, identities, access controls)
2. **Upload to Storacha** - Each block is uploaded separately to IPFS/Filecoin via Storacha
3. **Block Discovery** - Lists all files in Storacha space using Storacha SDK APIs
4. **CID Bridging** - Converts between Storacha CIDs (`bafkre*`) and OrbitDB CIDs (`zdpu*`)
5. **Reconstruct Database** - Reassembles blocks and opens database with original identity

## Logging

The library uses **Pino** for structured, high-performance logging. Control logging with environment variables:

```bash
# Set log level (trace, debug, info, warn, error, fatal, silent)
export LOG_LEVEL=debug

# Enable pretty printing for development
export LOG_PRETTY=true
```

## Testing

Ensure you have Storacha credentials in your `.env` file.
Use npm test commands to run various test suites including integration tests and verbose output.

### CAR Storage Tests

The `car-storage.test.js` suite provides validation of the CAR (Content Addressable Archive) storage layer that enables persistent file-based storage for OrbitDB databases. The **Full OrbitDB Integration with Persistence** test demonstrates database lifecycle management: creating an OrbitDB instance with CAR storage, adding todo entries, persisting to CAR files, closing the database, reopening with a new OrbitDB instance, and verifying all data is perfectly recovered. This test validates that CAR storage can serve as a reliable persistence layer for OrbitDB's entry, heads, and index storage, ensuring data survives across application restarts.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Submit a pull request

## License

MIT License


