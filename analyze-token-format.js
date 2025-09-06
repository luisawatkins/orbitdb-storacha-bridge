#!/usr/bin/env node
/**
 * Deep analysis of the token format to understand what w3 CLI generates
 */

import 'dotenv/config'

function analyzeTokenFormat() {
  console.log('🔬 Deep Token Format Analysis')
  console.log('=' .repeat(40))
  
  const ucanToken = process.env.STORACHA_UCAN_TOKEN
  if (!ucanToken) {
    console.error('❌ No UCAN token found')
    return
  }
  
  console.log(`📋 Token length: ${ucanToken.length} characters`)
  console.log(`📋 First 100 chars: ${ucanToken.substring(0, 100)}`)
  
  const tokenBytes = Buffer.from(ucanToken, 'base64')
  console.log(`📋 Decoded length: ${tokenBytes.length} bytes`)
  
  // Analyze the raw bytes
  console.log('\n🔍 Raw Bytes Analysis:')
  console.log(`First 32 bytes (hex):`)
  const first32 = Array.from(tokenBytes.slice(0, 32))
  const hexString = first32.map(b => b.toString(16).padStart(2, '0')).join(' ')
  console.log(`  ${hexString}`)
  
  console.log(`First 32 bytes (decimal):`)
  console.log(`  ${first32.join(' ')}`)
  
  console.log(`First 16 bytes (binary):`)
  first32.slice(0, 16).forEach((byte, i) => {
    const binary = byte.toString(2).padStart(8, '0')
    console.log(`  Byte ${i}: ${binary} (0x${byte.toString(16).padStart(2, '0')}) = ${byte}`)
  })
  
  // Check for known format signatures
  console.log('\n🔍 Format Signature Analysis:')
  
  // CAR format typically starts with CBOR encoding
  const firstByte = tokenBytes[0]
  console.log(`First byte: 0x${firstByte.toString(16)} = ${firstByte}`)
  
  if (firstByte === 0x98) {
    console.log('  🎯 0x98 = CBOR array of length 24')
  } else if (firstByte >= 0x80 && firstByte <= 0x9f) {
    const len = firstByte - 0x80
    console.log(`  🎯 CBOR array of length ${len}`)
  } else if (firstByte >= 0xa0 && firstByte <= 0xbf) {
    const len = firstByte - 0xa0
    console.log(`  🎯 CBOR map with ${len} pairs`)
  }
  
  // Check if this looks like multibase
  const firstChar = ucanToken[0]
  console.log(`First character: '${firstChar}'`)
  
  const multibaseEncodings = {
    'f': 'base16',
    'b': 'base32', 
    'c': 'base32pad',
    'v': 'base32hex',
    't': 'base32hexpad',
    'h': 'base32z',
    'z': 'base58btc',
    'm': 'base64',
    'M': 'base64pad',
    'u': 'base64url',
    'U': 'base64urlpad',
  }
  
  if (multibaseEncodings[firstChar]) {
    console.log(`  🎯 Multibase encoding: ${multibaseEncodings[firstChar]}`)
  }
  
  // Try to find ASCII strings in the data
  console.log('\n🔍 ASCII String Analysis:')
  const asciiStrings = []
  let current = ''
  
  for (let i = 0; i < Math.min(tokenBytes.length, 200); i++) {
    const byte = tokenBytes[i]
    if (byte >= 32 && byte <= 126) { // Printable ASCII
      current += String.fromCharCode(byte)
    } else {
      if (current.length >= 3) {
        asciiStrings.push(current)
      }
      current = ''
    }
  }
  
  if (asciiStrings.length > 0) {
    console.log('  Found ASCII strings:')
    asciiStrings.forEach(str => console.log(`    "${str}"`))
  } else {
    console.log('  No readable ASCII strings found')
  }
  
  // Check for common patterns
  console.log('\n🔍 Pattern Analysis:')
  
  // Look for repeated bytes
  const byteFreq = {}
  for (let i = 0; i < Math.min(tokenBytes.length, 100); i++) {
    const byte = tokenBytes[i]
    byteFreq[byte] = (byteFreq[byte] || 0) + 1
  }
  
  const frequentBytes = Object.entries(byteFreq)
    .filter(([_, count]) => count > 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
  
  if (frequentBytes.length > 0) {
    console.log('  Most frequent bytes:')
    frequentBytes.forEach(([byte, count]) => {
      console.log(`    0x${parseInt(byte).toString(16).padStart(2, '0')} appears ${count} times`)
    })
  }
  
  console.log('\n💡 Recommendations:')
  console.log('  1. This appears to be a multibase64 encoded CAR file')
  console.log('  2. The CBOR decoding is failing, suggesting non-standard format')
  console.log('  3. You might need to use a different w3 CLI command to export')
  console.log('  4. Or use the w3 CLI programmatically to handle the delegation')
  
  console.log('\n🔧 Try these w3 CLI commands:')
  console.log('  w3 delegation ls        # List delegations')
  console.log('  w3 proof ls             # List proofs') 
  console.log('  w3 key export           # Export private key')
  console.log('  w3 space info           # Show space information')
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  analyzeTokenFormat()
}

export { analyzeTokenFormat }
