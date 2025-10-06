/**
 * OrbitDB Storacha Bridge - Main Library
 *
 * Provides complete OrbitDB database backup and restoration via Storacha/Filecoin
 * with 100% hash preservation and identity recovery.
 */

import * as Client from "@storacha/client";
import { StoreMemory } from "@storacha/client/stores/memory";
import { Signer } from "@storacha/client/principal/ed25519";
import * as Proof from "@storacha/client/proof";
import { CID } from "multiformats/cid";
import * as Block from "multiformats/block";
import * as dagCbor from "@ipld/dag-cbor";
import { sha256 } from "multiformats/hashes/sha2";
import { bases } from "multiformats/basics";
import { EventEmitter } from "events";
import { createHeliaOrbitDB, cleanupOrbitDBDirectories } from "./utils.js";

/**
 * Default configuration options
 */
const DEFAULT_OPTIONS = {
  // Core configuration
  timeout: 30000, // Timeout in milliseconds
  gateway: "https://w3s.link", // IPFS gateway URL

  // Performance tuning (used in specific functions)
  batchSize: 10, // Batch size for upload/download operations (removeLayerFiles)
  maxConcurrency: 3, // Maximum concurrent batches (uploadBlocksToStoracha)

  // Credentials (required - can also be set via environment variables)
  storachaKey: undefined, // Storacha private key (required)
  storachaProof: undefined, // Storacha proof (required)

  // Restore options
  fallbackDatabaseName: undefined, // Custom name for fallback reconstruction
  forceFallback: false, // Force fallback reconstruction mode
};

/**
 * Convert Storacha CID format to OrbitDB CID format
 *
 * @param {string} storachaCID - Storacha CID (bafkre... format)
 * @returns {string} - OrbitDB CID (zdpu... format)
 */
export function convertStorachaCIDToOrbitDB(storachaCID) {
  const storachaParsed = CID.parse(storachaCID);

  // Create CIDv1 with dag-cbor codec using the same multihash
  const orbitdbCID = CID.createV1(0x71, storachaParsed.multihash); // 0x71 = dag-cbor

  // Return in base58btc format (zdpu prefix)
  return orbitdbCID.toString(bases.base58btc);
}

/**
 * Extract manifest CID from OrbitDB address
 *
 * @param {string} databaseAddress - OrbitDB address (/orbitdb/zdpu...)
 * @returns {string} - Manifest CID
 */
export function extractManifestCID(databaseAddress) {
  return databaseAddress.split("/").pop();
}

/**
 * Extract blocks from an OrbitDB database
 *
 * @param {Object} database - OrbitDB database instance
 * @param {Object} options - Extraction options
 * @param {boolean} [options.logEntriesOnly] - If true, only extract log entries (for fallback reconstruction)
 * @returns {Promise<Object>} - { blocks, blockSources, manifestCID }
 */
export async function extractDatabaseBlocks(database, options = {}) {
  const logEntriesOnly = options.logEntriesOnly || false;
  const extractionMode = logEntriesOnly
    ? "log entries only (fallback mode)"
    : "all blocks";

  console.log(
    `🔍 Extracting ${extractionMode} from database: ${database.name}`,
  );

  const blocks = new Map();
  const blockSources = new Map();

  // 1. Get all log entries
  const entries = await database.log.values();
  console.log(`   Found ${entries.length} log entries`);

  for (const entry of entries) {
    try {
      const entryBytes = await database.log.storage.get(entry.hash);
      if (entryBytes) {
        const entryCid = CID.parse(entry.hash);
        blocks.set(entry.hash, { cid: entryCid, bytes: entryBytes });
        blockSources.set(entry.hash, "log_entry");
        console.log(`   ✓ Entry block: ${entry.hash}`);
      }
    } catch (error) {
      console.warn(`   ⚠️ Failed to get entry ${entry.hash}: ${error.message}`);
    }
  }

  // Get manifest CID for metadata (always extract this regardless of mode)
  const addressParts = database.address.split("/");
  const manifestCID = addressParts[addressParts.length - 1];

  // Only extract metadata blocks if NOT in log-entries-only mode
  if (!logEntriesOnly) {
    // 2. Get database manifest
    try {
      const manifestBytes = await database.log.storage.get(manifestCID);
      if (manifestBytes) {
        const manifestParsedCid = CID.parse(manifestCID);
        blocks.set(manifestCID, {
          cid: manifestParsedCid,
          bytes: manifestBytes,
        });
        blockSources.set(manifestCID, "manifest");
        console.log(`   ✓ Manifest block: ${manifestCID}`);

        // Decode manifest to get access controller
        try {
          const manifestBlock = await Block.decode({
            cid: manifestParsedCid,
            bytes: manifestBytes,
            codec: dagCbor,
            hasher: sha256,
          });

          // Get access controller block
          if (manifestBlock.value.accessController) {
            const accessControllerCID =
              manifestBlock.value.accessController.replace("/ipfs/", "");
            try {
              const accessBytes =
                await database.log.storage.get(accessControllerCID);
              if (accessBytes) {
                const accessParsedCid = CID.parse(accessControllerCID);
                blocks.set(accessControllerCID, {
                  cid: accessParsedCid,
                  bytes: accessBytes,
                });
                blockSources.set(accessControllerCID, "access_controller");
                console.log(`   ✓ Access controller: ${accessControllerCID}`);
              }
            } catch (error) {
              console.warn(
                `   ⚠️ Could not get access controller: ${error.message}`,
              );
            }
          }
        } catch (error) {
          console.warn(`   ⚠️ Could not decode manifest: ${error.message}`);
        }
      }
    } catch (error) {
      console.warn(`   ⚠️ Could not get manifest: ${error.message}`);
    }

    // 3. Get identity blocks by iterating through all storage blocks
    console.log(`   🔍 Scanning all storage blocks for identities...`);

    // First, still collect known identity references from entries for comparison
    const referencedIdentities = new Set();
    for (const entry of entries) {
      if (entry.identity) {
        referencedIdentities.add(entry.identity);
      }
    }

    // Now iterate through ALL blocks in storage
    for await (const [hash, bytes] of database.log.storage.iterator()) {
      try {
        // Skip if we already have this block
        if (blocks.has(hash)) {
          continue;
        }

        // Try to decode as CBOR to check if it's an identity block
        const cid = CID.parse(hash);
        if (cid.code === 0x71) {
          // dag-cbor codec
          const block = await Block.decode({
            cid,
            bytes,
            codec: dagCbor,
            hasher: sha256,
          });

          const content = block.value;

          // Check if this is an identity block
          if (content.id && content.type) {
            blocks.set(hash, { cid, bytes });
            blockSources.set(hash, "identity");
            console.log(
              `   ✓ Identity block found: ${hash}${referencedIdentities.has(hash) ? " (referenced)" : " (discovered)"}`,
            );
          }
        }
      } catch (error) {
        // Skip blocks that can't be decoded - they might be raw data or other formats
        continue;
      }
    }
  } else {
    console.log(
      `   ⚡ Skipping manifest, access controller, and identity blocks (fallback mode)`,
    );
  }

  console.log(`   📊 Extracted ${blocks.size} total blocks`);
  return { blocks, blockSources, manifestCID };
}

/**
 * Initialize Storacha client with credentials
 *
 * @param {string} storachaKey - Storacha private key
 * @param {string} storachaProof - Storacha proof
 * @returns {Promise<Object>} - Initialized Storacha client
 */
async function initializeStorachaClient(storachaKey, storachaProof) {
  const principal = Signer.parse(storachaKey);
  const store = new StoreMemory();
  const client = await Client.create({ principal, store });

  const proof = await Proof.parse(storachaProof);
  const space = await client.addSpace(proof);
  await client.setCurrentSpace(space.did());

  return client;
}

/**
 * Initialize Storacha client with UCAN authentication
 *
 * @param {Object} options - UCAN options
 * @param {Object} options.client - Pre-initialized w3up client
 * @param {string} options.spaceDID - Target space DID
 * @returns {Promise<Object>} - Initialized Storacha client
 */
async function initializeStorachaClientWithUCAN(options) {
  console.log('🔐 Initializing Storacha client with UCAN authentication...');
  
  if (!options.client) {
    throw new Error('UCAN client is required');
  }
  
  // If spaceDID is provided, set it as current space
  if (options.spaceDID) {
    console.log(`   🚀 Setting current space: ${options.spaceDID}`);
    await options.client.setCurrentSpace(options.spaceDID);
  }
  
  console.log('✅ UCAN Storacha client initialized');
  console.log(`   🤖 Agent: ${options.client.agent.did()}`);
  console.log(`   🚀 Current space: ${options.client.currentSpace()?.did()}`);
  
  return options.client;
}

/**
 * Upload blocks to Storacha with parallel batch processing and progress events
 *
 * @param {Map} blocks - Map of blocks to upload
 * @param {Object} client - Storacha client
 * @param {number} batchSize - Number of files to upload in parallel (default: 10)
 * @param {number} maxConcurrency - Maximum concurrent batches (default: 3)
 * @param {EventEmitter} eventEmitter - Optional event emitter for progress updates
 * @returns {Promise<Object>} - Upload results and CID mappings
 */
async function uploadBlocksToStoracha(
  blocks,
  client,
  batchSize = 10,
  maxConcurrency = 3,
  eventEmitter = null,
) {
  console.log(
    `📤 Uploading ${blocks.size} blocks to Storacha in batches of ${batchSize}...`,
  );

  const uploadResults = [];
  const cidMappings = new Map();
  const blocksArray = Array.from(blocks.entries());
  const totalBlocks = blocks.size;
  let completedBlocks = 0;

  // Emit initial progress
  if (eventEmitter) {
    eventEmitter.emit("uploadProgress", {
      type: "upload",
      current: 0,
      total: totalBlocks,
      percentage: 0,
      status: "starting",
    });
  }

  // Helper function to upload a single block
  const uploadSingleBlock = async ([hash, blockData]) => {
    try {
      const blockFile = new File([blockData.bytes], hash, {
        type: "application/octet-stream",
      });

      console.log(
        `   📤 Uploading block ${hash} (${blockData.bytes.length} bytes)...`,
      );

      const result = await client.uploadFile(blockFile);
      const uploadedCID = result.toString();

      console.log(`   ✅ Uploaded: ${hash} → ${uploadedCID}`);

      // Update progress
      completedBlocks++;
      if (eventEmitter) {
        eventEmitter.emit("uploadProgress", {
          type: "upload",
          current: completedBlocks,
          total: totalBlocks,
          percentage: Math.round((completedBlocks / totalBlocks) * 100),
          status: "uploading",
          currentBlock: {
            hash,
            uploadedCID,
            size: blockData.bytes.length,
          },
        });
      }

      return {
        originalHash: hash,
        uploadedCID,
        size: blockData.bytes.length,
      };
    } catch (error) {
      console.error(`   ❌ Failed to upload block ${hash}: ${error.message}`);

      // Update progress even for failed uploads
      completedBlocks++;
      if (eventEmitter) {
        eventEmitter.emit("uploadProgress", {
          type: "upload",
          current: completedBlocks,
          total: totalBlocks,
          percentage: Math.round((completedBlocks / totalBlocks) * 100),
          status: "uploading",
          error: {
            hash,
            message: error.message,
          },
        });
      }

      return {
        originalHash: hash,
        error: error.message,
        size: blockData.bytes.length,
      };
    }
  };

  // Process blocks in batches with controlled concurrency
  for (let i = 0; i < blocksArray.length; i += batchSize * maxConcurrency) {
    const megaBatch = blocksArray.slice(i, i + batchSize * maxConcurrency);
    const batches = [];

    // Split mega-batch into smaller batches
    for (let j = 0; j < megaBatch.length; j += batchSize) {
      const batch = megaBatch.slice(j, j + batchSize);
      batches.push(batch);
    }

    console.log(
      `   🔄 Processing ${batches.length} concurrent batches (${megaBatch.length} blocks)...`,
    );

    // Process all batches in this mega-batch concurrently
    const batchPromises = batches.map(async (batch, batchIndex) => {
      console.log(
        `     📦 Batch ${batchIndex + 1}/${batches.length}: ${batch.length} blocks`,
      );

      // Upload all blocks in this batch in parallel
      const batchResults = await Promise.allSettled(
        batch.map(uploadSingleBlock),
      );

      return batchResults.map((result) =>
        result.status === "fulfilled"
          ? result.value
          : {
              originalHash: "unknown",
              error: result.reason?.message || "Unknown error",
              size: 0,
            },
      );
    });

    // Wait for all batches to complete
    const batchResults = await Promise.all(batchPromises);

    // Flatten and process results
    for (const batchResult of batchResults) {
      for (const result of batchResult) {
        uploadResults.push(result);
        if (result.uploadedCID) {
          cidMappings.set(result.originalHash, result.uploadedCID);
        }
      }
    }
  }

  const successful = uploadResults.filter((r) => r.uploadedCID);
  const failed = uploadResults.filter((r) => r.error);

  console.log(`   📊 Upload summary:`);
  console.log(`      Total blocks: ${blocks.size}`);
  console.log(`      Successful: ${successful.length}`);
  console.log(`      Failed: ${failed.length}`);
  console.log(`      Batch size: ${batchSize}`);
  console.log(`      Max concurrency: ${maxConcurrency}`);

  // Emit completion
  if (eventEmitter) {
    eventEmitter.emit("uploadProgress", {
      type: "upload",
      current: totalBlocks,
      total: totalBlocks,
      percentage: 100,
      status: "completed",
      summary: {
        successful: successful.length,
        failed: failed.length,
      },
    });
  }

  return { uploadResults, successful, failed, cidMappings };
}

// executeW3Command has been removed as it was deprecated and used Node.js-specific child_process
// Use SDK equivalents like listStorachaSpaceFiles() instead

/**
 * List all files in Storacha space using SDK (IMPROVED: Direct API access)
 *
 * @param {Object} options - Configuration options
 * @param {string} [options.storachaKey] - Storacha private key (defaults to env)
 * @param {string} [options.storachaProof] - Storacha proof (defaults to env)
 * @param {number} [options.size] - Maximum number of items to retrieve (default: 1000000)
 * @param {string} [options.cursor] - Pagination cursor
 * @returns {Promise<Array>} - Space files with metadata
 */
export async function listStorachaSpaceFiles(options = {}) {
  const _config = { ...DEFAULT_OPTIONS, ...options };
  console.log("📋 Listing files in Storacha space using SDK...");

  try {
    // Initialize client - support both credential and UCAN authentication
    let client;
    
    // Check for UCAN authentication first
    if (options.ucanClient) {
      client = await initializeStorachaClientWithUCAN({
        client: options.ucanClient,
        spaceDID: options.spaceDID
      });
    } else {
      // Fall back to credential authentication
      const storachaKey =
        options.storachaKey ||
        (typeof process !== "undefined" ? process.env?.STORACHA_KEY : undefined);
      const storachaProof =
        options.storachaProof ||
        (typeof process !== "undefined"
          ? process.env?.STORACHA_PROOF
          : undefined);

      if (!storachaKey || !storachaProof) {
        throw new Error(
          "Storacha authentication required: pass storachaKey + storachaProof OR ucanClient in options",
        );
      }

      client = await initializeStorachaClient(storachaKey, storachaProof);
    }

    // Prepare list options
    const listOptions = {};
    if (options.size) {
      listOptions.size = parseInt(String(options.size));
    } else {
      listOptions.size = 1000000; // Default to get ALL files
    }
    if (options.cursor) {
      listOptions.cursor = options.cursor;
    }
    if (options.pre) {
      listOptions.pre = options.pre;
    }

    // List uploads using SDK
    const result = await client.capability.upload.list(listOptions);

    console.log(`   ✅ Found ${result.results.length} uploads in space`);

    // Convert to the format we expect, with enhanced metadata
    const spaceFiles = result.results.map((upload) => ({
      root: upload.root.toString(),
      uploaded: upload.insertedAt ? new Date(upload.insertedAt) : new Date(),
      size:
        upload.shards?.reduce((total, shard) => {
          return total + (shard.size || 0);
        }, 0) || "unknown",
      shards: upload.shards?.length || 0,
      insertedAt: upload.insertedAt,
      updatedAt: upload.updatedAt,
    }));

    return spaceFiles;
  } catch (error) {
    console.error("   ❌ SDK listing error:", error.message);
    throw error;
  }
}

/**
 * List files in a specific Storacha layer using SDK
 *
 * @param {string} layer - Layer to list ('upload', 'store', 'blob')
 * @param {Object} options - Configuration options
 * @returns {Promise<Array>} - Layer files
 */
export async function listLayerFiles(layer, options = {}) {
  const _config = { ...DEFAULT_OPTIONS, ...options };

  try {
    // Initialize client - support both credential and UCAN authentication
    let client;
    
    // Check for UCAN authentication first
    if (options.ucanClient) {
      client = await initializeStorachaClientWithUCAN({
        client: options.ucanClient,
        spaceDID: options.spaceDID
      });
    } else {
      // Fall back to credential authentication
      const storachaKey =
        options.storachaKey ||
        (typeof process !== "undefined" ? process.env?.STORACHA_KEY : undefined);
      const storachaProof =
        options.storachaProof ||
        (typeof process !== "undefined"
          ? process.env?.STORACHA_PROOF
          : undefined);

      if (!storachaKey || !storachaProof) {
        throw new Error(
          "Storacha authentication required: pass storachaKey + storachaProof OR ucanClient in options",
        );
      }

      client = await initializeStorachaClient(storachaKey, storachaProof);
    }

    // Prepare list options
    const listOptions = {};
    if (options.size) {
      listOptions.size = parseInt(String(options.size));
    } else {
      listOptions.size = 1000000; // Default to get ALL files
    }
    if (options.cursor) {
      listOptions.cursor = options.cursor;
    }
    if (options.pre) {
      listOptions.pre = options.pre;
    }

    let result;
    switch (layer) {
      case "upload": {
        result = await client.capability.upload.list(listOptions);
        return result.results.map((upload) => upload.root.toString());
      }

      case "store": {
        result = await client.capability.store.list(listOptions);
        return result.results.map((store) => store.link.toString());
      }

      case "blob": {
        result = await client.capability.blob.list(listOptions);
        return result.results.map((blob) => {
          // For blob layer, format is similar to CLI output
          const digest = blob.blob.digest;
          const multihash = digest.bytes;
          const encodedDigest = Buffer.from(multihash).toString("base64");
          return encodedDigest;
        });
      }

      default:
        throw new Error(
          `Unknown layer: ${layer}. Use 'upload', 'store', or 'blob'.`,
        );
    }
  } catch (error) {
    console.warn(`   ⚠️ Failed to list ${layer}: ${error.message}`);
    return [];
  }
}

/**
 * Remove files from a specific layer in batches
 *
 * @param {string} layer - Layer to clear ('upload', 'store', 'blob')
 * @param {Array} cids - Array of CIDs to remove
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} - Removal results
 */
export async function removeLayerFiles(layer, cids, options = {}) {
  if (cids.length === 0) {
    console.log(`   ✓ ${layer}: No files to remove`);
    return { removed: 0, failed: 0 };
  }

  const batchSize = options.batchSize || 10;
  console.log(
    `   🗑️ Removing ${cids.length} files from ${layer} layer using SDK (batch size: ${batchSize})...`,
  );

  try {
    // Initialize client - support both credential and UCAN authentication
    let client;
    
    // Check for UCAN authentication first
    if (options.ucanClient) {
      client = await initializeStorachaClientWithUCAN({
        client: options.ucanClient,
        spaceDID: options.spaceDID
      });
    } else {
      // Fall back to credential authentication
      const storachaKey =
        options.storachaKey ||
        (typeof process !== "undefined" ? process.env?.STORACHA_KEY : undefined);
      const storachaProof =
        options.storachaProof ||
        (typeof process !== "undefined"
          ? process.env?.STORACHA_PROOF
          : undefined);

      if (!storachaKey || !storachaProof) {
        throw new Error(
          "Storacha authentication required: pass storachaKey + storachaProof OR ucanClient in options",
        );
      }

      client = await initializeStorachaClient(storachaKey, storachaProof);
    }

    let removed = 0;
    let failed = 0;

    // Process CIDs in batches
    for (let i = 0; i < cids.length; i += batchSize) {
      const batch = cids.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(cids.length / batchSize);

      console.log(
        `      📦 Processing batch ${batchNum}/${totalBatches} (${batch.length} files)...`,
      );

      // Process batch in parallel
      const batchPromises = batch.map(async (cid) => {
        try {
          switch (layer) {
            case "upload":
              await client.capability.upload.remove(CID.parse(cid));
              break;

            case "store":
              await client.capability.store.remove(CID.parse(cid));
              break;

            case "blob": {
              // For blob, we need to parse the digest format
              const digest = Buffer.from(cid, "base64");
              await client.capability.blob.remove(digest);
              break;
            }

            default:
              throw new Error(`Unknown layer: ${layer}`);
          }

          return { success: true, cid };
        } catch (error) {
          return { success: false, cid, error: error.message };
        }
      });

      // Wait for all deletions in this batch to complete
      const batchResults = await Promise.allSettled(batchPromises);

      // Process results
      for (const result of batchResults) {
        if (result.status === "fulfilled") {
          if (result.value.success) {
            removed++;
            console.log(`         ✓ Removed: ${result.value.cid}`);
          } else {
            failed++;
            console.log(
              `         ❌ Failed to remove ${result.value.cid}: ${result.value.error}`,
            );
          }
        } else {
          failed++;
          console.log(`         ❌ Batch operation failed: ${result.reason}`);
        }
      }

      // Add a small delay between batches to avoid overwhelming the API
      if (i + batchSize < cids.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    console.log(`   📊 ${layer}: ${removed} removed, ${failed} failed`);
    return { removed, failed };
  } catch (error) {
    console.error(`   ❌ Error removing from ${layer}: ${error.message}`);
    return { removed: 0, failed: cids.length };
  }
}

/**
 * Clear all files from Storacha space using SDK
 *
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} - Clearing results
 */
export async function clearStorachaSpace(options = {}) {
  console.log("🧹 Clearing Storacha space using SDK...");
  console.log("=".repeat(50));

  const layers = ["upload", "store", "blob"];
  const summary = {
    totalFiles: 0,
    totalRemoved: 0,
    totalFailed: 0,
    byLayer: {},
  };

  for (const layer of layers) {
    console.log(`\n📋 Checking ${layer} layer...`);
    const cids = await listLayerFiles(layer, options);
    summary.totalFiles += cids.length;

    if (cids.length > 0) {
      const result = await removeLayerFiles(layer, cids, options);
      summary.totalRemoved += result.removed;
      summary.totalFailed += result.failed;
      summary.byLayer[layer] = result;
    } else {
      summary.byLayer[layer] = { removed: 0, failed: 0 };
      console.log(`   ✓ ${layer}: Already empty`);
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log("🧹 SPACE CLEARING RESULTS (SDK)");
  console.log("=".repeat(50));
  console.log(`📊 Total files found: ${summary.totalFiles}`);
  console.log(`✅ Total files removed: ${summary.totalRemoved}`);
  console.log(`❌ Total failures: ${summary.totalFailed}`);

  for (const [layer, stats] of Object.entries(summary.byLayer)) {
    console.log(
      `   ${layer}: ${stats.removed} removed, ${stats.failed} failed`,
    );
  }

  const success =
    summary.totalFailed === 0 && summary.totalFiles === summary.totalRemoved;
  console.log(
    `\n${success ? "✅" : "⚠️"} Space clearing: ${success ? "COMPLETE" : "PARTIAL"}`,
  );

  return {
    success,
    ...summary,
  };
}

/**
 * Download a block from Storacha/IPFS gateways with fallback
 *
 * @param {string} storachaCID - Storacha CID to download
 * @param {Object} options - Configuration options
 * @returns {Promise<Uint8Array>} - Block bytes
 */
export async function downloadBlockFromStoracha(storachaCID, options = {}) {
  const config = { ...DEFAULT_OPTIONS, ...options };

  const gateways = [
    `${config.gateway}/ipfs`,
    "https://gateway.web3.storage/ipfs",
    "https://ipfs.io/ipfs",
  ];

  for (const gateway of gateways) {
    try {
      const response = await fetch(`${gateway}/${storachaCID}`, {
        signal: AbortSignal.timeout(config.timeout),
      });

      if (response.ok) {
        const bytes = new Uint8Array(await response.arrayBuffer());
        console.log(`   ✅ Downloaded ${bytes.length} bytes from ${gateway}`);
        return bytes;
      }
    } catch (error) {
      console.log(`   ⚠️ Failed from ${gateway}: ${error.message}`);
    }
  }

  throw new Error(`Could not download block ${storachaCID} from any gateway`);
}

/**
 * Advanced block analysis (classification and log head detection)
 *
 * @param {Object} blockstore - IPFS blockstore
 * @param {Map} downloadedBlocks - Downloaded blocks map
 * @returns {Promise<Object>} - Analysis results
 */
export async function analyzeBlocks(blockstore, downloadedBlocks = null) {
  console.log("🔍 Analyzing downloaded blocks...");

  const analysis = {
    manifestBlocks: [],
    accessControllerBlocks: [],
    logEntryBlocks: [],
    identityBlocks: [],
    unknownBlocks: [],
    logStructure: new Map(),
    potentialHeads: [],
    logChain: new Map(),
  };

  const allCIDStrings = downloadedBlocks
    ? Array.from(downloadedBlocks.keys())
    : [];

  for (const cidString of allCIDStrings) {
    try {
      const cid = CID.parse(cidString);
      const bytes = await blockstore.get(cid);

      if (cid.code === 0x71) {
        // dag-cbor codec
        try {
          const block = await Block.decode({
            cid,
            bytes,
            codec: dagCbor,
            hasher: sha256,
          });

          const content = block.value;
          console.log("content.type", content);
          // Smart block classification
          //if (content.type && content.name && content.accessController) {
          if (content.accessController) {
            analysis.manifestBlocks.push({ cid: cidString, content });
            console.log(`   📋 Manifest: ${cidString} (${content.name})`);
          } else if (content.sig && content.key && content.identity) {
            analysis.logEntryBlocks.push({ cid: cidString, content });
            analysis.logStructure.set(cidString, content);
            console.log(`   📝 Log Entry: ${cidString}`);

            // Build log chain for head detection
            if (content.next && Array.isArray(content.next)) {
              for (const nextHash of content.next) {
                analysis.logChain.set(nextHash, cidString);
              }
            }
          } else if (content.id && content.type) {
            analysis.identityBlocks.push({ cid: cidString, content });
            console.log(`   👤 Identity: ${cidString}`);
          } else if (
            content.type === "orbitdb-access-controller" ||
            content.type === "ipfs"
          ) {
            analysis.accessControllerBlocks.push({ cid: cidString, content });
            console.log(`   🔒 Access Controller: ${cidString}`);
          } else {
            analysis.unknownBlocks.push({ cid: cidString, content });
            console.log(`   ❓ Unknown: ${cidString}`);
          }
        } catch (decodeError) {
          analysis.unknownBlocks.push({
            cid: cidString,
            decodeError: decodeError.message,
          });
          console.log(`   ⚠️ Decode failed: ${cidString}`);
        }
      } else {
        analysis.unknownBlocks.push({ cid: cidString, reason: "not dag-cbor" });
        console.log(`   🔧 Raw block: ${cidString}`);
      }
    } catch (error) {
      console.warn(
        `   ❌ Error analyzing block ${cidString}: ${error.message}`,
      );
    }
  }

  // Intelligent head detection
  console.log("🎯 Determining log heads:");
  for (const [entryHash, _entryContent] of analysis.logStructure) {
    if (!analysis.logChain.has(entryHash)) {
      analysis.potentialHeads.push(entryHash);
      console.log(`   🎯 HEAD: ${entryHash}`);
    }
  }

  console.log("📊 Analysis Summary:");
  console.log(`   📋 Manifests: ${analysis.manifestBlocks.length}`);
  console.log(`   📝 Log Entries: ${analysis.logEntryBlocks.length}`);
  console.log(`   👤 Identities: ${analysis.identityBlocks.length}`);
  console.log(
    `   🔒 Access Controllers: ${analysis.accessControllerBlocks.length}`,
  );
  console.log(`   🎯 Heads Discovered: ${analysis.potentialHeads.length}`);

  return analysis;
}

/**
 * Download blocks from Storacha and bridge CID formats for OrbitDB
 *
 * @param {Map} cidMappings - Mapping of original → uploaded CIDs
 * @param {Object} client - Storacha client (unused, kept for compatibility)
 * @param {Object} targetBlockstore - Target blockstore to store blocks
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} - Bridge results
 */
async function downloadAndBridgeBlocks(
  cidMappings,
  client,
  targetBlockstore,
  options = {},
) {
  const config = { ...DEFAULT_OPTIONS, ...options };
  console.log(
    `📥 Downloading and bridging ${cidMappings.size} blocks for OrbitDB...`,
  );

  const bridgedBlocks = [];

  for (const [originalCID, storachaCID] of cidMappings) {
    try {
      console.log(`   📥 Downloading ${storachaCID}...`);

      // Download block from Storacha
      const response = await fetch(`${config.gateway}/ipfs/${storachaCID}`, {
        timeout: config.timeout,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const blockBytes = new Uint8Array(await response.arrayBuffer());
      console.log(`   ✅ Downloaded ${blockBytes.length} bytes`);

      // Convert Storacha CID to OrbitDB format
      const bridgedCID = convertStorachaCIDToOrbitDB(storachaCID);
      console.log(`   🌉 Bridged CID: ${storachaCID} → ${bridgedCID}`);

      // Verify the bridged CID matches the original
      const match = bridgedCID === originalCID;
      if (match) {
        console.log(`   ✅ CID bridge successful: ${bridgedCID}`);
      } else {
        console.warn(
          `   ⚠️ CID bridge mismatch: expected ${originalCID}, got ${bridgedCID}`,
        );
      }

      // Store block in target blockstore under OrbitDB CID format
      const parsedBridgedCID = CID.parse(bridgedCID);
      await targetBlockstore.put(parsedBridgedCID, blockBytes);
      console.log(`   💾 Stored in blockstore as: ${bridgedCID}`);

      bridgedBlocks.push({
        originalCID,
        storachaCID,
        bridgedCID,
        size: blockBytes.length,
        match,
      });
    } catch (error) {
      console.error(
        `   ❌ Failed to download/bridge ${storachaCID}: ${error.message}`,
      );
      bridgedBlocks.push({
        originalCID,
        storachaCID,
        error: error.message,
      });
    }
  }

  const successful = bridgedBlocks.filter((b) => b.bridgedCID);
  const failed = bridgedBlocks.filter((b) => b.error);
  const matches = successful.filter((b) => b.match);

  console.log(`   📊 Bridge summary:`);
  console.log(`      Total blocks: ${cidMappings.size}`);
  console.log(`      Downloaded: ${successful.length}`);
  console.log(`      Failed: ${failed.length}`);
  console.log(`      CID matches: ${matches.length}`);

  return { bridgedBlocks, successful, failed, matches };
}

/**
 * Backup an OrbitDB database to Storacha with progress events
 *
 * @param {Object} orbitdb - OrbitDB instance
 * @param {string} databaseAddress - Database address or name
 * @param {Object} options - Backup options
 * @param {EventEmitter} options.eventEmitter - Optional event emitter for progress updates
 * @param {boolean} [options.logEntriesOnly] - If true, only backup log entries (for fallback reconstruction)
 * @returns {Promise<Object>} - Backup result
 */
export async function backupDatabase(orbitdb, databaseAddress, options = {}) {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const eventEmitter = options.eventEmitter;
  const logEntriesOnly = options.logEntriesOnly || false;

  const backupMode = logEntriesOnly
    ? "Log Entries Only (Fallback Mode)"
    : "Full Backup";

  console.log("🚀 Starting OrbitDB Database Backup to Storacha");
  console.log(`📍 Database: ${databaseAddress}`);
  console.log(`🔧 Backup Mode: ${backupMode}`);

  try {
    // Initialize Storacha client - support both credential and UCAN authentication
    let client;
    
    // Check for UCAN authentication first
    if (config.ucanClient) {
      console.log('🔐 Using UCAN authentication...');
      client = await initializeStorachaClientWithUCAN({
        client: config.ucanClient,
        spaceDID: config.spaceDID
      });
    } else {
      // Fall back to credential authentication
      const storachaKey =
        config.storachaKey ||
        (typeof process !== "undefined" ? process.env?.STORACHA_KEY : undefined);
      const storachaProof =
        config.storachaProof ||
        (typeof process !== "undefined"
          ? process.env?.STORACHA_PROOF
          : undefined);

      if (!storachaKey || !storachaProof) {
        throw new Error(
          "Storacha authentication required: pass storachaKey + storachaProof OR ucanClient in options",
        );
      }
      
      console.log('🔑 Using credential authentication...');
      client = await initializeStorachaClient(storachaKey, storachaProof);
    }

    // Open the database
    const database = await orbitdb.open(databaseAddress, options.dbConfig);

    // Extract blocks based on backup mode
    const { blocks, blockSources, manifestCID } = await extractDatabaseBlocks(
      database,
      {
        logEntriesOnly,
      },
    );

  // Upload blocks to Storacha with progress tracking
  try {
    const { successful, cidMappings } = await uploadBlocksToStoracha(
      blocks,
      client,
      10,
      3,
      eventEmitter,
    );

    if (successful.length === 0) {
      throw new Error("No blocks were successfully uploaded");
    }
  } catch (error) {
    if (error.message?.includes("Unauthorized") || error.message?.includes("Capability")) {
      if (eventEmitter) {
        eventEmitter.emit("uploadProgress", {
          type: "upload",
          current: 0,
          total: blocks.size,
          percentage: 0,
          status: "error",
          error: {
            type: "ucan",
            message: "UCAN authorization failed: Your capabilities are not sufficient for uploading. Please check your space permissions.",
            details: error.message
          }
        });
      }
      throw new Error("UCAN authorization failed: Your capabilities are not sufficient for uploading. Please check your space permissions.");
    }
    throw error;
  }

    // Get block summary
    const blockSummary = {};
    for (const [_hash, source] of blockSources) {
      blockSummary[source] = (blockSummary[source] || 0) + 1;
    }

    console.log("✅ Backup completed successfully!");

    return {
      success: true,
      manifestCID,
      databaseAddress: database.address,
      databaseName: database.name,
      blocksTotal: blocks.size,
      blocksUploaded: successful.length,
      blockSummary,
      cidMappings: Object.fromEntries(cidMappings),
    };
  } catch (error) {
    console.error("❌ Backup failed:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Optimized restore from Storacha for fallback reconstruction (log entries only)
 *
 * @param {Object} orbitdb - Target OrbitDB instance
 * @param {Object} options - Restore options
 * @param {string} [options.storachaKey] - Storacha private key (defaults to env)
 * @param {string} [options.storachaProof] - Storacha proof (defaults to env)
 * @param {EventEmitter} [options.eventEmitter] - Optional event emitter for progress updates
 * @returns {Promise<Object>} - Restore result
 */
export async function restoreLogEntriesOnly(orbitdb, options = {}) {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const eventEmitter = options.eventEmitter;

  console.log("⚡ Starting Optimized Log-Entries-Only Restore from Storacha");

  try {
    // Step 1: List ALL files in Storacha space
    console.log("\n📋 Step 1: Discovering all files in Storacha space...");
    const spaceFiles = await listStorachaSpaceFiles(config);

    if (spaceFiles.length === 0) {
      throw new Error("No files found in Storacha space");
    }

    console.log(`   🎉 SUCCESS! Found ${spaceFiles.length} files in space`);

    // Step 2: Download ONLY log entry blocks (optimized)
    const logEntryBlocks = await downloadLogEntriesOnly(
      spaceFiles,
      orbitdb,
      config,
      eventEmitter,
    );

    if (logEntryBlocks.size === 0) {
      throw new Error("No log entries found in Storacha space");
    }

    console.log(
      `   ⚡ OPTIMIZATION: Downloaded only ${logEntryBlocks.size} log entries instead of ${spaceFiles.length} total files`,
    );

    // Step 3: Direct fallback reconstruction (skip analysis since we only have log entries)
    console.log("\n🔧 Step 3: Reconstructing database from log entries...");
    const fallbackResult = await reconstructWithoutManifest(
      orbitdb,
      logEntryBlocks,
      config,
    );

    console.log(
      "✅ Optimized Log-Entries-Only Restore completed successfully!",
    );

    return {
      database: fallbackResult.database,
      metadata: fallbackResult.metadata,
      entriesCount: fallbackResult.entriesCount,
      entriesRecovered: fallbackResult.entriesCount,
      method: "optimized-log-entries-only",
      success: true,
      preservedHashes: false,
      preservedAddress: false,
      spaceFilesFound: spaceFiles.length,
      logEntriesDownloaded: logEntryBlocks.size,
      optimizationSavings: {
        totalFiles: spaceFiles.length,
        filesDownloaded: logEntryBlocks.size,
        filesSkipped: spaceFiles.length - logEntryBlocks.size,
        percentageSaved: Math.round(
          ((spaceFiles.length - logEntryBlocks.size) / spaceFiles.length) * 100,
        ),
      },
    };
  } catch (error) {
    console.error(
      "❌ Optimized Log-Entries-Only Restore failed:",
      error.message,
    );

    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Mapping-independent restore from Storacha (ENHANCED)
 *
 * @param {Object} orbitdb - Target OrbitDB instance
 * @param {Object} options - Restore options
 * @param {string} [options.storachaKey] - Storacha private key (defaults to env)
 * @param {string} [options.storachaProof] - Storacha proof (defaults to env)
 * @param {boolean} [options.forceFallback] - Force fallback reconstruction mode (default: false)
 * @param {string} [options.fallbackDatabaseName] - Custom name for fallback reconstruction
 * @param {EventEmitter} [options.eventEmitter] - Optional event emitter for progress updates
 * @returns {Promise<Object>} - Restore result
 */
export async function restoreDatabaseFromSpace(orbitdb, options = {}) {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const eventEmitter = options.eventEmitter;
  // Use orbitdb parameter directly instead of creating an alias

  console.log("🔄 Starting Mapping-Independent OrbitDB Restore from Storacha");

  try {
    // Step 1: List ALL files in Storacha space
    console.log("\n📋 Step 1: Discovering all files in Storacha space...");
    const spaceFiles = await listStorachaSpaceFiles(config);

    if (spaceFiles.length === 0) {
      throw new Error("No files found in Storacha space");
    }

    console.log(
      `   🎉 SUCCESS! Found ${spaceFiles.length} files in space without requiring CID mappings`,
    );

    // Step 2: Download ALL files from space with progress tracking
    const downloadedBlocks = await downloadBlocksWithProgress(
      spaceFiles,
      orbitdb,
      config,
      eventEmitter,
    );

    // ... rest of existing code remains the same ...

    // Step 3: Intelligent block analysis
    console.log("\n🔍 Step 3: Analyzing block structure ...");
    const analysis = await analyzeBlocks(
      orbitdb.ipfs.blockstore,
      downloadedBlocks,
    );

    if (analysis.manifestBlocks.length === 0 || options.forceFallback) {
      console.log(
        "⚠️ No manifest blocks found - attempting fallback reconstruction...",
      );

      // Fallback: decode blocks and extract payloads to import as new entries
      const fallbackResult = await reconstructWithoutManifest(
        orbitdb,
        downloadedBlocks,
        config,
      );

      return {
        database: fallbackResult.database,
        metadata: fallbackResult.metadata,
        entriesCount: fallbackResult.entriesCount,
        entriesRecovered: fallbackResult.entriesCount,
        method: "fallback-reconstruction",
        success: true,
        preservedHashes: false,
        preservedAddress: false,
      };
    }

    // Step 4: Reconstruct database using discovered manifest
    console.log("\n🔄 Step 4: Reconstructing database from analysis...");

    // Find the correct manifest by matching log entries to database IDs
    const correctManifest = findCorrectManifest(analysis);
    if (!correctManifest) {
      throw new Error("Could not determine correct manifest from log entries");
    }

    const databaseAddress = `/orbitdb/${correctManifest.cid}`;

    console.log(`   📥 Opening database at: ${databaseAddress}`);
    console.log(
      `   🎯 Selected manifest: ${correctManifest.cid} (matched from log entries)`,
    );
    
    // Extract database type from manifest if available, otherwise infer from log entries
    let databaseType = inferDatabaseType(analysis.logEntryBlocks); // fallback
    if (correctManifest.content && correctManifest.content.type) {
      databaseType = correctManifest.content.type;
      console.log(`   📋 Database type from manifest: ${databaseType}`);
    } else {
      console.log(`   🔍 Inferred database type: ${databaseType}`);
    }
    
    const reconstructedDB = await orbitdb.open(
      databaseAddress,
      config.dbConfig ? config.dbConfig : { type: databaseType },
    );
    console.log("config.dbConfig", config.dbConfig);
    console.log("reconstructedDB.dbName", reconstructedDB.dbName);
    // const reconstructedDB = await orbitdb.open(config.dbName, config.dbConfig?config.dbConfig:{type: 'keyvalue'})
    // Wait for entries to load
    console.log("   ⏳ Waiting for entries to load...");
    await new Promise((resolve) => setTimeout(resolve, config.timeout / 10));
    const reconstructedEntries = await reconstructedDB.all();
    console.log("   ⏳ Waiting for entries to load...");
    await new Promise((resolve) => setTimeout(resolve, config.timeout / 10));

    // Handle different database types properly
    let entriesArray;
    let entriesCount;
    if (reconstructedDB.type === "keyvalue") {
      // For key-value databases, all() returns an object
      // Get the actual log entries to preserve hashes
      const logEntries = await reconstructedDB.log.values();
      console.log("logEntries", logEntries);
      entriesArray = logEntries.map((logEntry) => ({
        hash: logEntry.hash,
        payload: logEntry.payload,
      }));
      entriesCount = Object.keys(reconstructedEntries).length;
    } else {
      // For other database types (events, documents), all() returns an array
      entriesArray = Array.isArray(reconstructedEntries)
        ? reconstructedEntries
        : [];
      entriesCount = entriesArray.length;
    }

    console.log(`   📊 Reconstructed entries: ${entriesCount}`);
    console.log(`   🔍 Database type: ${reconstructedDB.type}`);

    console.log("✅ Mapping-Independent Restore completed successfully!");

    return {
      success: true,
      database: reconstructedDB,
      orbitdb: orbitdb, // Return the OrbitDB instance
      manifestCID: correctManifest.cid,
      address: reconstructedDB.address,
      name: reconstructedDB.name,
      type: reconstructedDB.type,
      entriesRecovered: entriesCount,
      blocksRestored: downloadedBlocks.size,
      addressMatch: reconstructedDB.address === databaseAddress,
      spaceFilesFound: spaceFiles.length,
      analysis,
      entries: entriesArray,
    };
  } catch (error) {
    console.error("❌ Mapping-Independent Restore failed:", error.message);

    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Restore an OrbitDB database from Storacha (Legacy mapping-dependent)
 *
 * @param {Object} orbitdb - Target OrbitDB instance
 * @param {string} manifestCID - Manifest CID from backup
 * @param {Object} cidMappings - Optional CID mappings (if available)
 * @param {Object} options - Restore options
 * @returns {Promise<Object>} - Restore result
 */
export async function restoreDatabase(
  orbitdb,
  manifestCID,
  cidMappings = null,
  options = {},
) {
  const config = { ...DEFAULT_OPTIONS, ...options };

  console.log("🔄 Starting OrbitDB Database Restore from Storacha");
  console.log(`📍 Manifest CID: ${manifestCID}`);

  // No temporary resources needed

  try {
    // Initialize Storacha client - support both credential and UCAN authentication
    let client;
    
    // Check for UCAN authentication first
    if (config.ucanClient) {
      client = await initializeStorachaClientWithUCAN({
        client: config.ucanClient,
        spaceDID: config.spaceDID
      });
    } else {
      // Fall back to credential authentication
      const storachaKey =
        config.storachaKey ||
        (typeof process !== "undefined" ? process.env?.STORACHA_KEY : undefined);
      const storachaProof =
        config.storachaProof ||
        (typeof process !== "undefined"
          ? process.env?.STORACHA_PROOF
          : undefined);

      if (!storachaKey || !storachaProof) {
        throw new Error(
          "Storacha authentication required: pass storachaKey + storachaProof OR ucanClient in options",
        );
      }

      client = await initializeStorachaClient(storachaKey, storachaProof);
    }

    // If no CID mappings provided, we need to discover them
    // This is a simplified version - in practice you'd store mappings during backup
    if (!cidMappings) {
      throw new Error(
        "CID mappings required for restore. Store them during backup.",
      );
    }

    // Convert object back to Map if needed
    const mappings =
      cidMappings instanceof Map
        ? cidMappings
        : new Map(Object.entries(cidMappings));

    // Download and bridge blocks
    const { successful, matches } = await downloadAndBridgeBlocks(
      mappings,
      client,
      orbitdb.ipfs.blockstore,
      config,
    );

    if (successful.length === 0) {
      throw new Error("No blocks were successfully restored");
    }

    if (matches.length < successful.length) {
      throw new Error("Some CID bridges failed - reconstruction may fail");
    }

    // Reconstruct database
    const databaseAddress = `/orbitdb/${manifestCID}`;
    console.log(`📥 Opening database at: ${databaseAddress}`);

    const reconstructedDB = await orbitdb.open(databaseAddress);

    // Wait for entries to load
    console.log("⏳ Waiting for entries to load...");
    await new Promise((resolve) => setTimeout(resolve, config.timeout / 10));

    const reconstructedEntries = await reconstructedDB.all();

    console.log(
      "✅ Restore completed successfully!",
      reconstructedEntries.length,
    );

    return {
      success: true,
      database: reconstructedDB,
      manifestCID,
      address: reconstructedDB.address,
      name: reconstructedDB.name,
      type: reconstructedDB.type,
      entriesRecovered: reconstructedEntries.length,
      blocksRestored: successful.length,
      addressMatch: reconstructedDB.address === databaseAddress,
      entries: reconstructedEntries.map((e) => ({
        hash: e.hash,
        value: e.value,
      })),
    };
  } catch (error) {
    console.error("❌ Restore failed:", error.message);
    return {
      success: false,
      error: error.message,
    };
  } // No cleanup needed
}

/**
 * Enhanced OrbitDBStorachaBridge class with event emission
 */
export class OrbitDBStorachaBridge extends EventEmitter {
  constructor(options = {}) {
    super();
    this.config = { ...DEFAULT_OPTIONS, ...options };
  }

  async backup(orbitdb, databaseAddress, options = {}) {
    // Pass this instance as eventEmitter to enable progress events
    return await backupDatabase(orbitdb, databaseAddress, {
      ...this.config,
      ...options,
      eventEmitter: this,
    });
  }

  async backupLogEntriesOnly(orbitdb, databaseAddress, options = {}) {
    // Optimized backup for fallback reconstruction - only log entries
    return await backupDatabase(orbitdb, databaseAddress, {
      ...this.config,
      ...options,
      logEntriesOnly: true,
      eventEmitter: this,
    });
  }

  async restore(orbitdb, manifestCID, cidMappings, options = {}) {
    return await restoreDatabase(orbitdb, manifestCID, cidMappings, {
      ...this.config,
      ...options,
    });
  }

  // BREAKTHROUGH: Mapping-independent restore
  async restoreFromSpace(orbitdb, options = {}) {
    return await restoreDatabaseFromSpace(orbitdb, {
      ...this.config,
      ...options,
      eventEmitter: this,
    });
  }

  // OPTIMIZATION: Log-entries-only restore (much faster for fallback reconstruction)
  async restoreLogEntriesOnly(orbitdb, options = {}) {
    return await restoreLogEntriesOnly(orbitdb, {
      ...this.config,
      ...options,
      eventEmitter: this,
    });
  }

  // Utility methods
  async listSpaceFiles(options = {}) {
    return await listStorachaSpaceFiles({ ...this.config, ...options });
  }

  async analyzeBlocks(blockstore, downloadedBlocks) {
    return await analyzeBlocks(blockstore, downloadedBlocks);
  }

  extractManifestCID(databaseAddress) {
    return extractManifestCID(databaseAddress);
  }

  convertCID(storachaCID) {
    return convertStorachaCIDToOrbitDB(storachaCID);
  }
}

/**
 * Find the correct manifest block by matching log entries to database IDs
 *
 * @param {Object} analysis - Block analysis results
 * @returns {Object|null} - Correct manifest block or null if not found
 */
function findCorrectManifest(analysis) {
  console.log("🎯 Finding correct manifest from log entries...");

  if (analysis.manifestBlocks.length === 1) {
    console.log("   ✅ Only one manifest found, using it");
    return analysis.manifestBlocks[0];
  }

  if (analysis.manifestBlocks.length === 0) {
    console.log("   ❌ No manifest blocks found");
    return null;
  }

  // Extract database IDs from log entries
  const databaseIds = new Set();
  for (const logEntry of analysis.logEntryBlocks) {
    if (logEntry.content && logEntry.content.id) {
      // Extract manifest CID from database address like '/orbitdb/zdpu...'
      const manifestCID = logEntry.content.id.replace("/orbitdb/", "");
      databaseIds.add(manifestCID);
      console.log(
        `   📝 Log entry references database: ${logEntry.content.id} (manifest: ${manifestCID})`,
      );
    }
  }

  console.log(
    `   🔍 Found ${databaseIds.size} unique database ID(s) from ${analysis.logEntryBlocks.length} log entries`,
  );

  // Find manifest that matches the most referenced database ID
  const manifestCounts = new Map();
  for (const manifestBlock of analysis.manifestBlocks) {
    const count = databaseIds.has(manifestBlock.cid) ? 1 : 0;
    manifestCounts.set(manifestBlock.cid, count);
    console.log(
      `   📋 Manifest ${manifestBlock.cid}: ${count > 0 ? "MATCHES" : "no match"}`,
    );
  }

  // Find the manifest with the highest count (most log entry references)
  let bestManifest = null;
  let bestCount = -1;

  for (const [manifestCID, count] of manifestCounts) {
    if (count > bestCount) {
      bestCount = count;
      bestManifest = analysis.manifestBlocks.find((m) => m.cid === manifestCID);
    }
  }

  if (bestManifest && bestCount > 0) {
    console.log(
      `   ✅ Selected manifest: ${bestManifest.cid} (referenced by ${bestCount} log entries)`,
    );
    return bestManifest;
  }

  // Fallback: if no manifest matches log entries, use the first one and warn
  console.warn(
    "   ⚠️ No manifest matched log entries, using first manifest as fallback",
  );
  return analysis.manifestBlocks[0];
}

/**
 * Download only log entry blocks from Storacha (optimized for fallback reconstruction)
 *
 * @param {Array} spaceFiles - Array of space files to download
 * @param {Object} currentOrbitDB - OrbitDB instance
 * @param {Object} config - Configuration options
 * @param {EventEmitter} eventEmitter - Optional event emitter for progress updates
 * @returns {Promise<Map>} - Downloaded log entry blocks map
 */
async function downloadLogEntriesOnly(
  spaceFiles,
  currentOrbitDB,
  config,
  eventEmitter = null,
) {
  console.log("\n📥 Downloading and filtering log entry blocks only...");
  const logEntryBlocks = new Map();
  const totalFiles = spaceFiles.length;
  let completedFiles = 0;
  let logEntriesFound = 0;

  // Emit initial progress
  if (eventEmitter) {
    eventEmitter.emit("downloadProgress", {
      type: "download",
      current: 0,
      total: totalFiles,
      percentage: 0,
      status: "starting (log entries only)",
    });
  }

  for (const spaceFile of spaceFiles) {
    const storachaCID = spaceFile.root;
    console.log(`   🔄 Checking: ${storachaCID}`);

    try {
      const bytes = await downloadBlockFromStoracha(storachaCID, config);

      // Convert Storacha CID to OrbitDB format
      const orbitdbCID = convertStorachaCIDToOrbitDB(storachaCID);
      const parsedCID = CID.parse(orbitdbCID);

      // Only process dag-cbor blocks (potential log entries)
      if (parsedCID.code === 0x71) {
        try {
          const block = await Block.decode({
            cid: parsedCID,
            bytes,
            codec: dagCbor,
            hasher: sha256,
          });

          const content = block.value;

          // Check if this looks like an OrbitDB log entry
          if (
            content &&
            content.v === 2 &&
            content.id &&
            content.clock &&
            content.payload !== undefined
          ) {
            // Store in target blockstore
            await currentOrbitDB.ipfs.blockstore.put(parsedCID, bytes);
            logEntryBlocks.set(orbitdbCID, {
              storachaCID,
              bytes: bytes.length,
            });
            logEntriesFound++;

            console.log(`   ✅ Log entry stored: ${orbitdbCID}`);
          } else {
            console.log(`   ⚪ Skipped non-log block: ${orbitdbCID}`);
          }
        } catch (decodeError) {
          console.log(`   ⚪ Skipped non-decodable block: ${orbitdbCID}`);
        }
      } else {
        console.log(`   ⚪ Skipped non-CBOR block: ${orbitdbCID}`);
      }

      // Update progress
      completedFiles++;
      if (eventEmitter) {
        eventEmitter.emit("downloadProgress", {
          type: "download",
          current: completedFiles,
          total: totalFiles,
          percentage: Math.round((completedFiles / totalFiles) * 100),
          status: "downloading (log entries only)",
          currentBlock: {
            storachaCID,
            orbitdbCID,
            size: bytes.length,
            isLogEntry: logEntryBlocks.has(orbitdbCID),
          },
        });
      }
    } catch (error) {
      console.error(`   ❌ Failed: ${storachaCID} - ${error.message}`);

      // Update progress even for failed downloads
      completedFiles++;
      if (eventEmitter) {
        eventEmitter.emit("downloadProgress", {
          type: "download",
          current: completedFiles,
          total: totalFiles,
          percentage: Math.round((completedFiles / totalFiles) * 100),
          status: "downloading (log entries only)",
          error: {
            storachaCID,
            message: error.message,
          },
        });
      }
    }
  }

  // Emit completion
  if (eventEmitter) {
    eventEmitter.emit("downloadProgress", {
      type: "download",
      current: totalFiles,
      total: totalFiles,
      percentage: 100,
      status: "completed (log entries only)",
      summary: {
        totalFiles: totalFiles,
        logEntriesFound: logEntriesFound,
        blocksSkipped: totalFiles - logEntriesFound,
      },
    });
  }

  console.log(
    `   📊 Found ${logEntriesFound} log entries out of ${totalFiles} total files`,
  );
  return logEntryBlocks;
}

/**
 * Download blocks from Storacha with progress events
 *
 * @param {Array} spaceFiles - Array of space files to download
 * @param {Object} currentOrbitDB - OrbitDB instance
 * @param {Object} config - Configuration options
 * @param {EventEmitter} eventEmitter - Optional event emitter for progress updates
 * @returns {Promise<Map>} - Downloaded blocks map
 */
async function downloadBlocksWithProgress(
  spaceFiles,
  currentOrbitDB,
  config,
  eventEmitter = null,
) {
  console.log("\n📥 Downloading all space files...");
  const downloadedBlocks = new Map();
  const totalFiles = spaceFiles.length;
  let completedFiles = 0;

  // Emit initial progress
  if (eventEmitter) {
    eventEmitter.emit("downloadProgress", {
      type: "download",
      current: 0,
      total: totalFiles,
      percentage: 0,
      status: "starting",
    });
  }

  for (const spaceFile of spaceFiles) {
    const storachaCID = spaceFile.root;
    console.log(`   🔄 Downloading: ${storachaCID}`);

    try {
      const bytes = await downloadBlockFromStoracha(storachaCID, config);

      // Convert Storacha CID to OrbitDB format
      const orbitdbCID = convertStorachaCIDToOrbitDB(storachaCID);
      const parsedCID = CID.parse(orbitdbCID);

      // Store in target blockstore
      await currentOrbitDB.ipfs.blockstore.put(parsedCID, bytes);
      downloadedBlocks.set(orbitdbCID, { storachaCID, bytes: bytes.length });

      console.log(`   ✅ Stored: ${orbitdbCID}`);

      // Update progress
      completedFiles++;
      if (eventEmitter) {
        eventEmitter.emit("downloadProgress", {
          type: "download",
          current: completedFiles,
          total: totalFiles,
          percentage: Math.round((completedFiles / totalFiles) * 100),
          status: "downloading",
          currentBlock: {
            storachaCID,
            orbitdbCID,
            size: bytes.length,
          },
        });
      }
    } catch (error) {
      console.error(`   ❌ Failed: ${storachaCID} - ${error.message}`);

      // Update progress even for failed downloads
      completedFiles++;
      if (eventEmitter) {
        eventEmitter.emit("downloadProgress", {
          type: "download",
          current: completedFiles,
          total: totalFiles,
          percentage: Math.round((completedFiles / totalFiles) * 100),
          status: "downloading",
          error: {
            storachaCID,
            message: error.message,
          },
        });
      }
    }
  }

  // Emit completion
  if (eventEmitter) {
    eventEmitter.emit("downloadProgress", {
      type: "download",
      current: totalFiles,
      total: totalFiles,
      percentage: 100,
      status: "completed",
      summary: {
        downloaded: downloadedBlocks.size,
        failed: totalFiles - downloadedBlocks.size,
      },
    });
  }

  console.log(`   📊 Downloaded ${downloadedBlocks.size} blocks total`);
  return downloadedBlocks;
}

/**
 * Fallback reconstruction when no manifest is found
 * Decodes blocks, extracts payloads, and creates a new database
 *
 * @param {Object} orbitdb - OrbitDB instance
 * @param {Map} downloadedBlocks - Downloaded blocks map
 * @param {Object} config - Configuration options
 * @returns {Promise<Object>} - Reconstruction results
 */
async function reconstructWithoutManifest(orbitdb, downloadedBlocks, config) {
  console.log("🔧 Starting fallback reconstruction without manifest...");

  const logEntries = [];
  const unknownBlocks = [];

  // Step 1: Decode all blocks and identify log entries
  console.log("🔍 Step 1: Decoding blocks to find log entries...");

  for (const [cidString, _] of downloadedBlocks) {
    try {
      const cid = CID.parse(cidString);
      const bytes = await orbitdb.ipfs.blockstore.get(cid);

      if (cid.code === 0x71) {
        // dag-cbor codec
        try {
          const block = await Block.decode({
            cid,
            bytes,
            codec: dagCbor,
            hasher: sha256,
          });

          const content = block.value;

          // Check if this looks like an OrbitDB log entry
          if (
            content &&
            content.v === 2 &&
            content.id &&
            content.clock &&
            content.payload !== undefined
          ) {
            logEntries.push({
              cid: cidString,
              content,
              hash: cidString,
              payload: content.payload,
            });

            console.log(`   📝 Found log entry: ${cidString.slice(0, 12)}...`);
          }
        } catch (decodeError) {
          unknownBlocks.push({ cid: cidString, error: decodeError.message });
        }
      }
    } catch (error) {
      console.warn(
        `   ⚠️ Error processing block ${cidString}: ${error.message}`,
      );
    }
  }

  console.log(`   ✅ Found ${logEntries.length} log entries`);

  if (logEntries.length === 0) {
    throw new Error(
      "No OrbitDB log entries found in blocks - cannot reconstruct database",
    );
  }

  // Step 2: Analyze payload patterns to determine database type
  console.log(
    "🔍 Step 2: Analyzing payload patterns to determine database type...",
  );

  const databaseType = inferDatabaseType(logEntries);
  console.log(`   📊 Inferred database type: ${databaseType}`);

  // Step 3: Create new database and import entries
  console.log(`🆕 Step 3: Creating new ${databaseType} database...`);

  const dbName = "test-todos"; // config.fallbackDatabaseName || `restored-${Date.now()}`

  // const database = await orbitdb.open(dbName, { type: databaseType })
  const database = await orbitdb.open(dbName, config.dbConfig);

  console.log(`   ✅ Created database: ${database.address}`);

  // Step 4: Sort entries by clock time and import them
  console.log("📥 Step 4: Importing entries in chronological order...");

  // Sort by clock time to maintain order
  logEntries.sort((a, b) => {
    const timeA = a.content.clock?.time || 0;
    const timeB = b.content.clock?.time || 0;
    return timeA - timeB;
  });

  let importedCount = 0;
  const importErrors = [];

  for (const entry of logEntries) {
    try {
      await importEntryByType(database, entry, databaseType);
      importedCount++;
      console.log(`   ✅ Imported entry ${importedCount}/${logEntries.length}`);
    } catch (error) {
      importErrors.push({ entry: entry.hash, error: error.message });
      console.warn(
        `   ⚠️ Failed to import entry ${entry.hash.slice(0, 12)}...: ${error.message}`,
      );
    }
  }

  console.log(
    `   📊 Import complete: ${importedCount}/${logEntries.length} entries imported`,
  );

  if (importErrors.length > 0) {
    console.warn(`   ⚠️ ${importErrors.length} import errors occurred`);
  }

  // Create fallback metadata
  const metadata = {
    type: "fallback-reconstruction",
    databaseType: databaseType,
    originalEntryCount: logEntries.length,
    importedEntryCount: importedCount,
    reconstructedAt: new Date().toISOString(),
    address: database.address.toString(),
    name: dbName,
    importErrors: importErrors.length,
  };

  return {
    database,
    metadata,
    entriesCount: importedCount,
  };
}

/**
 * Infer database type from payload patterns
 *
 * @param {Array} logEntries - Array of log entries
 * @returns {string} - Inferred database type
 */
function inferDatabaseType(logEntries) {
  const payloadPatterns = {
    hasDocumentOps: 0,
    hasKeyValueOps: 0,
    hasSimplePayloads: 0,
    hasCounterOps: 0,
  };

  for (const entry of logEntries) {
    const payload = entry.payload;

    if (payload && typeof payload === "object") {
      // Check for document/keyvalue operation patterns
      if ((payload.op === "PUT" || payload.op === "DEL") && payload.key) {
        if (payload.key.startsWith("_id") || (payload.op === "PUT" && payload.value && payload.value._id)) {
          payloadPatterns.hasDocumentOps++;
        } else {
          payloadPatterns.hasKeyValueOps++;
        }
      } else if (payload.op === "COUNTER" || payload.op === "DEC") {
        payloadPatterns.hasCounterOps++;
      } else if (payload.op === "ADD") {
        // Explicit ADD operation for events
        payloadPatterns.hasSimplePayloads++;
      } else {
        // Complex object without operation structure - likely events
        payloadPatterns.hasSimplePayloads++;
      }
    } else {
      // Simple payload (string, number, etc.) - likely events
      payloadPatterns.hasSimplePayloads++;
    }
  }

  console.log("   📊 Payload analysis:", payloadPatterns);

  // Determine type based on majority pattern
  if (payloadPatterns.hasCounterOps > 0) {
    return "counter";
  } else if (
    payloadPatterns.hasDocumentOps > payloadPatterns.hasKeyValueOps &&
    payloadPatterns.hasDocumentOps > payloadPatterns.hasSimplePayloads
  ) {
    return "documents";
  } else if (
    payloadPatterns.hasKeyValueOps > payloadPatterns.hasSimplePayloads
  ) {
    return "keyvalue";
  } else {
    return "events"; // Default fallback
  }
}

/**
 * Import a log entry into the appropriate database type
 *
 * @param {Object} database - Target OrbitDB database
 * @param {Object} entry - Log entry to import
 * @param {string} databaseType - Database type
 */
async function importEntryByType(database, entry, databaseType) {
  const payload = entry.payload;

  switch (databaseType) {
    case "events":
      // Events databases are append-only, only support ADD operations
      if (payload && payload.op === "ADD") {
        await database.add(payload.value || payload);
      } else {
        // Fallback: treat any payload as an event to add
        await database.add(payload);
      }
      break;

    case "documents":
      if (payload && payload.op === "PUT" && payload.value) {
        await database.put(payload.value);
      } else if (payload && payload.op === "DEL" && payload.key) {
        // Delete document by key (usually _id)
        await database.del(payload.key);
      } else if (payload && typeof payload === "object") {
        // Fallback: treat as document even without operation structure
        await database.put(payload);
      } else {
        throw new Error("Invalid document payload structure");
      }
      break;

    case "keyvalue":
      if (
        payload &&
        payload.op === "PUT" &&
        payload.key &&
        payload.value !== undefined
      ) {
        await database.put(payload.key, payload.value); // Use put for keyvalue, not set
      } else if (payload && payload.op === "DEL" && payload.key) {
        // Delete by key
        await database.del(payload.key);
      } else {
        throw new Error("Invalid keyvalue payload structure");
      }
      break;

    case "counter":
      if (payload && payload.op === "COUNTER") {
        await database.inc(payload.value || 1);
      } else if (payload && payload.op === "DEC") {
        // Decrement operation (negative increment)
        await database.inc(-(payload.value || 1));
      } else {
        // Fallback: try to increment by 1
        await database.inc(1);
      }
      break;

    default:
      throw new Error(`Unsupported database type: ${databaseType}`);
  }
}

// Export all utilities
export {
  cleanupOrbitDBDirectories,
  createHeliaOrbitDB,
  initializeStorachaClient,
};
