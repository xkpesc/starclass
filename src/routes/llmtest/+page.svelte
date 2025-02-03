<script lang="ts">
  import * as webllm from "@mlc-ai/web-llm";
  import appConfig from "$lib/app-config";
  import Worker from '$lib/webllm_worker?worker';
  import { onMount } from "svelte";
  import { writable } from 'svelte/store';
  import { getReadmes } from "$lib/IDBUtils";;

  //TODO: implement cache_usage API from web-llm/examples/cache-usage to show user if a model is present on cache
  //      and maybe to show a preload/precache button
  //
  
  const SYSTEM_PROMPT = `
    You are a helpful assistant that summarizes GitHub repository READMEs.
    You will be provided with the README content and then you must provide a brief description (1-2 sentences) of what the repository does.
    Also, extract 3 to 5 relevant keywords or tags that best represent the repository's functionality. No more than 5 keywords!
    Respond using only the JSON format with the following template, don't say nothing else:
    \`\`\`
    {
      "brief_description": "<brief description>",
      "keywords": ["<keyword1>", "<keyword2>", "<keyword3>"]
    }
    \`\`\`.
  `;
  
  let useWebWorker = appConfig.use_web_worker;
  let engine: webllm.MLCEngineInterface;
  let selectedModel: string = "Llama-3.2-1B-Instruct-q4f16_1-MLC";
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
          const initProgressCallback = (progress: webllm.InitProgressReport) => {
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
  
  // React to model selection changes without reloading the engine immediately
  function onModelChange(event) {
    selectedModel = event.target.value;
    console.log("Model selected:", selectedModel);
  }

  // Function to reload the selected model when triggered
  async function reloadModel() {
    try {
      console.log(`Reloading model: ${selectedModel}`);
      await engine.reload(selectedModel);
      console.log("Model reloaded successfully");
    } catch (err) {
      console.error("Model reload failed:", err);
      initProgressMessage.set("Model reload failed: " + err.message);
    }
  }

  // A function to generate text based on user input or README content
  async function generateTextFromReadmes() {

    const jsonGrammarStr = String.raw`
    root ::= DescriptionAndKeywords
    DescriptionAndKeywords ::= "{" ws "\"brief_description\":" ws brief_description "," ws "\"keywords\":" ws keywords "}"
    DescriptionAndKeywordslist ::= "[]" | "[" ws DescriptionAndKeywords ("," ws DescriptionAndKeywords)* "]"
    brief_description ::= "\"" word (" " word){5,25} "\""
    keywords ::= "[" ws keyword ("," ws keyword){4,4} ws "]"
    keyword ::= "\"" word "\""
    word ::= [^" \t\n]+
    boolean ::= "true" | "false"
    ws ::= [ \t\n]*
    number ::= [0-9]+ "."? [0-9]*
    `;

    const readmes = await getReadmes(2); // Load the first two READMEs from IndexedDB
    if (readmes.length === 0) {
      console.log("No READMEs found in IndexedDB.");
      return;
    }
    

    
    for (const readme of readmes) {
      await engine.resetChat();
      chatHistory = [];
      // const prompt = SYSTEM_PROMPT.replace('{README_CONTENT}', readme.content);
      console.log("Generating text for README:", readme.full_name);
      chatHistory.push({ role: "user", content: SYSTEM_PROMPT });
      chatHistory.push({ role: "user", content: readme.content });
      requestInProgress = true;
  
      try {
        let curMessage = "";
        const completion = await engine.chat.completions.create({
          stream: true,
          messages: chatHistory,
          stream_options: { include_usage: true },
          response_format: {
          type: "grammar",
          grammar: jsonGrammarStr,
        } as webllm.ResponseFormat,
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
  }

  onMount(initializeEngine);
</script>

<select class="select" on:change={onModelChange} bind:value={$modelSelected}>
  {#each modelList as model}
    <option value={model.model_id} selected={model.model_id === selectedModel}>
      {model.model_id}
    </option>
  {/each}
</select>

<button class="btn variant-filled" on:click={reloadModel}>Reload Model</button>
<p>Selected model: {$modelSelected}</p>
<p>Initialization progress: {$initProgressMessage}</p>

<button class="btn variant-filled" on:click={generateTextFromReadmes}>Generate from READMEs</button>

<input class="input" type="text" bind:value={userPrompt} placeholder="Enter your message..." />
<button class="btn variant-filled" on:click={generateTextFromReadmes}>Generate</button>
