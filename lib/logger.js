/**
 * Simple logging utility for OrbitDB Storacha Bridge
 * 
 * Provides different log levels and can be configured for production vs development
 */

const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
}

class Logger {
  constructor(level = 'INFO') {
    this.level = LOG_LEVELS[level.toUpperCase()] ?? LOG_LEVELS.INFO
  }

  error(message, ...args) {
    if (this.level >= LOG_LEVELS.ERROR) {
      console.error(`❌ ${message}`, ...args)
    }
  }

  warn(message, ...args) {
    if (this.level >= LOG_LEVELS.WARN) {
      console.warn(`⚠️ ${message}`, ...args)
    }
  }

  info(message, ...args) {
    if (this.level >= LOG_LEVELS.INFO) {
      console.log(`ℹ️ ${message}`, ...args)
    }
  }

  debug(message, ...args) {
    if (this.level >= LOG_LEVELS.DEBUG) {
      console.log(`🔍 ${message}`, ...args)
    }
  }

  // Progress and user feedback methods (always shown)
  progress(message, ...args) {
    console.log(`🔄 ${message}`, ...args)
  }

  success(message, ...args) {
    console.log(`✅ ${message}`, ...args)
  }
}

// Create default logger instance
// In production, set level to 'WARN' or 'ERROR'
// In development, use 'DEBUG' or 'INFO'
// Use globalThis to detect environment safely in both Node and browser
const isProduction = typeof globalThis !== 'undefined' && 
                     globalThis.process?.env?.NODE_ENV === 'production'
const logger = new Logger(isProduction ? 'WARN' : 'INFO')

export default logger
export { Logger }
