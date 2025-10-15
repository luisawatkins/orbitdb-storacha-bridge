#!/usr/bin/env node

import * as Principal from "@le-space/ucanto-principal";
import { delegate } from "@le-space/ucanto-client";

// Create a mock Storacha agent that might have undefined properties
class MockStorachaAgent {
  constructor() {
    this.mockUndefinedProperty = undefined; // This could cause the issue
    this.signatureAlgorithm = "ES256";
  }

  did() {
    return "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK";
  }

  async sign(payload) {
    // Mock sign implementation
    return { code: 1, raw: new Uint8Array(64) };
  }
}

console.log("Testing storacha agent undefined properties...");

async function testWithMockAgent() {
  try {
    console.log("Creating mock Storacha agent with undefined property...");
    const mockAgent = new MockStorachaAgent();

    console.log("Mock agent properties:");
    for (const key in mockAgent) {
      console.log(`  ${key}:`, mockAgent[key]);
    }

    console.log("\nTesting if mock agent causes undefined error...");

    const audience = await Principal.P256.generate();

    console.log("Calling delegate with mock agent as issuer...");

    const delegation = await delegate({
      issuer: mockAgent,
      audience: audience.verifier,
      capabilities: [{ can: "store/add", with: "did:key:test" }],
      expiration: Math.floor(Date.now() / 1000) + 3600,
    });

    console.log("✅ Success with mock agent");
  } catch (error) {
    console.error("❌ Error with mock agent:", error.message);
    if (
      error.message.includes("undefined") &&
      error.message.includes("IPLD Data Model")
    ) {
      console.log("\n🎯 This is likely the same error you're experiencing!");
      console.log(
        "The issue is probably that the storachaClient.agent has undefined properties.",
      );
    }
  }
}

// Test with a clean agent (no undefined properties)
async function testWithCleanAgent() {
  try {
    console.log("\nTesting with clean agent (no undefined properties)...");
    const cleanIssuer = await Principal.P256.generate();
    const audience = await Principal.P256.generate();

    console.log("Calling delegate with clean issuer...");

    const delegation = await delegate({
      issuer: cleanIssuer,
      audience: audience.verifier,
      capabilities: [{ can: "store/add", with: "did:key:test" }],
      expiration: Math.floor(Date.now() / 1000) + 3600,
    });

    console.log("✅ Success with clean agent");
  } catch (error) {
    console.error("❌ Unexpected error with clean agent:", error.message);
  }
}

testWithMockAgent().then(() => testWithCleanAgent());
