const candles = Array(100).fill({open:1,high:2,low:1,close:2});
const start = Date.now();
fetch('http://127.0.0.1:8181/v1/analyze', { 
    method: 'POST', 
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
        H1: { candles },
        M15: { candles, atr: 4.5 },
        M5: { candles },
        M1: { candles }
    })
})
.then(r => r.text())
.then(t => console.log('Time:', Date.now() - start, 'ms'))
.catch(e => console.error('Error:', e));
