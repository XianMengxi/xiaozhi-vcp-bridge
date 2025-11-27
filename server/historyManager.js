const fs = require('fs-extra');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');

// Default agent configuration
const DEFAULT_AGENT_CONFIG = {
    name: 'New Agent',
    systemPrompt: '',
    model: 'gemini-2.5-flash',
    temperature: 0.7,
    contextTokenLimit: 1000000,
    maxOutputTokens: 60000,
    streamOutput: true
};

async function getAgents() {
    try {
        await fs.ensureDir(DATA_DIR);
        const items = await fs.readdir(DATA_DIR, { withFileTypes: true });
        const agents = [];

        for (const dirent of items) {
            if (dirent.isDirectory() && !dirent.name.startsWith('.')) {
                const agentId = dirent.name;
                const config = await getAgentConfig(agentId);
                agents.push({
                    id: agentId,
                    ...config
                });
            }
        }

        return agents;
    } catch (e) {
        console.error('[HistoryManager] Error listing agents:', e);
        return [];
    }
}

async function getTopics(agentId) {
    try {
        const agentDir = path.join(DATA_DIR, agentId);
        if (!await fs.pathExists(agentDir)) return [];

        const items = await fs.readdir(agentDir, { withFileTypes: true });
        const topics = [];

        for (const dirent of items) {
            if (dirent.isDirectory() && !dirent.name.startsWith('.')) {
                const topicId = dirent.name;
                const metaPath = path.join(agentDir, topicId, 'meta.json');
                let name = topicId;

                if (await fs.pathExists(metaPath)) {
                    try {
                        const meta = await fs.readJson(metaPath);
                        name = meta.name || topicId;
                    } catch (e) {
                        console.error(`Error reading meta for topic ${topicId}:`, e);
                    }
                }

                topics.push({ id: topicId, name });
            }
        }

        return topics;
    } catch (e) {
        console.error(`[HistoryManager] Error listing topics for ${agentId}:`, e);
        return [];
    }
}

async function createAgent(config) {
    try {
        const agentId = `Agent_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const agentDir = path.join(DATA_DIR, agentId);
        await fs.ensureDir(agentDir);

        // Merge with defaults
        const fullConfig = { ...DEFAULT_AGENT_CONFIG, ...config };

        // Save config
        await fs.writeJson(path.join(agentDir, 'config.json'), fullConfig, { spaces: 2 });

        return { id: agentId, ...fullConfig };
    } catch (e) {
        console.error('[HistoryManager] Error creating agent:', e);
        throw e;
    }
}

async function updateAgent(agentId, config) {
    try {
        const agentDir = path.join(DATA_DIR, agentId);
        if (!await fs.pathExists(agentDir)) {
            throw new Error('Agent not found');
        }

        // Read existing config
        const existingConfig = await getAgentConfig(agentId);

        // Merge with new config
        const updatedConfig = { ...existingConfig, ...config };

        // Save
        await fs.writeJson(path.join(agentDir, 'config.json'), updatedConfig, { spaces: 2 });

        return { id: agentId, ...updatedConfig };
    } catch (e) {
        console.error(`[HistoryManager] Error updating agent ${agentId}:`, e);
        throw e;
    }
}

async function deleteAgent(agentId) {
    try {
        const agentDir = path.join(DATA_DIR, agentId);
        if (await fs.pathExists(agentDir)) {
            await fs.remove(agentDir);
            return { success: true };
        }
        return { success: false, error: 'Agent not found' };
    } catch (e) {
        console.error(`[HistoryManager] Error deleting agent ${agentId}:`, e);
        throw e;
    }
}

async function getAgentConfig(agentId) {
    try {
        const configPath = path.join(DATA_DIR, agentId, 'config.json');
        if (await fs.pathExists(configPath)) {
            return await fs.readJson(configPath);
        }
        // Return default if config doesn't exist
        return { ...DEFAULT_AGENT_CONFIG, name: agentId };
    } catch (e) {
        console.error(`[HistoryManager] Error reading config for ${agentId}:`, e);
        return { ...DEFAULT_AGENT_CONFIG, name: agentId };
    }
}

async function createTopic(agentId, topicName) {
    try {
        const topicId = `topic_${Date.now()}`;
        const topicDir = path.join(DATA_DIR, agentId, topicId);
        await fs.ensureDir(topicDir);

        if (topicName) {
            await fs.writeJson(path.join(topicDir, 'meta.json'), { name: topicName }, { spaces: 2 });
        }

        return { id: topicId, name: topicName || topicId };
    } catch (e) {
        console.error(`[HistoryManager] Error creating topic for ${agentId}:`, e);
        throw e;
    }
}

async function updateTopic(agentId, topicId, topicName) {
    try {
        const topicDir = path.join(DATA_DIR, agentId, topicId);
        if (!await fs.pathExists(topicDir)) {
            throw new Error('Topic not found');
        }

        await fs.writeJson(path.join(topicDir, 'meta.json'), { name: topicName }, { spaces: 2 });

        return { id: topicId, name: topicName };
    } catch (e) {
        console.error(`[HistoryManager] Error updating topic ${topicId}:`, e);
        throw e;
    }
}

async function deleteTopic(agentId, topicId) {
    try {
        const topicDir = path.join(DATA_DIR, agentId, topicId);
        if (await fs.pathExists(topicDir)) {
            await fs.remove(topicDir);
            return { success: true };
        }
        return { success: false, error: 'Topic not found' };
    } catch (e) {
        console.error(`[HistoryManager] Error deleting topic ${topicId}:`, e);
        throw e;
    }
}

async function getHistory(agentId, topicId) {
    try {
        const historyFile = path.join(DATA_DIR, agentId, topicId, 'history.json');
        if (await fs.pathExists(historyFile)) {
            return await fs.readJson(historyFile);
        }
        return [];
    } catch (e) {
        console.error(`[HistoryManager] Error reading history for ${agentId}/${topicId}:`, e);
        return [];
    }
}

async function appendHistory(agentId, topicId, newMessages) {
    try {
        const topicDir = path.join(DATA_DIR, agentId, topicId);
        await fs.ensureDir(topicDir);
        const historyFile = path.join(topicDir, 'history.json');

        let history = [];
        if (await fs.pathExists(historyFile)) {
            history = await fs.readJson(historyFile);
        }

        // Filter out system messages and invalid content
        const validMessages = newMessages.filter(msg => msg.role !== 'system');

        // Append
        history = history.concat(validMessages);

        await fs.writeJson(historyFile, history, { spaces: 2 });
        return history;
    } catch (e) {
        console.error(`[HistoryManager] Error appending history for ${agentId}/${topicId}:`, e);
        throw e;
    }
}

module.exports = {
    getAgents,
    getTopics,
    createAgent,
    updateAgent,
    deleteAgent,
    getAgentConfig,
    createTopic,
    updateTopic,
    deleteTopic,
    getHistory,
    appendHistory
};
