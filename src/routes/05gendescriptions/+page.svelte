<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import * as webllm from '@mlc-ai/web-llm';
    import { writable } from 'svelte/store';
    import appConfig from '$lib/app-config';
    import Worker from '$lib/webllm_worker?worker';
    import { getReadmes } from "$lib/GithubStarredRepos";

    // 
    // generate descriptions for all repos and save them to indexeddb
    // generate embeddings from descriptions
    // evaluate quality of embeddings
    // try embeddings search
    // 
    // 
  
    let useWebWorker = appConfig.use_web_worker;
    let engine: webllm.MLCEngineInterface;
    let requestInProgress = writable(false);
    let generatedDescriptions = writable<string[]>([]);

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
  
    const SYSTEM_PROMPT = `
      You are a helpful assistant that summarizes GitHub repository READMEs.
      You will be provided with the README content and then you must provide a brief description (1-2 sentences) of what the repository does.
      Also, extract 3 to 5 relevant keywords or tags that best represent the repository's functionality. No more than 5 keywords!
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
          if (useWebWorker) {
            console.log("Using WebWorker engine...");
            engine = new webllm.WebWorkerMLCEngine(new Worker(), { appConfig, logLevel: "INFO" });
          } else {
            console.log("Using normal MLCEngine...");
            engine = new webllm.MLCEngine({ appConfig });
          }
        }
        await engine.reload("Llama-3.2-1B-Instruct-q4f16_1-MLC");
        console.log("Model loaded successfully");
      } catch (err) {
        console.error("Initialization failed:", err);
      }
    }
  
    async function generateTextFromReadmes() {
      const readmes = await getReadmes(2);
      if (readmes.length === 0) {
        console.log("No READMEs found in IndexedDB.");
        return;
      }
  
      requestInProgress.set(true);
      let descriptions: string[] = [];
      
      for (const readme of readmes) {
        await engine.resetChat();
        let chatHistory: webllm.ChatCompletionMessageParam[] = [];
        console.log("Generating text for README:", readme.full_name);
        chatHistory.push({ role: "user", content: SYSTEM_PROMPT });
        chatHistory.push({ role: "user", content: readme.content });
  
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
  
          console.log("Generated description:", curMessage);
          descriptions.push(curMessage);
        } catch (err) {
          console.error("Generation error:", err);
        }
      }
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
  
    <button class="btn variant-filled" on:click={generateTextFromReadmes} disabled={$requestInProgress}>
      {#if $requestInProgress}
        Generating...
      {/if}
      {#if !$requestInProgress}
        Generate from READMEs
      {/if}
    </button>
  
    {#if $generatedDescriptions.length > 0}
      <div class="results">
        <h2>Generated Descriptions:</h2>
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
  