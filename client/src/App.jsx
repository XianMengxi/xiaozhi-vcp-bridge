import { useState, useEffect, useRef } from 'react'
import './App.css'

const DEFAULT_AGENT_CONFIG = {
  name: '',
  systemPrompt: '',
  model: 'gemini-2.5-flash',
  temperature: 0.7,
  contextTokenLimit: 1000000,
  maxOutputTokens: 60000,
  streamOutput: true
};

const DEFAULT_SETTINGS = {
  mac: 'F4:46:8C:A0:56:11',
  deviceName: 'Web测试设备2',
  clientId: 'web_test_client2',
  token: 'your-token12'
};

function App() {
  const [status, setStatus] = useState('disconnected')
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [showSettings, setShowSettings] = useState(false)
  const [isHandshakeComplete, setIsHandshakeComplete] = useState(false)
  const [agents, setAgents] = useState([])
  const [availableModels, setAvailableModels] = useState([])
  const [topics, setTopics] = useState([])
  const [currentAgent, setCurrentAgent] = useState(null)
  const [currentTopic, setCurrentTopic] = useState(null)
  const [history, setHistory] = useState([])
  const [inputMsg, setInputMsg] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [chatMode, setChatMode] = useState('text') // 'text' or 'voice'
  const [isUploading, setIsUploading] = useState(false)
  const [sessionId, setSessionId] = useState(null)
  const [wsUrl, setWsUrl] = useState(null)
  const [authToken, setAuthToken] = useState(null)

  // Modal states
  const [showAgentModal, setShowAgentModal] = useState(false)
  const [editingAgent, setEditingAgent] = useState(null)
  const [agentConfig, setAgentConfig] = useState(DEFAULT_AGENT_CONFIG)
  const [showTopicModal, setShowTopicModal] = useState(false)
  const [editingTopic, setEditingTopic] = useState(null)
  const [topicName, setTopicName] = useState('')

  const wsRef = useRef(null)
  const messagesEndRef = useRef(null)
  const reconnectTimeoutRef = useRef(null)

  useEffect(() => {
    // Auto-connect on load is disabled to allow settings configuration first
    // connectWs()
    return () => {
      if (wsRef.current) wsRef.current.close()
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [history, isTyping])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const discoverWebSocket = async () => {
    try {
      setStatus('discovering')
      const otaUrl = import.meta.env.VITE_OTA_URL || 'http://localhost:6007/ota'
      const otaKey = import.meta.env.VITE_OTA_KEY || 'your-secret-ota-key-change-this'

      console.log('[OTA] Discovering WebSocket URL...')

      const response = await fetch(otaUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'OTA_KEY': otaKey,
          'device-id': settings.mac,
          'client-id': settings.clientId
        },
        body: JSON.stringify({
          application: {
            version: '1.0.0'
          }
        })
      })

      if (!response.ok) {
        throw new Error(`OTA request failed: ${response.statusText}`)
      }

      const data = await response.json()
      console.log('[OTA] Response:', data)

      if (data.websocket && data.websocket.url && data.websocket.token) {
        setWsUrl(data.websocket.url)
        setAuthToken(data.websocket.token)
        console.log('[OTA] WebSocket URL discovered:', data.websocket.url)
        return { url: data.websocket.url, token: data.websocket.token }
      } else {
        throw new Error('Invalid OTA response: missing websocket info')
      }
    } catch (error) {
      console.error('[OTA] Discovery failed:', error)
      setStatus('error')
      alert(`Failed to discover WebSocket URL: ${error.message}`)
      return null
    }
  }

  const connectWs = async () => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.CONNECTING || wsRef.current.readyState === WebSocket.OPEN)) {
      return;
    }

    // Discover WebSocket URL first
    const discovery = await discoverWebSocket()
    if (!discovery) {
      return
    }

    setStatus('connecting')
    // Add authentication parameters to URL since browser WebSocket doesn't support custom headers
    const wsUrlWithAuth = `${discovery.url}?device-id=${encodeURIComponent(settings.mac)}&client-id=${encodeURIComponent(settings.clientId)}&token=${encodeURIComponent(discovery.token)}`
    const ws = new WebSocket(wsUrlWithAuth)
    wsRef.current = ws

    ws.onopen = () => {
      setStatus('connected')
      // Send Hello Handshake
      ws.send(JSON.stringify({
        type: 'hello',
        version: 1,
        transport: 'websocket',
        audio_params: {
          format: 'opus',
          sample_rate: 16000,
          channels: 1,
          frame_duration: 60
        }
      }))
    }

    ws.onmessage = async (event) => {
      try {
        let data;
        if (event.data instanceof Blob) {
          // console.log("get date buffer");
          // Handle Binary Audio Data (Blob)
          const arrayBuffer = await event.data.arrayBuffer();
          const base64Audio = btoa(
            new Uint8Array(arrayBuffer)
              .reduce((data, byte) => data + String.fromCharCode(byte), '')
          );
          playAudioChunk(base64Audio);
          return;
        } else if (event.data instanceof ArrayBuffer) {
          // Handle Binary Audio Data (ArrayBuffer)
          // console.log("get date buffer");
          const base64Audio = btoa(
            new Uint8Array(event.data)
              .reduce((data, byte) => data + String.fromCharCode(byte), '')
          );
          playAudioChunk(base64Audio);
          return;
        } else {
          data = JSON.parse(event.data);
        }
        // console.log(event.data);

        if (data.type === 'hello') {
          console.log('Handshake successful:', data);
          setIsHandshakeComplete(true);
          if (data.session_id) {
            setSessionId(data.session_id);
          }
          // After handshake, fetch initial data
          ws.send(JSON.stringify({ type: 'get_agents' }));
          ws.send(JSON.stringify({ type: 'get_models' }));
          return;
        }

        if (data.type === 'vcp-stream-event') {
          const payload = data.payload;
          if (payload.type === 'data') {
            setIsTyping(true)
            const chunk = payload.chunk;
            let text = '';
            if (chunk.choices?.[0]?.delta?.content) {
              text = chunk.choices[0].delta.content;
            } else if (chunk.content) {
              text = chunk.content;
            }
            // console.log(text);
            if (text) {
              setHistory(prev => {
                const newHistory = [...prev];
                const lastMsg = newHistory[newHistory.length - 1];
                // Only append if the last message is already a streaming assistant message
                // This prevents duplicate accumulation
                if (lastMsg && lastMsg.role === 'assistant' && lastMsg.isStreaming) {
                  // lastMsg.content += text;
                  const newHistory = [...prev];
                  const updatedMsg = {
                    ...lastMsg,
                    content: lastMsg.content + text
                  };
                  newHistory[newHistory.length - 1] = updatedMsg;
                  // console.log(newHistory);
                  return newHistory;
                } else {
                  // Create new streaming message only if there isn't one already
                  return [...newHistory, {
                    role: 'assistant',
                    content: text,
                    timestamp: Date.now(),
                    isStreaming: true
                  }];
                }
              });
            }
          } else if (payload.type === 'end') {
            setIsTyping(false)
            setHistory(prev => {
              const newHistory = [...prev];
              const lastMsg = newHistory[newHistory.length - 1];
              if (lastMsg && lastMsg.isStreaming) {
                delete lastMsg.isStreaming;
              }
              return newHistory;
            });
            if (currentAgent && currentTopic) {
              loadHistory(currentAgent, currentTopic);
            }
          } else if (payload.type === 'error') {
            setIsTyping(false)
            console.error('VCP Error:', payload.error);
          }
          return;
        } else if (data.type === 'agents_list') {
          setAgents(data.list);
          return;
        } else if (data.type === 'models_list') {
          setAvailableModels(data.list);
          return;
        } else if (data.type === 'topics_list') {
          setTopics(data.list);
          return;
        } else if (data.type === 'agent_created') {
          // Add new agent to list
          // console.warn("create agents");
          setAgents(prev => [...prev, data.result]);
          setCurrentAgent(data.result.id);
          return;
        } else if (data.type === 'agent_updated') {
          // Update agent in list
          // console.warn("update agents");
          setAgents(prev => prev.map(a => a.id === data.result.id ? data.result : a));
          return;
        } else if (data.type === 'agent_deleted') {
          // Remove agent from list
          setAgents(prev => prev.filter(a => a.id !== data.agentId));
          if (currentAgent === data.agentId) {
            setCurrentAgent(null);
            setCurrentTopic(null);
            setHistory([]);
          }
          return;
        } else if (data.type === 'topic_created') {
          // Add new topic to list
          setTopics(prev => [...prev, data.result]);
          setCurrentTopic(data.result.id);
          return;
        } else if (data.type === 'topic_updated') {
          // Update topic in list
          setTopics(prev => prev.map(t => t.id === data.result.id ? data.result : t));
          return;
        } else if (data.type === 'topic_deleted') {
          // Remove topic from list
          setTopics(prev => prev.filter(t => t.id !== data.topicId));
          if (currentTopic === data.topicId) {
            setCurrentTopic(null);
            setHistory([]);
          }
          return;
        } else if (data.type === 'history_content') {
          setHistory(data.content || []);
          return;
        } else if (data.type === 'stt') {
          // Handle STT result
          const text = data.text;
          if (text) {
            setHistory(prev => [...prev, {
              role: 'user',
              content: text,
              timestamp: Date.now()
            }]);
          }
          return;
          return;
        } else if (data.type === 'tts') {
          // Handle TTS state
          if (data.state === 'start') {
            console.log('TTS Started');
            // Ensure audio is enabled/ready
          } else if (data.state === 'stop') {
            console.log('TTS Stopped');
            // Optional: ensure playback stops if not already handled by audio queue end
          }
          return;
        } else if (data.type === 'clear_audio') {
          // Handle clear audio command
          stopAudioPlayback();
          return;
        }
      } catch (e) {
        console.error('Error parsing message:', e);
      }
    }

    ws.onclose = () => {
      setStatus('disconnected')
      wsRef.current = null
      reconnectTimeoutRef.current = setTimeout(connectWs, 3000)
    }

    ws.onerror = (err) => {
      console.error('WS Error', err)
      setStatus('error')
    }
  }

  const loadHistory = (agentId, topicId) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'get_history', agentId, topicId }));
    }
  }

  const handleAgentSelect = (agentId) => {
    setCurrentAgent(agentId);
    setCurrentTopic(null);
    setHistory([]);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'get_topics', agentId }));
    }
  }

  const handleTopicSelect = (topicId) => {
    setCurrentTopic(topicId);
    if (currentAgent) {
      loadHistory(currentAgent, topicId);
    }
  }

  const openAgentModal = (agent = null) => {
    if (agent) {
      setEditingAgent(agent);
      setAgentConfig(agent);
    } else {
      setEditingAgent(null);
      setAgentConfig(DEFAULT_AGENT_CONFIG);
    }
    setShowAgentModal(true);
  }

  const closeAgentModal = () => {
    setShowAgentModal(false);
    setEditingAgent(null);
    setAgentConfig(DEFAULT_AGENT_CONFIG);
  }

  const saveAgent = () => {
    if (!agentConfig.name.trim()) {
      alert('Please enter agent name');
      return;
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      if (editingAgent) {
        wsRef.current.send(JSON.stringify({
          type: 'update_agent',
          agentId: editingAgent.id,
          config: agentConfig
        }));
      } else {
        wsRef.current.send(JSON.stringify({
          type: 'create_agent',
          config: agentConfig
        }));
      }
      closeAgentModal();
    }
  }

  const deleteAgent = (agentId) => {
    if (confirm('Are you sure you want to delete this agent?')) {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'delete_agent', agentId }));
      }
    }
  }

  const openTopicModal = (topic = null) => {
    if (topic) {
      setEditingTopic(topic);
      setTopicName(topic.name);
    } else {
      setEditingTopic(null);
      setTopicName('');
    }
    setShowTopicModal(true);
  }

  const closeTopicModal = () => {
    setShowTopicModal(false);
    setEditingTopic(null);
    setTopicName('');
  }

  const saveTopic = () => {
    if (!topicName.trim()) {
      alert('Please enter topic name');
      return;
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && currentAgent) {
      if (editingTopic) {
        wsRef.current.send(JSON.stringify({
          type: 'update_topic',
          agentId: currentAgent,
          topicId: editingTopic.id,
          name: topicName
        }));
      } else {
        wsRef.current.send(JSON.stringify({
          type: 'create_topic',
          agentId: currentAgent,
          name: topicName
        }));
      }
      closeTopicModal();
    }
  }

  const deleteTopic = (topicId) => {
    if (confirm('Are you sure you want to delete this topic?')) {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && currentAgent) {
        wsRef.current.send(JSON.stringify({
          type: 'delete_topic',
          agentId: currentAgent,
          topicId: topicId
        }));
      }
    }
  }



  // Audio Playback Queue
  const audioQueueRef = useRef([]);
  const isPlayingRef = useRef(false);
  const currentAudioRef = useRef(null);

  const stopAudioPlayback = () => {
    // Clear queue
    audioQueueRef.current = [];

    // Stop current audio
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
      currentAudioRef.current = null;
    }

    isPlayingRef.current = false;
  };

  const requestStopAudio = () => {
    stopAudioPlayback();
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'abort' }));
    }
  };

  const playAudioChunk = (base64Audio) => {
    audioQueueRef.current.push(base64Audio);
    processAudioQueue();
  };

  const processAudioQueue = async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return;

    isPlayingRef.current = true;
    const base64Audio = audioQueueRef.current.shift();

    try {
      const audioData = atob(base64Audio);
      const arrayBuffer = new ArrayBuffer(audioData.length);
      const view = new Uint8Array(arrayBuffer);
      for (let i = 0; i < audioData.length; i++) {
        view[i] = audioData.charCodeAt(i);
      }

      const blob = new Blob([arrayBuffer], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      currentAudioRef.current = audio;

      audio.onended = () => {
        URL.revokeObjectURL(url);
        isPlayingRef.current = false;
        currentAudioRef.current = null;
        processAudioQueue();
      };

      audio.onerror = (e) => {
        console.error("Audio playback error", e);
        isPlayingRef.current = false;
        currentAudioRef.current = null;
        processAudioQueue();
      };

      await audio.play();
    } catch (e) {
      console.error("Error playing audio chunk", e);
      isPlayingRef.current = false;
      currentAudioRef.current = null;
      processAudioQueue();
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file || !currentAgent || !currentTopic) return;

    setIsUploading(true);
    try {
      const arrayBuffer = await file.arrayBuffer();

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        // 1. Send Listen Start
        wsRef.current.send(JSON.stringify({
          session_id: sessionId,
          type: 'listen',
          state: 'start',
          mode: 'manual'
        }));

        // 2. Send Audio Data (Full)
        wsRef.current.send(arrayBuffer);

        // 3. Send Listen Stop
        wsRef.current.send(JSON.stringify({
          session_id: sessionId,
          type: 'listen',
          state: 'stop',
          agentId: currentAgent,
          topicId: currentTopic
        }));
      }
    } catch (e) {
      console.error("File upload failed:", e);
    } finally {
      setIsUploading(false);
      // Reset file input
      event.target.value = null;
    }
  };

  const sendMessage = () => {
    if (!inputMsg.trim() || !currentAgent || !currentTopic) return;

    const content = inputMsg.trim();

    // Add user message to UI immediately
    const userMessage = {
      role: 'user',
      content: content,
      timestamp: Date.now()
    };
    setHistory(prev => [...prev, userMessage]);

    // Build messages array from history
    const agent = agents.find(a => a.id === currentAgent);
    const messages = [];

    // Add system prompt if available
    if (agent?.systemPrompt) {
      messages.push({
        role: 'system',
        content: agent.systemPrompt
      });
    }

    // Add history
    history.forEach(msg => {
      if (msg.role === 'user' || msg.role === 'assistant') {
        messages.push({
          role: msg.role,
          content: msg.content
        });
      }
    });

    // Add current message
    messages.push({ role: 'user', content: content });

    const requestId = `msg_${Date.now()}_client`;
    const chatRequest = {
      type: 'chat_request',
      messageId: requestId,
      messages: messages,
      context: {
        agentId: currentAgent,
        topicId: currentTopic
      }
    };

    wsRef.current.send(JSON.stringify(chatRequest));
    setInputMsg('');
  }

  const currentAgentData = agents.find(a => a.id === currentAgent);

  return (
    <div className="app-container">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-header">
          <h2>ESP32 Simulator</h2>
          <span className={`status-badge ${status}`}>
            {status === 'connected' ? '● Connected' : status === 'connecting' ? '○ Connecting...' : '○ Disconnected'}
          </span>
        </div>

        <div className="sidebar-actions" style={{ padding: '10px' }}>
          <button
            className="btn btn-secondary"
            onClick={() => setShowSettings(!showSettings)}
            style={{ width: '100%', marginBottom: '10px' }}
          >
            ⚙️ Settings
          </button>
          {status === 'disconnected' ? (
            <button
              className="btn btn-primary"
              onClick={connectWs}
              style={{ width: '100%' }}
            >
              🔌 Connect
            </button>
          ) : (
            <button
              className="btn btn-danger"
              onClick={() => {
                if (wsRef.current) wsRef.current.close();
                setStatus('disconnected');
                setIsHandshakeComplete(false);
              }}
              style={{ width: '100%' }}
            >
              ❌ Disconnect
            </button>
          )}
        </div>

        {showSettings && (
          <div className="settings-panel" style={{ padding: '10px', background: '#f5f5f5', borderRadius: '4px', marginBottom: '10px' }}>
            <div className="form-group">
              <label>Device MAC</label>
              <input
                type="text"
                value={settings.mac}
                onChange={e => setSettings({ ...settings, mac: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Device Name</label>
              <input
                type="text"
                value={settings.deviceName}
                onChange={e => setSettings({ ...settings, deviceName: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Client ID</label>
              <input
                type="text"
                value={settings.clientId}
                onChange={e => setSettings({ ...settings, clientId: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Auth Token</label>
              <input
                type="text"
                value={settings.token}
                onChange={e => setSettings({ ...settings, token: e.target.value })}
              />
            </div>
          </div>
        )}

        <div className="agent-list">
          {agents.map(agent => (
            <div
              key={agent.id}
              className={`agent-item ${currentAgent === agent.id ? 'active' : ''}`}
              onClick={() => handleAgentSelect(agent.id)}
            >
              <span className="agent-item-name">{agent.name || agent.id}</span>
              <div className="agent-item-actions" onClick={e => e.stopPropagation()}>
                <button className="icon-btn" onClick={() => openAgentModal(agent)} title="Edit">✏️</button>
                <button className="icon-btn" onClick={() => deleteAgent(agent.id)} title="Delete">🗑️</button>
              </div>
            </div>
          ))}
        </div>

        <button className="add-agent-btn" onClick={() => openAgentModal()}>
          + New Agent
        </button>
      </div>

      {/* Main Chat Area */}
      <div className="chat-container">
        {currentAgent ? (
          <>
            <div className="chat-header">
              <div
                className="topic-selector"
              >
                {topics.map(topic => (
                  <div
                    key={topic.id}
                    style={{
                      padding: '8px 12px',
                      background: currentTopic === topic.id ? '#1976d2' : '#f5f5f5',
                      color: currentTopic === topic.id ? 'white' : '#333',
                      borderRadius: '20px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '14px',
                      flexShrink: 0,
                      whiteSpace: 'nowrap'
                    }}
                    onClick={() => handleTopicSelect(topic.id)}
                  >
                    <span>{topic.name}</span>
                    <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: '4px' }}>
                      <button
                        className="icon-btn"
                        onClick={() => openTopicModal(topic)}
                        title="Edit"
                        style={{ padding: '2px 6px', fontSize: '12px' }}
                      >
                        ✏️
                      </button>
                      <button
                        className="icon-btn"
                        onClick={() => deleteTopic(topic.id)}
                        title="Delete"
                        style={{ padding: '2px 6px', fontSize: '12px' }}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  onClick={() => openTopicModal()}
                  disabled={status !== 'connected'}
                  style={{
                    padding: '8px 16px',
                    background: '#1976d2',
                    color: 'white',
                    border: 'none',
                    borderRadius: '20px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    flexShrink: 0,
                    whiteSpace: 'nowrap'
                  }}
                >
                  + New Topic
                </button>
              </div>
            </div>


            <div className="messages-container">
              {currentTopic ? (
                <>
                  {history.map((msg, idx) => (
                    <div key={idx} className={`message ${msg.role}`}>
                      <div className="message-bubble">
                        <div className="message-content">{msg.content}</div>
                        <div className="message-time">
                          {new Date(msg.timestamp).toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                  ))}
                  {isTyping && (
                    <div className="message assistant">
                      <div className="message-bubble">
                        <div className="typing-indicator">
                          <div className="typing-dot"></div>
                          <div className="typing-dot"></div>
                          <div className="typing-dot"></div>
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </>
              ) : (
                <div className="empty-state">
                  <div className="empty-state-icon">💬</div>
                  <div className="empty-state-text">Select a topic to start chatting</div>
                  <div className="empty-state-subtext">or create a new one</div>
                </div>
              )}
            </div>

            <div className="input-container">
              <div style={{ marginBottom: '8px', display: 'flex', gap: '10px' }}>
                <button
                  className={`mode-btn ${chatMode === 'text' ? 'active' : ''}`}
                  onClick={() => setChatMode('text')}
                  style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #ccc', background: chatMode === 'text' ? '#e3f2fd' : 'white', cursor: 'pointer' }}
                >
                  ⌨️ Text
                </button>
                <button
                  className={`mode-btn ${chatMode === 'voice' ? 'active' : ''}`}
                  onClick={() => setChatMode('voice')}
                  style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #ccc', background: chatMode === 'voice' ? '#e3f2fd' : 'white', cursor: 'pointer' }}
                >
                  🎤 Voice (File)
                </button>
              </div>

              {chatMode === 'text' ? (
                <div className="input-wrapper">
                  <input
                    type="text"
                    value={inputMsg}
                    onChange={(e) => setInputMsg(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                    placeholder={currentTopic ? "Type a message..." : "Select a topic first"}
                    disabled={!currentTopic || status !== 'connected'}
                  />
                  <button
                    className="send-btn"
                    onClick={sendMessage}
                    disabled={!inputMsg.trim() || !currentTopic || status !== 'connected'}
                  >
                    Send
                  </button>
                </div>
              ) : (
                <div className="input-wrapper" style={{ justifyContent: 'center' }}>
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={handleFileUpload}
                    disabled={!currentTopic || status !== 'connected' || isUploading}
                    style={{ display: 'none' }}
                    id="audio-upload"
                  />
                  <label
                    htmlFor="audio-upload"
                    className="send-btn"
                    style={{
                      cursor: (!currentTopic || status !== 'connected' || isUploading) ? 'not-allowed' : 'pointer',
                      opacity: (!currentTopic || status !== 'connected' || isUploading) ? 0.6 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 16px',
                      background: '#4caf50'
                    }}
                  >
                    {isUploading ? '📤 Sending...' : '📁 Select Audio File to Send'}
                  </label>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: '8px' }}>
                <button
                  onClick={requestStopAudio}
                  disabled={status !== 'connected'}
                  style={{
                    padding: '4px 12px',
                    background: '#d32f2f',
                    color: 'white',
                    border: 'none',
                    borderRadius: '16px',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  🛑 Stop Audio
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">🤖</div>
            <div className="empty-state-text">Select an agent to start</div>
            <div className="empty-state-subtext">or create a new one</div>
          </div>
        )}
      </div>

      {/* Agent Configuration Modal */}
      {showAgentModal && (
        <div className="modal-overlay" onClick={closeAgentModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>{editingAgent ? 'Edit Agent' : 'Create New Agent'}</h3>

            <div className="form-group">
              <label>Name *</label>
              <input
                type="text"
                value={agentConfig.name}
                onChange={(e) => setAgentConfig({ ...agentConfig, name: e.target.value })}
                placeholder="e.g., 喜多"
              />
            </div>

            <div className="form-group">
              <label>System Prompt</label>
              <textarea
                value={agentConfig.systemPrompt}
                onChange={(e) => setAgentConfig({ ...agentConfig, systemPrompt: e.target.value })}
                placeholder="e.g., {{Kita}}"
              />
            </div>

            <div className="form-group">
              <label>Model</label>
              <select
                value={agentConfig.model}
                onChange={(e) => setAgentConfig({ ...agentConfig, model: e.target.value })}
              >
                {availableModels.length > 0 ? (
                  availableModels.map(model => (
                    <option key={model.id} value={model.id}>{model.id}</option>
                  ))
                ) : (
                  <>
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                    <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                    <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                  </>
                )}
              </select>
            </div>

            <div className="form-group">
              <label>Temperature (0-1)</label>
              <input
                type="number"
                min="0"
                max="1"
                step="0.1"
                value={agentConfig.temperature}
                onChange={(e) => setAgentConfig({ ...agentConfig, temperature: parseFloat(e.target.value) })}
              />
            </div>

            <div className="form-group">
              <label>Context Token Limit</label>
              <input
                type="number"
                value={agentConfig.contextTokenLimit}
                onChange={(e) => setAgentConfig({ ...agentConfig, contextTokenLimit: parseInt(e.target.value) })}
              />
            </div>

            <div className="form-group">
              <label>Max Output Tokens</label>
              <input
                type="number"
                value={agentConfig.maxOutputTokens}
                onChange={(e) => setAgentConfig({ ...agentConfig, maxOutputTokens: parseInt(e.target.value) })}
              />
            </div>

            <div className="form-group">
              <label>
                {' '}Stream Output
              </label>
              <select
                value={String(agentConfig.streamOutput)}
                onChange={(e) => {
                  const boolValue = e.target.value === 'true';
                  setAgentConfig({ ...agentConfig, streamOutput: boolValue });
                }}
              >
                <option value="true">True</option>
                <option value="false">False</option>
              </select>
            </div>

            <div className="form-actions">
              <button className="btn btn-secondary" onClick={closeAgentModal}>Cancel</button>
              <button className="btn btn-primary" onClick={saveAgent}>
                {editingAgent ? 'Save Changes' : 'Create Agent'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Topic Modal */}
      {showTopicModal && (
        <div className="modal-overlay" onClick={closeTopicModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>{editingTopic ? 'Edit Topic' : 'Create New Topic'}</h3>

            <div className="form-group">
              <label>Topic Name *</label>
              <input
                type="text"
                value={topicName}
                onChange={(e) => setTopicName(e.target.value)}
                placeholder="e.g., Python学习"
              />
            </div>

            <div className="form-actions">
              <button className="btn btn-secondary" onClick={closeTopicModal}>Cancel</button>
              <button className="btn btn-primary" onClick={saveTopic}>
                {editingTopic ? 'Save Changes' : 'Create Topic'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
