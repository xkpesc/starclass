<!-- 
========================================
File: src/routes/04loadmodels/+page.svelte
========================================
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import Worker from '$lib/llm_worker?worker';
  import { ProgressBar } from '@skeletonlabs/skeleton';

  let IS_WEBGPU_AVAILABLE = false;
  let worker = null;
  let input = '';
  let messages = [];
  let isRunning = false;
  let status = null;
  let loadingMessage = '';
  let progressItems = [];

  let textareaRef = null;

  const onEnter = (message) => {
    messages = [...messages, { role: 'user', content: message }];
    isRunning = true;
    input = '';
    worker.postMessage({ type: 'generate', messages });
  };

  const handleWorkerMessage = (e) => {
    switch (e.data.status) {
      case 'loading':
        status = 'loading';
        loadingMessage = e.data.data;
        break;
      case 'initiate':
        progressItems = [...progressItems, e.data];
        break;
      case 'progress':
        progressItems = progressItems.map((item) =>
          item.file === e.data.file ? { ...item, ...e.data } : item
        );
        break;
      case 'done':
        progressItems = progressItems.filter((item) => item.file !== e.data.file);
        if (progressItems.length === 0) {
          status = 'ready';
        }
        break;
      case 'ready':
        status = 'ready';
        break;
      case 'start':
        messages = [...messages, { role: 'assistant', content: '' }];
        break;
      case 'update':
        const { output } = e.data;
        messages = messages.map((msg, idx) =>
          idx === messages.length - 1
            ? { ...msg, content: msg.content + output }
            : msg
        );
        break;
      case 'complete':
        isRunning = false;
        break;
    }
  };

  const loadModel = () => {
    worker.postMessage({ type: 'load' });
  };

  onMount(() => {
    worker = new Worker;
    worker.postMessage({ type: 'check' });
    worker.addEventListener('message', handleWorkerMessage);

    return () => {
      worker.removeEventListener('message', handleWorkerMessage);
      worker.terminate();
    };
  });
</script>

<div class="">
  {#if status === null}
    <div class="flex justify-center items-center h-full">
      <div class="text-center">
        <h1 class="text-4xl font-bold">Llama-3.2 WebGPU</h1>
        <p>A private and powerful AI chatbot that runs locally in your browser.</p>
        <button
          class="btn variant-filled"
          on:click={loadModel}
          disabled={status !== null}
        >
          Load model
        </button>


      </div>
    </div>
  {/if}

  {#if status === 'loading'}
    <div class="w-full max-w-md mx-auto p-4">
      <p>{loadingMessage}</p>
      {#each progressItems as { file, loaded, total }}
        <div>
          {file}: {Math.round((loaded / total) * 100)}%
          <ProgressBar value={loaded} max={total} />
          <span>{(loaded / (1024 * 1024)).toFixed(2)}MB / {(total / (1024 * 1024)).toFixed(2)}MB</span>
        </div>
      {/each}
    </div>
  {/if}

  {#if status === 'ready'}
    <div class="flex-grow overflow-y-auto">
      {#each messages as { role, content }}
        <div>{role}: {content}</div>
      {/each}
    </div>

    <textarea
      bind:this={textareaRef}
      class="input"
      placeholder="Type your message..."
      bind:value={input}
      on:keydown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey && input.trim()) {
          e.preventDefault();
          onEnter(input);
        }
      }}
    ></textarea>
    <button class="btn variant-filled" on:click={() => onEnter(input)}>
      Send
    </button>
  {/if}
</div>

<!-- 
========================================
End of: src/routes/04loadmodels/+page.svelte
========================================
-->
