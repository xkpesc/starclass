<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import Worker from '$lib/llm_worker?worker';
  import { ProgressBar } from '@skeletonlabs/skeleton';

  let IS_WEBGPU_AVAILABLE = false;
  let worker = null;
  let input = '';
  let messages = [];
  let tps = null;
  let numTokens = null;
  let isRunning = false;
  let status = null;
  let error = null;
  let loadingMessage = '';
  let progressItems = [];

  let textareaRef = null;
  let chatContainerRef = null;

  const STICKY_SCROLL_THRESHOLD = 120;
  const EXAMPLES = [
    'Give me some tips to improve my time management skills.',
    'What is the difference between AI and ML?',
    'Write python code to compute the nth fibonacci number.',
  ];

  const resizeInput = () => {
    if (!textareaRef) return;
    textareaRef.style.height = 'auto';
    textareaRef.style.height = `${Math.min(
      Math.max(textareaRef.scrollHeight, 24),
      200
    )}px`;
  };

  const onEnter = (message) => {
    messages = [...messages, { role: 'user', content: message }];
    tps = null;
    isRunning = true;
    input = '';
  };

  const onInterrupt = () => {
    worker.postMessage({ type: 'interrupt' });
  };

  const scrollToBottom = () => {
    if (
      chatContainerRef &&
      chatContainerRef.scrollHeight - chatContainerRef.scrollTop - chatContainerRef.clientHeight < STICKY_SCROLL_THRESHOLD
    ) {
      chatContainerRef.scrollTop = chatContainerRef.scrollHeight;
    }
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
        break;
      case 'ready':
        status = 'ready';
        break;
      case 'start':
        messages = [...messages, { role: 'assistant', content: '' }];
        break;
      case 'update':
        const { output, tps: newTps, numTokens: newNumTokens } = e.data;
        tps = newTps;
        numTokens = newNumTokens;
        messages = messages.map((msg, idx) =>
          idx === messages.length - 1
            ? { ...msg, content: msg.content + output }
            : msg
        );
        break;
      case 'complete':
        isRunning = false;
        break;
      case 'error':
        error = e.data.data;
        break;
    }
  };

  onMount(() => {
    IS_WEBGPU_AVAILABLE = !!navigator.gpu;
    worker = new Worker;
    worker.postMessage({ type: 'check' });

    worker.addEventListener('message', handleWorkerMessage);

    return () => {
      worker.removeEventListener('message', handleWorkerMessage);
      worker.terminate();
    };
  });

  $: scrollToBottom();
</script>

<div class="flex flex-col h-screen mx-auto text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900">
  {#if status === null && messages.length === 0}
    <div class="flex justify-center items-center h-full">
      <div class="text-center">
        <h1 class="text-4xl font-bold">Llama-3.2 WebGPU</h1>
        <p>A private and powerful AI chatbot that runs locally in your browser.</p>
        {#if error}
          <p class="text-red-500">{error}</p>
        {/if}
        <button
          class="bg-blue-400 text-white px-4 py-2 rounded-lg"
          on:click={() => worker.postMessage({ type: 'load' })}
          disabled={status !== null || error}
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
    <div bind:this={chatContainerRef} class="flex-grow overflow-y-auto">
      {#each messages as { role, content }}
        <div>{role}: {content}</div>
      {/each}
    </div>

    <textarea
      bind:this={textareaRef}
      class="w-full p-2 border"
      placeholder="Type your message..."
      bind:value={input}
      on:input={resizeInput}
      disabled={status !== 'ready'}
      on:keydown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey && input.trim()) {
          e.preventDefault();
          onEnter(input);
        }
      }}
    ></textarea>
    <button class="bg-green-400 px-4 py-2" on:click={() => onEnter(input)}>
      Send
    </button>
  {/if}

  {#if !IS_WEBGPU_AVAILABLE}
    <div>WebGPU is not supported by this browser.</div>
  {/if}
</div>