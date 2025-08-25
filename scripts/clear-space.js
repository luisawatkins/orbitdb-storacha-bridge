#!/usr/bin/env node

/**
 * Clear Storacha Space Script
 * 
 * This script clears all files from your Storacha space using the library's
 * clearStorachaSpace function. Useful for manual cleanup during development.
 * 
 * Usage:
 *   node scripts/clear-space.js [--batch-size=N]
 * 
 * Options:
 *   --batch-size=N  Process deletions in batches of N files (default: 10)
 */

import 'dotenv/config'
import { clearStorachaSpace } from '../lib/orbitdb-storacha-bridge.js'

function parseArgs() {
  const args = process.argv.slice(2)
  let batchSize = 10 // Default batch size
  
  for (const arg of args) {
    if (arg.startsWith('--batch-size=')) {
      const size = parseInt(arg.split('=')[1])
      if (size > 0) {
        batchSize = size
      } else {
        console.error('❌ Invalid batch size. Must be a positive number.')
        process.exit(1)
      }
    } else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/clear-space.js [--batch-size=N]')
      console.log('Options:')
      console.log('  --batch-size=N  Process deletions in batches of N files (default: 10)')
      process.exit(0)
    }
  }
  
  return { batchSize }
}

async function main() {
  const { batchSize } = parseArgs()
  
  console.log('🚀 Starting Storacha Space Cleanup')
  console.log('=' .repeat(50))
  console.log(`📦 Batch size: ${batchSize} files per batch`)
  
  if (!process.env.STORACHA_KEY || !process.env.STORACHA_PROOF) {
    console.error('❌ Missing Storacha credentials!')
    console.error('   Please set STORACHA_KEY and STORACHA_PROOF in your .env file')
    process.exit(1)
  }
  
  try {
    const result = await clearStorachaSpace({
      storachaKey: process.env.STORACHA_KEY,
      storachaProof: process.env.STORACHA_PROOF,
      batchSize
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
