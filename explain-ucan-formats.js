#!/usr/bin/env node
/**
 * Explain the difference between w3 CLI UCAN format and SecretShare format
 */

import 'dotenv/config'

console.log('🔍 UCAN Format Analysis & Solution')
console.log('=' .repeat(60))

console.log('\n📋 Current Environment Variables:')
console.log(`🎫 STORACHA_UCAN_TOKEN: ${!!process.env.STORACHA_UCAN_TOKEN ? 'Set' : 'Missing'}`)
console.log(`🤖 STORACHA_AGENT_DID: ${process.env.STORACHA_AGENT_DID || 'Missing'}`)
console.log(`🚀 STORACHA_SPACE_DID: ${process.env.STORACHA_SPACE_DID || 'Missing'}`)

console.log('\n🔍 Issue Analysis:')
console.log('   Your current setup uses w3 CLI generated credentials:')
console.log(`   - STORACHA_UCAN_TOKEN: CAR format delegation (2311 chars)`)
console.log(`   - STORACHA_AGENT_DID: Public DID (did:key:z6Mkv...)`)
console.log(`   - STORACHA_SPACE_DID: Target space DID`)

console.log('\n   But SecretShare expects:')
console.log(`   - STORACHA_PRIVATE_KEY: Ed25519 private key`)
console.log(`   - STORACHA_DELEGATION: Delegation proof`)

console.log('\n💡 Solutions:')
console.log('\n   Option 1: Convert w3 CLI credentials to SecretShare format')
console.log('   --------------------------------------------------------')
console.log('   The UCAN token you have is a delegation that was created with')
console.log('   the w3 CLI tool. It contains the delegation proof but needs to')
console.log('   be parsed differently.')
console.log('')
console.log('   Your Agent DID is the public key, but you need the private key.')
console.log('   The private key should have been generated when you ran "w3 key create".')

console.log('\n   Option 2: Use w3 CLI credentials directly (Recommended)')
console.log('   -----------------------------------------------------')
console.log('   Update your .env to work with the w3 CLI format:')
console.log('')
console.log('   # Keep your current variables:')
console.log('   STORACHA_UCAN_FILE=path/to/your/delegation.car  # OR')
console.log('   STORACHA_UCAN_TOKEN=<your-current-token>')
console.log('   STORACHA_AGENT_DID=<your-current-agent-did>')
console.log('   STORACHA_SPACE_DID=<your-current-space-did>')
console.log('')
console.log('   # But you also need the private key:')
console.log('   STORACHA_AGENT_PRIVATE_KEY=<private-key-from-w3-key-create>')

console.log('\n   Option 3: Check w3 CLI configuration')
console.log('   ------------------------------------')
console.log('   Run these commands to find your private key:')
console.log('')
console.log('   w3 key ls                    # List your keys')
console.log('   w3 whoami                    # Show current identity')
console.log('   cat ~/.config/w3up/store     # Check stored credentials')

console.log('\n🔧 Next Steps:')
console.log('   1. Find your private key from w3 CLI setup')
console.log('   2. Add it to .env as STORACHA_AGENT_PRIVATE_KEY')
console.log('   3. Update the UCAN bridge to use the private key')
console.log('   4. The delegation token can then be used as proof')

console.log('\n📚 Technical Details:')
console.log('   - Your UCAN token is a CAR file containing the delegation')
console.log('   - The delegation was signed with your private key')  
console.log('   - You need both the private key (for identity) and delegation (for permissions)')
console.log('   - SecretShare uses a simpler approach with direct key/proof env vars')

export {}
