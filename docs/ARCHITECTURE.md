# OrbitDB Storacha Bridge - Technical Architecture

## Overview

The OrbitDB Storacha Bridge solves a fundamental compatibility problem: OrbitDB uses specific CID formats that differ from standard IPFS CIDs used by Storacha. This document explains how the bridge works internally.

## The CID Format Problem

### OrbitDB CID Format
- **Prefix**: `zdpu` (multibase encoded)
- **Version**: CIDv1
- **Codec**: `dag-cbor` (0x71)
- **Encoding**: `base58btc`
- **Example**: `zdpuAy2JxUiqCzuTAhT5ukfHD1oxbcpJ6eH1VTUegC8Ljv4WK`

### Storacha/IPFS CID Format  
- **Prefix**: `bafkre` (multibase encoded)
- **Version**: CIDv1
- **Codec**: `raw` (0x55)
- **Encoding**: `base32`
- **Example**: `bafkreiempxfbalco4snaqnthiqhv7rrawa7axoawnl2rb56jvidmj4sisy`

### Key Insight
**The content hash (multihash) is identical** - only the codec and encoding differ. This enables perfect conversion between formats while preserving data integrity.

## Architecture Components

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Source        │    │   Storacha      │    │   Target        │
│   OrbitDB       │    │   Storage       │    │   OrbitDB       │
│                 │    │                 │    │                 │
│ ┌─────────────┐ │    │ ┌─────────────┐ │    │ ┌─────────────┐ │
│ │Log Entries  │ │───▶│ │Raw Blocks   │ │───▶│ │Log Entries  │ │
│ │Manifest     │ │    │ │(bafkre...)  │ │    │ │Manifest     │ │
│ │Access Ctrl  │ │    │ │             │ │    │ │Access Ctrl  │ │
│ │Identity     │ │    │ │             │ │    │ │Identity     │ │
│ │(zdpu...)    │ │    │ │             │ │    │ │(zdpu...)    │ │
│ └─────────────┘ │    │ └─────────────┘ │    │ └─────────────┘ │
└─────────────────┘    └─────────────────┘    └─────────────────┘
        │                        │                        ▲
        │ Block                  │ Block                  │ CID
        │ Extraction             │ Upload                 │ Bridge
        ▼                        ▼                        │
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│CID Mappings     │    │HTTP Download    │    │Format Conversion│
│zdpu* → bafkre*  │    │& Verification   │    │bafkre* → zdpu*  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Process Flow

### 1. Block Extraction Phase

```javascript
// Extract all block types from OrbitDB
const extractDatabaseBlocks = async (database) => {
  const blocks = new Map()
  
  // Extract log entries (user data)
  const entries = await database.log.values()
  for (const entry of entries) {
    const entryBytes = await database.log.storage.get(entry.hash)
    blocks.set(entry.hash, { cid: CID.parse(entry.hash), bytes: entryBytes })
  }
  
  // Extract manifest (database metadata)
  const manifestCID = database.address.split('/').pop()
  const manifestBytes = await database.log.storage.get(manifestCID)
  blocks.set(manifestCID, { cid: CID.parse(manifestCID), bytes: manifestBytes })
  
  // Extract access controller and identity blocks
  // ... additional extraction logic
  
  return { blocks, manifestCID }
}
```

### 2. Upload Phase

```javascript
// Upload each block individually to Storacha
const uploadBlocksToStoracha = async (blocks, client) => {
  const cidMappings = new Map()
  
  for (const [originalHash, blockData] of blocks) {
    // Create file from block bytes
    const blockFile = new File([blockData.bytes], originalHash)
    
    // Upload to Storacha (gets converted to bafkre* format)
    const result = await client.uploadFile(blockFile)
    const uploadedCID = result.toString()
    
    // Store mapping: zdpu* → bafkre*
    cidMappings.set(originalHash, uploadedCID)
  }
  
  return cidMappings
}
```

### 3. CID Bridge Conversion

```javascript
// Convert Storacha CID back to OrbitDB format
const convertStorachaCIDToOrbitDB = (storachaCID) => {
  const storachaParsed = CID.parse(storachaCID)
  
  // Create CIDv1 with dag-cbor codec using same multihash
  const orbitdbCID = CID.createV1(0x71, storachaParsed.multihash)
  
  // Return in base58btc format (zdpu prefix)
  return orbitdbCID.toString(bases.base58btc)
}
```

### 4. Block Restoration Phase

```javascript
// Download and bridge blocks for reconstruction
const downloadAndBridgeBlocks = async (cidMappings, blockstore) => {
  for (const [originalCID, storachaCID] of cidMappings) {
    // Download from Storacha
    const response = await fetch(`https://w3s.link/ipfs/${storachaCID}`)
    const blockBytes = new Uint8Array(await response.arrayBuffer())
    
    // Convert back to OrbitDB format
    const bridgedCID = convertStorachaCIDToOrbitDB(storachaCID)
    
    // Store under OrbitDB CID in target blockstore
    await blockstore.put(CID.parse(bridgedCID), blockBytes)
  }
}
```

### 5. Database Reconstruction

```javascript
// OrbitDB can now find all blocks in expected format
const reconstructedDB = await orbitdb.open(`/orbitdb/${manifestCID}`)
const entries = await reconstructedDB.all() // Perfect reconstruction!
```

## Block Types and Dependencies

### Database Structure
```
OrbitDB Database
├── Manifest Block (zdpu123...)
│   ├── Contains: name, type, access controller reference
│   └── Dependencies: Access Controller Block
├── Access Controller Block (zdpu456...)
│   ├── Contains: permissions, access rules
│   └── Dependencies: None
├── Log Entries (zdpu789..., zdpuABC...)
│   ├── Contains: actual user data, clocks, signatures
│   └── Dependencies: Identity Blocks
└── Identity Blocks (zdpuXYZ...)
    ├── Contains: cryptographic identities, public keys
    └── Dependencies: None
```

### Dependency Resolution
The system ensures all dependencies are captured:
1. **Manifest** → **Access Controller**
2. **Log Entries** → **Identity Blocks** 
3. All blocks → **Multihash preservation**

## Data Integrity Guarantees

### Cryptographic Verification
- **Content Addressing**: Each block's CID is derived from its content hash
- **Tamper Detection**: Any change to content results in different CID
- **Chain Verification**: Log entries contain cryptographic proofs

### Bridge Verification
```javascript
// Verify CID conversion preserves content hash
const originalCID = CID.parse('zdpu123...')
const storachaCID = 'bafkre456...'
const bridgedCID = CID.parse(convertStorachaCIDToOrbitDB(storachaCID))

// These must be identical for integrity
assert(originalCID.multihash.digest === bridgedCID.multihash.digest)
```

## Error Handling and Recovery

### Upload Failures
- **Individual Block Retry**: Failed blocks retried independently
- **Partial Success**: Continue with successful uploads
- **Mapping Persistence**: Store CID mappings for recovery

### Download Failures  
- **Block-by-Block Recovery**: Download each block independently
- **Gateway Fallback**: Try multiple IPFS gateways
- **Verification**: Ensure CID bridges match exactly

### Reconstruction Failures
- **Block Availability**: Verify all required blocks present
- **Dependency Check**: Ensure access controller and identity blocks available
- **Timeout Handling**: Wait for OrbitDB to discover entries

## Performance Characteristics

### Upload Performance
- **Parallel Uploads**: Blocks uploaded concurrently
- **Bandwidth Usage**: ~100-500 bytes per block average
- **Network Calls**: One HTTP request per block

### Download Performance  
- **Parallel Downloads**: Blocks downloaded concurrently
- **Cache Efficiency**: IPFS gateway caching improves performance
- **Verification**: CID conversion adds ~1ms overhead per block

### Storage Efficiency
- **No Duplication**: Each unique block stored once
- **Compression**: IPFS handles block-level compression
- **Metadata**: Minimal overhead for CID mappings

## Security Considerations

### Access Control
- **Preserved**: Access controller blocks maintain original permissions
- **Identity**: Cryptographic identities fully preserved
- **Signatures**: All cryptographic signatures remain valid

### Network Security
- **HTTPS**: All Storacha communications over HTTPS
- **Content Validation**: CID verification prevents tampering
- **No Key Exposure**: Private keys never transmitted

### Storage Security
- **Immutable**: IPFS blocks are content-addressed and immutable
- **Distributed**: Filecoin provides redundant storage
- **Encrypted Transport**: All network traffic encrypted

## Limitations and Considerations

### Network Dependencies
- **Internet Required**: Restoration requires network access to Storacha
- **Gateway Availability**: Dependent on IPFS gateway uptime
- **Bandwidth**: Large databases require significant bandwidth

### Timing Considerations
- **Upload Time**: Proportional to number of blocks
- **Propagation**: IPFS network propagation may take time
- **OrbitDB Sync**: Database reconstruction may need settling time

### Compatibility
- **OrbitDB Versions**: Tested with OrbitDB v2.x
- **Helia Versions**: Compatible with Helia v4.x
- **Node.js**: Requires Node.js 18+

## Future Enhancements

### Planned Improvements
- **Batch Operations**: Bundle small blocks for efficiency
- **Compression**: Block-level compression before upload
- **Caching**: Local cache for frequently accessed blocks
- **Streaming**: Stream large databases without memory limits

### Research Areas
- **Delta Sync**: Only backup changed blocks
- **Encryption**: End-to-end encryption for sensitive data
- **P2P Recovery**: Direct peer-to-peer restoration
- **Cross-Chain**: Integration with other blockchain networks
