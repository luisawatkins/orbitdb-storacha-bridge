#!/usr/bin/env node

/**
 * Monitor Storacha Block Propagation (Dynamic)
 * 
 * Run this right after a test to monitor when those specific blocks appear in space listing
 * Usage: node monitor-propagation.js [cid1] [cid2] [cid3] ...
 * Or just run it and it will prompt for CIDs
 */

import { spawn } from 'child_process'
import { createInterface } from 'readline'
import { CID } from 'multiformats/cid'

/**
 * Convert OrbitDB CID (zdpu...) to Storacha CID (bafkre...)
 * OrbitDB uses CIDv0 with dag-cbor codec
 * Storacha stores as CIDv1 with raw codec
 * But they share the same hash digest!
 */
function convertOrbitDBToStorachaCID(orbitdbCID) {
  try {
    const parsed = CID.parse(orbitdbCID)
    // Create CIDv1 with raw codec (0x55) using the same multihash
    const storachaCID = CID.createV1(0x55, parsed.multihash) // 0x55 = raw codec
    return storachaCID.toString()
  } catch (error) {
    console.warn(`   ⚠️ Failed to convert OrbitDB CID ${orbitdbCID}: ${error.message}`)
    return null
  }
}

/**
 * Detect and convert CID if it's OrbitDB format
 */
function processCIDInput(inputCID) {
  const trimmed = inputCID.trim()
  
  // Check if it's OrbitDB format (zdpu prefix)
  if (trimmed.startsWith('zdpu')) {
    console.log(`   🔄 Converting OrbitDB CID: ${trimmed}`)
    const storachaCID = convertOrbitDBToStorachaCID(trimmed)
    if (storachaCID) {
      console.log(`   ➡️  Storacha CID: ${storachaCID}`)
      return storachaCID
    } else {
      console.log(`   ❌ Conversion failed`)
      return null
    }
  }
  
  // Check if it's already Storacha format (bafkre prefix)
  if (trimmed.startsWith('bafkre')) {
    return trimmed
  }
  
  // Try to extract CID from longer lines
  const orbitdbMatch = trimmed.match(/zdpu[a-zA-Z0-9]+/)
  if (orbitdbMatch) {
    console.log(`   🔄 Found OrbitDB CID in text: ${orbitdbMatch[0]}`)
    const storachaCID = convertOrbitDBToStorachaCID(orbitdbMatch[0])
    if (storachaCID) {
      console.log(`   ➡️  Storacha CID: ${storachaCID}`)
      return storachaCID
    }
  }
  
  const storachaMatch = trimmed.match(/bafkre[a-z0-9]+/i)
  if (storachaMatch) {
    return storachaMatch[0]
  }
  
  return null
}

/**
 * Execute a w3 CLI command and return CIDs
 */
async function executeW3Command(command) {
  return new Promise((resolve, reject) => {
    // Add --size 1000000 to get ALL files, not just the default page size
    const args = ['can', ...command.split(' '), '--size', '1000000']
    const w3Process = spawn('w3', args, {
      stdio: ['pipe', 'pipe', 'pipe']
    })
    
    let stdout = ''
    let stderr = ''
    
    w3Process.stdout.on('data', (data) => {
      stdout += data.toString()
    })
    
    w3Process.stderr.on('data', (data) => {
      stderr += data.toString()
    })
    
    w3Process.on('close', (code) => {
      if (code === 0) {
        const cids = stdout.trim().split('\n').filter(line => line.trim())
        resolve(cids.map(cid => cid.trim()))
      } else {
        resolve([]) // Return empty array instead of rejecting for failed commands
      }
    })
  })
}

/**
 * List files in Storacha space using w3 CLI - checks upload, store, and blob
 */
async function listSpaceFiles() {
  const commands = [
    { name: 'upload', cmd: 'upload ls' },
    { name: 'store', cmd: 'store ls' }, 
    { name: 'blob', cmd: 'blob ls' }
  ]
  
  const allResults = new Map()
  const results = {}
  
  // Execute all commands in parallel
  const promises = commands.map(async ({ name, cmd }) => {
    try {
      const rawCids = await executeW3Command(cmd)
      
      // Handle different output formats - especially for blob layer
      const processedCids = rawCids.map(cidLine => {
        // For blob layer, the format might be "zQm... (bafkre...)"
        // Extract just the first CID (the zQm... part) which is what we monitor
        if (name === 'blob' && cidLine.includes(' (') && cidLine.includes(')')) {
          const firstCID = cidLine.split(' (')[0]
          return firstCID
        }
        
        // For upload and store, just return the CID as-is
        return cidLine
      })
      
      results[name] = processedCids
      // Add to combined set
      processedCids.forEach(cid => {
        if (!allResults.has(cid)) {
          allResults.set(cid, new Set())
        }
        allResults.get(cid).add(name)
      })
    } catch (error) {
      console.warn(`   ⚠️ Failed to list ${name}: ${error.message}`)
      results[name] = []
    }
  })
  
  await Promise.all(promises)
  
  // Convert to final array format for backwards compatibility
  const allCIDs = Array.from(allResults.keys())
  
  // Add metadata about which layer each CID is found in
  allCIDs.layerInfo = allResults
  allCIDs.byLayer = results
  
  return allCIDs
}

/**
 * Check how many target CIDs are found in space
 */
async function checkPropagation(targetCIDs) {
  try {
    const spaceFiles = await listSpaceFiles()
    const spaceSet = new Set(spaceFiles)
    
    const foundCIDs = targetCIDs.filter(cid => spaceSet.has(cid))
    const missingCIDs = targetCIDs.filter(cid => !spaceSet.has(cid))
    
    // Create detailed info about found CIDs including which layers they're in
    const foundDetails = foundCIDs.map(cid => {
      const layers = spaceFiles.layerInfo?.get(cid) || new Set()
      return {
        cid,
        layers: Array.from(layers)
      }
    })
    
    return {
      totalSpace: spaceFiles.length,
      foundCount: foundCIDs.length,
      totalTarget: targetCIDs.length,
      found: foundCIDs,
      foundDetails,
      missing: missingCIDs,
      complete: foundCIDs.length === targetCIDs.length,
      layerCounts: spaceFiles.byLayer ? {
        upload: spaceFiles.byLayer.upload?.length || 0,
        store: spaceFiles.byLayer.store?.length || 0,
        blob: spaceFiles.byLayer.blob?.length || 0
      } : null
    }
  } catch (error) {
    return {
      error: error.message,
      complete: false
    }
  }
}

/**
 * Get CIDs from command line args or user input
 */
async function getCIDsToMonitor() {
  // Check if CIDs were provided as command line arguments
  const args = process.argv.slice(2)
  if (args.length > 0) {
    console.log(`📋 Processing ${args.length} CIDs from command line:`)
    const processedCIDs = []
    
    for (let i = 0; i < args.length; i++) {
      console.log(`\n${i+1}. Input: ${args[i]}`)
      const processed = processCIDInput(args[i])
      if (processed) {
        processedCIDs.push(processed)
        console.log(`   ✅ Will monitor: ${processed}`)
      } else {
        console.log(`   ❌ Invalid CID format`)
      }
    }
    
    if (processedCIDs.length > 0) {
      console.log(`\n📋 Will monitor ${processedCIDs.length} converted Storacha CIDs`)
      return processedCIDs
    } else {
      console.log('❌ No valid CIDs found in command line arguments')
      process.exit(1)
    }
  }
  
  // If no args, prompt for CIDs
  console.log('🔄 Dynamic Storacha Block Propagation Monitor')
  console.log('=' .repeat(50))
  console.log('📋 Please paste the CIDs from your recent test output:')
  console.log('   • OrbitDB CIDs (zdpu...) will be auto-converted to Storacha format')
  console.log('   • Storacha CIDs (bafkre...) will be used as-is')
  console.log('   • You can paste full lines - CIDs will be extracted automatically')
  console.log('   • Paste them one by one, press Enter twice when done')
  console.log()
  
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  })
  
  const cids = []
  
  return new Promise((resolve) => {
    let emptyLines = 0
    
    const askForCID = () => {
      rl.question(`CID #${cids.length + 1} (or press Enter to finish): `, (input) => {
        const trimmed = input.trim()
        
        if (!trimmed) {
          emptyLines++
          if (emptyLines >= 2 || cids.length > 0) {
            rl.close()
            console.log()
            if (cids.length > 0) {
              console.log(`✅ Will monitor ${cids.length} CIDs`)
              resolve(cids)
            } else {
              console.log('❌ No CIDs provided')
              process.exit(1)
            }
            return
          }
        } else {
          emptyLines = 0
          const processed = processCIDInput(trimmed)
          if (processed) {
            cids.push(processed)
            console.log(`   ✓ Added: ${processed}`)
          } else {
            console.log(`   ⚠️ No valid CID found in input: ${trimmed}`)
          }
        }
        
        askForCID()
      })
    }
    
    askForCID()
  })
}

/**
 * Monitor propagation with timing
 */
async function monitorPropagation(targetCIDs) {
  console.log('\n🔄 Starting Propagation Monitor')
  console.log('=' .repeat(50))
  console.log(`🎯 Waiting for ${targetCIDs.length} uploaded blocks to appear in space listing...`)
  console.log(`⏱️  Checking every 10 seconds`)
  console.log()
  
  const startTime = Date.now()
  let checkCount = 0
  
  while (true) {
    checkCount++
    const elapsed = Math.round((Date.now() - startTime) / 1000)
    
    console.log(`📋 Check #${checkCount} (${elapsed}s elapsed):`)
    
    const result = await checkPropagation(targetCIDs)
    
    if (result.error) {
      console.log(`   ❌ Error: ${result.error}`)
    } else {
      // Show layer breakdown if available
      if (result.layerCounts) {
        console.log(`   📊 Storage layers: upload(${result.layerCounts.upload}) store(${result.layerCounts.store}) blob(${result.layerCounts.blob}) = ${result.totalSpace} total`)
      } else {
        console.log(`   📊 Space contains ${result.totalSpace} total files`)
      }
      
      console.log(`   ✅ Found ${result.foundCount}/${result.totalTarget} target blocks`)
      
      if (result.foundDetails && result.foundDetails.length > 0) {
        console.log(`   🎉 Propagated blocks:`)
        result.foundDetails.forEach(({ cid, layers }) => {
          const layerStr = layers.length > 0 ? ` [${layers.join(', ')}]` : ''
          console.log(`      ✓ ${cid}${layerStr}`)
        })
      }
      
      if (result.missing.length > 0) {
        console.log(`   ⏳ Still waiting for:`)
        result.missing.forEach(cid => {
          console.log(`      ⏸️  ${cid}`)
        })
      }
      
      if (result.complete) {
        const totalTime = Math.round((Date.now() - startTime) / 1000)
        const minutes = Math.floor(totalTime / 60)
        const seconds = totalTime % 60
        
        console.log()
        console.log('🎉 ALL BLOCKS PROPAGATED!')
        console.log(`⏱️  Total propagation time: ${totalTime} seconds (${minutes}m ${seconds}s)`)
        console.log(`🔄 Checks performed: ${checkCount}`)
        console.log(`📊 Final space size: ${result.totalSpace} files`)
        break
      }
    }
    
    console.log()
    
    // Wait 10 seconds before next check
    await new Promise(resolve => setTimeout(resolve, 10000))
  }
}

// Main execution
async function main() {
  try {
    const targetCIDs = await getCIDsToMonitor()
    await monitorPropagation(targetCIDs)
    console.log('\n✅ Monitoring completed successfully!')
  } catch (error) {
    console.error('\n💥 Monitoring failed:', error)
    process.exit(1)
  }
}

main()
