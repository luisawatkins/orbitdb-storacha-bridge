# Storacha Svelte Components

This document provides detailed documentation for the Svelte components included in the OrbitDB-Storacha-Bridge project for browser-based integration.

## Table of Contents

- [Storacha Svelte Components](#storacha-svelte-components)
  - [Table of Contents](#table-of-contents)
  - [Component Overview](#component-overview)
  - [StorachaAuth.svelte](#storachaauthsvelte)
  - [StorachaTest.svelte](#storachatestsvelte)
  - [StorachaTestWithReplication.svelte](#storachatestwithreplicationsvelte)
  - [StorachaTestWithWebAuthn.svelte](#storachatestwithwebauthnsvelte)
  - [WebAuthnDIDProvider.js](#webauthndidproviderjs)
  - [StorachaIntegration.svelte](#storachaintegrationsvelte)
  - [Svelte App Demonstrations](#svelte-app-demonstrations)
  - [Live Demo](#live-demo)
  - [Return to Main Documentation](#return-to-main-documentation)

## Component Overview

The OrbitDB-Storacha-Bridge project includes **Svelte components** for browser-based demos and integration. These components provide various authentication methods, backup/restore functionality, and P2P replication capabilities.

## StorachaAuth.svelte

**Location:** [`src/components/StorachaAuth.svelte`](src/components/StorachaAuth.svelte)

Authentication component supporting multiple Storacha authentication methods:

- Storacha credentials (Storacha-Key and Storacha Proof)
- UCAN authentication (delegated UCAN + corresponding temporary private key)
- WebAuthN/Passkey (P-256) UCANs and delegation (planed)

## StorachaTest.svelte

**Location:** [`src/components/StorachaTest.svelte`](src/components/StorachaTest.svelte)

Basic backup/restore demo with Alice & Bob using independent OrbitDB instances:

- Creates separate OrbitDB databases with different addresses
- No P2P replication - data exchange via Storacha backup/restore only
- Demonstrates entry-only backup approach (recreates database from entries + config)
- Uses mnemonic seed generation and DID-based identity management

## StorachaTestWithReplication.svelte

**Location:** [`src/components/StorachaTestWithReplication.svelte`](src/components/StorachaTestWithReplication.svelte)

Advanced replication demo with Alice & Bob using shared database and P2P connectivity:

- Creates shared OrbitDB database with same address for both peers
- Full P2P replication via libp2p with circuit relay support  
- Backup/restore preserves replication capabilities
- Uses Carbon Design System components for enhanced UI

## StorachaTestWithWebAuthn.svelte

**Location:** [`src/components/StorachaTestWithWebAuthn.svelte`](src/components/StorachaTestWithWebAuthn.svelte)

WebAuthn biometric authentication demo with hardware-secured DID identities:

- WebAuthn biometric authentication (Face ID, Touch ID, Windows Hello, PIN)
- Hardware-secured DID creation using WebAuthn credentials
- CBOR public key parsing from WebAuthn attestation objects
- Backup/restore with biometric-secured identities

## WebAuthnDIDProvider.js

**Location:** [`src/components/WebAuthnDIDProvider.js`](src/components/WebAuthnDIDProvider.js)

WebAuthn DID Provider for OrbitDB - Complete identity provider implementation:

- WebAuthn integration with OrbitDB's identity system
- Public key extraction from WebAuthn credentials via CBOR parsing
- DID specification compliance (`did:webauthn:...` format)
- Hardware-secured private keys that never leave the secure element
- Biometric authentication for every signing operation

## StorachaIntegration.svelte

**Location:** [`src/components/StorachaIntegration.svelte`](src/components/StorachaIntegration.svelte)

Full integration component for existing OrbitDB Svelte applications:

- Hash and identity preserving backup/restore (full database reconstruction)
- Progress tracking with real-time upload/download indicators
- LocalStorage credential management with auto-login
- Space management (create, list, select Storacha spaces)
- Note: Currently has browser limitations for full hash preservation ([Issue #4](../../issues/4))

## Svelte App Demonstrations

The following scripts create complete SvelteKit demo applications:

- `node` [`scripts/svelte-backup-restore.js`](scripts/svelte-backup-restore.js) - Creates SvelteKit demo app with StorachaAuth and StorachaTest components
- `node` [`scripts/svelte-backup-restore-02.js`](scripts/svelte-backup-restore-02.js) - Enhanced demo with StorachaTestWithReplication component
- WebAuthn Demo: Use [`orbitdb-storacha-svelte-backup-restore-demo`](orbitdb-storacha-svelte-backup-restore-demo/) with StorachaTestWithWebAuthn for biometric authentication testing

## Live Demo

[See Storacha Integration Widget in Simple Todo Example](https://simple-todo.le-space.de/)

## Return to Main Documentation

[← Back to README](README.md)
