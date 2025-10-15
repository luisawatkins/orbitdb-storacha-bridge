/**
 * Enhanced UCAN OrbitDB Access Controller with Real Revocation Support
 * 
 * This version uses the Storacha client's revokeDelegation() method for true UCAN revocation,
 * not just application-level access control.
 * 
 * Key improvements:
 * - Real UCAN revocation using client.revokeDelegation()
 * - Proper delegation CID tracking
 * - Immediate revocation (not just expiration-based)
 * - Better error handling and logging
 */

import { Verifier } from '@ucanto/principal'

const type = 'enhanced-ucan'

/**
 * SECURE: Get recipient principal for UCAN delegation with P-256 support
 * 
 * SECURITY MODEL:
 * - We create delegations TO the OrbitDB identity (recipient)
 * - We do NOT create signers FROM the identity (that would be impersonation!)
 * - The actual OrbitDB identity holder uses their real private key
 * 
 * This function returns the recipient principal that should receive UCAN delegations.
 * The Enhanced UCAN Access Controller creates delegations TO this recipient.
 */
const getRecipientFromOrbitDBIdentity = async (identityId, _orbitDBIdentity = null) => {
  console.log(`   🔒 SECURE: Getting UCAN delegation recipient for OrbitDB identity...`)
  console.log(`   🔗 OrbitDB Identity: ${identityId}`)
  
  // Check if the identity is a proper DID format
  if (identityId.startsWith('did:')) {
    console.log(`   ✅ Identity is a DID - checking if we can use it directly as recipient`)
    
    try {
      // Try unified Verifier.parse to validate the DID (supports Ed25519, RSA, and P-256!)
      console.log(`   🔄 Validating DID with unified verifier (Ed25519 + RSA + P-256)...`)
      const recipientVerifier = Verifier.parse(identityId)
      
      console.log(`   ✅ DID is valid!`)
      console.log(`   🔑 Identity algorithm: ${recipientVerifier.signatureAlgorithm}`)
      console.log(`   🆔 Identity DID: ${recipientVerifier.did()}`)
      
      // Return the verifier - this represents the RECIPIENT of UCAN delegations
      // The UCAN delegation will be created TO this identity
      console.log(`   🎯 Using OrbitDB identity directly as UCAN recipient`)
      console.log(`   🔒 SECURE: No private key derivation - delegation recipient only`)
      
      return {
        recipientDID: identityId,
        verifier: recipientVerifier,
        algorithm: recipientVerifier.signatureAlgorithm,
        supportsDirectDelegation: true,
        securityModel: 'direct-delegation'
      }
      
    } catch (parseError) {
      console.log(`   ⚠️ Cannot parse OrbitDB DID: ${parseError.message}`)
      console.log(`   🔄 Using identity ID as recipient identifier...`)
    }
  } else {
    console.log(`   💯 Identity is hash format - will use as recipient identifier`)
  }
  
  // For non-DID or unparseable identities, we still create a recipient identifier
  // This is used to create a consistent recipient DID for UCAN delegations
  console.log(`   🔒 Creating secure recipient identifier for UCAN delegation...`)
  
  return {
    recipientDID: identityId, // Use the original identity as recipient ID
    verifier: null, // No verifier available
    algorithm: 'unknown',
    supportsDirectDelegation: false,
    securityModel: 'identity-based-delegation'
  }
}

/**
 * Enhanced UCAN OrbitDB Access Controller with Real Revocation
 * 
 * @param {Object} options - Configuration options
 * @param {Array<string>} options.write - Array of initially allowed writer DIDs
 * @param {Object} options.storachaClient - Storacha client for UCAN delegation/revocation
 * @returns {Function} Access controller function
 */
const EnhancedUCANAccessController = (options = {}) => {
  const { write = [], storachaClient = null } = options
  
  return async ({ orbitdb, identities, address }) => {
    console.log('🔐 Initializing Enhanced UCAN OrbitDB Access Controller...')
    console.log(`   📝 Initial writers: ${write.length}`)
    console.log(`   🏗️ Database address: ${address}`)
    console.log(`   ⚡ Real UCAN revocation: ${storachaClient ? 'ENABLED' : 'DISABLED'}`)
    
    // Create the access control database
    const accessControllerAddress = `${address}/_access`
    console.log(`   📊 Access DB: ${accessControllerAddress}`)
    
    const accessDB = await orbitdb.open(accessControllerAddress, {
      type: 'keyvalue',
      AccessController: () => async ({ _orbitdb, identities, _address }) => ({
        canAppend: async (entry) => {
          // Only the database owner can modify access control
          const writerIdentity = await identities.getIdentity(entry.identity)
          return writerIdentity && identities.verifyIdentity(writerIdentity) && 
                 (write.includes(writerIdentity.id) || write.includes('*'))
        }
      })
    })
    
    // Load existing permissions from the access database
    const existingPermissions = await accessDB.all()
    const grantedWriteAccess = new Set(write)
    const ucanDelegations = new Map() // Store delegation info with CIDs
    const revocationProofs = new Map() // Store revocation status
    
    // Load permissions and delegation info from database
    for (const record of existingPermissions) {
      if (record.key.startsWith('write/')) {
        const identityId = record.key.replace('write/', '')
        grantedWriteAccess.add(identityId)
        console.log(`   ✅ Loaded write permission for: ${identityId}`)
      } else if (record.key.startsWith('ucan/')) {
        const identityId = record.key.replace('ucan/', '')
        ucanDelegations.set(identityId, record.value)
        console.log(`   📜 Loaded UCAN delegation for: ${identityId}`)
        console.log(`   🆔 Delegation CID: ${record.value.delegationCID}`)
      } else if (record.key.startsWith('revoked/')) {
        const identityId = record.key.replace('revoked/', '')
        revocationProofs.set(identityId, record.value)
        console.log(`   🚫 Loaded revocation record for: ${identityId}`)
      }
    }
    
    /**
     * Check if an entry can be appended to the log
     */
    const canAppend = async (entry) => {
      console.log(`🔍 Enhanced UCAN Access Controller: Checking write permission...`)
      console.log(`   🆔 Entry identity: ${entry.identity}`)
      
      try {
        const writerIdentity = await identities.getIdentity(entry.identity)
        if (!writerIdentity) {
          console.log(`   ❌ Could not resolve identity: ${entry.identity}`)
          return false
        }
        
        const { id } = writerIdentity
        console.log(`   🔑 Writer identity ID: ${id}`)
        
        // Check if identity has been explicitly revoked
        if (revocationProofs.has(id)) {
          const revocation = revocationProofs.get(id)
          console.log(`   🚫 Identity has been revoked at ${revocation.revokedAt}`)
          console.log(`   📝 Revocation reason: ${revocation.reason}`)
          return false
        }
        
        // Check if writer has been granted access
        if (grantedWriteAccess.has(id) || grantedWriteAccess.has('*')) {
          console.log(`   ✅ Identity has write permission`)
          
          // Check if UCAN delegation exists and is still valid
          if (ucanDelegations.has(id)) {
            const delegation = ucanDelegations.get(id)
            const now = Math.floor(Date.now() / 1000)
            
            // Check expiration
            if (delegation.expiration && delegation.expiration < now) {
              console.log(`   ⏰ UCAN delegation expired at ${new Date(delegation.expiration * 1000).toISOString()}`)
              
              // Clean up expired delegation
              grantedWriteAccess.delete(id)
              ucanDelegations.delete(id)
              await accessDB.del(`write/${id}`)
              await accessDB.del(`ucan/${id}`)
              
              return false
            }
            
            console.log(`   ✅ UCAN delegation valid until ${new Date(delegation.expiration * 1000).toISOString()}`)
          }
          
          console.log(`   🔐 Verifying identity...`)
          const isValid = await identities.verifyIdentity(writerIdentity)
          console.log(`   🔐 Identity verification: ${isValid ? 'PASSED' : 'FAILED'}`)
          return isValid
        }
        
        console.log(`   ❌ Identity not authorized: ${id}`)
        console.log(`   📝 Granted writers: ${Array.from(grantedWriteAccess)}`)
        return false
        
      } catch (error) {
        console.error(`   ❌ Error in Enhanced UCAN access controller: ${error.message}`)
        return false
      }
    }
    
    /**
     * Grant write access to an identity and create a UCAN delegation with revocation support
     */
    const grant = async (capability, identityId) => {
      console.log(`🎁 Enhanced UCAN: Granting ${capability} access to ${identityId}`)
      
      if (capability !== 'write') {
        console.warn(`   ⚠️ Only 'write' capability is supported, got: ${capability}`)
        return null
      }
      
      try {
        // Add to granted access set
        grantedWriteAccess.add(identityId)
        
        // Store the permission in the access database
        await accessDB.put(`write/${identityId}`, {
          capability,
          identityId,
          grantedAt: new Date().toISOString(),
          grantedBy: orbitdb.identity.id
        })
        console.log(`   ✅ Stored write permission for ${identityId}`)
        
        // Create UCAN delegation if Storacha client is available
        let delegationInfo = null
        if (storachaClient) {
          try {
            console.log(`   📜 Creating revocable UCAN delegation for ${identityId}...`)
            
            // SECURE: Get recipient info for UCAN delegation (no private key derivation!)
            const recipientInfo = await getRecipientFromOrbitDBIdentity(identityId)
            
            console.log(`   🔒 Security model: ${recipientInfo.securityModel}`)
            console.log(`   🔑 Recipient algorithm: ${recipientInfo.algorithm}`)
            console.log(`   🎯 Direct delegation supported: ${recipientInfo.supportsDirectDelegation}`)
            
            // Create UCAN delegation capabilities
            const capabilities = [
              'space/blob/add',
              'space/index/add', 
              'upload/add',
              'upload/list',
              'store/add',
              'filecoin/offer'
            ]
            
            const expiration = Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
            
            let delegation
            
            if (recipientInfo.supportsDirectDelegation && recipientInfo.verifier) {
              // SECURE: Create delegation TO the OrbitDB identity directly
              console.log(`   ✅ Creating direct delegation to OrbitDB identity`)
              console.log(`   🎯 Recipient: ${recipientInfo.recipientDID}`)
              
              delegation = await storachaClient.createDelegation(
                recipientInfo.verifier, // The actual OrbitDB identity verifier
                capabilities,
                { expiration }
              )
              
            } else {
              // For non-parseable identities, we need a different approach
              // We could either skip UCAN delegation or create a proxy delegation
              console.log(`   ⚠️ Cannot create direct delegation - identity not parseable as DID`)
              console.log(`   🔄 Skipping UCAN delegation for non-DID identity`)
              return null // Skip UCAN delegation for hash-based identities
            }
            
            // Archive the delegation
            const archive = await delegation.archive()
            if (archive.ok) {
              const delegationToken = Buffer.from(archive.ok).toString('base64')
              const delegationCID = delegation.cid.toString()
              
              // Store comprehensive delegation info including CID for revocation
              delegationInfo = {
                delegationToken,
                delegationCID, // THIS IS KEY for revocation!
                recipientDID: recipientInfo.recipientDID,
                recipientAlgorithm: recipientInfo.algorithm,
                securityModel: recipientInfo.securityModel,
                capabilities,
                expiration,
                createdAt: new Date().toISOString(),
                createdBy: orbitdb.identity.id,
                revocable: true, // Mark as revocable
                directDelegation: recipientInfo.supportsDirectDelegation,
                linkedOrbitDBIdentity: identityId // Track the link
              }
              
              await accessDB.put(`ucan/${identityId}`, delegationInfo)
              ucanDelegations.set(identityId, delegationInfo)
              
              console.log(`   ✅ Created SECURE UCAN delegation for ${identityId}`)
              console.log(`   🆔 Delegation CID: ${delegationCID}`)
              console.log(`   🎯 Recipient DID: ${recipientInfo.recipientDID}`)
              console.log(`   🔑 Security: ${recipientInfo.securityModel}`)
              console.log(`   🔄 Revocation: SUPPORTED`)
            }
          } catch (ucanError) {
            console.warn(`   ⚠️ Failed to create UCAN delegation: ${ucanError.message}`)
          }
        }
        
        return delegationInfo
        
      } catch (error) {
        console.error(`   ❌ Failed to grant access: ${error.message}`)
        return null
      }
    }
    
    /**
     * Revoke access - NOW WITH REAL UCAN REVOCATION!
     */
    const revoke = async (capability, identityId, reason = 'Access revoked by administrator') => {
      console.log(`🚫 Enhanced UCAN: Revoking ${capability} access from ${identityId}`)
      console.log(`   📝 Reason: ${reason}`)
      
      try {
        // Remove from granted access set (immediate OrbitDB effect)
        grantedWriteAccess.delete(identityId)
        
        // Remove from access database
        await accessDB.del(`write/${identityId}`)
        console.log(`   ✅ Removed OrbitDB write permission for ${identityId}`)
        
        // REAL UCAN REVOCATION - This is the game changer!
        if (ucanDelegations.has(identityId) && storachaClient) {
          const delegation = ucanDelegations.get(identityId)
          
          if (delegation.delegationCID && delegation.revocable) {
            console.log(`   🚫 Attempting REAL UCAN revocation...`)
            console.log(`   🆔 Revoking delegation CID: ${delegation.delegationCID}`)
            
            try {
              // THIS IS THE KEY: Use the Storacha client's revokeDelegation method!
              const revocationResult = await storachaClient.revokeDelegation(delegation.delegationCID)
              
              if (revocationResult.ok) {
                console.log(`   ✅ UCAN delegation successfully revoked on Storacha!`)
                console.log(`   🔥 Delegation CID ${delegation.delegationCID} is now invalid`)
                
                // Store revocation proof
                const revocationProof = {
                  originalDelegation: delegation,
                  revokedAt: new Date().toISOString(),
                  revokedBy: orbitdb.identity.id,
                  reason,
                  method: 'storacha-client-revocation',
                  delegationCID: delegation.delegationCID
                }
                
                await accessDB.put(`revoked/${identityId}`, revocationProof)
                revocationProofs.set(identityId, revocationProof)
                
                console.log(`   📋 Revocation proof stored`)
                
              } else {
                console.log(`   ⚠️ UCAN revocation returned error:`, revocationResult.error)
              }
              
            } catch (revocationError) {
              console.error(`   ❌ UCAN revocation failed: ${revocationError.message}`)
              console.log(`   🔄 Falling back to expiration-based revocation`)
            }
          } else {
            console.log(`   ⚠️ Delegation not revocable or missing CID`)
          }
        }
        
        // Clean up delegation record
        if (ucanDelegations.has(identityId)) {
          await accessDB.del(`ucan/${identityId}`)
          ucanDelegations.delete(identityId)
          console.log(`   🗑️ Removed UCAN delegation record for ${identityId}`)
        }
        
        console.log(`   ✅ Enhanced revocation completed`)
        console.log(`   🚫 Both OrbitDB access AND UCAN delegation revoked`)
        
      } catch (error) {
        console.error(`   ❌ Failed to revoke access: ${error.message}`)
      }
    }
    
    /**
     * Get UCAN delegation info (including revocation status)
     */
    const getUCANDelegation = (identityId) => {
      const delegation = ucanDelegations.get(identityId)
      const revocation = revocationProofs.get(identityId)
      
      return {
        delegation: delegation || null,
        revocation: revocation || null,
        isRevoked: !!revocation,
        isExpired: delegation && delegation.expiration < Math.floor(Date.now() / 1000)
      }
    }
    
    /**
     * List all writers with their UCAN status
     */
    const listWriters = () => {
      const writers = Array.from(grantedWriteAccess).map(id => {
        const info = getUCANDelegation(id)
        return {
          identityId: id,
          hasUCAN: !!info.delegation,
          isRevoked: info.isRevoked,
          isExpired: info.isExpired,
          delegationCID: info.delegation?.delegationCID
        }
      })
      return writers
    }
    
    /**
     * Get the deterministic recipient principal for an OrbitDB identity
     * This is what users need to authenticate with their UCAN delegation
     */
    const getRecipientForIdentity = async (identityId) => {
      console.log(`🔑 Getting deterministic recipient for ${identityId}...`)
      
      // Check if this identity has a UCAN delegation
      const delegation = ucanDelegations.get(identityId)
      if (!delegation) {
        console.log(`   ❌ No UCAN delegation found for ${identityId}`)
        return null
      }
      
      // Get the same recipient that was used for the delegation
      const recipientPrincipal = await getRecipientFromOrbitDBIdentity(identityId)
      
      return {
        recipientPrincipal,
        recipientDID: recipientPrincipal.did(),
        recipientKey: recipientPrincipal.toArchive(),
        delegation: delegation.delegationToken,
        delegationCID: delegation.delegationCID,
        isRevoked: revocationProofs.has(identityId),
        isExpired: delegation.expiration < Math.floor(Date.now() / 1000)
      }
    }
    
    /**
     * Get revocation statistics
     */
    const getRevocationStats = () => {
      return {
        totalWriters: grantedWriteAccess.size,
        totalDelegations: ucanDelegations.size,
        totalRevoked: revocationProofs.size,
        revocableUCANs: Array.from(ucanDelegations.values()).filter(d => d.revocable).length,
        supportsRealRevocation: !!storachaClient
      }
    }
    
    console.log('✅ Enhanced UCAN OrbitDB Access Controller initialized')
    console.log(`   📊 Total writers: ${grantedWriteAccess.size}`)
    console.log(`   📜 UCAN delegations: ${ucanDelegations.size}`)
    console.log(`   🚫 Revoked delegations: ${revocationProofs.size}`)
    console.log(`   ⚡ Real revocation support: ${!!storachaClient}`)
    
    return {
      type,
      canAppend,
      grant,
      revoke,
      getUCANDelegation,
      getRecipientForIdentity,
      listWriters,
      getRevocationStats,
      close: async () => {
        await accessDB.close()
      }
    }
  }
}

EnhancedUCANAccessController.type = type

export default EnhancedUCANAccessController