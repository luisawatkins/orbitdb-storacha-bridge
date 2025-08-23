#!/usr/bin/env node

/**
 * Clear Storacha Space Script
 * 
 * This script clears all files from your Storacha space using the library's
 * clearStorachaSpace function. Useful for manual cleanup during development.
 */

import 'dotenv/config'
import { clearStorachaSpace } from '../lib/orbitdb-storacha-bridge.js'

async function main() {
  console.log('🚀 Starting Storacha Space Cleanup')
  console.log('=' .repeat(50))
  
  if (!process.env.STORACHA_KEY || !process.env.STORACHA_PROOF) {
    console.error('❌ Missing Storacha credentials!')
    console.error('   Please set STORACHA_KEY and STORACHA_PROOF in your .env file')
    process.exit(1)
  }
  
  try {
    const result = await clearStorachaSpace({
      storachaKey: process.env.STORACHA_KEY,
      storachaProof: process.env.STORACHA_PROOF
    })
    
    if (result.success) {
      console.log('\\n🎉 Space cleared successfully!')
      process.exit(0)
    } else {
      console.warn('\\n⚠️ Space clearing completed with some failures')
      process.exit(1)
    }
  } catch (error) {
    console.error('\\n💥 Space clearing failed:', error.message)
    process.exit(1)
  }
}

main()
