#!/usr/bin/env node

import * as Principal from "@le-space/ucanto-principal";
import { delegate } from "@le-space/ucanto-client";

console.log("Testing P256 with real-world delegation pattern...");

async function testDelegation() {
  try {
    // Create a P256 signer and verifier (like your app would)
    const issuer = await Principal.P256.generate();
    const audience = await Principal.P256.generate();

    console.log("Issuer DID:", issuer.did());
    console.log("Audience DID:", audience.verifier.did());

    // Create a delegation with various parameter combinations
    console.log("\nTesting basic delegation...");

    const delegation1 = await delegate({
      issuer,
      audience: audience.verifier,
      capabilities: [{ can: "store/add", with: "did:key:test" }],
      expiration: Math.floor(Date.now() / 1000) + 3600,
    });

    console.log("✓ Basic delegation succeeded");

    // Test with optional parameters that might be undefined
    console.log("Testing delegation with optional parameters...");

    const optionalParams = {
      nonce: undefined,
      notBefore: undefined,
      facts: [],
    };

    const delegation2 = await delegate({
      issuer,
      audience: audience.verifier,
      capabilities: [{ can: "space/blob/add", with: "did:key:test" }],
      expiration: Math.floor(Date.now() / 1000) + 3600,
      ...optionalParams,
    });

    console.log("✓ Delegation with optional params succeeded");

    // Test with proofs (empty array)
    console.log("Testing delegation with empty proofs...");

    const delegation3 = await delegate({
      issuer,
      audience: audience.verifier,
      capabilities: [{ can: "upload/add", with: "did:key:test" }],
      expiration: Math.floor(Date.now() / 1000) + 3600,
      proofs: [],
    });

    console.log("✓ Delegation with empty proofs succeeded");

    // Test chained delegations
    console.log("Testing chained delegation...");

    const delegation4 = await delegate({
      issuer: audience,
      audience: issuer.verifier,
      capabilities: [{ can: "store/add", with: "did:key:test" }],
      expiration: Math.floor(Date.now() / 1000) + 3600,
      proofs: [delegation1],
    });

    console.log("✓ Chained delegation succeeded");

    console.log("\n🎉 All P256 delegation tests passed!");
    console.log("P256 is fully supported in ucanto delegation!");
  } catch (error) {
    console.error("❌ ERROR:", error.message);
    console.error("Stack:", error.stack);

    if (
      error.message.includes("undefined") &&
      error.message.includes("IPLD Data Model")
    ) {
      console.log("\n🔍 This is the undefined encoding error!");
      console.log("The error might be caused by:");
      console.log("1. Capabilities with undefined properties");
      console.log("2. Facts array with undefined values");
      console.log(
        "3. Optional parameters like nonce/notBefore being undefined",
      );
      console.log("4. Proofs containing undefined values");
    }
  }
}

testDelegation();
