const fs = require('fs');
fetch('http://127.0.0.1:8181/v1/analyze', { 
    method: 'POST', 
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
        H1: { candles: [{open:1,high:2,low:1,close:2}] },
        M15: { candles: [{open:1,high:2,low:1,close:2}], atr: 4.5 },
        M5: { candles: [{open:1,high:2,low:1,close:2}] },
        M1: { candles: [{open:1,high:2,low:1,close:2}] }
    })
})
.then(r => r.text())
.then(t => console.log('Response:', t))
.catch(e => console.error('Error:', e));
