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
  }

  let engineState = writable<EngineState>(EngineState.UNLOADED);

  let entropyValues = writable<number[]>([]);
  let stddevValues = writable<number[]>([]);
  let entropyChart: Chart;

  class TokenEntropyMonitor {
    entropyWindow = [];
    stddevWindow = [];
    maxWindowSize;

    constructor(windowSize = 30) {
      this.entropyWindow = [];
      this.stddevWindow = [];
      this.maxWindowSize = windowSize;
    }

    computeEntropy(logProbs) {
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

    getCurrentStdDev() {
      const n = this.entropyWindow.length;
      if (n === 0) return 0;
      const mean = this.entropyWindow.reduce((a, b) => a + b, 0) / n;
      const variance = this.entropyWindow.reduce((sum, e) => sum + Math.pow(e - mean, 2), 0) / n;
      return Math.sqrt(variance);
    }

    detectHallucination(logProbs) {
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
      const collapseWindowSize = 5; // Look at the last 5 tokens (adjustable)
      const collapseThreshold = 0.05; // Values below this are considered near zero
      if (this.stddevWindow.length >= collapseWindowSize && this.entropyWindow.length >= this.maxWindowSize) {
        const recentWindow = this.stddevWindow.slice(-collapseWindowSize);
        const collapseDetected = recentWindow.every(val => val < collapseThreshold);
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

    const entropyMonitor = new TokenEntropyMonitor(30);

    entropyValues.set([]);
    stddevValues.set([]);
    entropyChart.update();

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
          logprobs: true,
          top_logprobs: 5,
          // seed: 42,
          // stream_options: {include_usage: true},
          // TODO: implement these commented options and check for results, do not delete them
          // presence_penalty
          // frequency_penalty: 0.7,
          // max_tokens
          // ignore_eos
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
          // startWatchdog();
        };

        for await (const chunk of completion) {
          // Check if generation has been aborted
          if ($engineState !== EngineState.GENERATING) {
            console.log("Generation aborted during streaming.");
            break; // Exit the streaming loop if abort is requested
          }

          const chunkStartTime = Date.now();

          const curDelta = chunk.choices[0]?.delta.content;

          // console.log("Log probabilities for each token:");
          chunk.choices.forEach((choice, choiceIndex) => {
            choice.logprobs?.content?.forEach((tokenData, tokenIndex) => {
              // console.group(`Choice ${choiceIndex + 1} - Token ${tokenIndex + 1}`);
              // console.log(`Token: ${tokenData.token}`);
              // console.log(`Logprob: ${tokenData.logprob}`);
              
              // Add hallucination detection
              const logProbs = tokenData.top_logprobs?.slice(0, 5).map(t => t.logprob) || [];
              const entropy = entropyMonitor.computeEntropy(logProbs);
              
              // Update entropy values
              entropyValues.update(values => {
                const newValues = [...values, entropy];
                return newValues.slice(-300); // Keep only last 300 values
              });
              
              // Check for hallucination and get stddev
              const isHallucination = entropyMonitor.detectHallucination(logProbs);
              const currentStdDev = entropyMonitor.getCurrentStdDev();
              
              stddevValues.update(values => {
                const newValues = [...values, currentStdDev];
                return newValues.slice(-300); // Keep only last 300 values
              });

              // Update chart
              entropyChart.data.labels = Array.from(
                {length: Math.min(300, $entropyValues.length)}, 
                (_, i) => i + 1
              );
              entropyChart.data.datasets[0].data = $entropyValues;
              entropyChart.data.datasets[1].data = $stddevValues;
              entropyChart.update();

              if (isHallucination) {
                console.warn('⚠️ High entropy variance detected - potential hallucination!');
                abortGeneration();
              }

              if (tokenData.top_logprobs?.length > 0) {
                console.log('Top 5 alternatives:');
                tokenData.top_logprobs.slice(0, 5).forEach((top, i) => {
                  console.log(`  ${i + 1}. ${top.token}: ${top.logprob}`);
                });
              }
              // console.groupEnd();
            });
          });
          
          if (curDelta) {
            const tokenReceivedTime = Date.now();
            if (tokenCount < initialTokens) {
              const timeTaken = tokenReceivedTime - chunkStartTime;
              tokenStartTimes.push(timeTaken);
              if (tokenCount === initialTokens - 1) {
                avgTimePerToken = tokenStartTimes.reduce((a, b) => a + b, 0) / initialTokens;
                console.log(`Average time per token calculated: ${avgTimePerToken} ms`);
                // startWatchdog();
              }
            } else {
              // resetWatchdog();
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
    entropyValues.set([]);
    stddevValues.set([]);
    entropyChart.update();
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
