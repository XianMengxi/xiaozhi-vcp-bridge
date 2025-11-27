const TTSHandler = require('./ttsHandler');
process.env.TTS_API_URL = 'http://mock-tts-api';

// Mock fetch
global.fetch = async (url, options) => {
    const text = JSON.parse(options.body).text;
    console.log(`[MockFetch] Start: ${text}`);
    await new Promise(resolve => setTimeout(resolve, 100)); // Simulate delay
    console.log(`[MockFetch] End: ${text}`);
    return {
        ok: true,
        arrayBuffer: async () => Buffer.from('audio data')
    };
};

// Mock WS
const mockWs = {
    readyState: 1,
    send: (data) => console.log(`[MockWS] Sent data type: ${Buffer.isBuffer(data) ? 'Buffer' : typeof data}`)
};

async function test() {
    console.log('--- Starting Test ---');
    const handler = new TTSHandler(mockWs, {});

    // Add chunks
    handler.processChunk('Hello, ');
    handler.processChunk('world. ');

    console.log('Calling flush()...');
    const start = Date.now();
    await handler.flush();
    const end = Date.now();

    console.log(`Flush returned after ${end - start}ms`);

    // We expect at least 200ms (2 chunks * 100ms)
    if (end - start >= 200) {
        console.log('SUCCESS: flush() waited for processing.');
    } else {
        console.error('FAILURE: flush() returned too early.');
    }
}

test();
