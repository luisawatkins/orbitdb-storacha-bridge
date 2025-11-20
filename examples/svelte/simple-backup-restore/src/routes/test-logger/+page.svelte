<script>
  import { onMount } from 'svelte';
  import { logger, setLogLevel, logUtils } from '$lib/logger.js';
  import { Button, Select, SelectItem } from 'carbon-components-svelte';

  let logLevel = 'info';
  let messages = [];

  onMount(() => {
    // Set initial log level
    setLogLevel(logLevel);
    
    // Test the logger
    testLogger();
  });

  function testLogger() {
    messages = [];
    
    // Test different log levels
    logger.trace('This is a trace message');
    logger.debug('This is a debug message', { extra: 'data' });
    logger.info('This is an info message');
    logger.warn('This is a warning message');
    logger.error('This is an error message');
    
    // Test child logger
    const childLogger = logger.child({ component: 'TestComponent' });
    childLogger.info('Message from child logger');
    
    // Test log utils
    logUtils.functionEntry('testFunction', { param1: 'value1' });
    logUtils.functionExit('testFunction', { result: 'success' });
    logUtils.progress('Processing', 50, 100);
    
    const startTime = Date.now();
    setTimeout(() => {
      logUtils.timing('TestOperation', startTime);
    }, 100);
    
    messages = [
      'Logger test complete! Check the browser console for output.',
      `Current log level: ${logLevel}`,
      'Try changing the log level and running the test again.'
    ];
  }

  function handleLogLevelChange() {
    setLogLevel(logLevel);
    testLogger();
  }
</script>

<div style="padding: 2rem;">
  <h1>Logger Test Page</h1>
  
  <div style="margin: 2rem 0;">
    <Select bind:selected={logLevel} on:change={handleLogLevelChange} labelText="Log Level">
      <SelectItem value="trace" text="Trace" />
      <SelectItem value="debug" text="Debug" />
      <SelectItem value="info" text="Info" />
      <SelectItem value="warn" text="Warn" />
      <SelectItem value="error" text="Error" />
      <SelectItem value="silent" text="Silent" />
    </Select>
  </div>
  
  <Button on:click={testLogger}>Run Logger Test</Button>
  
  <div style="margin-top: 2rem;">
    <h3>Test Results:</h3>
    <ul>
      {#each messages as message}
        <li>{message}</li>
      {/each}
    </ul>
  </div>
  
  <div style="margin-top: 2rem; padding: 1rem; background: #f4f4f4; border-radius: 4px;">
    <p><strong>Instructions:</strong></p>
    <ol>
      <li>Open the browser Developer Console (F12)</li>
      <li>Click "Run Logger Test" to see log messages</li>
      <li>Change the log level to see different levels of output</li>
      <li>Try "Debug" to see all messages, or "Error" to see only errors</li>
    </ol>
  </div>
</div>
