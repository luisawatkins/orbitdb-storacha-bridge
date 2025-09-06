# Svelte Components

The `orbitdb-storacha-bridge` library now includes reusable Svelte components for easy integration into Svelte/SvelteKit projects.

## Available Components

### StorachaIntegration.svelte
A complete UI component for Storacha backup/restore functionality with authentication, space management, and progress tracking.

### StorachaTest.svelte  
A comprehensive test suite component for validating backup/restore operations.

## Installation & Usage

### 1. Install the package
```bash
npm install orbitdb-storacha-bridge
```

### 2. Install peer dependencies
```bash
npm install svelte lucide-svelte
```

### 3. Import and use components

#### StorachaIntegration Component
```svelte
<script>
  import StorachaIntegration from 'orbitdb-storacha-bridge/StorachaIntegration.svelte';
</script>

<StorachaIntegration />
```

#### StorachaTest Component
```svelte
<script>
  import StorachaTest from 'orbitdb-storacha-bridge/StorachaTest.svelte';
</script>

<StorachaTest />
```

## Component Features

### StorachaIntegration
- **Authentication**: Email account creation or credential-based login
- **Auto-login**: Automatic authentication with stored credentials
- **Space Management**: Create and switch between Storacha spaces
- **Backup**: One-click OrbitDB database backup to Storacha
- **Restore**: Database restoration from Storacha backups
- **Progress Tracking**: Real-time upload/download progress with block details
- **Error Handling**: Comprehensive error messages and user feedback

### StorachaTest
- **Comprehensive Testing**: Full backup/restore cycle testing
- **Independent Instances**: Creates isolated OrbitDB instances for testing
- **Progress Monitoring**: Detailed test step tracking and results
- **Data Verification**: Validates data integrity after restore
- **Cleanup**: Proper shutdown and cleanup of test instances

## Requirements

- Svelte 3.x, 4.x, or 5.x
- lucide-svelte for icons
- Modern browser with localStorage support
- Storacha account (for production usage)

## Component Dependencies

Both components depend on the core `orbitdb-storacha-bridge` library and expect:

- OrbitDB instances to be initialized
- Storacha credentials (for production usage)
- Browser environment with localStorage

## Example Integration

```svelte
<!-- In your main app layout -->
<script>
  import StorachaIntegration from 'orbitdb-storacha-bridge/StorachaIntegration.svelte';
  import StorachaTest from 'orbitdb-storacha-bridge/StorachaTest.svelte';
  
  let showBackup = false;
  let showTesting = false;
</script>

<main>
  <h1>My OrbitDB App</h1>
  
  <!-- Your existing app content -->
  
  <section>
    <button on:click={() => showBackup = !showBackup}>
      Toggle Backup Panel
    </button>
    
    {#if showBackup}
      <StorachaIntegration />
    {/if}
  </section>
  
  <section>
    <button on:click={() => showTesting = !showTesting}>
      Toggle Testing Panel
    </button>
    
    {#if showTesting}
      <StorachaTest />
    {/if}
  </section>
</main>
```

## Styling

Components use Tailwind CSS classes and support both light and dark themes. If you're not using Tailwind, you may need to provide alternative styling or include Tailwind in your project.

## Development

To modify or extend the components:

1. Clone the repository
2. Edit components in `src/components/`
3. Run `npm run build:components` to copy to dist
4. Test your changes

The components are distributed as uncompiled `.svelte` files, allowing the consuming project to handle compilation and bundling.
