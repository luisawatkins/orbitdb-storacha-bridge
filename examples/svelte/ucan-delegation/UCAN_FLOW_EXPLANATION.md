# UCAN Cross-Algorithm Delegation Flow

## Scenario
- **Alice**: Has Storacha account with EdDSA keys
- **Bob**: Has WebAuthn identity with P-256 keys

## Step 1: Alice Creates Delegation (EdDSA signed)
```javascript
// Alice's delegation UCAN (signed with EdDSA)
const delegation = {
  iss: "did:key:z6Mk...alice-eddsa-key",     // Alice's EdDSA DID
  aud: "did:key:zDna...bob-p256-key",        // Bob's P-256 DID  
  att: [{ with: "did:key:z6Mk...space", can: "space/blob/add" }],
  exp: 1234567890,
  signature: "...alice-eddsa-signature..."   // Alice signs with EdDSA
}
```

## Step 2: Bob Uses Delegation (P-256 signed)
When Bob wants to upload to Storacha:

```javascript
// Bob creates an invocation UCAN (signed with P-256)
const invocation = {
  iss: "did:key:zDna...bob-p256-key",        // Bob's P-256 DID
  aud: "did:web:upload.web3.storage",        // Storacha service
  att: [{ with: "did:key:z6Mk...space", can: "space/blob/add" }],
  prf: [delegation],                         // Alice's delegation as proof!
  signature: "...bob-p256-signature..."      // Bob signs with P-256
}
```

## Verification Process
1. **Storacha receives Bob's invocation**
2. **Verifies Bob's P-256 signature** on the invocation
3. **Verifies Alice's EdDSA signature** on the delegation proof
4. **Checks the chain**: Alice has space access → Alice delegated to Bob → Bob is invoking

## Result
✅ **Bob successfully uses Storacha with his P-256 WebAuthn identity!**

The delegation allows cross-algorithm authentication chains.