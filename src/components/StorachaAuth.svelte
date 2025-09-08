<script>
	import { createEventDispatcher } from 'svelte';
	import {
		Cloud,
		Key,
		Mail,
		Shuffle,
		Eye,
		EyeOff,
		Loader2,
		AlertCircle,
		CheckCircle,
		LogOut,
		Copy,
		RefreshCw,
		Plus
	} from 'lucide-svelte';
	import {
		initializeStorachaClient,
		initializeStorachaClientWithUCAN,
		initializeStorachaClientWithSeed,
		createStorachaAccount,
		listSpaces,
		createSpace,
		generateSeedPhrase,
		validateSeedPhrase
	} from './storacha-backup.js';

	const dispatch = createEventDispatcher();

	// Component props
	export let autoLogin = true;
	export let showTitle = true;
	export let compact = false;

	// Authentication state
	let isAuthenticated = false;
	let client = null;
	let currentSpace = null;
	let spaces = [];
	let authMethod = null; // 'credentials', 'ucan', 'seed'

	// UI state
	let isLoading = false;
	let status = '';
	let error = null;
	let success = null;
	let activeTab = 'credentials'; // 'credentials', 'ucan', 'seed', 'email'
	let showAdvanced = false;

	// Form data
	let email = '';
	let storachaKey = '';
	let storachaProof = '';
	let ucanToken = '';
	let recipientKey = '';
	let seedPhrase = '';
	let seedPassword = 'password';
	let delegationToken = '';
	let newSpaceName = '';

	// UI helpers
	let showSeedPhrase = false;
	let showPrivateKey = false;
	let showUcanToken = false;
	let showRecipientKey = false;

	// LocalStorage keys
	const STORAGE_KEYS = {
		STORACHA_KEY: 'storacha_key',
		STORACHA_PROOF: 'storacha_proof',
		UCAN_TOKEN: 'storacha_ucan_token',
		RECIPIENT_KEY: 'storacha_recipient_key',
		SEED_PHRASE: 'storacha_seed_phrase',
		SEED_PASSWORD: 'storacha_seed_password',
		DELEGATION_TOKEN: 'storacha_delegation_token',
		AUTH_METHOD: 'storacha_auth_method',
		AUTO_LOGIN: 'storacha_auto_login'
	};

	// Auto-hide messages
	function showMessage(message, type = 'info', duration = 5000) {
		if (type === 'error') {
			error = message;
			success = null;
		} else {
			success = message;
			error = null;
		}

		setTimeout(() => {
			error = null;
			success = null;
		}, duration);
	}

	// Save credentials to localStorage
	function saveCredentials(method, data) {
		try {
			localStorage.setItem(STORAGE_KEYS.AUTH_METHOD, method);
			localStorage.setItem(STORAGE_KEYS.AUTO_LOGIN, 'true');

			switch (method) {
				case 'credentials':
					localStorage.setItem(STORAGE_KEYS.STORACHA_KEY, data.key);
					localStorage.setItem(STORAGE_KEYS.STORACHA_PROOF, data.proof);
					break;
				case 'ucan':
					localStorage.setItem(STORAGE_KEYS.UCAN_TOKEN, data.ucanToken);
					localStorage.setItem(STORAGE_KEYS.RECIPIENT_KEY, data.recipientKey);
					break;
				case 'seed':
					localStorage.setItem(STORAGE_KEYS.SEED_PHRASE, data.seedPhrase);
					localStorage.setItem(STORAGE_KEYS.SEED_PASSWORD, data.seedPassword);
					if (data.delegationToken) {
						localStorage.setItem(STORAGE_KEYS.DELEGATION_TOKEN, data.delegationToken);
					}
					break;
			}
		} catch (err) {
			console.warn('Failed to save credentials:', err);
		}
	}

	// Load credentials from localStorage
	function loadStoredCredentials() {
		try {
			const method = localStorage.getItem(STORAGE_KEYS.AUTH_METHOD);
			const autoLoginEnabled = localStorage.getItem(STORAGE_KEYS.AUTO_LOGIN) === 'true';

			if (!method || !autoLoginEnabled) return null;

			switch (method) {
				case 'credentials':
					const key = localStorage.getItem(STORAGE_KEYS.STORACHA_KEY);
					const proof = localStorage.getItem(STORAGE_KEYS.STORACHA_PROOF);
					if (key && proof) return { method, key, proof };
					break;
				case 'ucan':
					const ucanToken = localStorage.getItem(STORAGE_KEYS.UCAN_TOKEN);
					const recipientKey = localStorage.getItem(STORAGE_KEYS.RECIPIENT_KEY);
					if (ucanToken && recipientKey) return { method, ucanToken, recipientKey };
					break;
				case 'seed':
					const seedPhrase = localStorage.getItem(STORAGE_KEYS.SEED_PHRASE);
					const seedPassword = localStorage.getItem(STORAGE_KEYS.SEED_PASSWORD);
					const delegationToken = localStorage.getItem(STORAGE_KEYS.DELEGATION_TOKEN);
					if (seedPhrase && seedPassword) return { method, seedPhrase, seedPassword, delegationToken };
					break;
			}
		} catch (err) {
			console.warn('Failed to load credentials:', err);
		}
		return null;
	}

	// Clear stored credentials
	function clearStoredCredentials() {
		try {
			Object.values(STORAGE_KEYS).forEach(key => {
				localStorage.removeItem(key);
			});
		} catch (err) {
			console.warn('Failed to clear credentials:', err);
		}
	}

	// Authentication methods
	async function authenticateWithCredentials() {
		if (!storachaKey.trim() || !storachaProof.trim()) {
			showMessage('Please provide both Storacha key and proof', 'error');
			return;
		}

		isLoading = true;
		status = 'Authenticating with credentials...';

		try {
			client = await initializeStorachaClient(storachaKey.trim(), storachaProof.trim());
			authMethod = 'credentials';
			
			await loadSpaces();
			
			saveCredentials('credentials', { key: storachaKey.trim(), proof: storachaProof.trim() });
			isAuthenticated = true;
			
			showMessage('Successfully authenticated with Storacha credentials!');
			dispatch('authenticated', { client, method: 'credentials', spaces });
		} catch (err) {
			showMessage(`Authentication failed: ${err.message}`, 'error');
		} finally {
			isLoading = false;
			status = '';
		}
	}

	async function authenticateWithUCAN() {
		if (!ucanToken.trim() || !recipientKey.trim()) {
			showMessage('Please provide both UCAN token and recipient key', 'error');
			return;
		}

		isLoading = true;
		status = 'Authenticating with UCAN...';

		try {
			client = await initializeStorachaClientWithUCAN(ucanToken.trim(), recipientKey.trim());
			authMethod = 'ucan';
			
			await loadSpaces();
			
			saveCredentials('ucan', { ucanToken: ucanToken.trim(), recipientKey: recipientKey.trim() });
			isAuthenticated = true;
			
			showMessage('Successfully authenticated with UCAN delegation!');
			dispatch('authenticated', { client, method: 'ucan', spaces });
		} catch (err) {
			showMessage(`UCAN authentication failed: ${err.message}`, 'error');
		} finally {
			isLoading = false;
			status = '';
		}
	}

	async function authenticateWithSeed() {
		if (!seedPhrase.trim()) {
			showMessage('Please provide a seed phrase', 'error');
			return;
		}

		if (!validateSeedPhrase(seedPhrase.trim())) {
			showMessage('Invalid seed phrase format', 'error');
			return;
		}

		isLoading = true;
		status = 'Authenticating with seed phrase...';

		try {
			const result = await initializeStorachaClientWithSeed(
				seedPhrase.trim(),
				seedPassword.trim() || 'password',
				delegationToken.trim() || null
			);
			
			client = result.client;
			authMethod = 'seed';
			
			await loadSpaces();
			
			saveCredentials('seed', {
				seedPhrase: seedPhrase.trim(),
				seedPassword: seedPassword.trim() || 'password',
				delegationToken: delegationToken.trim()
			});
			isAuthenticated = true;
			
			const message = delegationToken.trim() 
				? 'Successfully authenticated with seed phrase and delegation!'
				: 'Authenticated with seed phrase (limited functionality without delegation)';
			showMessage(message);
			dispatch('authenticated', { client, method: 'seed', identity: result.identity, spaces });
		} catch (err) {
			showMessage(`Seed authentication failed: ${err.message}`, 'error');
		} finally {
			isLoading = false;
			status = '';
		}
	}

	async function createAccount() {
		if (!email.trim()) {
			showMessage('Please enter your email address', 'error');
			return;
		}

		isLoading = true;
		status = 'Creating account...';

		try {
			const result = await createStorachaAccount(email.trim());
			if (result.success) {
				showMessage(result.message);
			} else {
				showMessage(result.error, 'error');
			}
		} catch (err) {
			showMessage(`Account creation failed: ${err.message}`, 'error');
		} finally {
			isLoading = false;
			status = '';
		}
	}

	// Space management
	async function loadSpaces() {
		if (!client) return;

		try {
			spaces = await listSpaces(client);
			currentSpace = client.currentSpace();
		} catch (err) {
			console.warn('Failed to load spaces:', err);
			spaces = [];
		}
	}

	async function createNewSpace() {
		if (!newSpaceName.trim()) {
			showMessage('Please enter a space name', 'error');
			return;
		}

		isLoading = true;
		status = 'Creating space...';

		try {
			const result = await createSpace(client, newSpaceName.trim());
			if (result.success) {
				showMessage(`Space "${newSpaceName}" created successfully!`);
				newSpaceName = '';
				await loadSpaces();
			} else {
				showMessage(result.error, 'error');
			}
		} catch (err) {
			showMessage(`Failed to create space: ${err.message}`, 'error');
		} finally {
			isLoading = false;
			status = '';
		}
	}

	async function selectSpace(space) {
		try {
			await client.setCurrentSpace(space.did);
			currentSpace = space;
			showMessage(`Switched to space: ${space.name}`);
			dispatch('spaceChanged', { space });
		} catch (err) {
			showMessage(`Failed to switch space: ${err.message}`, 'error');
		}
	}

	// Logout
	function logout() {
		isAuthenticated = false;
		client = null;
		currentSpace = null;
		spaces = [];
		authMethod = null;
		clearStoredCredentials();
		clearForms();
		showMessage('Logged out successfully');
		dispatch('logout');
	}

	// Clear forms
	function clearForms() {
		email = '';
		storachaKey = '';
		storachaProof = '';
		ucanToken = '';
		recipientKey = '';
		seedPhrase = '';
		seedPassword = 'password';
		delegationToken = '';
		newSpaceName = '';
	}

	// Utility functions
	function generateNewSeedPhrase() {
		seedPhrase = generateSeedPhrase();
		showMessage('New seed phrase generated!');
	}

	async function copyToClipboard(text) {
		try {
			await navigator.clipboard.writeText(text);
			showMessage('Copied to clipboard!');
		} catch (err) {
			showMessage('Failed to copy to clipboard', 'error');
		}
	}

	// Auto-login on mount
	import { onMount } from 'svelte';

	onMount(async () => {
		if (!autoLogin) return;

		const stored = loadStoredCredentials();
		if (!stored) return;

		console.log(`🔄 Auto-login with ${stored.method}...`);
		
		// Set form values
		switch (stored.method) {
			case 'credentials':
				storachaKey = stored.key;
				storachaProof = stored.proof;
				activeTab = 'credentials';
				await authenticateWithCredentials();
				break;
			case 'ucan':
				ucanToken = stored.ucanToken;
				recipientKey = stored.recipientKey;
				activeTab = 'ucan';
				await authenticateWithUCAN();
				break;
			case 'seed':
				seedPhrase = stored.seedPhrase;
				seedPassword = stored.seedPassword;
				delegationToken = stored.delegationToken || '';
				activeTab = 'seed';
				await authenticateWithSeed();
				break;
		}
	});

	// Export authentication status for parent components
	export { isAuthenticated, client, currentSpace, spaces, authMethod };
</script>

<div class="rounded-lg border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-4 dark:border-gray-600 dark:from-gray-700 dark:to-gray-600">
	<!-- Header -->
	{#if showTitle}
		<div class="mb-4 flex items-center justify-between">
			<div class="flex items-center space-x-2">
				<Cloud class="h-5 w-5 text-blue-600 dark:text-blue-400" />
				<h3 class="text-lg font-semibold text-gray-800 dark:text-white">Storacha Authentication</h3>
			</div>
		</div>
	{/if}

	<!-- Status Messages -->
	{#if error}
		<div class="mb-4 rounded-md border border-red-300 bg-red-100 p-3 dark:border-red-600 dark:bg-red-900/30">
			<div class="flex items-center space-x-2">
				<AlertCircle class="h-4 w-4 text-red-600 dark:text-red-400" />
				<span class="text-sm text-red-700 dark:text-red-300">{error}</span>
			</div>
		</div>
	{/if}

	{#if success}
		<div class="mb-4 rounded-md border border-green-300 bg-green-100 p-3 dark:border-green-600 dark:bg-green-900/30">
			<div class="flex items-center space-x-2">
				<CheckCircle class="h-4 w-4 text-green-600 dark:text-green-400" />
				<span class="text-sm text-green-700 dark:text-green-300">{success}</span>
			</div>
		</div>
	{/if}

	{#if status}
		<div class="mb-4 rounded-md border border-blue-300 bg-blue-100 p-3 dark:border-blue-600 dark:bg-blue-900/30">
			<div class="flex items-center space-x-2">
				<Loader2 class="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400" />
				<span class="text-sm text-blue-700 dark:text-blue-300">{status}</span>
			</div>
		</div>
	{/if}

	{#if !isAuthenticated}
		<!-- Authentication Tabs -->
		<div class="mb-4 flex space-x-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-700">
			<button
				on:click={() => activeTab = 'credentials'}
				class="flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors {activeTab === 'credentials' ? 'bg-white text-gray-900 shadow dark:bg-gray-600 dark:text-white' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}"
			>
				<Key class="mx-auto h-4 w-4 mb-1" />
				Credentials
			</button>
			<button
				on:click={() => activeTab = 'ucan'}
				class="flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors {activeTab === 'ucan' ? 'bg-white text-gray-900 shadow dark:bg-gray-600 dark:text-white' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}"
			>
				🎫
				UCAN
			</button>
			<button
				on:click={() => activeTab = 'seed'}
				class="flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors {activeTab === 'seed' ? 'bg-white text-gray-900 shadow dark:bg-gray-600 dark:text-white' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}"
			>
				<Shuffle class="mx-auto h-4 w-4 mb-1" />
				Seed
			</button>
			<button
				on:click={() => activeTab = 'email'}
				class="flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors {activeTab === 'email' ? 'bg-white text-gray-900 shadow dark:bg-gray-600 dark:text-white' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}"
			>
				<Mail class="mx-auto h-4 w-4 mb-1" />
				Email
			</button>
		</div>

		<!-- Authentication Forms -->
		<div class="rounded-md border bg-white p-4 dark:bg-gray-800">
			{#if activeTab === 'credentials'}
				<!-- Key/Proof Authentication -->
				<h4 class="mb-3 font-medium text-gray-800 dark:text-white">Storacha Key & Proof</h4>
				<div class="space-y-3">
					<div>
						<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
							Private Key
						</label>
						<div class="relative">
							<input
								bind:value={storachaKey}
								type={showPrivateKey ? 'text' : 'password'}
								placeholder="MgCZ9...your-storacha-private-key"
								class="w-full rounded-md border border-gray-300 bg-white px-3 py-2 pr-10 font-mono text-sm text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
							/>
							<button
								type="button"
								on:click={() => showPrivateKey = !showPrivateKey}
								class="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
							>
								<svelte:component this={showPrivateKey ? EyeOff : Eye} class="h-4 w-4" />
							</button>
						</div>
					</div>
					<div>
						<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
							Proof (Delegation)
						</label>
						<textarea
							bind:value={storachaProof}
							placeholder="uCAIS...your-storacha-proof"
							rows="3"
							class="w-full resize-none rounded-md border border-gray-300 bg-white px-3 py-2 font-mono text-xs text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
						></textarea>
					</div>
					<button
						on:click={authenticateWithCredentials}
						disabled={isLoading || !storachaKey.trim() || !storachaProof.trim()}
						class="w-full rounded-md bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
					>
						{isLoading ? 'Authenticating...' : 'Login with Credentials'}
					</button>
				</div>

			{:else if activeTab === 'ucan'}
				<!-- UCAN Authentication -->
				<h4 class="mb-3 font-medium text-gray-800 dark:text-white">UCAN Delegation</h4>
				<div class="space-y-3">
					<div>
						<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
							UCAN Token (Base64)
						</label>
						<div class="relative">
							<textarea
								bind:value={ucanToken}
								placeholder="eyJh...base64-encoded-ucan-token"
								rows="3"
								class="w-full resize-none rounded-md border border-gray-300 bg-white px-3 py-2 pr-10 font-mono text-xs text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
							></textarea>
							<button
								type="button"
								on:click={() => showUcanToken = !showUcanToken}
								class="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
							>
								<svelte:component this={showUcanToken ? EyeOff : Eye} class="h-4 w-4" />
							</button>
						</div>
					</div>
					<div>
						<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
							Recipient Key (JSON)
						</label>
						<div class="relative">
							<textarea
								bind:value={recipientKey}
								placeholder='did key as json'
								rows="3"
								class="w-full resize-none rounded-md border border-gray-300 bg-white px-3 py-2 pr-10 font-mono text-xs text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
							></textarea>
							<button
								type="button"
								on:click={() => showRecipientKey = !showRecipientKey}
								class="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
							>
								<svelte:component this={showRecipientKey ? EyeOff : Eye} class="h-4 w-4" />
							</button>
						</div>
					</div>
					<button
						on:click={authenticateWithUCAN}
						disabled={isLoading || !ucanToken.trim() || !recipientKey.trim()}
						class="w-full rounded-md bg-purple-600 px-4 py-2 text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
					>
						{isLoading ? 'Authenticating...' : 'Login with UCAN'}
					</button>
				</div>

			{:else if activeTab === 'seed'}
				<!-- Seed Phrase Authentication -->
				<h4 class="mb-3 font-medium text-gray-800 dark:text-white">Seed Phrase</h4>
				<div class="space-y-3">
					<div>
						<div class="flex items-center justify-between mb-1">
							<label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
								Seed Phrase (12-24 words)
							</label>
							<button
								type="button"
								on:click={generateNewSeedPhrase}
								class="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400"
							>
								<RefreshCw class="inline h-3 w-3 mr-1" />
								Generate
							</button>
						</div>
						<div class="relative">
							<textarea
								bind:value={seedPhrase}
								placeholder="abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art"
								rows="2"
								class="w-full resize-none rounded-md border border-gray-300 bg-white px-3 py-2 pr-10 text-sm text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
							></textarea>
							<button
								type="button"
								on:click={() => showSeedPhrase = !showSeedPhrase}
								class="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
							>
								<svelte:component this={showSeedPhrase ? EyeOff : Eye} class="h-4 w-4" />
							</button>
						</div>
					</div>
					<div>
						<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
							Password (optional)
						</label>
						<input
							bind:value={seedPassword}
							type="password"
							placeholder="password"
							class="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
						/>
					</div>
					<div>
						<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
							Delegation Token (optional)
						</label>
						<textarea
							bind:value={delegationToken}
							placeholder="eyJh...base64-encoded-delegation-token"
							rows="2"
							class="w-full resize-none rounded-md border border-gray-300 bg-white px-3 py-2 font-mono text-xs text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
						></textarea>
						<p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
							Without delegation, you can only create identities but not upload to Storacha
						</p>
					</div>
					<button
						on:click={authenticateWithSeed}
						disabled={isLoading || !seedPhrase.trim()}
						class="w-full rounded-md bg-green-600 px-4 py-2 text-white transition-colors hover:bg-green-700 disabled:opacity-50"
					>
						{isLoading ? 'Authenticating...' : 'Login with Seed'}
					</button>
				</div>

			{:else if activeTab === 'email'}
				<!-- Email Account Creation -->
				<h4 class="mb-3 font-medium text-gray-800 dark:text-white">Create Account</h4>
				<div class="space-y-3">
					<input
						bind:value={email}
						type="email"
						placeholder="Enter your email address"
						class="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
					/>
					<button
						on:click={createAccount}
						disabled={isLoading || !email.trim()}
						class="w-full rounded-md bg-green-600 px-4 py-2 text-white transition-colors hover:bg-green-700 disabled:opacity-50"
					>
						{isLoading ? 'Creating...' : 'Create Account'}
					</button>
					<p class="text-xs text-gray-500 dark:text-gray-400">
						This will guide you through manual account creation at web3.storage
					</p>
				</div>
			{/if}
		</div>

	{:else}
		<!-- Authenticated State -->
		<div class="space-y-4">
			<!-- Account Info -->
			<div class="flex items-center justify-between rounded-md border bg-white p-3 dark:bg-gray-800">
				<div class="flex items-center space-x-3">
					<div class="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
						<CheckCircle class="h-4 w-4 text-green-600 dark:text-green-400" />
					</div>
					<div>
						<div class="text-sm font-medium text-gray-800 dark:text-white">
							Connected via {authMethod}
						</div>
						{#if currentSpace}
							<div class="text-xs text-gray-500 dark:text-gray-400">
								Space: {currentSpace.name || currentSpace.did.slice(-8)}
							</div>
						{/if}
					</div>
				</div>

				<button
					on:click={logout}
					class="flex items-center space-x-1 px-3 py-1 text-sm text-red-600 transition-colors hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
				>
					<LogOut class="h-3 w-3" />
					<span>Logout</span>
				</button>
			</div>

			<!-- Space Management -->
			{#if !compact}
				<div class="rounded-md border bg-white p-4 dark:bg-gray-800">
					<h4 class="mb-3 text-sm font-medium text-gray-800 dark:text-white">
						Spaces ({spaces.length})
					</h4>

					<!-- Create New Space -->
					<div class="mb-4 flex space-x-2">
						<input
							bind:value={newSpaceName}
							placeholder="New space name"
							class="flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
						/>
						<button
							on:click={createNewSpace}
							disabled={isLoading || !newSpaceName.trim()}
							class="rounded-md bg-green-600 px-3 py-2 text-white transition-colors hover:bg-green-700 disabled:opacity-50"
						>
							<Plus class="h-4 w-4" />
						</button>
					</div>

					<!-- Spaces List -->
					{#if spaces.length === 0}
						<div class="py-4 text-center text-sm text-gray-500 dark:text-gray-400">
							No spaces found
						</div>
					{:else}
						<div class="max-h-40 space-y-2 overflow-y-auto">
							{#each spaces as space (space.did)}
								<div class="flex items-center justify-between rounded border bg-gray-50 p-2 dark:bg-gray-700">
									<div>
										<div class="text-sm font-medium text-gray-800 dark:text-white">
											{space.name || 'Unnamed Space'}
										</div>
										<div class="font-mono text-xs text-gray-500 dark:text-gray-400">
											{space.did.slice(0, 20)}...
										</div>
									</div>
									{#if currentSpace?.did !== space.did}
										<button
											on:click={() => selectSpace(space)}
											class="px-2 py-1 text-sm text-blue-600 transition-colors hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
										>
											Select
										</button>
									{:else}
										<span class="px-2 py-1 text-sm font-medium text-green-600 dark:text-green-400">
											Current
										</span>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	/* Custom scrollbar for webkit browsers */
	.overflow-y-auto::-webkit-scrollbar {
		width: 4px;
	}

	.overflow-y-auto::-webkit-scrollbar-track {
		background: rgba(0, 0, 0, 0.1);
		border-radius: 2px;
	}

	.overflow-y-auto::-webkit-scrollbar-thumb {
		background: rgba(0, 0, 0, 0.3);
		border-radius: 2px;
	}

	.overflow-y-auto::-webkit-scrollbar-thumb:hover {
		background: rgba(0, 0, 0, 0.4);
	}
</style>
