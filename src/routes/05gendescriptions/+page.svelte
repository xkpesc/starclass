<!-- 
========================================
File: src/routes/05gendescriptions/+page.svelte
========================================
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import * as webllm from '@mlc-ai/web-llm';
  import { writable } from 'svelte/store';
  import appConfig from '$lib/app-config';
  import Worker from '$lib/webllm_worker?worker';
  import { getReadmes } from "$lib/IDBUtils";
  import { saveDescriptions, getDescriptions } from '$lib/DescriptionUtils';

  const defaultModel = "Llama-3.2-1B-Instruct-q4f32_1-MLC";
  
  let useWebWorker = appConfig.use_web_worker;
  let engine: webllm.MLCEngineInterface | webllm.WebWorkerMLCEngine;

  let generatedDescriptions = writable<string[]>([]);
  let current_description = writable();

  // TODO: figure out a way to abort the LLM run and re-run it if it hallucinates

  const jsonGrammarStr = String.raw`
    root ::= "{" ws "\"brief_description\":" ws brief_description "," ws "\"keywords\":" ws keywords "}"
    brief_description ::= "\"" word (" " word){4,24} "\""
    keywords ::= "[" ws keyword ("," ws keyword){4,4} ws "]"
    keyword ::= "\"" word ("-" word)? "\""
    ws ::= [ \t\n]*
    word ::= [^" \t\n-]+
  `;

  const SYSTEM_PROMPT = `
    You are a helpful assistant that summarizes GitHub repository READMEs.
    You will be provided with the README content and then you must provide a brief description (1-2 sentences) of what the repository does.
    Also, generate 3 to 5 unique (do not repeat them) relevant keywords or tags that best represent the repository's functionality. No more than 5 keywords!
    Respond using only the JSON format with the following template, don't say anything else:
    \`\`\`
    {
      "brief_description": "<brief description>",
      "keywords": ["<keyword1>", "<keyword2>", "<keyword3>"]
    }
    \`\`\`.
  `;

  // Add EngineState enum and engineState store
  enum EngineState {
    UNLOADED = 'UNLOADED',
    LOADING = 'LOADING',
    LOADED = 'LOADED',
    GENERATING = 'GENERATING',
    ABORTING = 'ABORTING',
  }

  let engineState = writable<EngineState>(EngineState.UNLOADED);

  async function reloadModel() {
    try {
      engineState.set(EngineState.LOADING);
      await engine.reload(defaultModel);
      engineState.set(EngineState.LOADED);
      console.log("Model reloaded successfully");
    } catch (err) {
      console.error("Model reload failed:", err);
      engineState.set(EngineState.UNLOADED);
    }
  }

  async function initializeEngine() {
    console.log("Initializing engine...");
    try {
      if (!engine) {
        engine = useWebWorker
          ? new webllm.WebWorkerMLCEngine(new Worker(), { appConfig, logLevel: "INFO" })
          : new webllm.MLCEngine({ appConfig });
      }
      await reloadModel();
    } catch (err) {
      console.error("Initialization failed:", err);
    }
  }

  async function generateTextFromReadmes() {
    if (!engine) {
      await initializeEngine();
    }
    const readmes = await getReadmes(0);
    if (readmes.length === 0) {
      console.log("No READMEs found in IndexedDB.");
      return;
    }

    engineState.set(EngineState.GENERATING);
    let descriptions: string[] = [];

    for (const readme of readmes) {
      // Check if generation has been aborted
      if ($engineState !== EngineState.GENERATING) {
        console.log("Generation aborted.");
        break; // Exit the loop if abort is requested
      }

      console.log("Generating text for README:", readme.full_name);
      await engine.resetChat();

      const chatHistory: webllm.ChatCompletionMessageParam[] = [
        { role: "user", content: SYSTEM_PROMPT },
        { role: "user", content: readme.content }
      ];

      try {
        let curMessage = "";
        const completion = await engine.chat.completions.create({
          stream: true,
          messages: chatHistory,
          response_format: {
            type: "grammar",
            grammar: jsonGrammarStr,
          } as webllm.ResponseFormat,
        });

        // Initialize watchdog variables
        const initialTokens = 3;
        let tokenCount = 0;
        let tokenStartTimes: number[] = [];
        let avgTimePerToken = 0;
        let watchdogTimeout: ReturnType<typeof setTimeout> | null = null;

        const startWatchdog = () => {
          if (avgTimePerToken > 0) {
            watchdogTimeout = setTimeout(() => {
              console.warn("Watchdog timer triggered. Aborting generation due to potential hallucination.");
              abortGeneration();
            }, avgTimePerToken * 2); // Set timeout to twice the average time per token
          }
        };

        const resetWatchdog = () => {
          if (watchdogTimeout) {
            clearTimeout(watchdogTimeout);
            watchdogTimeout = null;
          }
          startWatchdog();
        };

        for await (const chunk of completion) {
          // Check if generation has been aborted
          if ($engineState !== EngineState.GENERATING) {
            console.log("Generation aborted during streaming.");
            break; // Exit the streaming loop if abort is requested
          }

          const chunkStartTime = Date.now();

          const curDelta = chunk.choices[0]?.delta.content;
          if (curDelta) {
            const tokenReceivedTime = Date.now();
            if (tokenCount < initialTokens) {
              const timeTaken = tokenReceivedTime - chunkStartTime;
              tokenStartTimes.push(timeTaken);
              if (tokenCount === initialTokens - 1) {
                avgTimePerToken = tokenStartTimes.reduce((a, b) => a + b, 0) / initialTokens;
                console.log(`Average time per token calculated: ${avgTimePerToken} ms`);
                startWatchdog();
              }
            } else {
              resetWatchdog();
            }

            tokenCount += 1;
            curMessage += curDelta;
            current_description.set(curMessage);
          }
        }

        // Clear watchdog after successful generation
        if (watchdogTimeout) {
          clearTimeout(watchdogTimeout);
          watchdogTimeout = null;
        }

        console.log("Generated description:", curMessage);
        descriptions.push(curMessage);

        const timestamp = new Date().toISOString();
        await saveDescriptions([{
          id: readme.id,
          full_name: readme.full_name,
          description: curMessage,
          timestamp
        }]);

      } catch (err) {
        console.error("Generation error:", err);
      }
    }

    generatedDescriptions.set(descriptions);
    engineState.set(EngineState.LOADED);
  }

  async function abortGeneration() {
    console.log("Aborting generation...");
    if ($engineState === EngineState.GENERATING) {
      engineState.set(EngineState.ABORTING);
      engine.interruptGenerate();
      await engine.resetChat();
      await engine.unload();
      await reloadModel();
      console.log("Generation aborted.");
    }
  }

  onMount(initializeEngine);

  onDestroy(() => {
    if (engine) {
      console.log("Unloading engine...");
      engine.unload();
    }
  });
</script>

<div class="container">
  <h1 class="text-4xl font-bold">Generate Descriptions</h1>
  <p>Generate concise descriptions and keywords from GitHub repository READMEs.</p>

  <button
    class="btn variant-filled"
    on:click={() => ($engineState === EngineState.GENERATING ? abortGeneration() : generateTextFromReadmes())}
    disabled={$engineState === EngineState.LOADING || $engineState === EngineState.ABORTING}
  >
    {#if $engineState === EngineState.LOADING}
      Loading model...
    {:else if $engineState === EngineState.ABORTING}
      Aborting...
    {:else if $engineState === EngineState.GENERATING}
      Abort Generation
    {:else}
      Generate from READMEs
    {/if}
  </button>

    <!-- TODO: show readme contents on left, show generated description on right -->
    <div class="h-full overflow-y-auto">
      <pre>{$current_description}</pre>
    </div>

  {#if $generatedDescriptions.length > 0}
    <div class="results">
      <h2>Generated Descriptions (this run):</h2>
      {#each $generatedDescriptions as description}
        <pre>{description}</pre>
      {/each}
    </div>
  {/if}
</div>

<style>
.container {
  max-width: 600px;
  margin: auto;
  text-align: center;
}
.results {
  margin-top: 20px;
  text-align: left;
}
</style>

<!-- 
========================================
End of File: src/routes/05gendescriptions/+page.svelte
========================================
-->
