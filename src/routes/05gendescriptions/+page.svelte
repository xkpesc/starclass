<!--
========================================
File: src/routes/05gendescriptions/+page.svelte
========================================
-->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import * as webllm from "@mlc-ai/web-llm";
  import { writable } from "svelte/store";
  import Worker from "$lib/webllm_worker?worker";
  import { getReadmes } from "$lib/IDBUtils";
  import { saveDescriptions, getDescriptions } from "$lib/DescriptionUtils";
  import { placeholderText } from "$lib/placeholder-text";

  import Chart from "chart.js/auto";

  import type { AppConfig } from "@mlc-ai/web-llm";
  import { prebuiltAppConfig } from "@mlc-ai/web-llm";

  // Declare the default model variable so we can use it in our mapping
  const defaultModel = "Llama-3.2-1B-Instruct-q4f32_1-MLC";
   // const defaultModel = "DeepSeek-R1-Distill-Llama-8B-q4f32_1-MLC";

   const engineOptions = {
        context_window_size: -1,
        sliding_window_size: 4096*4,
        attention_sink_size: 8,
      };

  // Merge the prebuilt configuration with additional options (such as enabling a web worker)
  // and force only the default model's overrides to have context_window_size equal to 2048.
  const appConfig: AppConfig & { use_web_worker?: boolean } = {
    ...prebuiltAppConfig,
    use_web_worker: true,
    model_list: prebuiltAppConfig.model_list.map((model) =>
      model.model_id === defaultModel
        ? { ...model, overrides: { ...model.overrides, context_window_size: -1 } }
        : model,
    ),
  };

  console.log("appConfig", appConfig);
  console.log("Default Model Object:", appConfig.model_list.find(model => model.model_id === defaultModel));

  let useWebWorker = appConfig.use_web_worker;
  let engine: webllm.MLCEngineInterface | webllm.WebWorkerMLCEngine;

  let generatedDescriptions = writable<string[]>([]);
  let current_description = writable();
  let currentReadme = writable<any>(null);

  const jsonGrammarStr = String.raw`
    root ::= "{" ws "\"brief_description\":" ws brief_description "," ws "\"keywords\":" ws keywords "}"
    brief_description ::= "\"" word (" " word){4,40} "\""
    keywords ::= "[" ws keyword ("," ws keyword){4,4} ws "]"
    keyword ::= "\"" word ("-" word)? "\""
    ws ::= [ \t\n]*
    word ::= [^" \t\n-]+
  `;

  const SYSTEM_PROMPT = `
    You are a helpful assistant that summarizes GitHub repository READMEs.
    You will be provided with the README content and then you must provide a brief description (1 or 2 sentences) of what the repository does in English.
    Always translate to English. Everything must be written in English. 
    Also, generate 4 unique (do not repeat them) relevant keywords or tags that best represent the repository's functionality. No more than 5 keywords!
    Respond using only the JSON format with the following template, don't say anything else:
    \`\`\`
    {
      "brief_description": "brief description in english here",
      "keywords": ["keyword1", "keyword2", "keyword3", "keyword4"]
    }
    \`\`\`.
  `;

  // Add EngineState enum and engineState store
  enum EngineState {
    UNLOADED = "UNLOADED",
    LOADING = "LOADING",
    LOADED = "LOADED",
    GENERATING = "GENERATING",
    INTERRUPTING = "INTERRUPTING",
  }

  let engineState = writable<EngineState>(EngineState.UNLOADED);

  let entropyValues = writable<number[]>([]);
  let stddevValues = writable<number[]>([]);
  let entropyChart: Chart;

  // This queue ensures that engine lifecycle operations occur sequentially.
  let engineTaskChain: Promise<void> = Promise.resolve();
  // Updated pushTask helper to be generic and log queued and executing tasks
  function pushTask<T>(
    task: () => Promise<T>,
    taskName: string = "(unnamed)",
  ): Promise<T> {
    console.log(`[pushTask] Pushed task ${taskName}`);
    const lastTask = engineTaskChain;
    const resultPromise = lastTask
      .then(async () => {
        console.log(`[pushTask] Executing task ${taskName}`);
        return task();
      })
      .catch((err) => {
        console.error(`[pushTask] Error in task ${taskName}:`, err);
        throw err;
      });
    // Update chain (we ignore the result here)
    engineTaskChain = resultPromise.then(() => void 0).catch(() => void 0);
    return resultPromise;
  }

  // This function ensures that all queued tasks are completed before proceeding.
  async function flushTasks() {
    console.log("[flushTasks] Flushing tasks...");
    await engineTaskChain;
    console.log("[flushTasks] Tasks flushed");
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
    constructor(
      windowSize: number = 30,
      collapseWindowSize: number = 5,
      collapseThreshold: number = 0.05,
    ) {
      this.entropyWindow = [];
      this.stddevWindow = [];
      this.maxWindowSize = windowSize;
      this.collapseWindowSize = collapseWindowSize;
      this.collapseThreshold = collapseThreshold;
    }

    computeEntropy(logProbs: number[]): number {
      // Filter out any -Infinity (invalid) entries
      const validLogProbs = logProbs.filter((logP) => logP > -Infinity);
      if (validLogProbs.length === 0) {
        return 0;
      }
      // Convert log-probs to probabilities and normalize
      const probs = validLogProbs.map((lp) => Math.exp(lp));
      const sumProbs = probs.reduce((a, b) => a + b, 0);
      const normalizedProbs = probs.map((p) => p / sumProbs);
      // Compute entropy: H = -Σ p * log(p)
      return -normalizedProbs.reduce(
        (acc, p) => acc + (p > 0 ? p * Math.log(p) : 0),
        0,
      );
    }

    getCurrentStdDev(): number {
      const n = this.entropyWindow.length;
      if (n === 0) return 0;
      const mean = this.entropyWindow.reduce((a, b) => a + b, 0) / n;
      const variance =
        this.entropyWindow.reduce((sum, e) => sum + Math.pow(e - mean, 2), 0) /
        n;
      return Math.sqrt(variance);
    }

    detectHallucination(logProbs: number[]): boolean {
      if (logProbs.length === 0) return false;

      const entropy = this.computeEntropy(logProbs);
      // console.log(`Current token entropy: ${entropy.toFixed(4)}`);
      this.entropyWindow.push(entropy);
      if (this.entropyWindow.length > this.maxWindowSize) {
        this.entropyWindow.shift();
      }

      const stdDev = this.getCurrentStdDev();
      // console.log(`Rolling entropy stddev: ${stdDev.toFixed(4)}`);

      // Update stddev rolling window
      this.stddevWindow.push(stdDev);
      if (this.stddevWindow.length > this.maxWindowSize) {
        this.stddevWindow.shift();
      }

      // Check if a collapse in stddev (near zero) is occurring by using a window of stddev values.
      if (
        this.stddevWindow.length >= this.collapseWindowSize &&
        this.entropyWindow.length >= this.maxWindowSize
      ) {
        const recentWindow = this.stddevWindow.slice(-this.collapseWindowSize);
        const collapseDetected = recentWindow.every(
          (val) => val < this.collapseThreshold,
        );
        if (collapseDetected) {
          console.warn(
            "Stddev collapse detected: recent stddev values near zero",
          );
          return true;
        }
      }

      return false;
    }
  }

  async function reloadModel() {
    try {
      engineState.set(EngineState.LOADING);
      await engine.reload(defaultModel, engineOptions);
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
          ? engine = await webllm.CreateWebWorkerMLCEngine(
            new Worker(),
            defaultModel,
            { appConfig, logLevel: "INFO" },
            engineOptions,
          )
          : engine = await webllm.CreateMLCEngine(
            defaultModel,
            { appConfig, logLevel: "INFO" },
            engineOptions,
          );
      }
      engineState.set(EngineState.LOADED);
    } catch (err) {
      console.error("Initialization failed:", err);
    }
  }

  interface DescriptionResult {
    description: string;
    hallucinationDetected: boolean;
  }

  async function generateDescriptionForReadme(
    readme: any,
  ): Promise<DescriptionResult> {
    engineState.set(EngineState.GENERATING);
    console.log(
      `[Task] Starting description generation for README: ${readme.full_name}`,
    );
    let curMessage = "";
    let hallucinationOccurred = false;

    const chatHistory: webllm.ChatCompletionMessageParam[] = [
      { role: "user", content: SYSTEM_PROMPT },
      { role: "user", content: readme.content },
    ];
    await engine.resetChat();
    const completion = await engine.chat.completions.create({
      stream: true,
      messages: chatHistory,
      logprobs: true,
      top_logprobs: 5,
      // seed: 42, // Keep even if commented out. Useful for hallucination reproducibility
      response_format: {
        type: "grammar",
        grammar: jsonGrammarStr,
      } as webllm.ResponseFormat,
    });
    console.log("after chat completion");

    const entropyMonitor = new TokenEntropyMonitor(30, 5, 0.05);
    console.log("before outer loop");
    outer: for await (const chunk of completion) {
      // Only break if generation is explicitly interrupted (user abort)
      if ($engineState === EngineState.INTERRUPTING) {
        console.log(
          "Generation aborted during streaming for",
          readme.full_name,
        );
        break outer;
      }

      const curDelta = chunk.choices[0]?.delta.content;
      for (const choice of chunk.choices) {
        if (choice.logprobs?.content) {
          for (const tokenData of choice.logprobs.content) {
            const logProbs =
              tokenData.top_logprobs?.slice(0, 5).map((t) => t.logprob) || [];
            const entropy = entropyMonitor.computeEntropy(logProbs);
            entropyValues.update((values) => {
              const newValues = [...values, entropy];
              return newValues.slice(-300);
            });
            stddevValues.update((values) => {
              const newValues = [...values, entropyMonitor.getCurrentStdDev()];
              return newValues.slice(-300);
            });

            entropyChart.data.labels = Array.from(
              { length: Math.min(300, $entropyValues.length) },
              (_, i) => i + 1,
            );
            entropyChart.data.datasets[0].data = $stddevValues;
            entropyChart.data.datasets[1].data = $entropyValues;
            entropyChart.update();

            // TODO: we also need a function to timeout the generation when the GPU keeps
            // running at 100% but no tokens are generated
            // TODO: need UX to briefly notify the user that a hallucination has been detected
            if (entropyMonitor.detectHallucination(logProbs)) {
              console.warn(
                `⚠️ High entropy variance detected in ${readme.full_name} - potential hallucination!`,
              );
              abortGeneration("hallucination");
              hallucinationOccurred = true;
              break outer;
            }
          }
        }
      }

      if (curDelta) {
        curMessage += curDelta;
        current_description.set(curMessage);
      }
    }

    console.log("returning from generateDescriptionForReadme");
    return {
      description: curMessage,
      hallucinationDetected: hallucinationOccurred,
    };
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

    // NEW CODE: Retrieve saved descriptions to resume generation.
    const savedDescriptionsList = await getDescriptions();
    const savedDescriptionsMap = new Map<any, any>();
    for (const desc of savedDescriptionsList) {
      const key = desc.id || desc.full_name;
      savedDescriptionsMap.set(key, desc);
    }

    engineState.set(EngineState.GENERATING);
    let descriptions: string[] = [];

    entropyValues.set([]);
    stddevValues.set([]);
    entropyChart.update();

    for (const readme of readmes) {
      // NEW CODE: Check if this readme has already been processed
      const key = readme.id || readme.full_name;
      const savedRecord = savedDescriptionsMap.get(key);
      if (savedRecord && (savedRecord.status === "ok" || savedRecord.status === "entropy_collapse")) {
        console.log(`Skipping ${readme.full_name} as already processed with status: ${savedRecord.status}`);
        descriptions.push(savedRecord.description);
        continue; // Skip generation for this readme
      }

      // Update the current readme store for display in the left panel
      currentReadme.set(readme);

      // Check if generation has been aborted
      console.log("engineState:", $engineState, "on readme:", readme.full_name);
      if (
        $engineState === EngineState.INTERRUPTING ||
        $engineState === EngineState.UNLOADED
      ) {
        console.log("Generation aborted.");
        break;
      }

      let attempts = 0;
      const maxAttempts = 3;
      let result;
      do {
        console.log(`attempt #${attempts}`);
        result = await pushTask(
          () => generateDescriptionForReadme(readme),
          `GENERATING ${readme.full_name}`,
        );
        console.log("after resetChat");
        if (result.hallucinationDetected) {
          await pushTask(() => engine.unload(), "UNLOAD_ENGINE");
          await pushTask(() => reloadModel(), "RELOAD_MODEL");

          attempts++;
          console.log(
            `Retrying generation for ${readme.full_name} due to hallucination. Attempt ${attempts}`,
          );
          await flushTasks();
        }
      } while (result.hallucinationDetected && attempts < maxAttempts);

      // Push the generated description to our local array
      descriptions.push(result.description);

      // Save the generated description along with the model used
      await saveDescriptions([
        {
          // Using readme.id if available; if not, fallback to readme.full_name
          id: readme.id,
          full_name: readme.full_name,
          description: result.description,
          model: defaultModel, // Added model field for inference model name
          status: result.hallucinationDetected ? "entropy_collapse" : "ok",
          timestamp: new Date().toISOString(),
        },
      ]);
    }

    generatedDescriptions.set(descriptions);
    engineState.set(EngineState.LOADED);
  }

  // User-triggered abort generation function
  async function abortGeneration(reason: string = "user") {
    console.log(`Aborting generation (${reason} initiated)...`);
    if ($engineState === EngineState.GENERATING) {
      await pushTask(async () => {
        engineState.set(EngineState.INTERRUPTING);
        engine.interruptGenerate();
      }, EngineState.INTERRUPTING);
    }
    // Clear token tracking and chart data
    entropyValues.set([]);
    stddevValues.set([]);
    entropyChart.update();
  }

  onMount(async () => {
    // Get the primary color from the container using skeleton colors
    const primaryColor = getComputedStyle(document.querySelector(".container")!)
      .getPropertyValue("--color-surface-500").trim();

    const secondaryColor = getComputedStyle(document.querySelector(".container")!)
      .getPropertyValue("--color-surface-300").trim();

    // Initialize chart after component mounts
    const ctx = document.getElementById("entropyChart") as HTMLCanvasElement;
    entropyChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: "Rolling StdDev",
            data: [],
            borderColor: `rgb(${secondaryColor})`,
            tension: 0.1,
          },
          {
            label: "Token Entropy",
            data: [],
            borderColor: `rgb(${primaryColor})`,
            tension: 0.1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
          },
        },
      },
    });

    await initializeEngine();
  });

  onDestroy(() => {
    if (engine) {
      console.log("Unloading engine...");
      engine.unload();
    }
  });
</script>

<!-- <ContainerSlot> -->
  <div id="top-container" class="w-full flex-1 h-4/5 flex flex-col">
    <h1 class="text-4xl font-bold">Generate Descriptions</h1>
    <button
      class="btn variant-filled"
      on:click={() => {
        if ($engineState === EngineState.GENERATING) {
          abortGeneration("user");
        } else {
          generateTextFromReadmes();
        }
      }}
      disabled={$engineState === EngineState.LOADING || $engineState === EngineState.UNLOADED ||
        $engineState === EngineState.INTERRUPTING}
    >
      {#if $engineState === EngineState.LOADING}
        Loading model...
      {:else if $engineState === EngineState.INTERRUPTING}
        Aborting...
      {:else if $engineState === EngineState.GENERATING}
        Abort Generation
      {:else}
        Generate from READMEs
      {/if}
    </button>

    <div class="flex flex-row mt-4 w-full min-h-20">
      <!-- Left Panel: Repository Details -->
      <div class="w-1/2 p-2 border-r overflow-auto">
        <h2 class="text-xl font-bold mb-2">Repository Details</h2>
        {#if $currentReadme}
          <h3 class="font-semibold">{$currentReadme.full_name}</h3>
          <pre style="white-space: pre-wrap;">{$currentReadme.content}</pre>
        {:else}
          <pre
            style="white-space: pre-wrap; font-family: monospace;">{placeholderText}</pre>
        {/if}
      </div>

      <!-- Right Panel: Generated Description -->
      <div class="w-1/2 p-2 overflow-auto">
        <h2 class="text-xl font-bold mb-2">Generated Description</h2>
        <pre style="white-space: pre-wrap;">{$current_description}</pre>
      </div>
    </div>
  </div>

  <div class="chart-container w-full  h-1/5">
    <canvas id="entropyChart" class="w-full"></canvas>
  </div>

<!--
========================================
End of File: src/routes/05gendescriptions/+page.svelte
========================================
-->

<!-- </ContainerSlot> -->

<style>
</style>
