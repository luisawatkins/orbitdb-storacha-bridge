// Debug script to identify the undefined value causing IPLD encoding error

async function debugDelegation() {
  console.log("🔍 Debugging delegation creation...");

  // Mock objects to simulate the error condition
  const mockStorachaClient = {
    agent: { did: () => "did:key:alice123" },
    currentSpace: () => null, // This returns null, causing the issue
  };


  try {
    console.log(
      "📊 Checking currentSpace result:",
      mockStorachaClient.currentSpace(),
    );
    console.log(
      "📊 Optional chaining result:",
      mockStorachaClient.currentSpace()?.did(),
    );

    // This is what's happening in the capabilities array
    const spaceDID = mockStorachaClient.currentSpace()?.did() || "ucan:*";
    console.log("📊 Space DID with fallback:", spaceDID);

    // Test the actual capabilities array that's causing problems
    const capabilities = [
      {
        with: mockStorachaClient.currentSpace()?.did() || "ucan:*",
        can: "space/blob/add",
      },
    ];

    console.log(
      "📊 Capabilities array:",
      JSON.stringify(capabilities, null, 2),
    );

    // Check for undefined values
    const hasUndefined = JSON.stringify(capabilities).includes("undefined");
    console.log("❓ Contains undefined:", hasUndefined);
  } catch (error) {
    console.error("❌ Debug error:", error.message);
  }
}

debugDelegation();
