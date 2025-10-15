/**
 * Helper functions for timestamped backup feature
 */

/**
 * Generate backup prefix with timestamp
 * 
 * @param {string} spaceName - Name of the Storacha space
 * @returns {string} - Backup prefix including timestamp
 */
export function generateBackupPrefix(spaceName) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `${spaceName}/backup-${timestamp}`
}

/**
 * Get metadata and blocks filenames for a backup prefix
 * 
 * @param {string} prefix - Backup prefix
 * @returns {{metadata: string, blocks: string}} - Filenames for metadata and blocks
 */
export function getBackupFilenames(prefix) {
  return {
    metadata: `${prefix}-metadata.json`,
    blocks: `${prefix}-blocks.car`
  }
}

/**
 * Validate backup metadata
 * 
 * @param {Object} metadata - Metadata object to validate
 * @returns {boolean} - True if valid
 */
export function isValidMetadata(metadata) {
  return metadata && 
    typeof metadata.version === 'string' && 
    typeof metadata.timestamp === 'number' && 
    Array.isArray(metadata.databases) &&
    metadata.databases.every(db => db.root && db.path)
}

/**
 * Find the latest valid backup in a space
 * 
 * @param {Array} spaceFiles - List of files in the space
 * @param {Object} options - Options
 * @param {Function} options.onWarning - Warning callback
 * @returns {Object|null} - Latest valid backup or null
 */
export function findLatestBackup(spaceFiles, options = {}) {
  const { onWarning = console.warn } = options
  const filenames = spaceFiles.map(f => f.root.toString())
  
  // Group files by timestamp
  const backupGroups = new Map()
  for (const file of filenames) {
    const match = file.match(/backup-(.*?)-(metadata\.json|blocks\.car)$/)
    if (match) {
      const [, timestamp, type] = match
      if (!backupGroups.has(timestamp)) {
        backupGroups.set(timestamp, new Set())
      }
      backupGroups.get(timestamp).add(type)
    }
  }

  // Find complete and valid backups
  const completeBackups = Array.from(backupGroups.entries())
    .filter(([timestamp, files]) => {
      const isComplete = files.has('metadata.json') && files.has('blocks.car')
      if (!isComplete) {
        onWarning(`⚠️ Incomplete backup found: backup-${timestamp}-*`)
        files.forEach(file => {
          onWarning(`   Orphaned file: backup-${timestamp}-${file}`)
        })
      }
      return isComplete
    })
    .sort((a, b) => b[0].localeCompare(a[0])) // Sort descending

  if (completeBackups.length === 0) {
    if (backupGroups.size > 0) {
      onWarning('⚠️ No complete backup sets found (missing metadata or blocks files)')
    }
    return null
  }

  const [latestTimestamp] = completeBackups[0]
  return {
    metadata: `backup-${latestTimestamp}-metadata.json`,
    blocks: `backup-${latestTimestamp}-blocks.car`,
    timestamp: latestTimestamp
  }
}