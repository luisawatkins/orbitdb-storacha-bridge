<script>
	import {
		Play,
		Database,
		CheckCircle,
		AlertCircle,
		Loader2,
		Eye,
		EyeOff
	} from 'lucide-svelte';
	import { createLibp2p } from 'libp2p';
	import { createHelia } from 'helia';
import { createOrbitDB, MemoryStorage, IPFSAccessController } from '@orbitdb/core';
import { createLibp2pConfig } from './libp2p-config.js';
import { DefaultLibp2pBrowserOptions } from './libp2p-config-minimal.js';
	import { backupDatabase, restoreDatabaseFromSpace, clearStorachaSpace } from 'orbitdb-storacha-bridge';
	// Add these imports for persistent storage
	import { LevelBlockstore } from 'blockstore-level';
	import { LevelDatastore } from 'datastore-level';

	// Test state
	let testRunning = false;
	let testStep = '';
	let testResults = [];
	let testError = null;
	let testSuccess = false;
	let showDetails = false;

	// Test data
	let originalTodos = [
		{
			id: 'test_todo_1',
			text: 'Test Todo 1 - Buy groceries',
			completed: false,
			createdAt: new Date().toISOString(),
			createdBy: 'test-peer-1'
		},
		{
			id: 'test_todo_2',
			text: 'Test Todo 2 - Walk the dog',
			completed: true,
			createdAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(), // 1 hour ago
			createdBy: 'test-peer-2'
		},
		{
			id: 'test_todo_3',
			text: 'Test Todo 3 - Finish project',
			completed: false,
			createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(), // 30 minutes ago
			createdBy: 'test-peer-1'
		}
	];

	// Test instances
	let testOrbitDB1 = null;
	let testOrbitDB2 = null;
	let testDatabase1 = null;
	let testDatabase2 = null;
	let testHelia1 = null;
	let testHelia2 = null;
	let testLibp2p1 = null;
	let testLibp2p2 = null;

	// Storacha credentials (will be loaded from localStorage)
	let storachaKey = '';
	let storachaProof = '';

	// Backup results
	let backupResult = null;
	let restoreResult = null;

	function addTestResult(step, status, message, data = null) {
		const result = {
			step,
			status, // 'running', 'success', 'error'
			message,
			data,
			timestamp: new Date().toISOString()
		};
		testResults = [...testResults, result];
		console.log(`🧪 Test ${step}: ${status} - ${message}`, data || '');
	}

	function updateLastTestResult(status, message, data = null) {
		if (testResults.length > 0) {
			const lastResult = testResults[testResults.length - 1];
			lastResult.status = status;
			lastResult.message = message;
			if (data) lastResult.data = data;
			testResults = [...testResults];
		}
	}

	async function createTestOrbitDB(instanceId, databaseName, enableNetworkConnection = false, enablePeerConnections = false) {
		console.log(`🔧 Creating test OrbitDB instance ${instanceId}...`);

		// Use minimal libp2p config to avoid relay connections
		const config = DefaultLibp2pBrowserOptions() // createMinimalLibp2pConfig();
		
		// Alternative: Use ultra-minimal config with no transports
		// const config = await createUltraMinimalLibp2pConfig();
 

		// Create libp2p instance
		const libp2p = await createLibp2p(config);
        console.log('libp2p created');

		// Create Helia instance with memory storage for tests to avoid persistence conflicts
		console.log('🗄️ Initializing Helia with memory storage for testing...');
		// Use memory storage to avoid filesystem conflicts and faster cleanup
		const helia = await createHelia({ libp2p });
        console.log('Helia created with memory storage');

		// Create OrbitDB instance with unique ID and memory storage
		const orbitdb = await createOrbitDB({
			ipfs: helia,
			id: `storacha-test-${instanceId}-${Date.now()}-${Math.random()}`,
			storage: MemoryStorage
		});
        console.log('orbitdb', orbitdb);

		// Create database with access controller (like working integration test)
		const database = await orbitdb.open(databaseName, {
			type: 'keyvalue',
			create: true,
			accessController: IPFSAccessController({ write: ['*'] })
		});
        console.log('database', database);

		// Set up event listeners for this database
		setupDatabaseEventListeners(database, instanceId);

		return { libp2p, helia, orbitdb, database };
	}

	// Keep track of all StorachaTest database addresses
	let storachaTestDatabaseAddresses = new Set();

	// Add this new function to set up event listeners for StorachaTest databases only
function setupDatabaseEventListeners(database, instanceId) {
	if (!database) return;

	console.log(`🎧 [StorachaTest] Setting up event listeners for database instance ${instanceId}...`);
	console.log(`🎯 [StorachaTest] Database address: ${database.address}`);
	
	// Add this database address to our tracking set
	storachaTestDatabaseAddresses.add(database.address?.toString() || database.address);

	// Listen for new entries being added (join event)
	database.events.on('join', async (address, entry, heads) => {
		// Check if this event is for any StorachaTest database
		const eventAddress = address?.toString() || address;
		
		if (storachaTestDatabaseAddresses.has(eventAddress)) {
			console.log(`🔗 [StorachaTest-${instanceId}] JOIN EVENT:`, {
				address: eventAddress,
				entry: {
					hash: entry?.hash?.toString() || entry?.hash,
					payload: entry?.payload,
					key: entry?.key,
					value: entry?.value
				},
				heads: heads?.map(h => h?.toString()) || heads,
				timestamp: new Date().toISOString()
			});
			
			// Add to test results if test is running
			if (testRunning) {
				addTestResult(`Join Event [${instanceId}]`, 'success', `New entry joined: ${entry?.key || 'unknown key'}`, {
					address: eventAddress,
					entryHash: entry?.hash?.toString() || entry?.hash,
					entryKey: entry?.key,
					entryValue: entry?.value
				});
			}
		}
	});

	// Listen for entries being updated (update event)
	database.events.on('update', async (address, entry, heads) => {
		// Check if this event is for any StorachaTest database
		const eventAddress = address?.toString() || address;
		
		if (storachaTestDatabaseAddresses.has(eventAddress)) {
			console.log(`🔄 [StorachaTest-${instanceId}] UPDATE EVENT:`, {
				address: eventAddress,
				entry: {
					hash: entry?.hash?.toString() || entry?.hash,
					payload: entry?.payload,
					key: entry?.key,
					value: entry?.value
				},
				heads: heads?.map(h => h?.toString()) || heads,
				timestamp: new Date().toISOString()
			});

			// Add to test results if test is running
			if (testRunning) {
				addTestResult(`Update Event [${instanceId}]`, 'success', `Entry updated: ${entry?.key || 'unknown key'}`, {
					address: eventAddress,
					entryHash: entry?.hash?.toString() || entry?.hash,
					entryKey: entry?.key,
					entryValue: entry?.value
				});
			}
		}
	});

	console.log(`✅ [StorachaTest] Event listeners set up for database instance ${instanceId}`);
}

	async function clearIndexedDB() {
	console.log('🗑️ Clearing IndexedDB...');
	
	// Get all IndexedDB databases
	if ('databases' in indexedDB) {
		const databases = await indexedDB.databases();
		console.log('📋 Found databases:', databases.map(db => db.name));
		
		// Delete databases that look like OrbitDB/Helia related
		const dbsToDelete = databases.filter(db => 
			db.name.includes('helia') || 
			db.name.includes('orbit') || 
			db.name.includes('level') ||
			db.name.includes('simple-todo') ||
			db.name.includes('storacha-test')
		);
		
		for (const db of dbsToDelete) {
			try {
				console.log(`🗑️ Deleting database: ${db.name}`);
				
				// Add timeout to prevent hanging
				await Promise.race([
					new Promise((resolve, reject) => {
						const deleteReq = indexedDB.deleteDatabase(db.name);
						deleteReq.onsuccess = () => resolve();
						deleteReq.onerror = () => reject(deleteReq.error);
						deleteReq.onblocked = () => {
							console.warn(`⚠️ Database deletion blocked for: ${db.name}`);
							// Don't reject immediately, give it more time
						};
					}),
					new Promise((_, reject) => 
						setTimeout(() => reject(new Error('Timeout')), 5000)
					)
				]);
				
				console.log(`✅ Deleted database: ${db.name}`);
			} catch (error) {
				if (error.message === 'Timeout') {
					console.warn(`⏱️ Timeout deleting database ${db.name} - skipping`);
				} else {
					console.warn(`⚠️ Failed to delete database ${db.name}:`, error);
				}
			}
		}
	}
	
	console.log('🧹 IndexedDB cleanup completed');
}

	async function runComprehensiveTest() {
		testRunning = true;
		testStep = '';
		testResults = [];
		testError = null;
		testSuccess = false;
		backupResult = null;
		restoreResult = null;
		
		// Clear the database addresses tracking set for a fresh test
		storachaTestDatabaseAddresses.clear();

		try {
			// Load Storacha credentials
			storachaKey = localStorage.getItem('storacha_key') || '';
			storachaProof = localStorage.getItem('storacha_proof') || '';

		if (!storachaKey || !storachaProof) {
			throw new Error('Storacha credentials not found. Please login to Storacha first.');
		}

		// Step 0: Clear Storacha space for clean test environment
		testStep = 'Clearing Storacha space';
		addTestResult('Step 0', 'running', 'Clearing Storacha space to ensure clean test environment...');
		
		try {
			const clearResult = await clearStorachaSpace({
				storachaKey,
				storachaProof
			});
			
			if (clearResult.success) {
				updateLastTestResult('success', `Space cleared successfully. Removed ${clearResult.totalRemoved} files`, {
					totalFiles: clearResult.totalFiles,
					totalRemoved: clearResult.totalRemoved,
					totalFailed: clearResult.totalFailed,
					byLayer: clearResult.byLayer
				});
			} else {
				updateLastTestResult('success', `Space partially cleared. ${clearResult.totalFailed} files failed to delete`, {
					totalFiles: clearResult.totalFiles,
					totalRemoved: clearResult.totalRemoved,
					totalFailed: clearResult.totalFailed,
					byLayer: clearResult.byLayer
				});
				// Continue with test even if some files failed to delete
			}
		} catch (clearError) {
			console.warn('⚠️ Space clearing failed:', clearError.message);
			updateLastTestResult('success', `Space clearing failed: ${clearError.message} - continuing with test`, {
				error: clearError.message
			});
			// Don't fail the test, just warn and continue
		}

			// Step 1: Create first OrbitDB instance and database
			testStep = 'Creating first OrbitDB instance';
			addTestResult('Step 1', 'running', 'Creating first OrbitDB instance...');

			const instance1 = await createTestOrbitDB('instance1', 'test-todos-1',true,true);
			testOrbitDB1 = instance1.orbitdb;
			testDatabase1 = instance1.database;
			testHelia1 = instance1.helia;
			testLibp2p1 = instance1.libp2p;

			updateLastTestResult('success', `First OrbitDB instance created with ID: ${testOrbitDB1.id}`, {
				orbitDBId: testOrbitDB1.id,
				databaseAddress: testDatabase1.address,
				peerId: testLibp2p1.peerId.toString()
			});

			// Step 2: Add test todos to first database
			testStep = 'Adding test todos';
			addTestResult('Step 2', 'running', 'Adding 3 test todos to first database...');

			for (let i = 0; i < originalTodos.length; i++) {
				const todo = originalTodos[i];
				await testDatabase1.put(todo.id, todo);
				console.log(`✅ Added todo ${i + 1}:`, todo);
			}

			// Verify todos were added
			const addedTodos = await testDatabase1.all();
			if (addedTodos.length !== 3) {
				throw new Error(`Expected 3 todos, but found ${addedTodos.length}`);
			}

			updateLastTestResult('success', `Successfully added ${addedTodos.length} test todos`, {
				todosAdded: addedTodos.map(t => ({ key: t.key, text: t.value.text, completed: t.value.completed }))
			});

			// Step 3: Create backup to Storacha
			testStep = 'Creating backup';
			addTestResult('Step 3', 'running', 'Creating backup to Storacha...');

			backupResult = await backupDatabase(testOrbitDB1, testDatabase1.address, {
				storachaKey,
				storachaProof,
				timeout: 60000
			});

			if (!backupResult.success) {
				throw new Error(`Backup failed: ${backupResult.error}`);
			}

			updateLastTestResult('success', `Backup created successfully with ${backupResult.blocksUploaded}/${backupResult.blocksTotal} blocks`, {
				manifestCID: backupResult.manifestCID,
				databaseAddress: backupResult.databaseAddress,
				blocksTotal: backupResult.blocksTotal,
				blocksUploaded: backupResult.blocksUploaded
			});

			// Step 4: Close and cleanup first instance
			testStep = 'Cleaning up first instance';
			addTestResult('Step 4', 'running', 'Properly shutting down first OrbitDB instance...');

			// PROPER SHUTDOWN SEQUENCE (based on bridge library examples)
			try {
				console.log('🧹 Starting proper shutdown sequence for instance 1...');
				
				// 1. Close individual databases first
				if (testDatabase1) {
					console.log('📝 Closing database 1...');
					await testDatabase1.close();
					console.log('✅ Database 1 closed');
				}
				
				// 2. Stop OrbitDB instance
				if (testOrbitDB1) {
					console.log('🛑 Stopping OrbitDB 1...');
					await testOrbitDB1.stop();
					console.log('✅ OrbitDB 1 stopped');
				}
				
				// 3. Stop Helia IPFS node
				if (testHelia1) {
					console.log('🌐 Stopping Helia 1...');
					await testHelia1.stop();
					console.log('✅ Helia 1 stopped');
				}
				
				// 4. Stop libp2p node
				if (testLibp2p1) {
					console.log('🔗 Stopping libp2p 1...');
					await testLibp2p1.stop();
					console.log('✅ libp2p 1 stopped');
				}
				
				console.log('✅ Proper shutdown sequence completed for instance 1');
				
			} catch (shutdownError) {
				console.warn('⚠️ Error during shutdown sequence:', shutdownError.message);
			}

			// Clear IndexedDB after proper shutdown
			await clearIndexedDB();

			// Clear references
			testDatabase1 = null;
			testOrbitDB1 = null;
			testHelia1 = null;
			testLibp2p1 = null;

			updateLastTestResult('success', 'First instance cleaned up and storage cleared');

			// Step 5: Create completely new OrbitDB instance
			testStep = 'Creating second OrbitDB instance';
			addTestResult('Step 5', 'running', 'Creating completely new OrbitDB instance...');

			// Wait a bit to ensure cleanup is complete
			await new Promise(resolve => setTimeout(resolve, 1000));

			const instance2 = await createTestOrbitDB('instance2', 'test-todos-2',true,true);
			testOrbitDB2 = instance2.orbitdb;
			testDatabase2 = instance2.database;
			testHelia2 = instance2.helia;
			testLibp2p2 = instance2.libp2p;
            console.log('testOrbitDB2', testOrbitDB2);
            console.log('testDatabase2', testDatabase2);
            console.log('testHelia2', testHelia2);
            console.log('testLibp2p2', testLibp2p2);

			// Verify it's a completely different instance
			const newTodos = await testDatabase2.all();
			if (newTodos.length !== 0) {
				console.warn(`⚠️ New database should be empty but contains ${newTodos.length} entries`);
			}

			updateLastTestResult('success', `Second OrbitDB instance created with different ID: ${testOrbitDB2.id}`, {
				orbitDBId: testOrbitDB2.id,
				databaseAddress: testDatabase2.address,
				peerId: testLibp2p2.peerId.toString(),
				initialTodoCount: newTodos.length
			});

			// Step 6: Restore from Storacha backup
			testStep = 'Restoring from backup';
			addTestResult('Step 6', 'running', 'Restoring database from Storacha backup...');

			restoreResult = await restoreDatabaseFromSpace(testOrbitDB2, {
				storachaKey,
				storachaProof,
				timeout: 120000 // Increase timeout to 2 minutes
			});

			if (!restoreResult.success) {
				throw new Error(`Restore failed: ${restoreResult.error}`);
			}

			updateLastTestResult('success', `Database restored successfully with ${restoreResult.entriesRecovered} entries`, {
				manifestCID: restoreResult.manifestCID,
				databaseAddress: restoreResult.address,
				entriesRecovered: restoreResult.entriesRecovered,
				blocksRestored: restoreResult.blocksRestored
			});

			// Step 7: Verify restored data
			testStep = 'Verifying restored data';
			addTestResult('Step 7', 'running', 'Verifying all original todos are readable...');

			// Get the restored database instance
			const restoredDatabase = restoreResult.database;
			
			// Add the restored database address to our tracking set
			if (restoredDatabase && restoredDatabase.address) {
				storachaTestDatabaseAddresses.add(restoredDatabase.address?.toString() || restoredDatabase.address);
				console.log(`🎯 [StorachaTest] Added restored database address to tracking: ${restoredDatabase.address}`);
			}
			
			// Add extra wait time for database indexing in browser
			console.log('⏳ Waiting additional time for browser database indexing...');
			await new Promise(resolve => setTimeout(resolve, 10000)); // 10 second wait
			
			const restoredTodos = await restoredDatabase.all();
			console.log(`🔍 Database type: ${restoredDatabase.type}`);
			console.log(`🔍 Database address: ${restoredDatabase.address}`);
			console.log(`🔍 Restored todos count: ${restoredTodos.length}`);

			console.log('🔍 Original todos:', originalTodos);
			console.log('🔍 Restored todos:', restoredTodos);
			
			// Try different approaches to get data
			if (restoredTodos.length === 0) {
				console.log('🔍 Trying alternative data access methods...');
				
				// Try accessing log entries directly
				try {
					const logEntries = await restoredDatabase.log.values();
					console.log(`🔍 Log entries count: ${logEntries.length}`);
					logEntries.forEach((entry, i) => {
						console.log(`🔍 Log entry ${i}:`, {
							hash: entry.hash,
							payload: entry.payload,
							clock: entry.clock
						});
					});
				} catch (error) {
					console.warn('⚠️ Could not access log entries:', error.message);
				}
				
				// Try iterator approach
				try {
					const entries = [];
					for (const entry of restoredDatabase.iterator()) {
						entries.push(entry);
					}
					console.log(`🔍 Iterator entries count: ${entries.length}`);
				} catch (error) {
					console.warn('⚠️ Iterator approach failed:', error.message);
				}
			}

			// Verify count
			if (restoredTodos.length !== originalTodos.length) {
				throw new Error(`Expected ${originalTodos.length} todos, but restored ${restoredTodos.length}`);
			}

			// Verify content using working integration test pattern
			const verificationResults = [];
			let foundTodoEntries = 0;
			
			for (const entry of restoredTodos) {
				// Use the working pattern: check payload or entry
				const payload = entry.payload || entry;
				console.log('🔍 Checking entry payload:', payload);
				
				if (payload.key && payload.key.startsWith('test_todo_')) {
					foundTodoEntries++;
					const todoData = payload.value;
					
					// Find matching original todo
					const originalTodo = originalTodos.find(t => t.id === payload.key);
					if (!originalTodo) {
						throw new Error(`Restored todo not found in original data: ${payload.key}`);
					}
					
					// Validate todo structure
					if (!todoData.id || !todoData.text || typeof todoData.completed !== 'boolean') {
						throw new Error(`Invalid todo structure for: ${payload.key}`);
					}
					
					const matches = {
						text: todoData.text === originalTodo.text,
						completed: todoData.completed === originalTodo.completed,
						createdBy: todoData.createdBy === originalTodo.createdBy
					};

					verificationResults.push({
						originalId: originalTodo.id,
						restoredKey: payload.key,
						originalText: originalTodo.text,
						restoredText: todoData.text,
						matches
					});

					if (!matches.text || matches.completed !== originalTodo.completed) {
						throw new Error(`Data mismatch for todo: ${originalTodo.text}`);
					}
					
					console.log(`✅ Verified todo: ${todoData.id} - "${todoData.text}" (${todoData.completed ? 'completed' : 'pending'})`);
				}
			}
			
			if (foundTodoEntries === 0) {
				throw new Error('No todo entries found in restored data! Check if backup/restore worked correctly.');
			}
			
			if (foundTodoEntries !== originalTodos.length) {
				throw new Error(`Expected ${originalTodos.length} todos, but found ${foundTodoEntries}`);
			}

			updateLastTestResult('success', `All ${originalTodos.length} todos verified successfully!`, {
				verificationResults,
				restoredCount: restoredTodos.length,
				originalCount: originalTodos.length
			});

			// Test completed successfully
			testSuccess = true;
			testStep = 'Test completed successfully!';

		} catch (error) {
			console.error('❌ Test failed:', error);
			testError = error.message;
			testStep = `Test failed: ${error.message}`;
			
			if (testResults.length > 0) {
				updateLastTestResult('error', error.message);
			} else {
				addTestResult('Error', 'error', error.message);
			}
		} finally {
			// Final cleanup with proper shutdown sequence
			console.log('🧹 Final cleanup - shutting down all test instances...');
			
			// Cleanup instance 1 with proper sequence
			try {
				if (testDatabase1) {
					console.log('📝 Final: Closing database 1...');
					await testDatabase1.close();
				}
				if (testOrbitDB1) {
					console.log('🛑 Final: Stopping OrbitDB 1...');
					await testOrbitDB1.stop();
				}
				if (testHelia1) {
					console.log('🌐 Final: Stopping Helia 1...');
					await testHelia1.stop();
				}
				if (testLibp2p1) {
					console.log('🔗 Final: Stopping libp2p 1...');
					await testLibp2p1.stop();
				}
			} catch (cleanupError1) {
				console.warn('⚠️ Instance 1 cleanup error:', cleanupError1.message);
			}
			
			// Cleanup instance 2 with proper sequence
			try {
				if (testDatabase2) {
					console.log('📝 Final: Closing database 2...');
					await testDatabase2.close();
				}
				if (testOrbitDB2) {
					console.log('🛑 Final: Stopping OrbitDB 2...');
					await testOrbitDB2.stop();
				}
				if (testHelia2) {
					console.log('🌐 Final: Stopping Helia 2...');
					await testHelia2.stop();
				}
				if (testLibp2p2) {
					console.log('🔗 Final: Stopping libp2p 2...');
					await testLibp2p2.stop();
				}
			} catch (cleanupError2) {
				console.warn('⚠️ Instance 2 cleanup error:', cleanupError2.message);
			}
			
			console.log('✅ Final cleanup completed');

			testRunning = false;
		}
	}

	function formatTimestamp(timestamp) {
		return new Date(timestamp).toLocaleTimeString();
	}

	function getStatusIcon(status) {
		switch (status) {
			case 'running':
				return Loader2;
			case 'success':
				return CheckCircle;
			case 'error':
				return AlertCircle;
			default:
				return AlertCircle;
		}
	}

	function getStatusClass(status) {
		switch (status) {
			case 'running':
				return 'text-blue-600 dark:text-blue-400';
			case 'success':
				return 'text-green-600 dark:text-green-400';
			case 'error':
				return 'text-red-600 dark:text-red-400';
			default:
				return 'text-gray-600 dark:text-gray-400';
		}
	}
</script>

<div class="mt-6 rounded-lg border border-purple-200 bg-gradient-to-r from-purple-50 to-pink-50 p-4 dark:border-gray-600 dark:from-gray-700 dark:to-gray-600">
	<!-- Header -->
	<div class="mb-4 flex items-center justify-between">
		<div class="flex items-center space-x-2">
			<Database class="h-5 w-5 text-purple-600 dark:text-purple-400" />
			<h3 class="text-lg font-semibold text-gray-800 dark:text-white">
				Storacha Bridge Test Suite
			</h3>
		</div>
	</div>

	<!-- Description -->
	<div class="mb-4 rounded-md bg-purple-100 p-3 dark:bg-purple-900/30">
		<p class="text-sm text-purple-800 dark:text-purple-200">
			This test creates an independent OrbitDB instance, adds 3 test todos, backs them up to Storacha, 
			completely destroys the database and storage, creates a new OrbitDB instance with a different ID, 
			and verifies that all data can be restored correctly.
		</p>
	</div>

	<!-- Test Controls -->
	<div class="mb-4 flex items-center space-x-3">
		<button
			on:click={runComprehensiveTest}
			disabled={testRunning}
			class="flex items-center space-x-2 rounded-md bg-purple-600 px-4 py-2 text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
		>
			{#if testRunning}
				<Loader2 class="h-4 w-4 animate-spin" />
				<span>Running Test...</span>
			{:else}
				<Play class="h-4 w-4" />
				<span>Run Test</span>
			{/if}
		</button>

		<button
			on:click={() => (showDetails = !showDetails)}
			class="flex items-center space-x-2 rounded-md bg-gray-600 px-4 py-2 text-white transition-colors hover:bg-gray-700"
		>
			{#if showDetails}
				<EyeOff class="h-4 w-4" />
				<span>Hide Details</span>
			{:else}
				<Eye class="h-4 w-4" />
				<span>Show Details</span>
			{/if}
		</button>
	</div>

	<!-- Current Status -->
	{#if testRunning || testStep}
		<div class="mb-4 rounded-md border bg-white p-3 dark:bg-gray-700">
			<div class="flex items-center space-x-2">
				{#if testRunning}
					<Loader2 class="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400" />
				{:else if testSuccess}
					<CheckCircle class="h-4 w-4 text-green-600 dark:text-green-400" />
				{:else if testError}
					<AlertCircle class="h-4 w-4 text-red-600 dark:text-red-400" />
				{/if}
				<span class="font-medium text-gray-800 dark:text-white">
					{testStep}
				</span>
			</div>
		</div>
	{/if}

	<!-- Test Results -->
	{#if testResults.length > 0}
		<div class="rounded-md border bg-white p-4 dark:bg-gray-700">
			<h4 class="mb-3 font-medium text-gray-800 dark:text-white">Test Results</h4>
			
			<div class="space-y-2">
				{#each testResults as result, index}
					<div class="flex items-start space-x-3 rounded border bg-gray-50 p-3 dark:bg-gray-600">
						<div class="flex-shrink-0">
							<svelte:component 
								this={getStatusIcon(result.status)} 
								class="h-4 w-4 {getStatusClass(result.status)} {result.status === 'running' ? 'animate-spin' : ''}" 
							/>
						</div>
						<div class="flex-1">
							<div class="flex items-center justify-between">
								<span class="font-medium text-gray-800 dark:text-white">
									{result.step}
								</span>
								<span class="text-xs text-gray-500 dark:text-gray-400">
									{formatTimestamp(result.timestamp)}
								</span>
							</div>
							<p class="text-sm text-gray-600 dark:text-gray-300">
								{result.message}
							</p>
							
							{#if showDetails && result.data}
								<details class="mt-2">
									<summary class="cursor-pointer text-xs text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300">
										Show Details
									</summary>
									<pre class="mt-1 overflow-x-auto rounded bg-gray-100 p-2 text-xs text-gray-800 dark:bg-gray-800 dark:text-gray-200">{JSON.stringify(result.data, null, 2)}</pre>
								</details>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Final Results Summary -->
	{#if testSuccess}
		<div class="mt-4 rounded-md border border-green-300 bg-green-100 p-4 dark:border-green-600 dark:bg-green-900/30">
			<div class="flex items-start space-x-2">
				<CheckCircle class="h-5 w-5 text-green-600 dark:text-green-400" />
				<div>
					<h4 class="font-medium text-green-800 dark:text-green-200">
						Test Completed Successfully! ✅
					</h4>
					<p class="text-sm text-green-700 dark:text-green-300">
						The OrbitDB-Storacha bridge successfully backed up and restored all test data. 
						All {originalTodos.length} todos were verified after complete database recreation.
					</p>
					{#if backupResult && restoreResult}
						<div class="mt-2 text-xs text-green-600 dark:text-green-400">
							Backup: {backupResult.blocksUploaded}/{backupResult.blocksTotal} blocks uploaded •
							Restore: {restoreResult.entriesRecovered} entries recovered
						</div>
					{/if}
				</div>
			</div>
		</div>
	{:else if testError}
		<div class="mt-4 rounded-md border border-red-300 bg-red-100 p-4 dark:border-red-600 dark:bg-red-900/30">
			<div class="flex items-start space-x-2">
				<AlertCircle class="h-5 w-5 text-red-600 dark:text-red-400" />
				<div>
					<h4 class="font-medium text-red-800 dark:text-red-200">
						Test Failed ❌
					</h4>
					<p class="text-sm text-red-700 dark:text-red-300">
						{testError}
					</p>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	pre {
		font-family: 'Courier New', Courier, monospace;
		white-space: pre-wrap;
		word-break: break-all;
	}
</style>
