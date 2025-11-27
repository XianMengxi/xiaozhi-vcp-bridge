const crypto = require('crypto');

/**
 * Authentication Manager
 * Generates and verifies HMAC-SHA256 tokens for device authentication
 */
class AuthManager {
    constructor(secretKey, expireSeconds = 60 * 60 * 24 * 30) {
        this.secretKey = secretKey;
        this.expireSeconds = expireSeconds || 60 * 60 * 24 * 30; // Default 30 days
    }

    /**
     * Generate HMAC-SHA256 signature and Base64 encode
     * @param {string} content - Content to sign
     * @returns {string} Base64-encoded signature
     */
    _sign(content) {
        const hmac = crypto.createHmac('sha256', this.secretKey);
        hmac.update(content);
        const signature = hmac.digest('base64url'); // Use base64url encoding (no padding)
        return signature;
    }

    /**
     * Generate authentication token
     * @param {string} clientId - Client ID
     * @param {string} deviceId - Device ID (username)
     * @returns {string} Token string
     */
    generateToken(clientId, deviceId) {
        const ts = Math.floor(Date.now() / 1000);
        const content = `${clientId}|${deviceId}|${ts}`;
        const signature = this._sign(content);
        const token = `${signature}.${ts}`;
        return token;
    }

    /**
     * Verify token validity
     * @param {string} token - Token from client
     * @param {string} clientId - Client ID used in connection
     * @param {string} deviceId - Device ID used in connection
     * @returns {boolean} True if valid, false otherwise
     */
    verifyToken(token, clientId, deviceId) {
        try {
            const parts = token.split('.');
            if (parts.length !== 2) {
                return false;
            }

            const [sigPart, tsStr] = parts;
            const ts = parseInt(tsStr, 10);

            // Check expiration
            const now = Math.floor(Date.now() / 1000);
            if (now - ts > this.expireSeconds) {
                return false; // Expired
            }

            // Verify signature
            const expectedSig = this._sign(`${clientId}|${deviceId}|${ts}`);

            // Use timing-safe comparison
            if (!crypto.timingSafeEqual(Buffer.from(sigPart), Buffer.from(expectedSig))) {
                return false;
            }

            return true;
        } catch (error) {
            console.error('[AuthManager] Token verification error:', error);
            return false;
        }
    }
}

module.exports = AuthManager;
