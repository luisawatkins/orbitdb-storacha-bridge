<script>
	import StorachaTest from '$lib/StorachaTest.svelte';
	
	// Add floating particles effect
	import { onMount } from 'svelte';
	
	onMount(() => {
		// Create floating particles
		const particlesContainer = document.querySelector('.particles');
		if (particlesContainer) {
			for (let i = 0; i < 50; i++) {
				const particle = document.createElement('div');
				particle.className = 'particle';
				particle.style.left = Math.random() * 100 + '%';
				particle.style.animationDelay = Math.random() * 15 + 's';
				particle.style.animationDuration = (15 + Math.random() * 10) + 's';
				particlesContainer.appendChild(particle);
			}
		}
	});
</script>

<svelte:head>
	<title>OrbitDB Storacha Backup Restore Test</title>
	<meta name="description" content="Test the OrbitDB Storacha Backup Restore functionality" />
	<link rel="preconnect" href="https://fonts.googleapis.com">
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
	<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
</svelte:head>

<!-- Floating particles background -->
<div class="particles"></div>

<div class="container mx-auto px-4 py-8 relative z-10">
	<header class="mb-12 text-center">
		<!-- OrbitDB Storacha Bridge Logo with Animation -->
		<div class="mb-8 flex justify-center">
			<div class="relative">
				<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 32 32" class="drop-shadow-2xl">
					<defs>
						<linearGradient id="orbitGradient" x1="0%" y1="0%" x2="100%" y2="100%">
							<stop offset="0%" style="stop-color:#4F46E5;stop-opacity:1" />
							<stop offset="100%" style="stop-color:#7C3AED;stop-opacity:1" />
						</linearGradient>
						<linearGradient id="storageGradient" x1="0%" y1="0%" x2="100%" y2="100%">
							<stop offset="0%" style="stop-color:#06B6D4;stop-opacity:1" />
							<stop offset="100%" style="stop-color:#0891B2;stop-opacity:1" />
						</linearGradient>
					</defs>
					
					<!-- Background circle -->
					<circle cx="16" cy="16" r="15" fill="#1F2937" stroke="#374151" stroke-width="1"/>
					
					<!-- Central storage node -->
					<circle cx="16" cy="16" r="4" fill="url(#storageGradient)"/>
					
					<!-- Orbital rings with animation -->
					<g class="orbit-animation" style="transform-origin: 16px 16px;">
						<ellipse cx="16" cy="16" rx="10" ry="6" fill="none" stroke="url(#orbitGradient)" stroke-width="1.5" opacity="0.8"/>
						<ellipse cx="16" cy="16" rx="6" ry="10" fill="none" stroke="url(#orbitGradient)" stroke-width="1.5" opacity="0.8"/>
						
						<!-- Data nodes on orbits -->
						<circle cx="26" cy="16" r="1.5" fill="url(#orbitGradient)"/>
						<circle cx="6" cy="16" r="1.5" fill="url(#orbitGradient)"/>
						<circle cx="16" cy="6" r="1.5" fill="url(#orbitGradient)"/>
						<circle cx="16" cy="26" r="1.5" fill="url(#orbitGradient)"/>
					</g>
					
					<!-- Storage cloud elements -->
					<path d="M12 12 Q10 10 8 12 Q6 14 8 16 Q10 18 12 16 Q14 14 12 12" fill="url(#storageGradient)" opacity="0.6"/>
					<path d="M20 20 Q22 18 24 20 Q26 22 24 24 Q22 26 20 24 Q18 22 20 20" fill="url(#storageGradient)" opacity="0.6"/>
				</svg>
				
				<!-- Glow effect behind logo -->
				<div class="absolute inset-0 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 rounded-full blur-xl -z-10"></div>
			</div>
		</div>
		
		<h1 class="mb-6 text-5xl font-bold gradient-text-purple">
			OrbitDB Storacha Bridge
		</h1>
		<p class="text-xl text-slate-300 max-w-2xl mx-auto leading-relaxed">
			Test backup and restore functionality with 
			<span class="gradient-text-cyan font-semibold">Storacha/Filecoin</span>
		</p>
		
		<!-- Subtitle with orbital theme -->
		<div class="mt-6 flex items-center justify-center gap-2 text-sm text-slate-400">
			<div class="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></div>
			<span>Distributed • Decentralized • Resilient</span>
			<div class="w-2 h-2 bg-cyan-500 rounded-full animate-pulse"></div>
		</div>
	</header>

	<main class="orbital-card rounded-2xl p-8 max-w-4xl mx-auto">
		<StorachaTest />
	</main>

	<footer class="mt-16 text-center">
		<div class="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-slate-800/50 backdrop-blur-sm border border-slate-700/50">
			<div class="w-2 h-2 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full"></div>
			<span class="text-sm text-slate-400">OrbitDB Storacha Bridge Demo</span>
			<div class="w-2 h-2 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full"></div>
		</div>
		
		<p class="mt-4 text-xs text-slate-500">
			Bridging distributed databases with decentralized storage
		</p>
	</footer>
</div>
