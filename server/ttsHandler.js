// const fetch = require('node-fetch');
// import fetch from 'node-fetch';

class TTSHandler {
    constructor(ws, context) {
        this.ws = ws;
        this.context = context;
        this.buffer = '';
        this.ttsUrl = process.env.TTS_API_URL;
        this.processingQueue = Promise.resolve();
        this.stopped = false;

        // Audio timing tracking
        // this.totalDurationMs = 0;
        // this.firstChunkSentTime = 0;
        // this.stopTimer = null;
    }

    stop() {
        this.stopped = true;
        this.buffer = '';
        // this.totalDurationMs = 0;
        // this.firstChunkSentTime = 0;

        // Clear any pending stop timer
        if (this.stopTimer) {
            clearTimeout(this.stopTimer);
            this.stopTimer = null;
        }

        // Send clear_audio command to client
        if (this.ws && this.ws.readyState === 1) {
            this.ws.send(JSON.stringify({
                type: 'clear_audio',
                payload: {
                    context: this.context
                }
            }));
        }
    }

    // Process incoming text chunk
    processChunk(text) {
        if (this.stopped) return;
        this.buffer += text;
        this.checkAndProcess();
    }

    // Process remaining buffer at the end
    async flush() {
        if (this.stopped) return;
        if (this.buffer.trim()) {
            this.addToQueue(this.buffer);
            this.buffer = '';
        }
    }

    checkAndProcess() {
        if (this.stopped) return;
        // Split by punctuation: , . ; ? ! ， 。 ； ？ ！
        // We want to keep the punctuation with the segment
        const regex = /([^,.;?!，。；？！]+[,.;?!，。；？！]+)/g;
        let match;
        let lastIndex = 0;

        while ((match = regex.exec(this.buffer)) !== null) {
            const segment = match[0];
            lastIndex = match.index + match[0].length;

            // Add to queue
            this.addToQueue(segment);
        }

        // Remove processed part from buffer
        if (lastIndex > 0) {
            this.buffer = this.buffer.substring(lastIndex);
        }
    }

    addToQueue(text) {
        if (this.stopped) return;

        this.processingQueue = this.processingQueue
            .then(async () => {
                if (!this.stopped) {
                    await this.generateAndSend(text);
                }
            })
            .catch((err) => {
                console.error("任务处理失败:", text, err);
            });
    }

    async generateAndSend(text) {
        if (this.stopped || !this.ttsUrl || !text.trim()) return;

        try {
            console.log(`[TTS] Generating audio for: "${text.substring(0, 20)}..."`);
            const response = await fetch(this.ttsUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: text })
            });

            if (this.stopped) return;

            if (!response.ok) {
                console.error(`[TTS] API error: ${response.status}`);
                return;
            }

            const arrayBuffer = await response.arrayBuffer();
            if (this.stopped) return;

            const audioData = Buffer.from(arrayBuffer);

            // Calculate duration: 16kHz, 16-bit (2 bytes), mono = 32 bytes/ms
            // Adjust this constant if audio format changes
            const BYTES_PER_MS = 32;
            const durationMs = Math.floor(audioData.length / BYTES_PER_MS / 1.37);
            console.log(`[TTS] Generated audio for: "${text.substring(0, 20)}..." (Duration: ${durationMs}ms)`);

            // this.totalDurationMs += durationMs;
            // if (this.firstChunkSentTime === 0) {
            //     this.firstChunkSentTime = Date.now();
            // }

            // Send raw binary audio data
            if (this.ws && this.ws.readyState === 1) {
                this.ws.send(audioData);
            }
        } catch (e) {
            console.error('[TTS] Generation failed:', e);
        }
    }

    sendStopSignal() {
        if (this.stopped) return;

        // Calculate delay
        // If nothing sent, delay is 0
        let delay = 0;
        if (this.firstChunkSentTime > 0) {
            const elapsed = Date.now() - this.firstChunkSentTime;
            // Add a small buffer (e.g., 100ms) to be safe
            delay = Math.max(0, this.totalDurationMs - elapsed + 600);
        }

        console.log(`[TTS] Scheduling stop signal in ${delay}ms (Total: ${this.totalDurationMs}ms)`);

        this.stopTimer = setTimeout(() => {
            if (this.stopped) return;

            if (this.ws && this.ws.readyState === 1) {
                this.ws.send(JSON.stringify({
                    type: 'tts',
                    state: 'stop',
                    session_id: this.context?.sessionId
                }));
                console.log('[TTS] Stop signal sent.');
            }
            this.stopTimer = null;
            this.totalDurationMs = 0;
            this.firstChunkSentTime = 0;
        }, delay);
    }
}

module.exports = TTSHandler;
