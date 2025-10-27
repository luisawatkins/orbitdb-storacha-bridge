/**
 * OrbitDB Storacha Bridge - Utility Functions
 *
 * Common utility functions for OrbitDB operations and cleanup
 */

import { createLibp2p } from "libp2p";
import { identify } from "@libp2p/identify";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { tcp } from "@libp2p/tcp";
import { gossipsub } from "@chainsafe/libp2p-gossipsub";
import { createHelia } from "helia";
import { createOrbitDB } from "@orbitdb/core";
import { LevelBlockstore } from "blockstore-level";
import { LevelDatastore } from "datastore-level";
import logger from "./logger.js";

/**
 * Clean up OrbitDB directories
 */
export async function cleanupOrbitDBDirectories() {
  const fs = await import("fs");

  try {
    const entries = await fs.promises.readdir(".", { withFileTypes: true });
    const orbitdbDirs = entries.filter(
      (entry) =>
        entry.isDirectory() &&
        (entry.name.startsWith("orbitdb-bridge-") ||
          entry.name.includes("orbitdb-bridge-")),
    );

    for (const dir of orbitdbDirs) {
      try {
        await fs.promises.rm(dir.name, { recursive: true, force: true });
        logger.info(`Cleaned up: ${dir.name}`);
      } catch (error) {
        console.warn(`⚠️ Could not clean up ${dir.name}: ${error.message}`);
      }
    }

    if (orbitdbDirs.length === 0) {
      logger.info("No OrbitDB directories to clean up");
    } else {
      console.log(`🧹 Cleaned up ${orbitdbDirs.length} OrbitDB directories`);
    }
  } catch (error) {
    console.warn(`⚠️ Cleanup warning: ${error.message}`);
  }
}


/**
 * Create a Helia/OrbitDB instance with specified suffix
 */
export async function createHeliaOrbitDB(suffix = "") {
  const libp2p = await createLibp2p({
    addresses: {
      listen: ["/ip4/0.0.0.0/tcp/0"],
    },
    transports: [tcp()],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    services: {
      identify: identify(),
      pubsub: gossipsub({ allowPublishToZeroTopicPeers: true }),
    },
  });

  const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  const blockstore = new LevelBlockstore(
    `./orbitdb-bridge-${uniqueId}${suffix}`,
  );
  const datastore = new LevelDatastore(
    `./orbitdb-bridge-${uniqueId}${suffix}-data`,
  );

  const helia = await createHelia({ libp2p, blockstore, datastore });
  const orbitdb = await createOrbitDB({ ipfs: helia });

  return { helia, orbitdb, libp2p, blockstore, datastore };
}
