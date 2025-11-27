const AuthManager = require('./authManager');

/**
 * OTA Handler
 * Handles OTA requests for WebSocket URL discovery and authentication
 */
class OTAHandler {
    constructor(config) {
        this.config = config;
        this.otaKey = config.otaKey;
        this.authKey = config.authKey;
        this.expireSeconds = config.expireSeconds || 60 * 60 * 24 * 30;
        this.wsPort = config.wsPort;
        this.authManager = new AuthManager(this.authKey, this.expireSeconds);
    }

    /**
     * Get WebSocket URL
     * @param {string} localIp - Local IP address
     * @param {number} port - WebSocket port
     * @returns {string} WebSocket URL
     */
    _getWebSocketUrl(localIp, port) {
        // You can customize this based on your configuration
        return `ws://${localIp}:${port}`;
    }

    /**
     * Get local IP address
     * @returns {string} Local IP address
     */
    _getLocalIp() {
        const os = require('os');
        const interfaces = os.networkInterfaces();

        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
                // Skip internal and non-IPv4 addresses
                if (iface.family === 'IPv4' && !iface.internal) {
                    return iface.address;
                }
            }
        }

        return 'localhost';
    }

    /**
     * Handle POST request
     * @param {object} req - Express request
     * @param {object} res - Express response
     */
    async handlePost(req, res) {
        try {
            // Validate OTA_KEY
            const otaKey = req.headers['ota_key'] || req.headers['ota-key'];
            if (!otaKey || otaKey !== this.otaKey) {
                console.log('[OTA] Invalid or missing OTA_KEY');
                return res.status(403).json({
                    success: false,
                    message: 'Invalid or missing OTA_KEY'
                });
            }

            // Extract device information
            const deviceId = req.headers['device-id'] || req.headers['device_id'];
            const clientId = req.headers['client-id'] || req.headers['client_id'];

            if (!deviceId) {
                console.log('[OTA] Missing device-id');
                return res.status(400).json({
                    success: false,
                    message: 'Missing device-id header'
                });
            }

            if (!clientId) {
                console.log('[OTA] Missing client-id');
                return res.status(400).json({
                    success: false,
                    message: 'Missing client-id header'
                });
            }

            console.log(`[OTA] Request from device: ${deviceId}, client: ${clientId}`);

            // Parse request body
            const data = req.body || {};

            // Get local IP and construct WebSocket URL
            const localIp = this._getLocalIp();
            const wsUrl = this._getWebSocketUrl(localIp, this.wsPort);

            // Generate authentication token
            const token = this.authManager.generateToken(clientId, deviceId);

            // Build response
            const response = {
                server_time: {
                    timestamp: Date.now(),
                    timezone_offset: 8 * 60 // UTC+8 in minutes
                },
                firmware: {
                    version: data.application?.version || '1.0.0',
                    url: ''
                },
                websocket: {
                    url: wsUrl,
                    token: token
                }
            };

            console.log(`[OTA] Sending WebSocket URL: ${wsUrl}`);
            res.json(response);

        } catch (error) {
            console.error('[OTA] Error handling POST request:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }

    /**
     * Handle GET request (health check)
     * @param {object} req - Express request
     * @param {object} res - Express response
     */
    async handleGet(req, res) {
        try {
            const localIp = this._getLocalIp();
            const wsUrl = this._getWebSocketUrl(localIp, this.wsPort);
            const message = `OTA service is running. WebSocket URL: ${wsUrl}`;
            res.send(message);
        } catch (error) {
            console.error('[OTA] Error handling GET request:', error);
            res.status(500).send('OTA service error');
        }
    }
}

module.exports = OTAHandler;
