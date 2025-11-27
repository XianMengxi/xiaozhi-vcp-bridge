const fs = require('fs-extra');
const path = require('path');

/**
 * Device Manager
 * Manages connected device information and persistence
 */
class DeviceManager {
    constructor(dataDir = './data') {
        this.dataDir = dataDir;
        this.devicesFile = path.join(dataDir, 'devices.json');
        this.devices = new Map();
        this._loadDevices();
    }

    /**
     * Load devices from file
     */
    async _loadDevices() {
        try {
            await fs.ensureDir(this.dataDir);
            if (await fs.pathExists(this.devicesFile)) {
                const data = await fs.readJson(this.devicesFile);
                if (data.devices && Array.isArray(data.devices)) {
                    data.devices.forEach(device => {
                        this.devices.set(device.deviceId, device);
                    });
                }
            }
        } catch (error) {
            console.error('[DeviceManager] Error loading devices:', error);
        }
    }

    /**
     * Save devices to file
     */
    async _saveDevices() {
        try {
            await fs.ensureDir(this.dataDir);
            const data = {
                devices: Array.from(this.devices.values())
            };
            await fs.writeJson(this.devicesFile, data, { spaces: 2 });
        } catch (error) {
            console.error('[DeviceManager] Error saving devices:', error);
        }
    }

    /**
     * Add or update device information
     * @param {string} deviceId - Device ID (MAC address)
     * @param {string} clientId - Client ID
     * @param {object} metadata - Additional device metadata
     */
    async addOrUpdateDevice(deviceId, clientId, metadata = {}) {
        const device = {
            deviceId,
            clientId,
            lastConnected: Date.now(),
            metadata
        };

        this.devices.set(deviceId, device);
        await this._saveDevices();
        console.log(`[DeviceManager] Device registered: ${deviceId}`);
    }

    /**
     * Get device by ID
     * @param {string} deviceId - Device ID
     * @returns {object|null} Device object or null
     */
    getDevice(deviceId) {
        return this.devices.get(deviceId) || null;
    }

    /**
     * Get all devices
     * @returns {Array} Array of device objects
     */
    getAllDevices() {
        return Array.from(this.devices.values());
    }

    /**
     * Remove device
     * @param {string} deviceId - Device ID
     */
    async removeDevice(deviceId) {
        if (this.devices.delete(deviceId)) {
            await this._saveDevices();
            console.log(`[DeviceManager] Device removed: ${deviceId}`);
            return true;
        }
        return false;
    }
}

module.exports = DeviceManager;
