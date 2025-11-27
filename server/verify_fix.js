const WebSocket = require('ws');
const { spawn } = require('child_process');
const path = require('path');

const SERVER_PORT = 6007;
const serverProcess = spawn('node', ['index.js'], {
    cwd: __dirname,
    env: { ...process.env, PORT: SERVER_PORT, VCP_WS_URL: 'ws://mock', VCP_KEY: 'mock' },
    stdio: ['pipe', 'pipe', 'pipe']
});

let serverOutput = '';
serverProcess.stdout.on('data', (data) => {
    const str = data.toString();
    serverOutput += str;
    console.log('[SERVER STDOUT]', str.trim());
});
serverProcess.stderr.on('data', (data) => {
    console.error('[SERVER STDERR]', data.toString().trim());
});

setTimeout(() => {
    const ws = new WebSocket(`ws://localhost:${SERVER_PORT}`);

    ws.on('open', () => {
        console.log('Connected to test server');
        // Send binary data (Buffer)
        const buffer = Buffer.from([1, 2, 3, 4]);
        ws.send(buffer);

        // Give server time to process
        setTimeout(() => {
            if (serverOutput.includes('[Bridge] Received audio chunk')) {
                console.log('SUCCESS: Server detected binary data!');
                process.exit(0);
            } else {
                console.error('FAILURE: Server did not detect binary data.');
                process.exit(1);
            }
        }, 1000);
    });

    ws.on('error', (err) => {
        console.error('WebSocket error:', err);
        process.exit(1);
    });

}, 2000); // Wait for server to start

// Cleanup
process.on('exit', () => {
    serverProcess.kill();
});
