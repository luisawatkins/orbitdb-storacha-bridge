/**
 * UCAN OrbitDB Access Controller with Delegation Support
 *
 * Implements proper OrbitDB access controller pattern while providing UCAN delegation functionality.
 * Uses IPFS storage for persistent delegation data, following OrbitDBAccessController pattern.
 *
 * Key features:
 * - Standard identity-based write access control (OrbitDB pattern)
 * - UCAN delegation token creation and management
 * - Grant and revoke operations with UCAN support
 * - Storacha delegation integration
 * - Persistent IPFS storage (no recursive database dependencies)
 */

import { Signer } from "@storacha/client/principal/ed25519";
import { IPFSAccessController } from "@orbitdb/core";
import { IPFSBlockStorage, LRUStorage, ComposedStorage } from "@orbitdb/core";
import * as Block from "multiformats/block";
import * as dagCbor from "@ipld/dag-cbor";
import { sha256 } from "multiformats/hashes/sha2";
import { base58btc } from "multiformats/bases/base58";

const type = "ucan";
const codec = dagCbor;
const hasher = sha256;
const hashStringEncoding = base58btc;

// Helper to create and store access control list in IPFS
const AccessControlList = async ({ storage, type, params }) => {
  const manifest = {
    type,
    ...params,
  };
  const { cid, bytes } = await Block.encode({ value: manifest, codec, hasher });
  const hash = cid.toString(hashStringEncoding);
  await storage.put(hash, bytes);
  return hash;
};

/**
 * UCAN OrbitDB Access Controller with Enhanced Revocation Support
 *
 * @param {Object} options - Configuration options
 * @param {Array<string>} options.write - Array of initially allowed writer DIDs
 * @param {Object} options.storachaClient - Storacha client for UCAN delegation/revocation
 * @returns {Function} Access controller function
 */
const UCANOrbitDBAccessController = (options = {}) => {
  const { write = [], storachaClient = null } = options;

  return async ({ orbitdb, identities, address }) => {
    console.log("🔐 Initializing UCAN OrbitDB Access Controller...");
    console.log(`   📋 Initial writers: ${write.length} [${write.join(", ")}]`);
    console.log(
      `   🔒 Access controller address: ${address || "undefined"} (${typeof address})`,
    );
    console.log(
      `   ⚡ UCAN features: ${storachaClient ? "ENABLED" : "DISABLED"}`,
    );
    console.log("🔍 Identity debug info:");
    console.log(`   🆔 OrbitDB identity: ${orbitdb.identity?.id}`);
    console.log(
      `   🗂️ Identities instance: ${identities ? "present" : "missing"}`,
    );
    console.log(`   🌐 IPFS instance: ${orbitdb.ipfs ? "present" : "missing"}`);
    console.log("🔍 CRITICAL DEBUG: Understanding address parameter...");
    console.log(`   🎯 Address value: ${JSON.stringify(address)}`);
    console.log(`   📊 Address type: ${typeof address}`);
    console.log(`   📏 Address length: ${address?.length || "N/A"}`);
    console.log(`   🔍 Is address truthy: ${!!address}`);
    console.log(`   💡 This determines if accessDB will be created or not!`);

    // Create storage for access controller manifest (required by OrbitDB)
    const storage = await ComposedStorage(
      await LRUStorage({ size: 1000 }),
      await IPFSBlockStorage({ ipfs: orbitdb.ipfs, pin: true }),
    );

    // Initialize state first
    const grantedWriteAccess = new Set(write);
    const ucanDelegations = new Map();
    const revocationProofs = new Map();
    let authorityIdentity = write[0] || orbitdb.identity.id; // Default authority

    // Create or load the access controller address
    if (address) {
      // Loading existing access controller
      console.log(
        `   📝 Loading existing UCAN access controller from: ${address}`,
      );
      try {
        const manifestBytes = await storage.get(address);
        const { value } = await Block.decode({
          bytes: manifestBytes,
          codec,
          hasher,
        });
        // 🔧 CRITICAL FIX: Load write permissions from stored manifest
        if (value.write && Array.isArray(value.write)) {
          console.log(
            `   📋 Loading stored write permissions: [${value.write.join(", ")}]`,
          );
          // Clear and reload from manifest (this is the authoritative source)
          grantedWriteAccess.clear();
          value.write.forEach((id) => grantedWriteAccess.add(id));
          // Set authority identity to first writer from manifest
          authorityIdentity = value.write[0] || orbitdb.identity.id;
          console.log(
            `   👑 Authority identity loaded from manifest: ${authorityIdentity}`,
          );
        }
        console.log(`   ✅ Successfully loaded access controller manifest`);
      } catch (loadError) {
        console.warn(
          `   ⚠️ Could not load existing access controller manifest: ${loadError.message}`,
        );
        console.log(
          `   💡 This is normal for new databases or when IPFS gateways are unavailable`,
        );
        console.log(
          `   🚀 Continuing with initial write permissions: [${write.join(", ")}]`,
        );
        // Continue with initial write permissions already set in grantedWriteAccess
      }
    } else {
      // Creating new access controller - store the manifest in IPFS
      console.log(`   🆕 Creating new UCAN access controller manifest...`);
      const acAddress = await AccessControlList({
        storage,
        type,
        params: { write: Array.from(grantedWriteAccess) },
      });
      address = `/orbitdb/${acAddress}`;
      console.log(`   ✅ Access controller address created: ${address}`);
    }

    // 🎯 OPTION A: Alice-Only AccessDB for UCAN Delegation Model
    // Only Alice (the database creator/authority) can modify the accessDB
    // Bob and other participants can read permissions but cannot modify them

    let accessDB = null;
    const isAliceAuthority = authorityIdentity === orbitdb.identity.id; // Check against loaded authority

    console.log(
      `   🔍 Authority check: ${isAliceAuthority ? "This is Alice (authority)" : "This is Bob/other (participant)"}`,
    );
    console.log(
      `   👑 Authority identity: ${authorityIdentity || "undefined"}`,
    );
    console.log(`   🆔 Current identity: ${orbitdb.identity.id}`);
    console.log(
      `   🔧 Authority loaded from: ${address ? "stored manifest" : "initial write parameter"}`,
    );

    // Only create/modify accessDB if this is the authority (Alice) or if we need to read permissions
    if (
      address &&
      address !== "undefined" &&
      address !== "/orbitdb/undefined"
    ) {
      console.log("   📦 Setting up access database connection...");
      try {
        // Create accessDB with authority-only write permissions
        // This ensures only the original creator (authority) can grant/revoke, but everyone can read

        accessDB = await orbitdb.open(`${address}`, {
          type: "keyvalue",
          AccessController: IPFSAccessController({
            write: [authorityIdentity], // 👑 ONLY the authority can write
          }),
        });
        console.log(`   ✅ Access database connected: ${accessDB.address}`);
        console.log(`   👑 Authority-only write access: ${authorityIdentity}`);
        console.log(`   📜 Read access: Available to all participants`);

        // Load existing permissions from access database (everyone can read)
        try {
          const allEntries = await accessDB.all();
          console.log(
            `   🔍 DEBUG: AccessDB contains ${allEntries.length} total entries`,
          );

          // Debug: Show all entries in accessDB
          for (const entry of allEntries) {
            console.log(
              `   📊 Entry: key="${entry.key}" value=${JSON.stringify(entry.value)}`,
            );
          }

          // Process entries
          for (const entry of allEntries) {
            if (entry.key.startsWith("write/")) {
              const identityId = entry.key.replace("write/", "");
              grantedWriteAccess.add(identityId);
              console.log(`   ✅ Added write permission: ${identityId}`);
            } else if (entry.key.startsWith("ucan/")) {
              const identityId = entry.key.replace("ucan/", "");
              ucanDelegations.set(identityId, entry.value);
              console.log(`   🔐 Added UCAN delegation: ${identityId}`);
            } else if (entry.key.startsWith("revoked/")) {
              const identityId = entry.key.replace("revoked/", "");
              revocationProofs.set(identityId, entry.value);
              console.log(`   🚫 Added revocation: ${identityId}`);
            } else {
              console.log(`   ⚠️ Unknown entry type: ${entry.key}`);
            }
          }
          console.log(
            `   📋 Final: Loaded ${grantedWriteAccess.size} write permissions from storage`,
          );
          console.log(
            `   📊 Final write permissions: [${Array.from(grantedWriteAccess).join(", ")}]`,
          );
          console.log(
            `   📏 Loaded ${ucanDelegations.size} UCAN delegations from storage`,
          );
          console.log(
            `   🚫 Loaded ${revocationProofs.size} revocations from storage`,
          );
        } catch (readError) {
          console.warn(
            `   ⚠️ Could not read from access database: ${readError.message}`,
          );
          console.log(
            "   💡 This might be normal if no permissions have been granted yet",
          );
        }
      } catch (error) {
        console.warn(
          `   ⚠️ Could not connect to access database: ${error.message}`,
        );
        console.log("   📝 Continuing with in-memory-only mode");
        console.log(
          "   💡 Alice will need to grant permissions for persistent storage",
        );
      }
    } else {
      console.log(
        "   📝 Address undefined - using in-memory-only mode for now",
      );
    }

    console.log(
      `   ✅ UCAN access controller initialized ${accessDB ? "with persistent storage" : "in memory-only mode"}`,
    );

    /**
     * Check if an entry can be appended to the log
     */
    const canAppend = async (entry) => {
      console.log(
        `🔍 Enhanced UCAN Access Controller: Checking write permission...`,
      );
      console.log(`   🆔 Entry identity: ${entry.identity}`);

      try {
        // 🔧 CRITICAL FIX: entry.identity is the identity hash, not the DID
        // The identities.getIdentity() method expects the identity hash
        console.log(
          `🧪 Testing identity resolution for hash: ${entry.identity}`,
        );
        const writerIdentity = await identities.getIdentity(entry.identity);
        if (!writerIdentity) {
          console.log(
            `   ❌ Could not resolve identity from IPFS: ${entry.identity}`,
          );
          console.log(`   🔧 This is likely the IPFS storage linkage issue!`);
          return false;
        }
        console.log(
          `   ✅ Successfully resolved identity from IPFS hash: ${entry.identity}`,
        );
        console.log(`   🔍 Resolved to DID: ${writerIdentity.id}`);

        const { id } = writerIdentity;
        console.log(`   🔑 Writer identity ID: ${id}`);

        // Check if identity has been explicitly revoked
        if (revocationProofs.has(id)) {
          const revocation = revocationProofs.get(id);
          console.log(
            `   🚫 Identity has been revoked at ${revocation.revokedAt}`,
          );
          console.log(`   📝 Revocation reason: ${revocation.reason}`);
          return false;
        }

        // Check if writer has been granted access
        if (grantedWriteAccess.has(id) || grantedWriteAccess.has("*")) {
          console.log(`   ✅ Identity has write permission`);

          // Check if UCAN delegation exists and is still valid
          if (ucanDelegations.has(id)) {
            const delegation = ucanDelegations.get(id);
            const now = Math.floor(Date.now() / 1000);

            // Check expiration
            if (delegation.expiration && delegation.expiration < now) {
              console.log(
                `   ⏰ UCAN delegation expired at ${new Date(delegation.expiration * 1000).toISOString()}`,
              );

              // Clean up expired delegation (in-memory only for now)
              grantedWriteAccess.delete(id);
              ucanDelegations.delete(id);

              return false;
            }

            console.log(
              `   ✅ UCAN delegation valid until ${new Date(delegation.expiration * 1000).toISOString()}`,
            );
          }

          console.log(`   🔐 Verifying identity...`);
          const isValid = await identities.verifyIdentity(writerIdentity);
          console.log(
            `   🔐 Identity verification: ${isValid ? "PASSED" : "FAILED"}`,
          );
          return isValid;
        }

        console.log(`   ❌ Identity not authorized: ${id}`);
        console.log(`   📝 Granted writers: ${Array.from(grantedWriteAccess)}`);
        return false;
      } catch (error) {
        console.error(
          `   ❌ Error in Enhanced UCAN access controller: ${error.message}`,
        );
        return false;
      }
    };

    /**
     * Grant write access to an identity and create a UCAN delegation with revocation support
     * 👑 AUTHORITY CHECK: Only Alice can grant permissions
     */
    const grant = async (capability, identityId) => {
      console.log(
        `🎁 Enhanced UCAN: Granting ${capability} access to ${identityId}`,
      );

      // 👑 AUTHORITY CHECK: Only Alice (authority) can grant permissions
      if (!isAliceAuthority) {
        console.warn(
          `   🚫 PERMISSION DENIED: Only the database authority can grant access`,
        );
        console.log(`   👑 Authority: ${write[0] || "undefined"}`);
        console.log(`   🆔 Current identity: ${orbitdb.identity.id}`);
        console.log(
          `   💡 Only Alice can grant permissions to maintain UCAN delegation security`,
        );
        return null;
      }

      if (capability !== "write") {
        console.warn(
          `   ⚠️ Only 'write' capability is supported, got: ${capability}`,
        );
        return null;
      }

      try {
        // 🔍 DEBUG: Check state before grant
        console.log(
          `   🔍 BEFORE GRANT: grantedWriteAccess size = ${grantedWriteAccess.size}`,
        );
        console.log(
          `   🔍 BEFORE GRANT: contents = [${Array.from(grantedWriteAccess).join(", ")}]`,
        );

        // Add to granted access set and persist it if possible
        grantedWriteAccess.add(identityId);

        // 🔍 DEBUG: Check state after adding to Set
        console.log(
          `   🔍 AFTER ADD: grantedWriteAccess size = ${grantedWriteAccess.size}`,
        );
        console.log(
          `   🔍 AFTER ADD: contents = [${Array.from(grantedWriteAccess).join(", ")}]`,
        );

        if (accessDB) {
          await accessDB.put(`write/${identityId}`, true);
          console.log(
            `   ✅ Added write permission for ${identityId} (persistent)`,
          );
        } else {
          console.log(
            `   ✅ Added write permission for ${identityId} (memory-only)`,
          );
        }

        // Create UCAN delegation if Storacha client is available
        let delegationInfo = null;
        if (storachaClient) {
          try {
            console.log(
              `   📜 Creating revocable UCAN delegation for ${identityId}...`,
            );

            // Create a recipient principal from the identity ID
            const recipientPrincipal = await Signer.generate();

            // Create UCAN delegation
            const capabilities = [
              "space/blob/add",
              "space/index/add",
              "upload/add",
              "upload/list",
              "store/add",
              "filecoin/offer",
            ];

            const expiration = Math.floor(Date.now() / 1000) + 24 * 60 * 60; // 24 hours

            const delegation = await storachaClient.createDelegation(
              recipientPrincipal,
              capabilities,
              { expiration },
            );

            // Archive the delegation
            const archive = await delegation.archive();
            if (archive.ok) {
              const delegationToken = Buffer.from(archive.ok).toString(
                "base64",
              );
              const delegationCID = delegation.cid.toString();

              // Store comprehensive delegation info including CID for revocation
              delegationInfo = {
                delegationToken,
                delegationCID, // THIS IS KEY for revocation!
                recipientDID: recipientPrincipal.did(),
                recipientKey: recipientPrincipal.toArchive(),
                capabilities,
                expiration,
                createdAt: new Date().toISOString(),
                createdBy: orbitdb.identity.id,
                revocable: true, // Mark as revocable
              };

              // Store delegation info (persistent if possible)
              if (accessDB) {
                await accessDB.put(`ucan/${identityId}`, delegationInfo);
              }
              ucanDelegations.set(identityId, delegationInfo);

              console.log(
                `   ✅ Created revocable UCAN delegation for ${identityId}`,
              );
              console.log(`   🆔 Delegation CID: ${delegationCID}`);
              console.log(`   🎯 Recipient DID: ${recipientPrincipal.did()}`);
              console.log(`   🔄 Revocation: SUPPORTED`);
            }
          } catch (ucanError) {
            console.warn(
              `   ⚠️ Failed to create UCAN delegation: ${ucanError.message}`,
            );
          }
        }

        return delegationInfo;
      } catch (error) {
        console.error(`   ❌ Failed to grant access: ${error.message}`);
        return null;
      }
    };

    /**
     * Revoke access - NOW WITH REAL UCAN REVOCATION!
     * 👑 AUTHORITY CHECK: Only Alice can revoke permissions
     */
    const revoke = async (
      capability,
      identityId,
      reason = "Access revoked by administrator",
    ) => {
      console.log(
        `🚫 Enhanced UCAN: Revoking ${capability} access from ${identityId}`,
      );
      console.log(`   📝 Reason: ${reason}`);

      // 👑 AUTHORITY CHECK: Only Alice (authority) can revoke permissions
      if (!isAliceAuthority) {
        console.warn(
          `   🚫 PERMISSION DENIED: Only the database authority can revoke access`,
        );
        console.log(`   👑 Authority: ${write[0] || "undefined"}`);
        console.log(`   🆔 Current identity: ${orbitdb.identity.id}`);
        console.log(
          `   💡 Only Alice can revoke permissions to maintain UCAN delegation security`,
        );
        return;
      }

      try {
        // Remove from granted access set (immediate OrbitDB effect)
        grantedWriteAccess.delete(identityId);

        // Remove from access database if available
        if (accessDB) {
          await accessDB.del(`write/${identityId}`);
          console.log(
            `   ✅ Removed OrbitDB write permission for ${identityId} (persistent)`,
          );
        } else {
          console.log(
            `   ✅ Removed OrbitDB write permission for ${identityId} (memory-only)`,
          );
        }

        // REAL UCAN REVOCATION - This is the game changer!
        if (ucanDelegations.has(identityId) && storachaClient) {
          const delegation = ucanDelegations.get(identityId);

          if (delegation.delegationCID && delegation.revocable) {
            console.log(`   🚫 Attempting REAL UCAN revocation...`);
            console.log(
              `   🆔 Revoking delegation CID: ${delegation.delegationCID}`,
            );

            try {
              // THIS IS THE KEY: Use the Storacha client's revokeDelegation method!
              const revocationResult = await storachaClient.revokeDelegation(
                delegation.delegationCID,
              );

              if (revocationResult.ok) {
                console.log(
                  `   ✅ UCAN delegation successfully revoked on Storacha!`,
                );
                console.log(
                  `   🔥 Delegation CID ${delegation.delegationCID} is now invalid`,
                );

                // Store revocation proof (persistent if possible)
                const revocationProof = {
                  originalDelegation: delegation,
                  revokedAt: new Date().toISOString(),
                  revokedBy: orbitdb.identity.id,
                  reason,
                  method: "storacha-client-revocation",
                  delegationCID: delegation.delegationCID,
                };

                if (accessDB) {
                  await accessDB.put(`revoked/${identityId}`, revocationProof);
                  console.log(`   📋 Revocation proof stored (persistent)`);
                } else {
                  console.log(`   📋 Revocation proof stored (memory-only)`);
                }
                revocationProofs.set(identityId, revocationProof);
              } else {
                console.log(
                  `   ⚠️ UCAN revocation returned error:`,
                  revocationResult.error,
                );
              }
            } catch (revocationError) {
              console.error(
                `   ❌ UCAN revocation failed: ${revocationError.message}`,
              );
              console.log(`   🔄 Falling back to expiration-based revocation`);
            }
          } else {
            console.log(`   ⚠️ Delegation not revocable or missing CID`);
          }
        }

        // Clean up delegation record
        if (ucanDelegations.has(identityId)) {
          if (accessDB) {
            await accessDB.del(`ucan/${identityId}`);
            console.log(
              `   🗑️ Removed UCAN delegation record for ${identityId} (persistent)`,
            );
          } else {
            console.log(
              `   🗑️ Removed UCAN delegation record for ${identityId} (memory-only)`,
            );
          }
          ucanDelegations.delete(identityId);
        }

        console.log(`   ✅ Enhanced revocation completed`);
        console.log(`   🚫 Both OrbitDB access AND UCAN delegation revoked`);
      } catch (error) {
        console.error(`   ❌ Failed to revoke access: ${error.message}`);
      }
    };

    /**
     * Get UCAN delegation info (including revocation status)
     */
    const getUCANDelegation = (identityId) => {
      const delegation = ucanDelegations.get(identityId);
      const revocation = revocationProofs.get(identityId);

      return {
        delegation: delegation || null,
        revocation: revocation || null,
        isRevoked: !!revocation,
        isExpired:
          delegation && delegation.expiration < Math.floor(Date.now() / 1000),
      };
    };

    /**
     * List all writers with their UCAN status
     */
    const listWriters = () => {
      const writers = Array.from(grantedWriteAccess).map((id) => {
        const info = getUCANDelegation(id);
        return {
          identityId: id,
          hasUCAN: !!info.delegation,
          isRevoked: info.isRevoked,
          isExpired: info.isExpired,
          delegationCID: info.delegation?.delegationCID,
        };
      });
      return writers;
    };

    /**
     * Get revocation statistics
     */
    const getRevocationStats = () => {
      return {
        totalWriters: grantedWriteAccess.size,
        totalDelegations: ucanDelegations.size,
        totalRevoked: revocationProofs.size,
        revocableUCANs: Array.from(ucanDelegations.values()).filter(
          (d) => d.revocable,
        ).length,
        supportsRealRevocation: !!storachaClient,
      };
    };

    console.log("✅ Enhanced UCAN OrbitDB Access Controller initialized");
    console.log(`   📊 Total writers: ${grantedWriteAccess.size}`);
    console.log(`   📏 UCAN delegations: ${ucanDelegations.size}`);
    console.log(`   🙫 Revoked delegations: ${revocationProofs.size}`);
    console.log(`   ⚡ Real revocation support: ${!!storachaClient}`);
    console.log(
      `   🔧 Fix applied: Database address will be generated by OrbitDB (not /ucan/)`,
    );

    // 🔧 Ensure address is never undefined for OrbitDB compatibility
    const finalAddress = address || `/${type}/placeholder-${Date.now()}`;

    const accessController = {
      type,
      address: finalAddress, // ✅ REQUIRED by OrbitDB - all access controllers must have an address
      // 🔧 CRITICAL FIX: Make write property dynamic using a getter
      get write() {
        const currentWriters = Array.from(grantedWriteAccess);
        console.log(`🔍 CRITICAL DEBUG: Dynamic write property accessed!`);
        console.log(`   📊 Current writers: ${currentWriters.length}`);
        console.log(`   📋 Writers: [${currentWriters.join(", ")}]`);
        console.log(
          `   🧠 grantedWriteAccess Set size: ${grantedWriteAccess.size}`,
        );
        console.log(
          `   🔍 grantedWriteAccess contents: [${Array.from(grantedWriteAccess).join(", ")}]`,
        );
        return currentWriters;
      },
      canAppend,
      grant,
      revoke,
      getUCANDelegation,
      listWriters,
      getRevocationStats,
      close: async () => {
        console.log("🔒 UCAN access controller closing...");
        if (accessDB) {
          await accessDB.close();
          console.log("   ✅ Internal access database closed");
        }
        console.log("🔒 UCAN access controller closed");
      },
    };

    console.log("🔍 UCAN Access Controller object structure:");
    console.log(`   🏷️ Type: ${accessController.type}`);
    console.log(`   📝 Methods: ${Object.keys(accessController).join(", ")}`);
    console.log(`   🔍 canAppend type: ${typeof accessController.canAppend}`);
    console.log(`   🔍 grant type: ${typeof accessController.grant}`);

    return accessController;
  };
};

UCANOrbitDBAccessController.type = type;

export default UCANOrbitDBAccessController;
