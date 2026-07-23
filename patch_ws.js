const fs = require('fs');
let content = fs.readFileSync('lib/trading-engine/py-ws-client.ts', 'utf-8');
content = "import WebSocket from 'ws';\n" + content;
content = content.replace("const WebSocket = require('ws');", "");
fs.writeFileSync('lib/trading-engine/py-ws-client.ts', content);
