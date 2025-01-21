<!-- 
========================================
End of File: src/routes/04loadmodels/+page.svelte
========================================
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import * as webllm from '@mlc-ai/web-llm';
  import { writable } from 'svelte/store';
  import appConfig from '$lib/app-config';
  import Worker from '$lib/webllm_worker?worker';
  import { ProgressBar } from '@skeletonlabs/skeleton';

  let useWebWorker = appConfig.use_web_worker;
  let engine: webllm.MLCEngineInterface;
  let selectedModel: string = appConfig.model_list[0]?.model_id || 'default-model';
  let modelSelected = writable(selectedModel);
  let initProgressMessage = writable('');
  let cacheStatus = writable('Checking...');
  let progressValue = writable(0);
  let progressText = writable('Initializing...');
  let lastDownloaded = 0;
  let lastTime = Date.now();

  function extractProgress(text: string): number | null {
    const match = text.match(/^Loading model from cache\[(\d+)\/(\d+)\]/);
    if (match) {
        const current = parseInt(match[1], 10);
        const total = parseInt(match[2], 10);
        return total > 0 ? (current / total) * 100 : 0;
    }
    return null;
  }

  function extractFetchProgress(text: string): string | null {
    const match = text.match(/^Fetching param cache\[(\d+)\/(\d+)\]: (\d+)MB fetched/);
    if (match) {
        const downloaded = parseInt(match[3], 10);
        const total = parseInt(match[2], 10) * downloaded / parseInt(match[1], 10); // Estimate total size
        const currentTime = Date.now();
        //TODO: speed is buggy because callback updates are at a non regular interval
        const timeElapsed = (currentTime - lastTime) / 1000; // Convert to seconds
        const speed = timeElapsed > 0 ? ((downloaded - lastDownloaded) / timeElapsed).toFixed(1) : '0.0';
        lastDownloaded = downloaded;
        lastTime = currentTime;
        return `${downloaded}MB/${Math.round(total)}MB ~ ${speed}MB/s`;
    }
    return null;
  }

  async function checkCacheStatus() {
    const isCached = await webllm.hasModelInCache(selectedModel, appConfig);
    cacheStatus.set(isCached ? 'Model found in cache' : 'Model needs to be downloaded');
  }

  async function loadModel() {
    console.log('Initializing MLC LLM engine...');
    try {
      if (!engine) {
        if (useWebWorker) {
          console.log('Using WebWorker engine...');
          engine = new webllm.WebWorkerMLCEngine(new Worker(), { appConfig, logLevel: 'INFO' });
        } else {
          console.log('Using normal MLCEngine...');
          engine = new webllm.MLCEngine({ appConfig });
        }
      }
      engine.setInitProgressCallback((progress: webllm.InitProgressReport) => {
        console.log('Initialization progress:', progress);
        initProgressMessage.set(progress.text);
        const extractedProgress = extractProgress(progress.text);
        const extractedFetchProgress = extractFetchProgress(progress.text);
        //TODO: messages when downloading a model are too verbosy
        progressValue.set(extractedProgress !== null ? extractedProgress : progress.progress * 100);
        progressText.set(extractedFetchProgress !== null ? extractedFetchProgress : progress.text);
      });

      await checkCacheStatus();

      console.log(`Loading model: ${selectedModel}`);
      await engine.reload(selectedModel);
      console.log('Model loaded successfully');
      cacheStatus.set('Model ready');
    } catch (err) {
      console.error('Initialization failed:', err);
      initProgressMessage.set('Initialization failed: ' + err.message);
    }
  }

  function onModelChange(event) {
    selectedModel = event.target.value;
    console.log('Model selected:', selectedModel);
    checkCacheStatus();
  }

  async function deleteModelCache() {
    try {
      console.log(`Deleting model cache for: ${selectedModel}`);
      await webllm.deleteModelAllInfoInCache(selectedModel, appConfig);
      console.log('Cache deleted successfully');
      cacheStatus.set('Cache cleared, model will need to be downloaded again');
    } catch (err) {
      console.error('Cache deletion failed:', err);
    }
  }

  onMount(checkCacheStatus);

  onDestroy(() => {
    if (engine) {
      console.log('Unloading engine...');
      engine.unload();
    }
  });
</script>

<div class="container">
  <h1 class="text-4xl font-bold">MLC-AI Web LLM Model Management</h1>
  <p>Select, load, and manage models running locally in your browser.</p>

  <select class="select" on:change={onModelChange} bind:value={$modelSelected}>
    {#each appConfig.model_list as model}
      <option value={model.model_id}>{model.model_id}</option>
    {/each}
  </select>

  <button class="btn variant-filled" on:click={loadModel}>Load Model</button>
  <button class="btn variant-filled" on:click={deleteModelCache}>Clear Cache</button>
  
  <p>Cache Status: {$cacheStatus}</p>
  <p>Initialization Progress: {$initProgressMessage}</p>

  <div class="progress-container">
    <p>{$progressText}</p>
    <ProgressBar value={$progressValue} max={100} />
  </div>
</div>

<style>
  .container {
    max-width: 600px;
    margin: auto;
    text-align: center;
  }
  .progress-container {
    margin-top: 20px;
  }
</style>
<!-- 
========================================
End of File: src/routes/04loadmodels/+page.svelte
========================================
-->
