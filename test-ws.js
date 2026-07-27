const WebSocket = require('ws');
const ws = new WebSocket('ws://127.0.0.1:8181/ws/analyze');
ws.on('open', () => {
  console.log('WS OPEN');
  ws.send(JSON.stringify({ correlation_id: 'test', payload: { H1: { candles: [{open:1,high:2,low:1,close:2}] } } }));
});
ws.on('message', (m) => console.log('WS MSG:', m.toString()));
ws.on('error', (e) => console.log('WS ERR:', e.message));
