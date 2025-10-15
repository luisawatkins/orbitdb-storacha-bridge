#!/usr/bin/env node

import * as Principal from "@ucanto/principal";
import * as UCAN from "@ipld/dag-ucan";

console.log("Testing P256 support in UCAN.issue...");

try {
  // Create a P256 signer and verifier
  const signer = await Principal.P256.generate();
  const verifier = signer.verifier;

  console.log("Signer DID:", signer.did());
  console.log("Verifier DID:", verifier.did());
  console.log("Verifier type:", verifier.constructor.name);
  console.log("Verifier signatureAlgorithm:", verifier.signatureAlgorithm);

  // Test parsing the DID
  const { parse: parseDID } = await import("@ipld/dag-ucan/did");
  console.log("Parsing verifier DID...");
  const parsedAudience = parseDID(verifier.did());
  console.log("Parsed audience:", parsedAudience);
  console.log(
    "Parsed audience properties:",
    Object.getOwnPropertyNames(parsedAudience),
  );
  console.log("Parsed audience buffer length:", parsedAudience.byteLength);

  // Check if any properties are undefined
  for (const prop in parsedAudience) {
    if (parsedAudience[prop] === undefined) {
      console.log("WARNING: Found undefined property:", prop);
    }
  }

  // Try to format it back
  const { format: formatDID } = await import("@ipld/dag-ucan/did");
  console.log("Formatting back to DID:", formatDID(parsedAudience));

  console.log("\nTesting UCAN.issue...");

  const ucan = await UCAN.issue({
    issuer: signer,
    audience: verifier,
    capabilities: [{ can: "test/read", with: "test:example" }],
    lifetimeInSeconds: 3600,
  });

  console.log("SUCCESS: UCAN issued successfully!");
  console.log("UCAN CID would be:", (await UCAN.link(ucan)).toString());
} catch (error) {
  console.error("ERROR:", error);
  console.error("Stack:", error.stack);

  // If it's an IPLD error, let's see the problematic data
  if (
    error.message.includes("undefined") &&
    error.message.includes("IPLD Data Model")
  ) {
    console.log("\nThis is the undefined encoding error we expected.");
    console.log(
      "The issue is likely in the P256 verifier DID encoding or parsing.",
    );
  }
}
