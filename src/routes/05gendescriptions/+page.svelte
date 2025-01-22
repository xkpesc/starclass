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
  import { saveDescriptions } from '$lib/DescriptionUtils';

  let useWebWorker = appConfig.use_web_worker;
  let engine: webllm.MLCEngineInterface;
  let requestInProgress = writable(false);
  let generatedDescriptions = writable<string[]>([]);
  let modelLoaded = writable(false);
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

  async function initializeEngine() {
    console.log("Initializing engine...");
    try {
      if (!engine) {
        engine = useWebWorker
          ? new webllm.WebWorkerMLCEngine(new Worker(), { appConfig, logLevel: "INFO" })
          : new webllm.MLCEngine({ appConfig });
      }
      // Load or reload your model
      await engine.reload("Llama-3.2-1B-Instruct-q4f16_1-MLC");
      console.log("Model loaded successfully");
      modelLoaded.set(true);
    } catch (err) {
      console.error("Initialization failed:", err);
    }
  }

  async function generateTextFromReadmes() {
    const readmes = await getReadmes(0); // or a limit if desired
    if (readmes.length === 0) {
      console.log("No READMEs found in IndexedDB.");
      return;
    }

    requestInProgress.set(true);

    let descriptions: string[] = [];

    for (const readme of readmes) {
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
          // stream_options: { include_usage: true },
          response_format: {
            type: "grammar",
            grammar: jsonGrammarStr,
          } as webllm.ResponseFormat,
        });

        for await (const chunk of completion) {
          const curDelta = chunk.choices[0]?.delta.content;
          if (curDelta) {
            curMessage += curDelta;
            current_description.set(curMessage)
          }
        }

        console.log("Generated description:", curMessage);
        descriptions.push(curMessage);

        // Save this particular description to IndexedDB immediately
        const timestamp = new Date().toISOString();
        await saveDescriptions([{
          id: readme.id,               // The same ID used for storing the readme
          repo_name: readme.full_name,
          descriptions: curMessage,    // The JSON string from the model
          timestamp
        }]);

      } catch (err) {
        console.error("Generation error:", err);
      }
    }

    // Update the reactive store with all descriptions that we've generated
    generatedDescriptions.set(descriptions);
    requestInProgress.set(false);
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
    on:click={generateTextFromReadmes}
    disabled={!$modelLoaded || $requestInProgress}
  >
    {#if !$modelLoaded}
      Loading model...
    {:else if $requestInProgress}
      Generating...
    {:else}
      Generate from READMEs
    {/if}
  </button>

    <!-- TODO: show readme contents on left, show generated description on right -->
    <div>
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
