<script lang="ts">
  import * as webllm from "@mlc-ai/web-llm";
  import appConfig from "$lib/app-config";
  import Worker from '$lib/webllm_worker?worker';
  import { onMount } from "svelte";
  import { writable } from 'svelte/store';
  
  let useWebWorker = appConfig.use_web_worker;
  let engine: webllm.MLCEngineInterface;
  let selectedModel: string = "default-model";
  let modelList = appConfig.model_list;
  let modelSelected = writable(selectedModel);
  let initProgressMessage = writable("");
  let chatHistory: webllm.ChatCompletionMessageParam[] = [];
  let requestInProgress = false;
  let userPrompt = "";
  
  // A function to initialize the webllm engine and inform us about the process
  async function initializeEngine() {
    console.log("Initializing engine...");
    try {
      if (!engine) {
        if (useWebWorker) {
          console.log("Using WebWorker engine...");
          const initProgressCallback = (progress) => {
            console.log("Initialization progress:", progress);
            initProgressMessage.set(progress.text);
          };
          engine = new webllm.WebWorkerMLCEngine(
            new Worker(),
            { appConfig, logLevel: "INFO" },
          );
          engine.setInitProgressCallback(initProgressCallback);
        } else {
          console.log("Using normal MLCEngine...");
          engine = new webllm.MLCEngine({ appConfig });
        }
      }
      
      // Check GPU vendor and device capability
      console.log("Fetching device capabilities...");
      const [maxStorageBufferBindingSize, gpuVendor] = await Promise.all([
        engine.getMaxStorageBufferBindingSize(),
        engine.getGPUVendor(),
      ]);
      console.log("Max Storage Buffer Binding Size:", maxStorageBufferBindingSize);
      console.log("GPU Vendor:", gpuVendor);
  
      console.log("Initializing chat capabilities...");
      await engine.resetChat();
      console.log("Chat initialized successfully");
    } catch (err) {
      console.error("Initialization failed:", err);
      initProgressMessage.set("Initialization failed: " + err.message);
    }
  }
  
  // React to model selection changes
  async function onModelChange(event) {
    selectedModel = event.target.value;
    console.log("Model changed to:", selectedModel);
    try {
      console.log(`Reloading model: ${selectedModel}`);
      await engine.reload(selectedModel);
      console.log("Model reloaded successfully");
    } catch (err) {
      console.error("Model reload failed:", err);
      initProgressMessage.set("Model reload failed: " + err.message);
    }
  }

  // A function to generate text based on user input
  async function generateText() {
    if (requestInProgress) {
      console.log("Request already in progress, please wait.");
      return;
    }
    if (!userPrompt) {
      console.log("Prompt is empty, nothing to generate.");
      return;
    }
    
    console.log("Generating text for prompt:", userPrompt);
    chatHistory.push({ role: "user", content: userPrompt });
    requestInProgress = true;

    try {
      let curMessage = "";
      const completion = await engine.chat.completions.create({
        stream: true,
        messages: chatHistory,
        stream_options: { include_usage: true },
      });
      for await (const chunk of completion) {
        const curDelta = chunk.choices[0]?.delta.content;
        if (curDelta) {
          curMessage += curDelta;
        }
        console.log("Current response:", curMessage);
      }
      const finalMessage = await engine.getMessage();
      console.log("Final response:", finalMessage);
      chatHistory.push({ role: "assistant", content: finalMessage });
    } catch (err) {
      console.error("Generate error:", err);
    }
    requestInProgress = false;
  }

  onMount(initializeEngine);
</script>

<select on:change={onModelChange} bind:value={$modelSelected}>
  {#each modelList as model}
    <option value={model.model_id} selected={model.model_id === selectedModel}>
      {model.model_id}
    </option>
  {/each}
</select>

<p>Selected model: {$modelSelected}</p>
<p>Initialization progress: {$initProgressMessage}</p>

<input type="text" bind:value={userPrompt} placeholder="Enter your message..." />
<button on:click={generateText}>Generate</button>
