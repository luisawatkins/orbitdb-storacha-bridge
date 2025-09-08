<script>
	import {
		Plus,
		Upload,
		Download,
		Database,
		CheckCircle,
		AlertCircle,
		Loader2,
		Eye,
		EyeOff,
		User,
		Users,
		ArrowRight,
		ToggleLeft,
		ToggleRight
	} from 'lucide-svelte';
	import { createLibp2p } from 'libp2p';
	import { createHelia } from 'helia';
    import { circuitRelayTransport } from '@libp2p/circuit-relay-v2';
    import { webSockets } from '@libp2p/websockets';
    import { webRTC } from '@libp2p/webrtc';
    import { noise } from '@chainsafe/libp2p-noise';
    import { yamux } from '@chainsafe/libp2p-yamux';
    import { identify } from '@libp2p/identify';
    import { gossipsub } from '@chainsafe/libp2p-gossipsub';
    import { all } from '@libp2p/websockets/filters';
    import { createOrbitDB, IPFSAccessController } from '@orbitdb/core';
	import { backupDatabase, restoreLogEntriesOnly, clearStorachaSpace } from './orbitdb-storacha-bridge';
    import { Identities, useIdentityProvider } from '@orbitdb/core';
    import OrbitDBIdentityProviderDID from '@orbitdb/identity-provider-did';
    import { Ed25519Provider } from 'key-did-provider-ed25519';
    import * as KeyDIDResolver from 'key-did-resolver';
    import { generateMnemonic, mnemonicToSeedSync } from 'bip39';
    import { createHash } from 'crypto';
	
	// Import the new Storacha Auth component
	import StorachaAuth from './StorachaAuth.svelte';

	// Storacha authentication state
	let storachaAuthenticated = false;
	let storachaClient = null;
	let storachaCredentials = null;

	// Alice's state (creates data and backs up)
	let aliceRunning = false;
	let aliceOrbitDB = null;
	let aliceDatabase = null;
	let aliceHelia = null;
	let aliceLibp2p = null;
	let aliceTodos = [];
	let aliceResults = [];
	let aliceStep = '';
	let aliceError = null;

	// Bob's state (restores data)
	let bobRunning = false;
	let bobOrbitDB = null;
	let bobDatabase = null;
	let bobHelia = null;
	let bobLibp2p = null;
	let bobTodos = [];
	let bobResults = [];
	let bobStep = '';
	let bobError = null;
	let bobUseSameIdentity = true; // Toggle for Bob's identity choice
	let bobIdentity = null; // Bob's own identity if he creates one
	let bobIdentities = null; // Bob's own identities instance

	// Shared state
	let sharedIdentity = null;
	let sharedIdentities = null;
	let backupResult = null;
	let restoreResult = null;
	let showDetails = false;

	// Test data
	let originalTodos = [
		{
			id: 'test_todo_1',
			text: 'Buy groceries for the week',
			completed: false,
			createdAt: new Date().toISOString(),
			createdBy: 'alice'
		},
		{
			id: 'test_todo_2',
			text: 'Walk the dog in the park',
			completed: true,
			createdAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
			createdBy: 'alice'
		},
		{
			id: 'test_todo_3',
			text: 'Finish the OrbitDB project',
			completed: false,
			createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
			createdBy: 'alice'
		}
	];

	// Keep track of database addresses
	let storachaTestDatabaseAddresses = new Set();

	// Handle Storacha authentication events
	function handleStorachaAuthenticated(event) {
		console.log('🔐 Storacha authenticated:', event.detail);
		storachaAuthenticated = true;
		storachaClient = event.detail.client;
		storachaCredentials = {
			method: event.detail.method,
			spaces: event.detail.spaces,
			identity: event.detail.identity // Available if authenticated with seed
		};

		// Store credentials for backup/restore operations
		if (event.detail.method === 'credentials') {
			// For key/proof authentication, we need to extract the credentials
			console.log('📝 Credentials-based authentication - storing for backup operations');
		} else if (event.detail.method === 'ucan' || event.detail.method === 'seed') {
			console.log(`📝 ${event.detail.method}-based authentication - ready for operations`);
		}
	}

	function handleStorachaLogout() {
		console.log('🚪 Storacha logged out');
		storachaAuthenticated = false;
		storachaClient = null;
		storachaCredentials = null;
	}

	function handleSpaceChanged(event) {
		console.log('🔄 Storacha space changed:', event.detail.space);
		// Update any space-dependent operations
	}

/**
 * Convert 64-bit seed to 32-bit seed (same as deContact)
 */
function convertTo32BitSeed(origSeed) {
    const hash = createHash('sha256');
    hash.update(Buffer.from(origSeed, 'hex'));
    return hash.digest();
}

/**
 * Generate master seed from mnemonic
 */
function generateMasterSeed(mnemonicSeedphrase, password = 'password') {
    return mnemonicToSeedSync(mnemonicSeedphrase, password).toString('hex');
}

/**
 * Create a reusable OrbitDB identity from seed
 */
async function createReusableIdentity(persona = 'shared') {
    console.log(`🆔 Creating ${persona} identity...`);
    
    // Generate a test seed phrase for consistent identity
    const seedPhrase = generateMnemonic();
    const masterSeed = generateMasterSeed(seedPhrase, `${persona}-password`);
    const seed32 = convertTo32BitSeed(masterSeed);
    
    // Set up DID resolver and register the official DID provider
    const keyDidResolver = KeyDIDResolver.getResolver();
    OrbitDBIdentityProviderDID.setDIDResolver(keyDidResolver);
    useIdentityProvider(OrbitDBIdentityProviderDID);
    
    // Create OrbitDB identities instance
    const identities = await Identities();
    
    // Create DID provider from seed
    const didProvider = new Ed25519Provider(seed32);
    
    // Use the official OrbitDB DID identity provider
    const identity = await identities.createIdentity({ 
        provider: OrbitDBIdentityProviderDID({ 
            didProvider: didProvider 
        }) 
    });
    
    console.log(`✅ ${persona} identity created: ${identity.id}`);
    return { identity, identities, seedPhrase, masterSeed };
}

function addResult(persona, step, status, message, data = null) {
		const result = {
			step,
			status, // 'running', 'success', 'error'
			message,
			data,
			timestamp: new Date().toISOString()
		};
		
		if (persona === 'alice') {
			aliceResults = [...aliceResults, result];
		} else {
			bobResults = [...bobResults, result];
		}
		console.log(`🧪 ${persona}: ${step} - ${status} - ${message}`, data || '');
	}

	function updateLastResult(persona, status, message, data = null) {
		const results = persona === 'alice' ? aliceResults : bobResults;
		if (results.length > 0) {
			const lastResult = results[results.length - 1];
			lastResult.status = status;
			lastResult.message = message;
			if (data) lastResult.data = data;
			
			if (persona === 'alice') {
				aliceResults = [...aliceResults];
			} else {
				bobResults = [...bobResults];
			}
		}
	}

	async function createOrbitDBInstance(persona, instanceId, databaseName, databaseConfig, useSharedIdentity = true) {
		console.log(`🔧 Creating OrbitDB instance for ${persona}...`);

		// Use minimal libp2p config to avoid relay connections
		const config = DefaultLibp2pBrowserOptions;

		// Create libp2p instance
		const libp2p = await createLibp2p(config);
        console.log('libp2p created');

		// Create Helia instance with memory storage for tests to avoid persistence conflicts
		console.log('🗄️ Initializing Helia with memory storage for testing...');
		// Use memory storage to avoid filesystem conflicts and faster cleanup
		const helia = await createHelia({ libp2p });
        console.log('Helia created with memory storage');

		// Create OrbitDB instance with unique ID and memory storage
		const orbitdbConfig = {
			ipfs: helia,
			id: `${persona}-${instanceId}-${Date.now()}-${Math.random()}`,
			directory: `./orbitdb-${persona}-${instanceId}`,
		};

		// Choose identity based on persona and settings
		if (persona === 'alice' && sharedIdentity && sharedIdentities) {
			orbitdbConfig.identity = sharedIdentity;
			orbitdbConfig.identities = sharedIdentities;
		} else if (persona === 'bob') {
			if (useSharedIdentity && sharedIdentity && sharedIdentities) {
				orbitdbConfig.identity = sharedIdentity;
				orbitdbConfig.identities = sharedIdentities;
				console.log(`🔗 Bob using Alice's shared identity: ${sharedIdentity.id}`);
			} else if (bobIdentity && bobIdentities) {
				orbitdbConfig.identity = bobIdentity;
				orbitdbConfig.identities = bobIdentities;
				console.log(`🆔 Bob using his own identity: ${bobIdentity.id}`);
			}
		}

		const orbitdb = await createOrbitDB(orbitdbConfig);
        console.log('orbitdb', orbitdb);

		// Create database with access controller (like working integration test)
		const database = await orbitdb.open(databaseName, databaseConfig);
        console.log('database', database);

		// Set up event listeners for this database
		setupDatabaseEventListeners(database, persona);

		return { libp2p, helia, orbitdb, database };
	}

	// Add this new function to set up event listeners for StorachaTest databases only
function setupDatabaseEventListeners(database, persona) {
	if (!database) return;

	console.log(`🎧 Setting up event listeners for ${persona}'s database...`);
	console.log(`🎯 [StorachaTest] Database address: ${database.address}`);
	
	// Add this database address to our tracking set
	storachaTestDatabaseAddresses.add(database.address?.toString() || database.address);

	// Listen for new entries being added (join event)
	database.events.on('join', async (address, entry, heads) => {
		// Check if this event is for any StorachaTest database
		const eventAddress = address?.toString() || address;
		
		if (storachaTestDatabaseAddresses.has(eventAddress)) {
			console.log(`🔗 [StorachaTest-${persona}] JOIN EVENT:`, {
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
			if (persona === 'alice') {
				addResult('alice', 'Join Event', 'success', `New entry joined: ${entry?.key || 'unknown key'}`, {
					address: eventAddress,
					entryHash: entry?.hash?.toString() || entry?.hash,
					entryKey: entry?.key,
					entryValue: entry?.value
				});
			} else if (persona === 'bob') {
				addResult('bob', 'Join Event', 'success', `New entry joined: ${entry?.key || 'unknown key'}`, {
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
			console.log(`🔄 [StorachaTest-${persona}] UPDATE EVENT:`, {
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
			if (persona === 'alice') {
				addResult('alice', 'Update Event', 'success', `Entry updated: ${entry?.key || 'unknown key'}`, {
					address: eventAddress,
					entryHash: entry?.hash?.toString() || entry?.hash,
					entryKey: entry?.key,
					entryValue: entry?.value
				});
			} else if (persona === 'bob') {
				addResult('bob', 'Update Event', 'success', `Entry updated: ${entry?.key || 'unknown key'}`, {
					address: eventAddress,
					entryHash: entry?.hash?.toString() || entry?.hash,
					entryKey: entry?.key,
					entryValue: entry?.value
				});
			}
		}
	});

	console.log(`✅ [StorachaTest] Event listeners set up for database instance ${persona}`);
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
			db.name.includes('storacha-test') ||
			db.name.includes('alice') ||
			db.name.includes('bob')
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

	// Alice's functions
	async function initializeAlice() {
		if (aliceRunning) return;

		// Check Storacha authentication first
		if (!storachaAuthenticated || !storachaClient) {
			addResult('alice', 'Error', 'error', 'Please authenticate with Storacha first');
			return;
		}
		
		aliceRunning = true;
		aliceError = null;
		aliceResults = [];
		aliceStep = 'Initializing Alice...';

		try {
			// Create shared identity if not exists
			if (!sharedIdentity) {
				addResult('alice', 'Identity', 'running', 'Creating shared identity...');
				const identityResult = await createReusableIdentity('shared');
				sharedIdentity = identityResult.identity;
				sharedIdentities = identityResult.identities;
				updateLastResult('alice', 'success', `Shared identity created: ${sharedIdentity.id}`);
			}

			// Create Alice's OrbitDB instance
			addResult('alice', 'Setup', 'running', 'Setting up Alice\'s OrbitDB instance...');
			
			const databaseConfig = {
				type: 'keyvalue',
				create: true,
				sync: true,
				accessController: IPFSAccessController({ write: ['*'] })
			};

			const instance = await createOrbitDBInstance('alice', 'instance', 'shared-todos', databaseConfig, true);
			aliceOrbitDB = instance.orbitdb;
			aliceDatabase = instance.database;
			aliceHelia = instance.helia;
			aliceLibp2p = instance.libp2p;

			updateLastResult('alice', 'success', `Alice's OrbitDB instance ready`, {
				orbitDBId: aliceOrbitDB.id,
				identityId: aliceOrbitDB.identity.id,
				databaseAddress: aliceDatabase.address
			});

			aliceStep = 'Alice ready to add todos';

		} catch (error) {
			console.error('❌ Alice initialization failed:', error);
			aliceError = error.message;
			aliceStep = `Alice initialization failed: ${error.message}`;
			updateLastResult('alice', 'error', error.message);
		} finally {
			aliceRunning = false;
		}
	}

	async function addTodos() {
		if (aliceRunning || !aliceDatabase) return;
		
		aliceRunning = true;
		aliceStep = 'Adding todos...';
		
		try {
			addResult('alice', 'Adding Todos', 'running', 'Adding test todos to database...');

			for (let i = 0; i < originalTodos.length; i++) {
				const todo = originalTodos[i];
				await aliceDatabase.put(todo.id, todo);
				console.log(`✅ Alice added todo ${i + 1}:`, todo);
			}

			// Get all todos to verify and display
			aliceTodos = await aliceDatabase.all();
			
			updateLastResult('alice', 'success', `Successfully added ${aliceTodos.length} todos`, {
				todosAdded: aliceTodos.map(t => ({ key: t.key, text: t.value.text, completed: t.value.completed }))
			});

			aliceStep = 'Alice ready to backup';

		} catch (error) {
			console.error('❌ Adding todos failed:', error);
			aliceError = error.message;
			aliceStep = `Adding todos failed: ${error.message}`;
			updateLastResult('alice', 'error', error.message);
		} finally {
			aliceRunning = false;
		}
	}

	async function backupAlice() {
		if (aliceRunning || !aliceDatabase) return;

		// Check Storacha authentication
		if (!storachaAuthenticated || !storachaClient) {
			addResult('alice', 'Error', 'error', 'Storacha authentication required for backup');
			return;
		}
		
		aliceRunning = true;
		aliceStep = 'Creating backup...';
		
		try {
			addResult('alice', 'Backup', 'running', 'Creating backup to Storacha...');

			const databaseConfig = {
				type: 'keyvalue',
				create: true,
				sync: true,
				accessController: IPFSAccessController({ write: ['*'] })
			};

			// Get Storacha credentials based on authentication method
			let backupOptions = {
				dbConfig: databaseConfig,
				logEntriesOnly: true,
				timeout: 60000
			};

			// Add credentials based on authentication method
			if (storachaCredentials.method === 'credentials') {
				// For credentials-based auth, we need the actual key/proof
				const storachaKey = localStorage.getItem('storacha_key');
				const storachaProof = localStorage.getItem('storacha_proof');
				
				if (storachaKey && storachaProof) {
					backupOptions.storachaKey = storachaKey;
					backupOptions.storachaProof = storachaProof;
				} else {
					throw new Error('Storacha credentials not found in storage');
				}
			} else {
				// For UCAN or seed-based auth, we can use the client directly
				throw new Error(`Backup with ${storachaCredentials.method} authentication not yet implemented`);
			}

			backupResult = await backupDatabase(aliceOrbitDB, aliceDatabase.address, backupOptions);

			if (!backupResult.success) {
				throw new Error(`Backup failed: ${backupResult.error}`);
			}

			updateLastResult('alice', 'success', `Backup created successfully with ${backupResult.blocksUploaded}/${backupResult.blocksTotal} blocks`, {
				manifestCID: backupResult.manifestCID,
				databaseAddress: backupResult.databaseAddress,
				blocksTotal: backupResult.blocksTotal,
				blocksUploaded: backupResult.blocksUploaded
			});

			aliceStep = 'Alice backup complete - Bob can now restore';

		} catch (error) {
			console.error('❌ Backup failed:', error);
			aliceError = error.message;
			aliceStep = `Backup failed: ${error.message}`;
			updateLastResult('alice', 'error', error.message);
		} finally {
			aliceRunning = false;
		}
	}

	// Bob's functions
	async function initializeBob() {
		if (bobRunning || !backupResult) return;

		// Check Storacha authentication first
		if (!storachaAuthenticated || !storachaClient) {
			addResult('bob', 'Error', 'error', 'Please authenticate with Storacha first');
			return;
		}
		
		bobRunning = true;
		bobError = null;
		bobResults = [];
		bobStep = 'Initializing Bob...';

		try {
			if (!sharedIdentity && bobUseSameIdentity) {
				throw new Error('Shared identity not available. Alice must initialize first.');
			}

			// Create Bob's own identity if needed
			if (!bobUseSameIdentity && !bobIdentity) {
				addResult('bob', 'Identity', 'running', 'Creating Bob\'s own identity...');
				const identityResult = await createReusableIdentity('bob');
				bobIdentity = identityResult.identity;
				bobIdentities = identityResult.identities;
				updateLastResult('bob', 'success', `Bob's identity created: ${bobIdentity.id}`, {
					identityId: bobIdentity.id,
					identityType: bobIdentity.type
				});
			}

			addResult('bob', 'Setup', 'running', `Setting up Bob's OrbitDB instance with ${bobUseSameIdentity ? 'shared' : 'own'} identity...`);
			
			const databaseConfig = {
				type: 'keyvalue',
				create: true,
				sync: true,
				accessController: IPFSAccessController({ write: ['*'] })
			};

			const instance = await createOrbitDBInstance('bob', 'instance', 'shared-todos', databaseConfig, bobUseSameIdentity);
			bobOrbitDB = instance.orbitdb;
			bobDatabase = instance.database;
			bobHelia = instance.helia;
			bobLibp2p = instance.libp2p;

			const identityUsed = bobUseSameIdentity ? sharedIdentity : bobIdentity;
			updateLastResult('bob', 'success', `Bob's OrbitDB instance ready with ${bobUseSameIdentity ? 'shared' : 'own'} identity`, {
				orbitDBId: bobOrbitDB.id,
				identityId: bobOrbitDB.identity.id,
				databaseAddress: bobDatabase.address,
				usingSameIdentity: bobUseSameIdentity,
				identityMatches: bobOrbitDB.identity.id === (sharedIdentity?.id || 'none')
			});

			bobStep = 'Bob ready to restore';

		} catch (error) {
			console.error('❌ Bob initialization failed:', error);
			bobError = error.message;
			bobStep = `Bob initialization failed: ${error.message}`;
			updateLastResult('bob', 'error', error.message);
		} finally {
			bobRunning = false;
		}
	}

	async function restoreBob() {
		if (bobRunning || !bobOrbitDB || !backupResult) return;

		// Check Storacha authentication
		if (!storachaAuthenticated || !storachaClient) {
			addResult('bob', 'Error', 'error', 'Storacha authentication required for restore');
			return;
		}
		
		bobRunning = true;
		bobStep = 'Restoring from backup...';
		
		try {
			const identityInfo = bobUseSameIdentity ? 'same identity as Alice' : 'his own identity';
			addResult('bob', 'Restore', 'running', `Restoring database from Storacha backup using ${identityInfo}...`);

			const databaseConfig = {
				type: 'keyvalue',
				create: true,
				sync: true,
				accessController: IPFSAccessController({ write: ['*'] })
			};

			// Get Storacha credentials based on authentication method
			let restoreOptions = {
				dbName: 'shared-todos',
				dbConfig: databaseConfig,
				timeout: 120000
			};

			// Add credentials based on authentication method
			if (storachaCredentials.method === 'credentials') {
				const storachaKey = localStorage.getItem('storacha_key');
				const storachaProof = localStorage.getItem('storacha_proof');
				
				if (storachaKey && storachaProof) {
					restoreOptions.storachaKey = storachaKey;
					restoreOptions.storachaProof = storachaProof;
				} else {
					throw new Error('Storacha credentials not found in storage');
				}
			} else {
				throw new Error(`Restore with ${storachaCredentials.method} authentication not yet implemented`);
			}

			restoreResult = await restoreLogEntriesOnly(bobOrbitDB, restoreOptions);

			if (!restoreResult.success) {
				throw new Error(`Restore failed: ${restoreResult.error}`);
			}

			// Get restored todos
			const restoredDatabase = restoreResult.database;
			
			// Add restored database to tracking
			if (restoredDatabase && restoredDatabase.address) {
				storachaTestDatabaseAddresses.add(restoredDatabase.address?.toString() || restoredDatabase.address);
			}
			
			// Wait for indexing
			await new Promise(resolve => setTimeout(resolve, 5000));
			bobTodos = await restoredDatabase.all();

			const optimizationInfo = restoreResult.optimizationSavings 
				? `(${restoreResult.optimizationSavings.percentageSaved}% fewer downloads)` 
				: '';

			updateLastResult('bob', 'success', `Database restored successfully with ${restoreResult.entriesRecovered} entries using ${identityInfo} ${optimizationInfo}`, {
				manifestCID: restoreResult.manifestCID,
				databaseAddress: restoreResult.address,
				entriesRecovered: restoreResult.entriesRecovered,
				todosRestored: bobTodos.map(t => ({ key: t.key, text: t.value.text, completed: t.value.completed })),
				usingSameIdentity: bobUseSameIdentity,
				identityUsed: bobOrbitDB.identity.id
			});

			bobStep = 'Bob restore complete';

		} catch (error) {
			console.error('❌ Restore failed:', error);
			bobError = error.message;
			bobStep = `Restore failed: ${error.message}`;
			updateLastResult('bob', 'error', error.message);
		} finally {
			bobRunning = false;
		}
	}

	// Cleanup functions
	async function cleanup() {
		console.log('🧹 Cleaning up all instances...');
		
		// Cleanup Alice
		try {
			if (aliceDatabase) await aliceDatabase.close();
			if (aliceOrbitDB) await aliceOrbitDB.stop();
			if (aliceHelia) await aliceHelia.stop();
			if (aliceLibp2p) await aliceLibp2p.stop();
		} catch (error) {
			console.warn('⚠️ Alice cleanup error:', error.message);
		}
		
		// Cleanup Bob
		try {
			if (bobDatabase) await bobDatabase.close();
			if (bobOrbitDB) await bobOrbitDB.stop();
			if (bobHelia) await bobHelia.stop();
			if (bobLibp2p) await bobLibp2p.stop();
		} catch (error) {
			console.warn('⚠️ Bob cleanup error:', error.message);
		}

		await clearIndexedDB();

		// Reset state
		aliceOrbitDB = null;
		aliceDatabase = null;
		aliceHelia = null;
		aliceLibp2p = null;
		aliceTodos = [];
		aliceResults = [];
		aliceStep = '';
		aliceError = null;

		bobOrbitDB = null;
		bobDatabase = null;
		bobHelia = null;
		bobLibp2p = null;
		bobTodos = [];
		bobResults = [];
		bobStep = '';
		bobError = null;
		bobUseSameIdentity = true;
		bobIdentity = null;
		bobIdentities = null;

		sharedIdentity = null;
		sharedIdentities = null;
		backupResult = null;
		restoreResult = null;
		storachaTestDatabaseAddresses.clear();
	}

	// Utility functions
	function formatTimestamp(timestamp) {
		return new Date(timestamp).toLocaleTimeString();
	}

	function getStatusIcon(status) {
		switch (status) {
			case 'running': return Loader2;
			case 'success': return CheckCircle;
			case 'error': return AlertCircle;
			default: return AlertCircle;
		}
	}

	function getStatusClass(status) {
		switch (status) {
			case 'running': return 'text-blue-600 dark:text-blue-400';
			case 'success': return 'text-green-600 dark:text-green-400';
			case 'error': return 'text-red-600 dark:text-red-400';
			default: return 'text-gray-600 dark:text-gray-400';
		}
	}

	/**
 * A basic Libp2p configuration for browser nodes.
 */
const DefaultLibp2pBrowserOptions = {
  addresses: {
    listen: ['/webrtc', '/p2p-circuit']
  },
  transports: [
    webSockets({
      filter: all
    }),
    webRTC(),
    circuitRelayTransport()
  ],
  connectionEncrypters: [noise()],
  streamMuxers: [yamux()],
  connectionGater: {
    denyDialMultiaddr: () => false
  },
  services: {
    identify: identify(),
    pubsub: gossipsub({ allowPublishToZeroTopicPeers: true })
  }
}
</script>

<div class="mt-6 rounded-lg border border-purple-200 bg-gradient-to-r from-purple-50 to-pink-50 p-6 dark:border-gray-600 dark:from-gray-700 dark:to-gray-600">
	<!-- Storacha Authentication Section -->
	<div class="mb-8">
		<StorachaAuth 
			on:authenticated={handleStorachaAuthenticated}
			on:logout={handleStorachaLogout}
			on:spaceChanged={handleSpaceChanged}
			autoLogin={true}
			showTitle={true}
			compact={false}
		/>
		
		{#if !storachaAuthenticated}
			<div class="mt-4 rounded-md border border-orange-300 bg-orange-100 p-3 dark:border-orange-600 dark:bg-orange-900/30">
				<div class="flex items-center space-x-2">
					<AlertCircle class="h-4 w-4 text-orange-600 dark:text-orange-400" />
					<span class="text-sm text-orange-700 dark:text-orange-300">
						Please authenticate with Storacha above to enable backup and restore functionality
					</span>
				</div>
			</div>
		{/if}
	</div>

	<!-- Header -->
	<div class="mb-6 text-center">
		<div class="mb-4 flex items-center justify-center space-x-2">
			<Database class="h-6 w-6 text-purple-600 dark:text-purple-400" />
			<h3 class="text-xl font-bold text-gray-800 dark:text-white">
				Alice & Bob Backup/Restore Demo
			</h3>
		</div>
		<p class="text-sm text-purple-800 dark:text-purple-200">
			Alice creates todos and backs them up to Storacha. Bob restores the data from the backup using either the same identity or his own.
		</p>
	</div>

	<!-- Controls -->
	<div class="mb-6 flex items-center justify-center space-x-3">
		<button
			on:click={() => (showDetails = !showDetails)}
			class="flex items-center space-x-2 rounded-md bg-gray-600 px-3 py-2 text-sm text-white transition-colors hover:bg-gray-700"
		>
			{#if showDetails}
				<EyeOff class="h-4 w-4" />
				<span>Hide Details</span>
			{:else}
				<Eye class="h-4 w-4" />
				<span>Show Details</span>
			{/if}
		</button>

		<button
			on:click={cleanup}
			class="flex items-center space-x-2 rounded-md bg-red-600 px-3 py-2 text-sm text-white transition-colors hover:bg-red-700"
		>
			<span>Reset All</span>
		</button>
	</div>

	<!-- Two-column layout -->
	<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
		<!-- Alice's Section -->
		<div class="rounded-lg border bg-white p-4 dark:bg-gray-800">
			<div class="mb-4 flex items-center space-x-2">
				<div class="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900">
					<User class="h-4 w-4 text-blue-600 dark:text-blue-400" />
				</div>
				<h4 class="text-lg font-semibold text-gray-800 dark:text-white">
					Alice (Data Creator)
				</h4>
			</div>

			<!-- Alice's Status -->
			{#if aliceStep}
				<div class="mb-3 rounded-md border bg-blue-50 p-3 dark:bg-blue-900/20">
					<div class="flex items-center space-x-2">
						{#if aliceRunning}
							<Loader2 class="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400" />
						{:else if aliceError}
							<AlertCircle class="h-4 w-4 text-red-600 dark:text-red-400" />
						{:else}
							<CheckCircle class="h-4 w-4 text-green-600 dark:text-green-400" />
						{/if}
						<span class="text-sm font-medium text-gray-800 dark:text-white">
							{aliceStep}
						</span>
					</div>
				</div>
			{/if}

			<!-- Alice's Actions -->
			<div class="mb-4 space-y-2">
				<button
					on:click={initializeAlice}
					disabled={aliceRunning || aliceOrbitDB || !storachaAuthenticated}
					class="flex w-full items-center justify-center space-x-2 rounded-md bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
				>
					{#if aliceRunning}
						<Loader2 class="h-4 w-4 animate-spin" />
					{:else}
						<Database class="h-4 w-4" />
					{/if}
					<span>1. Initialize Alice</span>
				</button>

				<button
					on:click={addTodos}
					disabled={aliceRunning || !aliceDatabase || aliceTodos.length > 0}
					class="flex w-full items-center justify-center space-x-2 rounded-md bg-green-600 px-4 py-2 text-white transition-colors hover:bg-green-700 disabled:opacity-50"
				>
					{#if aliceRunning}
						<Loader2 class="h-4 w-4 animate-spin" />
					{:else}
						<Plus class="h-4 w-4" />
					{/if}
					<span>2. Add Todos</span>
				</button>

				<button
					on:click={backupAlice}
					disabled={aliceRunning || aliceTodos.length === 0 || backupResult || !storachaAuthenticated}
					class="flex w-full items-center justify-center space-x-2 rounded-md bg-purple-600 px-4 py-2 text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
				>
					{#if aliceRunning}
						<Loader2 class="h-4 w-4 animate-spin" />
					{:else}
						<Upload class="h-4 w-4" />
					{/if}
					<span>3. Backup to Storacha</span>
				</button>
			</div>

			<!-- Alice's Todos -->
			{#if aliceTodos.length > 0}
				<div class="mb-4">
					<h5 class="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Alice's Todos:</h5>
					<div class="space-y-1">
						{#each aliceTodos as todo}
							<div class="flex items-center space-x-2 rounded bg-gray-50 p-2 text-xs dark:bg-gray-700">
								<span class="font-mono text-gray-500">{todo.key}:</span>
								<span class={todo.value.completed ? 'line-through text-gray-500' : 'text-gray-800 dark:text-white'}>
									{todo.value.text}
								</span>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Alice's Results -->
			{#if aliceResults.length > 0}
				<div class="rounded-md border bg-gray-50 p-3 dark:bg-gray-700">
					<h5 class="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Alice's Progress:</h5>
					<div class="space-y-2">
						{#each aliceResults as result}
							<div class="flex items-start space-x-2">
								<svelte:component 
									this={getStatusIcon(result.status)} 
									class="h-3 w-3 mt-0.5 {getStatusClass(result.status)} {result.status === 'running' ? 'animate-spin' : ''}" 
								/>
								<div class="flex-1">
									<div class="flex items-center justify-between">
										<span class="text-xs font-medium text-gray-800 dark:text-white">
											{result.step}
										</span>
										<span class="text-xs text-gray-500">
											{formatTimestamp(result.timestamp)}
										</span>
									</div>
									<p class="text-xs text-gray-600 dark:text-gray-300">
										{result.message}
									</p>
									{#if showDetails && result.data}
										<details class="mt-1">
											<summary class="cursor-pointer text-xs text-blue-600 hover:text-blue-800">
												Details
											</summary>
											<pre class="mt-1 overflow-x-auto rounded bg-gray-100 p-1 text-xs dark:bg-gray-800">{JSON.stringify(result.data, null, 2)}</pre>
										</details>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>

		<!-- Bob's Section -->
		<div class="rounded-lg border bg-white p-4 dark:bg-gray-800">
			<div class="mb-4 flex items-center space-x-2">
				<div class="flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900">
					<User class="h-4 w-4 text-orange-600 dark:text-orange-400" />
				</div>
				<h4 class="text-lg font-semibold text-gray-800 dark:text-white">
					Bob (Data Restorer)
				</h4>
			</div>

			<!-- Bob's Identity Toggle -->
			<div class="mb-4 rounded-md border bg-orange-50 p-3 dark:bg-orange-900/20">
				<div class="mb-2 flex items-center justify-between">
					<span class="text-sm font-medium text-gray-700 dark:text-gray-300">
						Identity Choice:
					</span>
					<button
						on:click={() => bobUseSameIdentity = !bobUseSameIdentity}
						disabled={bobRunning || bobOrbitDB}
						class="flex items-center space-x-1 text-sm transition-colors hover:text-orange-600 disabled:opacity-50"
					>
						<svelte:component 
							this={bobUseSameIdentity ? ToggleRight : ToggleLeft}
							class="h-5 w-5 {bobUseSameIdentity ? 'text-orange-600' : 'text-gray-400'}"
						/>
						<span class="text-xs text-gray-600 dark:text-gray-400">
							{bobUseSameIdentity ? 'Same as Alice' : 'Own Identity'}
						</span>
					</button>
				</div>
				<p class="text-xs text-gray-600 dark:text-gray-400">
					{#if bobUseSameIdentity}
						🔗 Bob will use Alice's shared identity (DID) - typical for same user restoring data
					{:else}
						🆔 Bob will create his own identity (DID) - demonstrates cross-identity data sharing
					{/if}
				</p>
			</div>

			<!-- Bob's Status -->
			{#if bobStep}
				<div class="mb-3 rounded-md border bg-orange-50 p-3 dark:bg-orange-900/20">
					<div class="flex items-center space-x-2">
						{#if bobRunning}
							<Loader2 class="h-4 w-4 animate-spin text-orange-600 dark:text-orange-400" />
						{:else if bobError}
							<AlertCircle class="h-4 w-4 text-red-600 dark:text-red-400" />
						{:else}
							<CheckCircle class="h-4 w-4 text-green-600 dark:text-green-400" />
						{/if}
						<span class="text-sm font-medium text-gray-800 dark:text-white">
							{bobStep}
						</span>
					</div>
				</div>
			{/if}

			<!-- Bob's Actions -->
			<div class="mb-4 space-y-2">
				<button
					on:click={initializeBob}
					disabled={bobRunning || !backupResult || bobOrbitDB || !storachaAuthenticated}
					class="flex w-full items-center justify-center space-x-2 rounded-md bg-orange-600 px-4 py-2 text-white transition-colors hover:bg-orange-700 disabled:opacity-50"
				>
					{#if bobRunning}
						<Loader2 class="h-4 w-4 animate-spin" />
					{:else}
						<Database class="h-4 w-4" />
					{/if}
					<span>1. Initialize Bob</span>
				</button>

				<button
					on:click={restoreBob}
					disabled={bobRunning || !bobOrbitDB || restoreResult || !storachaAuthenticated}
					class="flex w-full items-center justify-center space-x-2 rounded-md bg-indigo-600 px-4 py-2 text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
				>
					{#if bobRunning}
						<Loader2 class="h-4 w-4 animate-spin" />
					{:else}
						<Download class="h-4 w-4" />
					{/if}
					<span>2. Restore from Storacha</span>
				</button>
			</div>

			<!-- Backup Status Indicator -->
			{#if !backupResult}
				<div class="mb-4 rounded-md border border-gray-300 bg-gray-50 p-3 dark:bg-gray-700">
					<div class="flex items-center space-x-2">
						<ArrowRight class="h-4 w-4 text-gray-400" />
						<span class="text-sm text-gray-600 dark:text-gray-400">
							Waiting for Alice to create backup...
						</span>
					</div>
				</div>
			{:else}
				<div class="mb-4 rounded-md border border-green-300 bg-green-50 p-3 dark:bg-green-900/20">
					<div class="flex items-center space-x-2">
						<CheckCircle class="h-4 w-4 text-green-600" />
						<span class="text-sm text-green-700 dark:text-green-300">
							Backup available from Alice
						</span>
					</div>
				</div>
			{/if}

			<!-- Bob's Todos -->
			{#if bobTodos.length > 0}
				<div class="mb-4">
					<h5 class="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Bob's Restored Todos:</h5>
					<div class="space-y-1">
						{#each bobTodos as todo}
							<div class="flex items-center space-x-2 rounded bg-gray-50 p-2 text-xs dark:bg-gray-700">
								<span class="font-mono text-gray-500">{todo.key}:</span>
								<span class={todo.value.completed ? 'line-through text-gray-500' : 'text-gray-800 dark:text-white'}>
									{todo.value.text}
								</span>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Bob's Results -->
			{#if bobResults.length > 0}
				<div class="rounded-md border bg-gray-50 p-3 dark:bg-gray-700">
					<h5 class="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Bob's Progress:</h5>
					<div class="space-y-2">
						{#each bobResults as result}
							<div class="flex items-start space-x-2">
								<svelte:component 
									this={getStatusIcon(result.status)} 
									class="h-3 w-3 mt-0.5 {getStatusClass(result.status)} {result.status === 'running' ? 'animate-spin' : ''}" 
								/>
								<div class="flex-1">
									<div class="flex items-center justify-between">
										<span class="text-xs font-medium text-gray-800 dark:text-white">
											{result.step}
										</span>
										<span class="text-xs text-gray-500">
											{formatTimestamp(result.timestamp)}
										</span>
									</div>
									<p class="text-xs text-gray-600 dark:text-gray-300">
										{result.message}
									</p>
									{#if showDetails && result.data}
										<details class="mt-1">
											<summary class="cursor-pointer text-xs text-orange-600 hover:text-orange-800">
												Details
											</summary>
											<pre class="mt-1 overflow-x-auto rounded bg-gray-100 p-1 text-xs dark:bg-gray-800">{JSON.stringify(result.data, null, 2)}</pre>
										</details>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	</div>

	<!-- Success Summary -->
	{#if aliceTodos.length > 0 && bobTodos.length > 0 && aliceTodos.length === bobTodos.length}
		<div class="mt-6 rounded-md border border-green-300 bg-green-100 p-4 dark:border-green-600 dark:bg-green-900/30">
			<div class="flex items-start space-x-2">
				<CheckCircle class="h-5 w-5 text-green-600 dark:text-green-400" />
				<div>
					<h4 class="font-medium text-green-800 dark:text-green-200">
						Success! Data Successfully Transferred ✅
					</h4>
					<p class="text-sm text-green-700 dark:text-green-300">
						Alice created {aliceTodos.length} todos and backed them up to Storacha. 
						Bob successfully restored all {bobTodos.length} todos from the backup using {bobUseSameIdentity ? 'the same identity' : 'his own identity'}!
					</p>
					{#if backupResult && restoreResult}
						<div class="mt-2 text-xs text-green-600 dark:text-green-400">
							Backup: {backupResult.blocksUploaded}/{backupResult.blocksTotal} blocks • 
							Restore: {restoreResult.entriesRecovered} entries recovered • 
							Identity: {bobUseSameIdentity ? 'Shared (Same DID)' : 'Separate (Different DID)'}
						</div>
					{/if}
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
