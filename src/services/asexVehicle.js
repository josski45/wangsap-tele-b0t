const axios = require('axios');
const config = require('../config');
const db = require('../database');

class AsexVehicleService {
    constructor() {
        this.activePolls = new Map();
    }

    getApiKey() {
        const settings = db.getAllSettings();
        return settings.asex_api_key || config.asexApiKey;
    }

    getBaseUrl() {
        return config.asexApiBaseUrl;
    }

    getResultUrl() {
        return config.asexApiResultUrl;
    }

    getSubmitParam(type) {
        return {
            nopol: 'plate',
            noka: 'no_rangka',
            nosin: 'no_mesin',
            nikplat: 'no_ktp'
        }[type];
    }

    async submitLookup(type, value) {
        const paramName = this.getSubmitParam(type);
        if (!paramName) {
            return {
                success: false,
                error: 'Tipe pencarian kendaraan tidak valid',
                refund: true
            };
        }

        try {
            const response = await axios.get(this.getBaseUrl(), {
                timeout: 30000,
                params: {
                    api_key: this.getApiKey(),
                    [paramName]: value
                },
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            const data = response.data || {};
            if (!data.status || !data.request_id) {
                return {
                    success: false,
                    error: data.message || 'Request kendaraan gagal diproses',
                    refund: true
                };
            }

            return {
                success: true,
                requestCode: data.request_id,
                source: data.source || 'queue',
                message: data.message || 'Request queued, processing...',
                refund: false
            };
        } catch (error) {
            return this.handleError(error);
        }
    }

    async fetchResult(requestCode) {
        try {
            const response = await axios.get(this.getResultUrl(), {
                timeout: 30000,
                params: {
                    api_key: this.getApiKey(),
                    request_code: requestCode
                },
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            const data = response.data || {};
            if (!data.status) {
                return {
                    success: false,
                    state: 'failed',
                    error: data.message || 'Gagal mengambil hasil kendaraan',
                    refund: true
                };
            }

            if (data.state === 'done' && data.result) {
                return {
                    success: true,
                    state: 'done',
                    result: data.result,
                    updatedAt: data.updated_at || null,
                    refund: false
                };
            }

            if (data.state === 'pending') {
                return {
                    success: true,
                    state: 'pending',
                    message: data.message || 'Request still processing',
                    refund: false
                };
            }

            return {
                success: false,
                state: data.state || 'failed',
                error: data.message || 'Request kendaraan gagal',
                refund: true
            };
        } catch (error) {
            return this.handleError(error);
        }
    }

    async waitForResult(requestCode) {
        await this.delay(config.asexInitialDelayMs);

        const startedAt = Date.now();
        while ((Date.now() - startedAt) < config.asexPollTimeoutMs) {
            const result = await this.fetchResult(requestCode);

            if (!result.success) {
                return result;
            }

            if (result.state === 'done') {
                return result;
            }

            await this.delay(config.asexPollIntervalMs + Math.floor(Math.random() * 3000));
        }

        return {
            success: false,
            state: 'timeout',
            error: 'Request kendaraan timeout, silakan coba lagi nanti',
            refund: true
        };
    }

    startPolling(requestCode, poller) {
        if (this.activePolls.has(requestCode)) {
            return this.activePolls.get(requestCode);
        }

        const promise = (async () => {
            try {
                return await poller();
            } finally {
                this.activePolls.delete(requestCode);
            }
        })();

        this.activePolls.set(requestCode, promise);
        return promise;
    }

    handleError(error) {
        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
            return {
                success: false,
                error: 'Request timeout, silakan coba lagi',
                refund: true
            };
        }

        if (error.response) {
            let message = 'Server kendaraan sedang bermasalah';
            if (error.response.status === 401 || error.response.status === 403) {
                message = 'Akses API kendaraan ditolak';
            } else if (error.response.status === 429) {
                message = 'API kendaraan terlalu sibuk, coba lagi nanti';
            } else if (error.response.status === 404) {
                message = 'Data kendaraan tidak ditemukan';
            }

            return {
                success: false,
                error: message,
                refund: true
            };
        }

        return {
            success: false,
            error: 'Gagal menghubungi server kendaraan',
            refund: true
        };
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = new AsexVehicleService();
