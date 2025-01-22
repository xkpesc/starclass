// Serve the engine workload through web worker
import { WebWorkerMLCEngineHandler } from "@mlc-ai/web-llm";

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = async (msg: MessageEvent) => {
  handler.onmessage(msg);
};


// // Listen for messages from the main thread
// self.addEventListener("message", async (e) => {
//     const { type, messages } = e.data;
//     console.log(`llm_worker: ${type} + ${messages}`)
// })