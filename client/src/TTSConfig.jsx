import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const TTSConfig = () => {
    const navigate = useNavigate();
    const [speakers, setSpeakers] = useState([]);
    const [emotions, setEmotions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);

    // Emotion Configuration State
    const [emoControlMethod, setEmoControlMethod] = useState(0);
    const [emoRefPath, setEmoRefPath] = useState('');
    const [emoWeight, setEmoWeight] = useState(0.8);
    const [emoVec, setEmoVec] = useState('');
    const [emoText, setEmoText] = useState('');

    useEffect(() => {
        fetchSpeakers();
        fetchEmotions();
    }, []);

    const fetchSpeakers = async () => {
        try {
            const res = await fetch('http://localhost:6007/api/tts/speakers');
            if (res.ok) {
                const data = await res.json();
                console.log(data.speakers);
                setSpeakers(Object.keys(data.speakers) || []);
            }
        } catch (err) {
            console.error('Failed to fetch speakers:', err);
        }
    };

    const fetchEmotions = async () => {
        try {
            const res = await fetch('http://localhost:6007/api/tts/emotions');
            if (res.ok) {
                const data = await res.json();
                setEmotions(data.emotions || []);
            }
        } catch (err) {
            console.error('Failed to fetch emotions:', err);
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
            const res = await fetch('http://localhost:6007/api/tts/speakers', {
                method: 'POST',
                body: formData
            });
            if (res.ok) {
                alert('Speaker added successfully');
                e.target.reset();
                fetchSpeakers();
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
            const res = await fetch(`http://localhost:6007/api/tts/speakers/${name}`, {
                method: 'DELETE'
            });
            if (res.ok) {
                fetchSpeakers();
            } else {
                alert('Failed to delete speaker');
            }
        } catch (err) {
            console.error('Error deleting speaker:', err);
        }
    };

    return (
        <div className="tts-config-container" style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h1>TTS Configuration</h1>
                <button onClick={() => navigate('/')} className="btn btn-secondary">Back to Chat</button>
            </div>

            <div className="section" style={{ marginBottom: '40px' }}>
                <h2>Speakers Management</h2>

                <div className="card" style={{ padding: '20px', background: '#f5f5f5', marginBottom: '20px', borderRadius: '8px' }}>
                    <h3>Add New Speaker</h3>
                    <form onSubmit={handleAddSpeaker} style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                        <div className="form-group">
                            <label>Name:</label>
                            <input type="text" name="name" required placeholder="e.g. xiaowang" style={{ padding: '8px' }} />
                        </div>
                        <div className="form-group">
                            <label>Reference Audio (WAV):</label>
                            <input type="file" name="file" accept=".wav" required style={{ padding: '8px' }} />
                        </div>
                        <button type="submit" className="btn btn-primary" disabled={uploading}>
                            {uploading ? 'Uploading...' : 'Add Speaker'}
                        </button>
                    </form>
                </div>

                <div className="speakers-list">
                    <h3>Available Speakers</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px' }}>
                        {speakers.map((speaker, idx) => (
                            <div key={idx} style={{
                                padding: '10px',
                                border: '1px solid #ddd',
                                borderRadius: '4px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                background: 'white'
                            }}>
                                <span>{speaker}</span>
                                <button
                                    onClick={() => handleDeleteSpeaker(speaker)}
                                    style={{ color: 'red', border: 'none', background: 'none', cursor: 'pointer' }}
                                >
                                    🗑️
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="section">
                <h2>Emotion Configuration (Test/Default)</h2>
                <div className="card" style={{ padding: '20px', background: '#f5f5f5', borderRadius: '8px' }}>
                    <div className="form-group" style={{ marginBottom: '15px' }}>
                        <label>Control Method:</label>
                        <select
                            value={emoControlMethod}
                            onChange={(e) => setEmoControlMethod(parseInt(e.target.value))}
                            style={{ padding: '8px', width: '100%' }}
                        >
                            <option value={0}>Mode 0: No Emotion Control (Default)</option>
                            <option value={1}>Mode 1: Reference Audio Emotion</option>
                            <option value={2}>Mode 2: Emotion Vector</option>
                            <option value={3}>Mode 3: Text Prompt Emotion</option>
                        </select>
                    </div>

                    {emoControlMethod === 1 && (
                        <div className="mode-settings">
                            <div className="form-group">
                                <label>Reference Path (emo_ref_path):</label>
                                <input
                                    type="text"
                                    value={emoRefPath}
                                    onChange={e => setEmoRefPath(e.target.value)}
                                    placeholder="/path/to/ref.wav"
                                    style={{ width: '100%', padding: '8px' }}
                                />
                            </div>
                            <div className="form-group">
                                <label>Emotion Weight (emo_weight):</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    max="1"
                                    value={emoWeight}
                                    onChange={e => setEmoWeight(parseFloat(e.target.value))}
                                    style={{ width: '100%', padding: '8px' }}
                                />
                            </div>
                        </div>
                    )}

                    {emoControlMethod === 2 && (
                        <div className="mode-settings">
                            <div className="form-group">
                                <label>Emotion Vector (emo_vec) [comma separated]:</label>
                                <input
                                    type="text"
                                    value={emoVec}
                                    onChange={e => setEmoVec(e.target.value)}
                                    placeholder="0.1, 0.2, 0.0..."
                                    style={{ width: '100%', padding: '8px' }}
                                />
                                <small>Must sum to less than 1.5</small>
                            </div>
                        </div>
                    )}

                    {emoControlMethod === 3 && (
                        <div className="mode-settings">
                            <div className="form-group">
                                <label>Emotion Text (emo_text):</label>
                                <input
                                    type="text"
                                    value={emoText}
                                    onChange={e => setEmoText(e.target.value)}
                                    placeholder="e.g. 悲伤的语气"
                                    style={{ width: '100%', padding: '8px' }}
                                />
                            </div>
                        </div>
                    )}

                    <div style={{ marginTop: '20px', padding: '10px', background: '#e3f2fd', borderRadius: '4px' }}>
                        <p><strong>Note:</strong> These settings are for testing/defaults. Actual emotion control during chat may be dynamic based on AI response.</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TTSConfig;
