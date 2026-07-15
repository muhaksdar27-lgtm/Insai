const { spawn } = require('child_process');
const path = require('path');

const pyProcess = spawn('python3', [
    '-c', 'import sys; sys.path.append("./python-engine"); import main'
], {
    cwd: process.cwd(),
    stdio: 'pipe'
});

pyProcess.stderr.on('data', data => console.error('STDERR:', data.toString()));
pyProcess.stdout.on('data', data => console.log('STDOUT:', data.toString()));
pyProcess.on('close', code => console.log('Exit code:', code));
