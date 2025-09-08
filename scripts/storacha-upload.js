#!/usr/bin/env node

import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import * as Client from '@web3-storage/w3up-client';
import { StoreMemory } from '@web3-storage/w3up-client/stores/memory';
import { Signer } from '@web3-storage/w3up-client/principal/ed25519';
import * as Proof from '@web3-storage/w3up-client/proof';
import * as Delegation from '@ucanto/core/delegation';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.dirname(__dirname);

class StorachaPublisher {
	constructor() {
		this.client = null;
		this.buildDir = 'build';
	}

	async checkEnvironmentCredentials() {
		console.log('🔍 Checking for Storacha credentials...');
		
		// Check for different possible environment variable names
		const storachaKey = process.env.STORACHA_KEY || 
						   process.env.NEXT_PUBLIC_STORACHA_PRIVATE_KEY ||
						   process.env.W3_PRINCIPAL;
		
		const storachaProof = process.env.STORACHA_PROOF || 
							  process.env.NEXT_PUBLIC_STORACHA_DELEGATION ||
							  process.env.W3_PROOF;

		const ucanFile = process.env.STORACHA_UCAN_FILE || process.env.W3_UCAN_FILE;
		const ucanToken = process.env.STORACHA_UCAN_TOKEN || process.env.W3_UCAN_TOKEN;

		console.log(`📋 Environment check:`);
		console.log(`   STORACHA_KEY: ${storachaKey ? '✅ Present' : '❌ Missing'}`);
		console.log(`   STORACHA_PROOF: ${storachaProof ? '✅ Present' : '❌ Missing'}`);
		console.log(`   STORACHA_UCAN_FILE: ${ucanFile ? '✅ Present' : '❌ Missing'}`);
		console.log(`   STORACHA_UCAN_TOKEN: ${ucanToken ? '✅ Present' : '❌ Missing'}`);

		return {
			hasCredentials: !!(storachaKey && storachaProof),
			hasUCAN: !!(ucanFile || ucanToken),
			storachaKey,
			storachaProof,
			ucanFile,
			ucanToken
		};
	}

	async initializeStorachaClient(credentials) {
		console.log('🚀 Initializing Storacha client...');

		try {
			if (credentials.hasCredentials) {
				console.log('   Using STORACHA_KEY and STORACHA_PROOF');
				const principal = Signer.parse(credentials.storachaKey);
				const store = new StoreMemory();
				this.client = await Client.create({ principal, store });
				
				const proof = await Proof.parse(credentials.storachaProof);
				const space = await this.client.addSpace(proof);
				await this.client.setCurrentSpace(space.did());
				
				console.log(`   ✅ Connected to space: ${space.did()}`);
				return true;
			}

			if (credentials.hasUCAN) {
				console.log('   Using UCAN authentication');
				
				let delegation;
				if (credentials.ucanFile) {
					console.log(`   Loading UCAN from file: ${credentials.ucanFile}`);
					const ucanBytes = await fs.readFile(credentials.ucanFile);
					const extracted = await Delegation.extract(ucanBytes);
					if (!extracted.ok) throw new Error('Failed to extract delegation from file');
					delegation = extracted.ok;
				} else if (credentials.ucanToken) {
					console.log('   Loading UCAN from token');
					const tokenBytes = Buffer.from(credentials.ucanToken, 'base64');
					const extracted = await Delegation.extract(tokenBytes);
					if (!extracted.ok) throw new Error('Failed to extract delegation from token');
					delegation = extracted.ok;
				}

				// Create a temporary identity for the upload
				const principal = Signer.generate();
				const store = new StoreMemory();
				this.client = await Client.create({ principal, store });
				
				const space = await this.client.addSpace(delegation);
				await this.client.setCurrentSpace(space.did());
				
				console.log(`   ✅ Connected to space via UCAN: ${space.did()}`);
				return true;
			}

			return false;
		} catch (error) {
			console.error(`   ❌ Failed to initialize client: ${error.message}`);
			return false;
		}
	}

	async promptForW3Login() {
		console.log('\n🔐 No Storacha credentials found in environment.');
		console.log('💡 You need to login with w3 CLI first.');
		console.log('\nTo setup credentials:');
		console.log('1. Install w3 CLI: npm install -g @web3-storage/w3cli');
		console.log('2. Login: w3 login your-email@example.com');
		console.log('3. Create/select space: w3 space create my-space');
		console.log('4. Generate delegation: w3 delegation create --can "*" --output .env.ucan');
		console.log('5. Set STORACHA_UCAN_FILE=./.env.ucan in your .env file');
		console.log('\nOr provide STORACHA_KEY and STORACHA_PROOF in .env file.');
		
		const readline = await import('readline');
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout
		});

		return new Promise((resolve) => {
			rl.question('\nWould you like to try w3 login now? (y/n): ', (answer) => {
				rl.close();
				resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
			});
		});
	}

	async attemptW3Login() {
		console.log('\n🔄 Attempting w3 CLI login...');
		
		try {
			// Check if w3 CLI is installed
			execSync('which w3', { stdio: 'pipe' });
			console.log('✅ w3 CLI found');
		} catch {
			console.log('❌ w3 CLI not found. Installing...');
			try {
				execSync('npm install -g @web3-storage/w3cli', { stdio: 'inherit' });
				console.log('✅ w3 CLI installed');
			} catch (error) {
				console.error('❌ Failed to install w3 CLI:', error.message);
				return false;
			}
		}

		const readline = await import('readline');
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout
		});

		return new Promise((resolve) => {
			rl.question('Enter your email for w3 login: ', async (email) => {
				rl.close();
				
				if (!email.trim()) {
					console.log('❌ No email provided');
					resolve(false);
					return;
				}

				try {
					console.log(`🔐 Logging in with email: ${email}`);
					execSync(`w3 login ${email}`, { stdio: 'inherit' });
					
					console.log('\n📋 Checking available spaces...');
					const spacesOutput = execSync('w3 space ls', { encoding: 'utf-8' });
					console.log(spacesOutput);
					
					console.log('\n💡 If you need to create a space: w3 space create my-project-space');
					console.log('💡 If you need to select a space: w3 space use <space-did>');
					console.log('\n✅ w3 CLI setup complete! You can now run this script again.');
					resolve(true);
				} catch (error) {
					console.error('❌ w3 login failed:', error.message);
					resolve(false);
				}
			});
		});
	}

	async buildProject() {
		console.log('\n🔨 Building project...');
		
		try {
			// Check if we have a build script
			const packageJson = JSON.parse(await fs.readFile(path.join(projectRoot, 'package.json'), 'utf-8'));
			
			if (packageJson.scripts?.build) {
				console.log('   Running npm run build...');
				execSync('npm run build', { stdio: 'inherit', cwd: projectRoot });
			} else {
				console.log('   No build script found, checking for existing build directory...');
			}

			// Check if build directory exists
			const buildPath = path.join(projectRoot, this.buildDir);
			try {
				await fs.access(buildPath);
				console.log(`   ✅ Build directory found: ${this.buildDir}`);
				return true;
			} catch {
				console.log(`   ❌ Build directory not found: ${this.buildDir}`);
				
				// Try common build directories
				const commonBuildDirs = ['dist', 'public', 'out', '_site'];
				for (const dir of commonBuildDirs) {
					try {
						await fs.access(path.join(projectRoot, dir));
						this.buildDir = dir;
						console.log(`   ✅ Found build directory: ${this.buildDir}`);
						return true;
					} catch {}
				}
				
				console.log('   ❌ No build directory found');
				return false;
			}
		} catch (error) {
			console.error(`   ❌ Build failed: ${error.message}`);
			return false;
		}
	}

	async uploadDirectoryToStoracha() {
		console.log('\n📤 Uploading to Storacha...');
		
		const buildPath = path.join(projectRoot, this.buildDir);
		
		try {
			// Read all files in build directory recursively
			const files = await this.getFilesRecursively(buildPath);
			console.log(`   📁 Found ${files.length} files to upload`);
			
			if (files.length === 0) {
				throw new Error('No files found to upload');
			}

			// Convert to File objects for w3up-client
			const fileObjects = await Promise.all(
				files.map(async (filePath) => {
					const content = await fs.readFile(filePath);
					const relativePath = path.relative(buildPath, filePath);
					return new File([content], relativePath, {
						type: this.getMimeType(filePath)
					});
				})
			);

			console.log('   🚀 Starting upload...');
			const result = await this.client.uploadDirectory(fileObjects);
			
			console.log(`   ✅ Upload successful!`);
			console.log(`   🔗 Root CID: ${result}`);
			console.log(`   🌐 IPFS URL: https://w3s.link/ipfs/${result}`);
			console.log(`   🌐 Gateway URL: https://${result}.ipfs.w3s.link`);
			
			return {
				cid: result.toString(),
				ipfsUrl: `https://w3s.link/ipfs/${result}`,
				gatewayUrl: `https://${result}.ipfs.w3s.link`,
				fileCount: files.length
			};
		} catch (error) {
			console.error(`   ❌ Upload failed: ${error.message}`);
			throw error;
		}
	}

	async getFilesRecursively(dir) {
		const files = [];
		const entries = await fs.readdir(dir, { withFileTypes: true });
		
		for (const entry of entries) {
			const fullPath = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				files.push(...await this.getFilesRecursively(fullPath));
			} else {
				files.push(fullPath);
			}
		}
		
		return files;
	}

	getMimeType(filePath) {
		const ext = path.extname(filePath).toLowerCase();
		const mimeTypes = {
			'.html': 'text/html',
			'.css': 'text/css',
			'.js': 'application/javascript',
			'.json': 'application/json',
			'.png': 'image/png',
			'.jpg': 'image/jpeg',
			'.jpeg': 'image/jpeg',
			'.gif': 'image/gif',
			'.svg': 'image/svg+xml',
			'.ico': 'image/x-icon',
			'.woff': 'font/woff',
			'.woff2': 'font/woff2',
			'.ttf': 'font/ttf',
			'.eot': 'application/vnd.ms-fontobject'
		};
		return mimeTypes[ext] || 'application/octet-stream';
	}

	async updatePackageVersion() {
		console.log('\n📦 Updating package version...');
		
		try {
			execSync('npm version patch', { stdio: 'inherit', cwd: projectRoot });
			const packageJson = JSON.parse(await fs.readFile(path.join(projectRoot, 'package.json'), 'utf-8'));
			console.log(`   ✅ Version bumped to: ${packageJson.version}`);
			return packageJson.version;
		} catch (error) {
			console.error(`   ❌ Version bump failed: ${error.message}`);
			return null;
		}
	}

	async commitAndTag(cid, version) {
		console.log('\n📝 Committing changes...');
		
		try {
			execSync(`git add .`, { stdio: 'inherit', cwd: projectRoot });
			execSync(`git commit -m "Deploy to Storacha: ${cid} (v${version})"`, { stdio: 'inherit', cwd: projectRoot });
			
			if (version) {
				execSync(`git tag -a "v${version}" -m "Version ${version} deployed to Storacha"`, { stdio: 'inherit', cwd: projectRoot });
				console.log(`   ✅ Tagged as v${version}`);
			}
			
			execSync('git push origin main', { stdio: 'inherit', cwd: projectRoot });
			execSync('git push origin --tags', { stdio: 'inherit', cwd: projectRoot });
			
			console.log('   ✅ Changes committed and pushed to GitHub');
			return true;
		} catch (error) {
			console.error(`   ❌ Git operations failed: ${error.message}`);
			return false;
		}
	}

	async run() {
		console.log('🌟 OrbitDB Storacha Bridge - Storacha Publisher');
		console.log('='.repeat(60));
		
		try {
			// Step 1: Check credentials
			const credentials = await this.checkEnvironmentCredentials();
			
			if (!credentials.hasCredentials && !credentials.hasUCAN) {
				const shouldLogin = await this.promptForW3Login();
				if (shouldLogin) {
					const loginSuccess = await this.attemptW3Login();
					if (!loginSuccess) {
						console.log('❌ Authentication setup failed. Please set up credentials manually.');
						return;
					}
					console.log('\n💡 Please run this script again after setting up your credentials.');
					return;
				} else {
					console.log('❌ Cannot proceed without Storacha credentials.');
					return;
				}
			}

			// Step 2: Initialize Storacha client
			const clientInitialized = await this.initializeStorachaClient(credentials);
			if (!clientInitialized) {
				console.log('❌ Failed to initialize Storacha client.');
				return;
			}

			// Step 3: Build project
			const buildSuccess = await this.buildProject();
			if (!buildSuccess) {
				console.log('❌ Build failed or no build directory found.');
				return;
			}

			// Step 4: Upload to Storacha
			const uploadResult = await this.uploadDirectoryToStoracha();
			
			// Step 5: Update version and commit
			const version = await this.updatePackageVersion();
			await this.commitAndTag(uploadResult.cid, version);

			// Success summary
			console.log('\n' + '='.repeat(60));
			console.log('🎉 STORACHA DEPLOYMENT COMPLETE! 🎉');
			console.log('='.repeat(60));
			console.log(`📦 Version: ${version || 'unchanged'}`);
			console.log(`🔗 CID: ${uploadResult.cid}`);
			console.log(`📁 Files uploaded: ${uploadResult.fileCount}`);
			console.log(`🌐 IPFS URL: ${uploadResult.ipfsUrl}`);
			console.log(`🌐 Gateway URL: ${uploadResult.gatewayUrl}`);
			console.log('\n💡 Your project is now available on IPFS via Storacha!');
			
		} catch (error) {
			console.error('\n❌ Deployment failed:', error.message);
			process.exit(1);
		}
	}
}

// Run the publisher
const publisher = new StorachaPublisher();
publisher.run().catch((error) => {
	console.error('Fatal error:', error);
	process.exit(1);
});
