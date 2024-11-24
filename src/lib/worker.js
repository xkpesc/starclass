// worker.js
self.addEventListener('message', (event) => {
    const { type, data } = event.data;
  
    switch (type) {
      case 'ping':
        self.postMessage({ type: 'pong', data: `Hello from the Worker! You sent: ${data}` });
        break;
  
      case 'calculate':
        const result = data.num1 + data.num2;
        self.postMessage({ type: 'result', data: result });
        console.log('result '+ result)
        break;
  
      default:
        self.postMessage({ type: 'error', data: 'Unknown message type' });
    }
  });