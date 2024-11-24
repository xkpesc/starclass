<script>
    import { onMount, onDestroy } from 'svelte';
    import Worker from '$lib/worker?worker'
    let worker;
    let messageFromWorker = '';
    let num1 = 0;
    let num2 = 0;
    let calculationResult = null;
  
    // Initialize the worker when the component mounts
    onMount(() => {
      worker = new Worker; // Load the worker from the public folder
  
      worker.addEventListener('message', (event) => {
        const { type, data } = event.data;
  
        if (type === 'pong') {
          messageFromWorker = data;
        } else if (type === 'result') {
          calculationResult = data;
        }
      });
  
      worker.addEventListener('error', (error) => {
        console.error('Worker Error:', error.message);
      });
    });
  
    // Clean up the worker when the component is destroyed
    onDestroy(() => {
      worker.terminate();
    });
  
    function sendPing() {
      worker.postMessage({ type: 'ping', data: 'This is the main thread!' });
    }
  
    function calculateSum() {
      worker.postMessage({ type: 'calculate', data: { num1, num2 } });
    }
  </script>
  
  <h1>Web Worker in Svelte</h1>
  
  <!-- Ping Test -->
  <button class="btn variant-filled" on:click={sendPing}>Send Ping to Worker</button>
  <p>Message from Worker: {messageFromWorker}</p>
  
  <!-- Calculation Test -->
  <div>
    <input type="number" class="input" bind:value={num1} placeholder="Number 1" />
    <input type="number" class="input" bind:value={num2} placeholder="Number 2" />
    <button class="btn variant-filled" on:click={calculateSum}>Calculate Sum</button>
    {#if calculationResult !== null}
      <p>Sum: {calculationResult}</p>
    {/if}
  </div>