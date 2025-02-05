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

  import Chart from 'chart.js/auto';


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
    HALLUCINATING = 'HALLUCINATING',
    RETRYING = 'RETRYING'
  }

  let engineState = writable<EngineState>(EngineState.UNLOADED);

  let entropyValues = writable<number[]>([]);
  let stddevValues = writable<number[]>([]);
  let entropyChart: Chart;

  // ------------------------------
  // NEW: Add engine task queue helper
  // ------------------------------
  // This queue ensures that engine lifecycle operations occur sequentially.
  let engineTaskChain: Promise<void> = Promise.resolve();
  // Updated pushTask helper to be generic and log queued and executing tasks
  function pushTask<T>(task: () => Promise<T>, taskName: string = "(unnamed)"): Promise<T> {
    console.log(`[pushTask] Pushed task ${taskName}`);
    const lastTask = engineTaskChain;
    const resultPromise = lastTask.then(async () => {
      console.log(`[pushTask] Executing task ${taskName}`);
      return task();
    }).catch(err => {
      console.error(`[pushTask] Error in task ${taskName}:`, err);
      throw err;
    });
    // Update chain (we ignore the result here)
    engineTaskChain = resultPromise.then(() => void 0).catch(() => void 0);
    return resultPromise;
  }
  // ------------------------------

  class TokenEntropyMonitor {
    entropyWindow: number[] = [];
    stddevWindow: number[] = [];
    maxWindowSize: number;
    collapseWindowSize: number;
    collapseThreshold: number;

    /**
     * Creates an instance of the TokenEntropyMonitor.
     *
     * @param windowSize - Maximum size of the rolling window holding raw entropy values.
     *                     This is used to compute the current rolling standard deviation.
     * @param collapseWindowSize - The number of recent stddev values to consider for collapse detection.
     *                             This window will be checked to see if all values fall below the collapseThreshold.
     * @param collapseThreshold - The threshold for stddev values below which they are considered collapsed (i.e. near zero).
     */
    constructor(windowSize: number = 30, collapseWindowSize: number = 5, collapseThreshold: number = 0.05) {
      this.entropyWindow = [];
      this.stddevWindow = [];
      this.maxWindowSize = windowSize;
      this.collapseWindowSize = collapseWindowSize;
      this.collapseThreshold = collapseThreshold;
    }

    computeEntropy(logProbs: number[]): number {
      // Filter out any -Infinity (invalid) entries
      const validLogProbs = logProbs.filter(logP => logP > -Infinity);
      if (validLogProbs.length === 0) {
        return 0;
      }
      // Convert log-probs to probabilities and normalize
      const probs = validLogProbs.map(lp => Math.exp(lp));
      const sumProbs = probs.reduce((a, b) => a + b, 0);
      const normalizedProbs = probs.map(p => p / sumProbs);
      // Compute entropy: H = -Σ p * log(p)
      return -normalizedProbs.reduce((acc, p) => acc + (p > 0 ? p * Math.log(p) : 0), 0);
    }

    getCurrentStdDev(): number {
      const n = this.entropyWindow.length;
      if (n === 0) return 0;
      const mean = this.entropyWindow.reduce((a, b) => a + b, 0) / n;
      const variance = this.entropyWindow.reduce((sum, e) => sum + Math.pow(e - mean, 2), 0) / n;
      return Math.sqrt(variance);
    }

    detectHallucination(logProbs: number[]): boolean {
      if (logProbs.length === 0) return false;
      
      const entropy = this.computeEntropy(logProbs);
      console.log(`Current token entropy: ${entropy.toFixed(4)}`);
      this.entropyWindow.push(entropy);
      if (this.entropyWindow.length > this.maxWindowSize) {
        this.entropyWindow.shift();
      }
      
      const stdDev = this.getCurrentStdDev();
      console.log(`Rolling entropy stddev: ${stdDev.toFixed(4)}`);

      // Update stddev rolling window
      this.stddevWindow.push(stdDev);
      if (this.stddevWindow.length > this.maxWindowSize) {
        this.stddevWindow.shift();
      }

      // Check if a collapse in stddev (near zero) is occurring by using a window of stddev values.
      if (this.stddevWindow.length >= this.collapseWindowSize && this.entropyWindow.length >= this.maxWindowSize) {
        const recentWindow = this.stddevWindow.slice(-this.collapseWindowSize);
        const collapseDetected = recentWindow.every(val => val < this.collapseThreshold);
        if (collapseDetected) {
          console.warn("Stddev collapse detected: recent stddev values near zero");
          return true;
        }
      }
      
      return false;
    }
  }

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
      await pushTask(() => reloadModel(), EngineState.LOADING);
    } catch (err) {
      console.error("Initialization failed:", err);
    }
  }

  async function generateDescriptionForReadme(readme: any): Promise<string> {
    console.log(`[Task] Starting description generation for README: ${readme.full_name}`);
    let curMessage = "";
    try {
      await engine.resetChat();
      const chatHistory: webllm.ChatCompletionMessageParam[] = [
        { role: "user", content: SYSTEM_PROMPT },
        { role: "user", content: readme.content }
      ];
 
      const completion = await engine.chat.completions.create({
        stream: true,
        messages: chatHistory,
        logprobs: true,
        top_logprobs: 5,
        seed: 42, // Useful for hallucination reproducibility
        response_format: {
          type: "grammar",
          grammar: jsonGrammarStr,
        } as webllm.ResponseFormat,
      });
 
      const entropyMonitor = new TokenEntropyMonitor(30, 5, 0.05);
      for await (const chunk of completion) {
        if ($engineState !== EngineState.GENERATING) {
          console.log("Generation aborted during streaming for", readme.full_name);
          break;
        }
 
        const curDelta = chunk.choices[0]?.delta.content;
 
        chunk.choices.forEach((choice, choiceIndex) => {
          choice.logprobs?.content?.forEach((tokenData, tokenIndex) => {
            const logProbs = tokenData.top_logprobs?.slice(0, 5).map(t => t.logprob) || [];
            const entropy = entropyMonitor.computeEntropy(logProbs);
            entropyValues.update(values => {
              const newValues = [...values, entropy];
              return newValues.slice(-300);
            });
            const isHallucination = entropyMonitor.detectHallucination(logProbs);
            const currentStdDev = entropyMonitor.getCurrentStdDev();
            stddevValues.update(values => {
              const newValues = [...values, currentStdDev];
              return newValues.slice(-300);
            });
            // --- Chart Update ---
            entropyChart.data.labels = Array.from(
              {length: Math.min(300, $entropyValues.length)},
              (_, i) => i + 1
            );
            entropyChart.data.datasets[0].data = $entropyValues;
            entropyChart.data.datasets[1].data = $stddevValues;
            entropyChart.update();
            // ---------------------

            if (isHallucination) {
              console.warn(`⚠️ High entropy variance detected in ${readme.full_name} - potential hallucination!`);
              hallucinationDetected();
            }
          });
        });
 
        if (curDelta) {
          curMessage += curDelta;
          current_description.set(curMessage);
        }
      }
 
      console.log(`Task [GENERATING ${readme.full_name}] - Generated description: ${curMessage}`);
      const timestamp = new Date().toISOString();
      await saveDescriptions([{
        id: readme.id,
        full_name: readme.full_name,
        description: curMessage,
        timestamp
      }]);
    } catch (err) {
      console.error(`Generation error for ${readme.full_name}:`, err);
    }
    return curMessage;
  }

  async function generateTextFromReadmes() {
    if (!engine) {
      await pushTask(() => initializeEngine(), "INITIALIZING");
    }
    const readmes = await getReadmes(0);
    if (readmes.length === 0) {
      console.log("No READMEs found in IndexedDB.");
      return;
    }

    engineState.set(EngineState.GENERATING);
    let descriptions: string[] = [];

    entropyValues.set([]);
    stddevValues.set([]);
    entropyChart.update();

    for (const readme of readmes) {
      // Check if generation has been aborted
      if ($engineState !== EngineState.GENERATING) {
        console.log("Generation aborted.");
        break;
      }

      // Push the per-readme description generation as an individual async task
      const description = await pushTask(
        () => generateDescriptionForReadme(readme),
        `GENERATING ${readme.full_name}`
      );
      descriptions.push(description);
    }

    generatedDescriptions.set(descriptions);
    engineState.set(EngineState.LOADED);
  }

  // User-triggered abort generation function
  async function abortGeneration() {
    console.log("Aborting generation (user initiated)...");
    if ($engineState === EngineState.GENERATING) {
      engineState.set(EngineState.ABORTING);
      await pushTask(async () => {
        engine.interruptGenerate();
        await engine.resetChat();
        await engine.unload();
        await reloadModel();
        console.log("Generation aborted (user initiated).");
      }, EngineState.ABORTING);
    }
    entropyValues.set([]);
    stddevValues.set([]);
    entropyChart.update();
  }

  // Handler for hallucination detection triggered abort & retry
  async function hallucinationDetected() {
    console.log("Aborting generation due to hallucination detection...");
    if ($engineState === EngineState.GENERATING) {
      engineState.set(EngineState.HALLUCINATING);
      await pushTask(async () => {
        engine.interruptGenerate();
        await engine.resetChat();
        await engine.unload();
        await reloadModel();
        console.log("Generation aborted (hallucination).");
      }, EngineState.HALLUCINATING);
    }
    entropyValues.set([]);
    stddevValues.set([]);
    entropyChart.update();

    // Transition to retry process
    engineState.set(EngineState.RETRYING);
    console.log("Retrying generation due to hallucination detection...");
    await new Promise(resolve => setTimeout(resolve, 1000));
    await generateTextFromReadmes();
  }

  onMount(async () => {
    await initializeEngine();
    
    // Initialize chart after component mounts
    const ctx = document.getElementById('entropyChart') as HTMLCanvasElement;
    entropyChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: 'Token Entropy',
          data: [],
          borderColor: 'rgb(75, 192, 192)',
          tension: 0.1
        },
        {
          label: 'Rolling StdDev',
          data: [],
          borderColor: 'rgb(255, 99, 132)',
          tension: 0.1,
        }]
      },
      options: {
        responsive: true,
        scales: {
          y: {
            beginAtZero: true
          }
        }
      }
    });
  });

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
    on:click={() => {
      if ($engineState === EngineState.GENERATING) {
        abortGeneration();
      } else {
        generateTextFromReadmes();
      }
    }}
    disabled={$engineState === EngineState.LOADING || $engineState === EngineState.ABORTING || $engineState === EngineState.HALLUCINATING || $engineState === EngineState.RETRYING}
  >
    {#if $engineState === EngineState.LOADING}
      Loading model...
    {:else if $engineState === EngineState.ABORTING}
      Aborting...
    {:else if $engineState === EngineState.GENERATING}
      Abort Generation
    {:else if $engineState === EngineState.HALLUCINATING}
      Hallucination detected...
    {:else if $engineState === EngineState.RETRYING}
      Retrying generation...
    {:else}
      Generate from READMEs
    {/if}
  </button>

    <!-- TODO: show readme contents on left, show generated description on right -->
    <div class="h-full overflow-y-auto">
      <pre style="white-space: pre-wrap;">{$current_description}</pre>
    </div>

  <!-- {#if $generatedDescriptions.length > 0}
    <div class="results">
      <h2>Generated Descriptions (this run):</h2>
      {#each $generatedDescriptions as description}
        <pre style="white-space: pre-wrap;">{description}</pre>
      {/each}
    </div>
  {/if} -->

  <div class="chart-container">
    <canvas id="entropyChart"></canvas>
  </div>
</div>

<style>
.container {
  /* max-width: 600px; */
  margin: auto;
  text-align: center;
}
.results {
  margin-top: 20px;
  text-align: left;
}
.chart-container {
  margin: 20px 0;
  height: 600px;
}
</style>

<!-- 
========================================
End of File: src/routes/05gendescriptions/+page.svelte
========================================
-->
