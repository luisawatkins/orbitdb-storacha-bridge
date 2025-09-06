# UCAN Authentication Setup for Storacha

## Overview

UCANs (User Controlled Authorization Networks) provide a decentralized way to manage permissions in Storacha without requiring traditional API keys and proofs.

## Installing w3 CLI

```bash
npm install -g @web3-storage/w3cli
```

## Creating UCANs

### Step 1: Login to w3 CLI
```bash
# Login with your email
w3 login your-email@example.com
```

### Step 2: Create a Space (if needed)
```bash
# Create a new space
w3 space create my-orbitdb-space

# Or use an existing space
w3 space use did:key:your-space-did
```

### Step 3: Generate UCAN Token
```bash
# Generate a UCAN for your space with upload capabilities
w3 delegation create \
  --can 'space/blob/add' \
  --can 'space/index/add' \
  --can 'upload/add' \
  --can 'filecoin/offer' \
  --can 'upload/remove' \
  --audience did:key:your-audience-did \
  --output my-ucan.car

# Or for broader permissions
w3 delegation create \
  --can '*' \
  --audience did:key:your-audience-did \
  --output my-ucan.car
```

### Step 4: Extract UCAN from CAR file
```bash
# The UCAN is now stored in my-ucan.car file
# You can use this file directly or extract the UCAN token
```

## UCAN Structure

A UCAN contains:
- **Issuer**: The DID that created the token
- **Audience**: The DID that can use the token  
- **Capabilities**: What actions are permitted
- **Expiration**: When the token expires
- **Proof**: Chain of delegations

## Environment Variables for UCAN

```env
# Instead of STORACHA_KEY and STORACHA_PROOF
STORACHA_UCAN_FILE=./my-ucan.car
# OR
STORACHA_UCAN_TOKEN=base64-encoded-ucan
STORACHA_AGENT_DID=did:key:your-agent-did
```
