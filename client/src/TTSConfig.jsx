import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:6007';

const TTSConfig = () => {
    const navigate = useNavigate();
    const [uploading, setUploading] = useState(false);

    const [speakers, setSpeakers] = useState([]);
    const [emotions, setEmotions] = useState([]);
    const [emotionConfigs, setEmotionConfigs] = useState({});

    // Emotion Config Form State
    const [configName, setConfigName] = useState('');
    const [emoMethod, setEmoMethod] = useState(0);
    const [emoRefAudio, setEmoRefAudio] = useState('');
    const [emoWeight, setEmoWeight] = useState(1.0);
    const [emoVec, setEmoVec] = useState('');
    const [emoIsRandom, setEmoIsRandom] = useState(false);
    const [emoText, setEmoText] = useState('');
    const [isEditingConfig, setIsEditingConfig] = useState(false);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [speakersRes, emotionsRes, configsRes] = await Promise.all([
                fetch(`${API_URL}/api/tts/speakers`),
                fetch(`${API_URL}/api/tts/emotions`),
                fetch(`${API_URL}/api/tts/emotion-configs`)
            ]);

            if (speakersRes.ok) {
                const data = await speakersRes.json();
                setSpeakers(Object.keys(data.speakers) || []);
            }
            if (emotionsRes.ok) {
                const data = await emotionsRes.json();
                setEmotions(Object.keys(data.emotions) || []);
            }
            if (configsRes.ok) {
                const data = await configsRes.json();
                setEmotionConfigs(data.configs || {});
            }
        } catch (err) {
            console.error('Failed to fetch TTS data:', err);
        }
    };

    const handleAddSpeaker = async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const name = formData.get('name');
        const file = formData.get('file');

        if (!name || !file) return;

        setUploading(true);
        try {
            const res = await fetch(`${API_URL}/api/tts/speakers`, {
                method: 'POST',
                body: formData
            });
            if (res.ok) {
                e.target.reset();
                fetchData();
            } else {
                alert('Failed to add speaker');
            }
        } catch (err) {
            console.error('Error adding speaker:', err);
            alert('Error adding speaker');
        } finally {
            setUploading(false);
        }
    };

    const handleDeleteSpeaker = async (name) => {
        if (!confirm(`Delete speaker "${name}"?`)) return;
        try {
            await fetch(`${API_URL}/api/tts/speakers/${name}`, { method: 'DELETE' });
            fetchData();
        } catch (err) {
            console.error('Error deleting speaker:', err);
        }
    };

    const handleAddEmotion = async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const name = formData.get('name');
        const file = formData.get('file');

        if (!name || !file) return;

        setUploading(true);
        try {
            const res = await fetch(`${API_URL}/api/tts/emotions`, {
                method: 'POST',
                body: formData
            });
            if (res.ok) {
                e.target.reset();
                fetchData();
            } else {
                alert('Failed to add emotion');
            }
        } catch (err) {
            console.error('Error adding emotion:', err);
            alert('Error adding emotion');
        } finally {
            setUploading(false);
        }
    };

    const handleDeleteEmotion = async (name) => {
        if (!confirm(`Delete emotion audio "${name}"?`)) return;
        try {
            await fetch(`${API_URL}/api/tts/emotions/${name}`, { method: 'DELETE' });
            fetchData();
        } catch (err) {
            console.error('Error deleting emotion:', err);
        }
    };

    const handleSaveConfig = async (e) => {
        e.preventDefault();
        if (!configName.trim()) {
            alert('Please enter a config name');
            return;
        }

        const config = {
            method: parseInt(emoMethod),
            weight: parseFloat(emoWeight),
            is_random: emoIsRandom
        };

        if (emoMethod === 1) {
            if (!emoRefAudio) {
                alert('Please select a reference audio');
                return;
            }
            config.ref_audio_name = emoRefAudio;
        } else if (emoMethod === 2) {
            if (emoVec) {
                const vec = emoVec.split(',').map(v => parseFloat(v.trim()));
                if (vec.length !== 8) {
                    alert('Vector must have 8 values');
                    return;
                }
                config.vector = vec;
            }
        } else if (emoMethod === 3) {
            if (!emoText) {
                alert('Please enter emotion text');
                return;
            }
            config.text_prompt = emoText;
        }

        try {
            const res = await fetch(`${API_URL}/api/tts/emotion-configs/${configName}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });

            if (res.ok) {
                fetchData();
                resetConfigForm();
            } else {
                const err = await res.json();
                alert(`Failed to save config: ${err.message || res.statusText}`);
            }
        } catch (err) {
            console.error('Error saving config:', err);
            alert('Error saving config');
        }
    };

    const handleDeleteConfig = async (name) => {
        if (!confirm(`Delete emotion config "${name}"?`)) return;
        try {
            await fetch(`${API_URL}/api/tts/emotion-configs/${name}`, { method: 'DELETE' });
            fetchData();
        } catch (err) {
            console.error('Error deleting config:', err);
        }
    };

    const handleEditConfig = (name, config) => {
        setConfigName(name);
        setEmoMethod(config.method || 0);
        setEmoWeight(config.weight || 1.0);
        setEmoIsRandom(config.is_random || false);

        if (config.method === 1) {
            setEmoRefAudio(config.ref_audio_name || '');
        } else if (config.method === 2) {
            setEmoVec(config.vector ? config.vector.join(', ') : '');
        } else if (config.method === 3) {
            setEmoText(config.text_prompt || '');
        }

        setIsEditingConfig(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const resetConfigForm = () => {
        setConfigName('');
        setEmoMethod(0);
        setEmoRefAudio('');
        setEmoWeight(1.0);
        setEmoVec('');
        setEmoIsRandom(false);
        setEmoText('');
        setIsEditingConfig(false);
    };

    return (
        <div className="tts-config-container">
            <div className="tts-header">
                <h2>TTS Configuration</h2>
                <button onClick={() => navigate('/')} className="tts-btn-secondary">Back to Chat</button>
            </div>

            <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>

                {/* Speakers Section */}
                <div className="tts-section">
                    <h3>🎤 Speakers Management</h3>
                    <div className="tts-card">
                        <h4 style={{ marginBottom: '15px', color: '#555' }}>Add New Speaker</h4>
                        <form onSubmit={handleAddSpeaker} className="tts-form">
                            <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
                                <label>Name</label>
                                <input type="text" name="name" required placeholder="e.g. xiaowang" className="tts-input" style={{ color: '#0f0909ff' }} />
                            </div>
                            <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
                                <label>Reference Audio (WAV)</label>
                                <input type="file" name="file" accept=".wav" required className="tts-input" style={{ color: '#0f0909ff' }} />
                            </div>
                            <button type="submit" className="tts-btn-primary" disabled={uploading}>
                                {uploading ? '⏳ Uploading...' : '➕ Add Speaker'}
                            </button>
                        </form>
                    </div>

                    <div className="tts-grid">
                        {speakers.map((speaker, idx) => (
                            <div key={idx} className="tts-item">
                                <span className="tts-item-name">{speaker}</span>
                                <button onClick={() => handleDeleteSpeaker(speaker)} className="tts-delete-btn">🗑️</button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Emotions (Reference Audio) Section */}
                <div className="tts-section">
                    <h3>🎭 Emotion Audios (Reference Files)</h3>
                    <div className="tts-card">
                        <h4 style={{ marginBottom: '15px', color: '#555' }}>Upload Reference Audio</h4>
                        <form onSubmit={handleAddEmotion} className="tts-form">
                            <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
                                <label>Name</label>
                                <input type="text" name="name" required placeholder="e.g. sad_ref" className="tts-input" style={{ color: '#0f0909ff' }} />
                            </div>
                            <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
                                <label>Audio File (WAV)</label>
                                <input type="file" name="file" accept=".wav" required className="tts-input" style={{ color: '#0f0909ff' }} />
                            </div>
                            <button type="submit" className="tts-btn-primary" disabled={uploading}>
                                {uploading ? '⏳ Uploading...' : '📤 Upload Audio'}
                            </button>
                        </form>
                    </div>

                    <div className="tts-grid">
                        {emotions.map((emotion, idx) => (
                            <div key={idx} className="tts-item">
                                <span className="tts-item-name">{emotion}</span>
                                <button onClick={() => handleDeleteEmotion(emotion)} className="tts-delete-btn">🗑️</button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Emotion Configs Section */}
                <div className="tts-section">
                    <h3>⚙️ Emotion Configs</h3>
                    <div className="tts-card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h4 style={{ margin: 0, color: '#555' }}>{isEditingConfig ? '✏️ Edit Config' : '➕ Create New Config'}</h4>
                            {isEditingConfig && (
                                <button onClick={resetConfigForm} className="tts-btn-secondary">
                                    ❌ Cancel Edit
                                </button>
                            )}
                        </div>
                        <form onSubmit={handleSaveConfig}>
                            <div className="form-group">
                                <label>Config Name</label>
                                <input
                                    type="text"
                                    value={configName}
                                    onChange={e => setConfigName(e.target.value)}
                                    required
                                    placeholder="e.g. sad_style"
                                    disabled={isEditingConfig}
                                    className="tts-input"
                                    style={{ color: '#0f0909ff' }}
                                />
                            </div>
                            <div className="form-group">
                                <label>Control Method</label>
                                <select value={emoMethod} onChange={e => setEmoMethod(parseInt(e.target.value))} className="tts-input" style={{ color: '#0f0909ff' }}>
                                    <option value={0}>0: Default (No Control)</option>
                                    <option value={1}>1: Reference Audio</option>
                                    <option value={2}>2: Vector</option>
                                    <option value={3}>3: Text Prompt</option>
                                </select>
                            </div>

                            {emoMethod === 1 && (
                                <div style={{ padding: '15px', background: 'linear-gradient(135deg, #f5f7fa 0%, #e8ecf1 100%)', borderRadius: '12px', marginBottom: '15px', border: '1px solid #e0e0e0' }}>
                                    <div className="form-group">
                                        <label>Reference Audio</label>
                                        <select value={emoRefAudio} onChange={e => setEmoRefAudio(e.target.value)} required className="tts-input" style={{ color: '#0f0909ff' }}>
                                            <option value="">Select Audio...</option>
                                            {emotions.map(e => <option key={e} value={e}>{e}</option>)}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label>Weight (0.0 - 1.0)</label>
                                        <input type="number" step="0.1" min="0" max="1" value={emoWeight} onChange={e => setEmoWeight(e.target.value)} className="tts-input" style={{ color: '#0f0909ff' }} />
                                    </div>
                                </div>
                            )}

                            {emoMethod === 2 && (
                                <div style={{ padding: '15px', background: 'linear-gradient(135deg, #f5f7fa 0%, #e8ecf1 100%)', borderRadius: '12px', marginBottom: '15px', border: '1px solid #e0e0e0' }}>
                                    <div className="form-group">
                                        <label>Vector (8 floats, comma separated)</label>
                                        <input type="text" value={emoVec} onChange={e => setEmoVec(e.target.value)} placeholder="0.1, 0.2, ..." className="tts-input" style={{ color: '#0f0909ff' }} />
                                    </div>
                                    <div className="form-group">
                                        <label>
                                            {' '}Use Random
                                        </label>
                                        <select
                                            value={String(emoIsRandom)}
                                            onChange={(e) => {
                                                const boolValue = e.target.value === 'true';
                                                setEmoIsRandom(boolValue);
                                            }}
                                            className="tts-input" style={{ color: '#0f0909ff' }}
                                        >
                                            <option value="true">True</option>
                                            <option value="false">False</option>
                                        </select>
                                    </div>
                                </div>
                            )}

                            {emoMethod === 3 && (
                                <div style={{ padding: '15px', background: 'linear-gradient(135deg, #f5f7fa 0%, #e8ecf1 100%)', borderRadius: '12px', marginBottom: '15px', border: '1px solid #e0e0e0' }}>
                                    <div className="form-group">
                                        <label>Text Prompt</label>
                                        <input type="text" value={emoText} onChange={e => setEmoText(e.target.value)} placeholder="e.g. sad voice" required className="tts-input" style={{ color: '#0f0909ff' }} />
                                    </div>
                                </div>
                            )}

                            <button type="submit" className="tts-btn-primary">
                                {isEditingConfig ? '💾 Update Config' : '💾 Save Config'}
                            </button>
                        </form>
                    </div>

                    <div className="tts-grid">
                        {Object.entries(emotionConfigs).map(([name, config]) => (
                            <div
                                key={name}
                                className="tts-item-config"
                                onClick={() => handleEditConfig(name, config)}
                            >
                                <div className="tts-item-name">{name}</div>
                                <div className="tts-item-detail">
                                    Method: {config.method}
                                    {config.method === 1 && ` (Ref: ${config.ref_audio_name})`}
                                    {config.method === 3 && ` (Prompt: ${config.text_prompt})`}
                                </div>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteConfig(name);
                                    }}
                                    className="tts-delete-btn"
                                    style={{ position: 'absolute', top: '15px', right: '15px' }}
                                >
                                    🗑️
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TTSConfig;
