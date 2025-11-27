require('dotenv').config();
const WebSocket = require('ws');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { sendToVCP } = require('./vcpClient');
const { getAgents, getTopics, createAgent, updateAgent, deleteAgent, getAgentConfig, createTopic, updateTopic, deleteTopic, getHistory } = require('./historyManager');
const audioHandler = require('./audioHandler');
const OTAHandler = require('./otaHandler');
const DeviceManager = require('./deviceManager');
const AuthManager = require('./authManager');

// Configuration
const VCP_WS_URL = process.env.VCP_WS_URL;
const VCP_KEY = process.env.VCP_KEY;
const PORT = process.env.PORT || 6006;
const OTA_PORT = process.env.OTA_PORT || 6007;
const OTA_KEY = process.env.OTA_KEY;
const AUTH_KEY = process.env.AUTH_KEY;
const TOKEN_EXPIRE_SECONDS = parseInt(process.env.TOKEN_EXPIRE_SECONDS) || 2592000;

if (!VCP_WS_URL || !VCP_KEY) {
    console.warn('WARNING: VCP_WS_URL or VCP_KEY not set in .env file. VCP connection will fail.');
}

if (!OTA_KEY || !AUTH_KEY) {
    console.warn('WARNING: OTA_KEY or AUTH_KEY not set in .env file. Authentication will not work properly.');
}

// Initialize managers
const deviceManager = new DeviceManager('./data');
const authManager = new AuthManager(AUTH_KEY, TOKEN_EXPIRE_SECONDS);
const otaHandler = new OTAHandler({
    otaKey: OTA_KEY,
    authKey: AUTH_KEY,
    expireSeconds: TOKEN_EXPIRE_SECONDS,
    wsPort: PORT
});

// --- HTTP Server for OTA ---
const app = express();
app.use(cors());
app.use(bodyParser.json());

// OTA endpoints
app.post('/ota', (req, res) => otaHandler.handlePost(req, res));
app.get('/ota', (req, res) => otaHandler.handleGet(req, res));

app.listen(OTA_PORT, () => {
    console.log(`OTA Server listening on port ${OTA_PORT}`);
});

// --- ESP32 / Frontend Server ---
const wss = new WebSocket.Server({ port: PORT });

console.log(`Bridge Server listening on port ${PORT}`);

// Store connected ESP32 clients
const espClients = new Set();

wss.on('headers', (headers, req) => {
    headers.push('Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate');
    headers.push('X-Content-Type-Options: nosniff');
});

wss.on('connection', (ws, req) => {
    console.log('[ESP32-Server] New client attempting connection');

    // Parse URL query parameters
    const url = new URL(req.url, `http://${req.headers.host}`);
    const queryDeviceId = url.searchParams.get('device-id');
    const queryClientId = url.searchParams.get('client-id');
    const queryToken = url.searchParams.get('token');

    // Extract authentication from headers or query parameters
    const deviceId = req.headers['device-id'] || queryDeviceId;
    const clientId = req.headers['client-id'] || queryClientId;
    const authHeader = req.headers['authorization'];
    const token = queryToken || (authHeader ? authHeader.replace('Bearer ', '') : null);

    // Store device info on WebSocket for later use
    ws.deviceId = deviceId;
    ws.clientId = clientId;

    // If authentication is enabled and we have the required info, verify token
    if (AUTH_KEY && deviceId && clientId && token) {
        const isValid = authManager.verifyToken(token, clientId, deviceId);

        if (!isValid) {
            console.log(`[ESP32-Server] Authentication failed for device: ${deviceId}`);
            ws.close(1008, 'Authentication failed');
            return;
        }

        console.log(`[ESP32-Server] Authentication successful for device: ${deviceId}`);

        // Register device
        deviceManager.addOrUpdateDevice(deviceId, clientId, {
            userAgent: req.headers['user-agent'],
            connectedAt: new Date().toISOString()
        });
    } else if (AUTH_KEY) {
        console.log('[ESP32-Server] Missing authentication info, but AUTH_KEY is set. Allowing connection for backward compatibility.');
    }

    console.log('[ESP32-Server] Client connected successfully');
    espClients.add(ws);

    ws.on('message', async (message, isBinary) => {
        console.log(`[ESP32-Server] Received: ${message}`);
        console.log(`[ESP32-Server] Isbuffer: ${isBinary}`)

        // Handle Binary Audio Data
        if (isBinary) {
            console.log(`[Bridge] Received audio chunk: ${message.length} bytes`);
            if (!ws.audioBuffer) {
                ws.audioBuffer = [];
            }
            ws.audioBuffer.push(message);
            return;
        }

        try {
            const data = JSON.parse(message);
            // console.log(data)

            if (data.type === 'listen') {
                console.log(`[Bridge] Listen command: ${data.state} (Mode: ${data.mode})`);

                if (data.state === 'start') {
                    ws.audioBuffer = []; // Reset buffer
                } else if (data.state === 'stop') {
                    console.log('[Bridge] Processing audio with Python service...');

                    if (!ws.audioBuffer || ws.audioBuffer.length === 0) {
                        console.log('[Bridge] No audio data received.');
                        return;
                    }

                    // Combine buffers
                    const fullAudio = Buffer.concat(ws.audioBuffer);
                    ws.audioBuffer = []; // Clear buffer

                    // Call Python Service
                    try {
                        const processedBuffer = await audioHandler.convertAudioNode(fullAudio);

                        const formData = new FormData();
                        // 使用转换后的 buffer 创建 blob，文件名为 audio.wav
                        const processedBlob = new Blob([processedBuffer], { type: 'audio/wav' });
                        formData.append('file', processedBlob, 'audio.wav');
                        formData.append('audio_format', 'pcm');

                        const response = await fetch(process.env.ASR_API_URL, {
                            method: 'POST',
                            body: formData
                        });

                        if (!response.ok) {
                            throw new Error(`Python service error: ${response.statusText}`);
                        }

                        const result = await response.json();
                        console.log('[Bridge] Python service result:', result);

                        if (result.text) {
                            // Send STT result to client
                            ws.send(JSON.stringify({
                                type: 'stt',
                                text: result.text
                            }));

                            // Trigger Chat Request automatically if agentId/topicId are present
                            if (data.agentId && data.topicId) {
                                console.log('[Bridge] Triggering chat from voice input...');

                                // 1. Fetch History
                                const history = await getHistory(data.agentId, data.topicId);

                                // 2. Build Messages
                                const agent = (await getAgents()).find(a => a.id === data.agentId);
                                const messages = [];
                                if (agent?.systemPrompt) {
                                    messages.push({ role: 'system', content: agent.systemPrompt });
                                }
                                history.forEach(msg => {
                                    if (msg.role === 'user' || msg.role === 'assistant') {
                                        messages.push({ role: msg.role, content: msg.content });
                                    }
                                });
                                messages.push({ role: 'user', content: result.text });

                                // 3. Get agent config for model parameters
                                const agentConfig = await getAgentConfig(data.agentId);
                                const modelConfig = {
                                    stream: agentConfig?.streamOutput !== false,
                                    model: agentConfig?.model || 'gemini-2.5-flash',
                                    temperature: agentConfig?.temperature || 0.7,
                                    max_tokens: agentConfig?.maxOutputTokens || 60000
                                };

                                // 4. Send to VCP
                                let vcpHttpUrl = 'http://localhost:6005/v1/chat/completions';
                                if (process.env.VCP_WS_URL) {
                                    const url = new URL(process.env.VCP_WS_URL.replace('ws://', 'http://').replace('wss://', 'https://'));
                                    url.pathname = '/v1/chat/completions';
                                    vcpHttpUrl = url.toString();
                                }

                                const params = {
                                    vcpUrl: vcpHttpUrl,
                                    vcpApiKey: process.env.VCP_KEY,
                                    messages: messages,
                                    modelConfig: modelConfig,
                                    messageId: `msg_${Date.now()}_voice`,
                                    context: {
                                        agentId: data.agentId,
                                        topicId: data.topicId,
                                        sessionId: ws.sessionId
                                    },
                                    ws: ws,
                                    streamChannel: 'vcp-stream-event'
                                };

                                await sendToVCP(params);
                            }
                        } else {
                            console.log('[Bridge] No speech detected or empty text.');
                        }

                    } catch (err) {
                        console.error('[Bridge] Failed to call Python service:', err);
                    }
                }
                return;
            }
            else if (data.type === 'hello') {
                console.log('[Bridge] Received hello handshake');
                const sessionId = 'sess_' + Date.now();
                ws.sessionId = sessionId;

                // Send server hello
                ws.send(JSON.stringify({
                    type: 'hello',
                    transport: 'websocket',
                    session_id: sessionId,
                    audio_params: {
                        format: 'opus',
                        sample_rate: 16000,
                        channels: 1,
                        frame_duration: 60
                    }
                }));
                return;
            }
            else if (data.type === 'chat_request') {
                console.log('[Bridge] Processing chat_request');

                // Interrupt existing TTS if any
                if (ws.activeTTSHandler) {
                    console.log('[Bridge] Interrupting existing TTS for new chat request');
                    ws.activeTTSHandler.stop();
                    ws.activeTTSHandler = null;
                }

                let vcpHttpUrl = 'http://localhost:6005/v1/chat/completions';
                if (process.env.VCP_WS_URL) {
                    const url = new URL(process.env.VCP_WS_URL.replace('ws://', 'http://').replace('wss://', 'https://'));
                    url.pathname = '/v1/chat/completions';
                    vcpHttpUrl = url.toString();
                }

                // Read agent config to get model parameters
                const agentId = data.context?.agentId;
                let modelConfig = { stream: false }; // Default
                if (agentId) {
                    const agentConfig = await getAgentConfig(agentId);
                    if (agentConfig) {
                        modelConfig = {
                            stream: agentConfig.streamOutput !== false,
                            model: agentConfig.model || 'gemini-2.5-flash',
                            temperature: agentConfig.temperature || 0.7,
                            max_tokens: agentConfig.maxOutputTokens || 60000
                        };
                    }
                }

                const params = {
                    vcpUrl: data.vcpUrl || vcpHttpUrl,
                    vcpApiKey: data.vcpApiKey || process.env.VCP_KEY,
                    messages: data.messages || [],
                    modelConfig: modelConfig,
                    messageId: data.messageId || Date.now().toString(),
                    context: data.context || {},
                    ws: ws,
                    streamChannel: 'vcp-stream-event'
                };

                await sendToVCP(params);
                return;
            } else if (data.type === 'abort') {
                console.log('[Bridge] Processing abort request');
                if (ws.activeTTSHandler) {
                    ws.activeTTSHandler.stop();
                    ws.activeTTSHandler = null;
                }
                return;
            } else if (data.type === 'get_agents') {
                const list = await getAgents();
                ws.send(JSON.stringify({ type: 'agents_list', list }));
                return;
            } else if (data.type === 'get_topics') {
                const list = await getTopics(data.agentId);
                ws.send(JSON.stringify({ type: 'topics_list', agentId: data.agentId, list }));
                return;
            } else if (data.type === 'create_agent') {
                const result = await createAgent(data.config);
                ws.send(JSON.stringify({ type: 'agent_created', result }));
                return;
            } else if (data.type === 'update_agent') {
                const result = await updateAgent(data.agentId, data.config);
                ws.send(JSON.stringify({ type: 'agent_updated', result }));
                // Broadcast to other clients
                broadcastToEsp({ type: 'agent_updated', result }, ws);
                return;
            } else if (data.type === 'delete_agent') {
                const result = await deleteAgent(data.agentId);
                ws.send(JSON.stringify({ type: 'agent_deleted', agentId: data.agentId, result }));
                // Broadcast to other clients
                broadcastToEsp({ type: 'agent_deleted', agentId: data.agentId }, ws);
                return;
            } else if (data.type === 'get_agent_config') {
                const config = await getAgentConfig(data.agentId);
                ws.send(JSON.stringify({ type: 'agent_config', agentId: data.agentId, config }));
                return;
            } else if (data.type === 'create_topic') {
                const result = await createTopic(data.agentId, data.name);
                ws.send(JSON.stringify({ type: 'topic_created', agentId: data.agentId, result }));
                return;
            } else if (data.type === 'update_topic') {
                const result = await updateTopic(data.agentId, data.topicId, data.name);
                ws.send(JSON.stringify({ type: 'topic_updated', agentId: data.agentId, result }));
                // Broadcast to other clients
                broadcastToEsp({ type: 'topic_updated', agentId: data.agentId, result }, ws);
                return;
            } else if (data.type === 'delete_topic') {
                const result = await deleteTopic(data.agentId, data.topicId);
                ws.send(JSON.stringify({ type: 'topic_deleted', agentId: data.agentId, topicId: data.topicId, result }));
                // Broadcast to other clients
                broadcastToEsp({ type: 'topic_deleted', agentId: data.agentId, topicId: data.topicId }, ws);
                return;
            } else if (data.type === 'get_history') {
                const content = await getHistory(data.agentId, data.topicId);
                ws.send(JSON.stringify({ type: 'history_content', agentId: data.agentId, topicId: data.topicId, content }));
                return;
            } else if (data.type === 'get_models') {
                if (cachedModels.length === 0) {
                    await fetchAndCacheModels();
                }
                ws.send(JSON.stringify({ type: 'models_list', list: cachedModels }));
                return;
            }

        } catch (e) {
            console.error('[ESP32-Server] Error processing message:', e);
        }

        // Example: Forward to VCP if connected (existing logic)
        if (vcpWs && vcpWs.readyState === WebSocket.OPEN) {
            console.log('[Bridge] (Optional) Forwarding to VCP not implemented yet to avoid loops');
        }
    });

    ws.on('close', () => {
        console.log('[ESP32-Server] Client disconnected');
        espClients.delete(ws);
    });

    ws.send(JSON.stringify({ type: 'info', message: 'Connected to VCP-ESP32 Bridge' }));
});

// --- Model Fetching ---
let cachedModels = [];

async function fetchAndCacheModels() {
    try {
        const vcpServerUrl = process.env.VCP_WS_URL;
        const vcpApiKey = process.env.VCP_KEY;

        if (!vcpServerUrl) {
            console.warn('[Main] VCP Server URL is not configured. Cannot fetch models.');
            cachedModels = [];
            return;
        }

        // Correctly construct the base URL by removing known API paths.
        // The VCP_WS_URL is likely ws://... we need http://...
        const urlObject = new URL(vcpServerUrl.replace('ws://', 'http://').replace('wss://', 'https://'));
        const baseUrl = `${urlObject.protocol}//${urlObject.host}`;
        const modelsUrl = new URL('/v1/models', baseUrl).toString();

        console.log(`[Main] Fetching models from: ${modelsUrl}`);
        const response = await fetch(modelsUrl, {
            headers: {
                'Authorization': `Bearer ${vcpApiKey}`
            }
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        cachedModels = data.data || [];
        console.log('[Main] Models fetched and cached successfully:', cachedModels.map(m => m.id));
    } catch (error) {
        console.error('[Main] Failed to fetch and cache models:', error);
        cachedModels = [];
    }
}

// Initial fetch
fetchAndCacheModels();

// --- VCP Backend Client ---
let vcpWs = null;
let vcpReconnectInterval = null;

function connectVcp() {
    if (!VCP_WS_URL || !VCP_KEY) return;

    const fullUrl = `${VCP_WS_URL}/VCPlog/VCP_Key=${VCP_KEY}`;
    console.log(`[VCP-Client] Connecting to ${fullUrl}`);

    vcpWs = new WebSocket(fullUrl);

    vcpWs.on('open', () => {
        console.log('[VCP-Client] Connected to VCP Backend');
        broadcastToEsp({ type: 'vcp_status', status: 'connected' });

        if (vcpReconnectInterval) {
            clearInterval(vcpReconnectInterval);
            vcpReconnectInterval = null;
        }
    });

    vcpWs.on('message', (data) => {
        try {
            const message = data.toString();
            console.log('[VCP-Client] Received:', message);

            broadcastToEsp({ type: 'vcp_message', data: JSON.parse(message) });
        } catch (e) {
            console.error('[VCP-Client] Error parsing message:', e);
            broadcastToEsp({ type: 'vcp_message', data: data.toString() });
        }
    });

    vcpWs.on('close', (code, reason) => {
        console.log(`[VCP-Client] Disconnected (Code: ${code}, Reason: ${reason})`);
        broadcastToEsp({ type: 'vcp_status', status: 'disconnected' });
        vcpWs = null;
        scheduleReconnect();
    });

    vcpWs.on('error', (err) => {
        console.error('[VCP-Client] Error:', err.message);
        vcpWs = null;
    });
}

function scheduleReconnect() {
    if (!vcpReconnectInterval) {
        console.log('[VCP-Client] Scheduling reconnect in 5s...');
        vcpReconnectInterval = setInterval(() => {
            console.log('[VCP-Client] Attempting reconnect...');
            connectVcp();
        }, 5000);
    }
}

function broadcastToEsp(data, excludeWs = null) {
    const msg = JSON.stringify(data);
    espClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN && client !== excludeWs) {
            client.send(msg);
        }
    });
}

// Start VCP connection
connectVcp();
