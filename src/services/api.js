const axios = require('axios');
const https = require('https');
const config = require('../config');
const db = require('../database');

/**
 * API Service untuk semua API calls
 * - Original NIK (ceknik)
 * - EYEX (nama, kk)  
 * - Starkiller (foto)
 * - EDABU (edabu)
 */
class APIService {
    constructor() {
        this.nikBaseUrl = config.apiBaseUrl;
        this.eyexBaseUrl = config.eyexBaseUrl;
        this.starkillerBaseUrl = config.starkillerBaseUrl;
        this.edabuBaseUrl = config.edabuBaseUrl;
        this.nopolBaseUrl = config.nopolBaseUrl;
        this.httpsAgent = new https.Agent({ rejectUnauthorized: false });
    }

    /**
     * Get API key dari database atau config
     */
    getApiKey(type) {
        const settings = db.getAllSettings();
        switch (type) {
            case 'eyex':
                return settings.eyex_api_key || config.eyexApiKey;
            case 'starkiller':
                return settings.starkiller_api_key || config.starkillerApiKey;
            case 'edabu':
                return settings.edabu_api_key || config.edabuApiKey;
            case 'nopol':
                return settings.nopol_api_key || config.nopolApiKey;
            case 'nik':
            default:
                return settings.api_key || config.apiKey;
        }
    }

    /**
     * CEK NIK ORIGINAL
     */
    async checkNIK(nik) {
        try {
            const apiKey = this.getApiKey('nik');
            const url = `${this.nikBaseUrl}?apikey=${apiKey}&endpoint=nikv2&query=${nik}`;
            
            const response = await axios.get(url, {
                timeout: 30000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            const data = response.data;

            if (data.error === true || data.error === 'true') {
                return {
                    success: false,
                    error: data.message || 'Data tidak ditemukan',
                    refund: true
                };
            }

            if (!data.data || Object.keys(data.data).length === 0) {
                return {
                    success: false,
                    error: 'Data tidak ditemukan untuk NIK tersebut',
                    refund: true
                };
            }

            return {
                success: true,
                data: data.data,
                refund: false
            };

        } catch (error) {
            console.error('NIK API Error:', error.message);
            return this.handleError(error);
        }
    }

    /**
     * CARI NAMA (EYEX API)
     */
    async searchByName(name, page = 1) {
        try {
            const apiKey = this.getApiKey('eyex');
            const url = `${this.eyexBaseUrl}/sname?key=${apiKey}&data=${encodeURIComponent(name)}&page=${page}`;
            
            const response = await axios.get(url, {
                timeout: 30000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            const data = response.data;

            if (!data.result || data.result === false) {
                return {
                    success: false,
                    error: data.message || 'Data tidak ditemukan',
                    refund: true
                };
            }

            return {
                success: true,
                data: data.data,
                account: data.account,
                searchName: data.name,
                refund: false
            };

        } catch (error) {
            console.error('EYEX Name API Error:', error.message);
            return this.handleError(error);
        }
    }

    /**
     * CEK KARTU KELUARGA (EYEX API)
     */
    async checkKK(kkNumber) {
        try {
            const apiKey = this.getApiKey('eyex');
            const url = `${this.eyexBaseUrl}/nkk?key=${apiKey}&data=${kkNumber}`;
            
            const response = await axios.get(url, {
                timeout: 30000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            const data = response.data;

            if (!data.result || data.result === false) {
                return {
                    success: false,
                    error: data.message || 'Data tidak ditemukan',
                    refund: true
                };
            }

            return {
                success: true,
                data: data.data,
                account: data.account,
                nkk: data.nkk,
                refund: false
            };

        } catch (error) {
            console.error('EYEX KK API Error:', error.message);
            return this.handleError(error);
        }
    }

    /**
     * CEK NIK DENGAN FOTO (STARKILLER API)
     */
    async checkNIKFoto(nik) {
        try {
            const apiKey = this.getApiKey('starkiller');
            const url = `${this.starkillerBaseUrl}/dukcapil/nik?user_key=${apiKey}&nik=${nik}`;
            
            const response = await axios.get(url, {
                timeout: 120000,
                httpsAgent: this.httpsAgent,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            const data = response.data;

            if (!data.success) {
                return {
                    success: false,
                    error: data.message || 'Request gagal',
                    refund: true
                };
            }

            return {
                success: true,
                needCallback: true,
                localId: data.local_id,
                callbackUrl: data.callback,
                message: data.message,
                refund: false
            };

        } catch (error) {
            console.error('Starkiller API Error:', error.message);
            return this.handleError(error);
        }
    }

    /**
     * Poll callback URL dari Starkiller
     */
    async pollStarkillerCallback(callbackUrl, maxAttempts = 20, delayMs = 10000) {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const response = await axios.get(callbackUrl, {
                    timeout: 120000,
                    httpsAgent: this.httpsAgent,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                });

                const data = response.data;

                if (data.success && data.data && data.data.length > 0) {
                    // Cek apakah data[0].data kosong (array kosong)
                    const firstData = data.data[0];
                    if (firstData && Array.isArray(firstData.data) && firstData.data.length === 0) {
                        return {
                            success: false,
                            error: 'Data tidak ditemukan untuk NIK tersebut',
                            refund: true
                        };
                    }
                    
                    return {
                        success: true,
                        data: data.data,
                        message: data.message,
                        refund: false
                    };
                }

                if (data.message && (data.message.includes('antrian') || data.message.includes('belum ada hasil'))) {
                    await this.delay(delayMs);
                    continue;
                }

                if (attempt === maxAttempts) {
                    return {
                        success: false,
                        error: 'Data tidak ditemukan atau timeout',
                        refund: true
                    };
                }

            } catch (error) {
                if (attempt === maxAttempts) {
                    return this.handleError(error);
                }
                await this.delay(delayMs);
            }
        }

        return {
            success: false,
            error: 'Timeout menunggu response',
            refund: true
        };
    }

    /**
     * CEK EDABU / BPJS (EDABU API)
     */
    async checkEdabu(nik) {
        try {
            const apiKey = this.getApiKey('edabu');
            const url = `${this.edabuBaseUrl}/search-nik?apikey=${apiKey}&nik=${nik}`;
            
            const response = await axios.get(url, {
                timeout: 180000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            const data = response.data;

            if (!data.success) {
                return {
                    success: false,
                    error: data.message || 'Data tidak ditemukan',
                    refund: true
                };
            }

            return {
                success: true,
                data: data.data,
                message: data.message,
                refund: false
            };

        } catch (error) {
            console.error('EDABU API Error:', error.message);
            return this.handleError(error);
        }
    }

    /**
     * FETCH NIK ADDRESS (untuk enrichment data EDABU)
     * Mengambil alamat lengkap berdasarkan NIK
     */
    async fetchNIKAddress(nik) {
        try {
            const apiKey = this.getApiKey('nik');
            const url = `${this.nikBaseUrl}?apikey=${apiKey}&endpoint=nikv2&query=${nik}`;
            
            const response = await axios.get(url, {
                timeout: 10000, // timeout lebih pendek untuk enrichment
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            const data = response.data;

            if (data.error === true || data.error === 'true' || !data.data) {
                return null;
            }

            const d = data.data;
            // Format alamat lengkap
            const alamatParts = [
                d.alamat,
                d.kelurahan ? `Kel. ${d.kelurahan}` : null,
                d.kecamatan ? `Kec. ${d.kecamatan}` : null,
                d.kabupaten,
                d.provinsi
            ].filter(p => p && p !== '-' && p.trim() !== '');

            return {
                alamat: d.alamat || '-',
                kelurahan: d.kelurahan || '-',
                kecamatan: d.kecamatan || '-',
                kabupaten: d.kabupaten || '-',
                provinsi: d.provinsi || '-',
                alamat_lengkap: alamatParts.join(', ') || '-'
            };

        } catch (error) {
            console.error('Fetch NIK Address Error:', error.message);
            return null;
        }
    }

    /**
     * FETCH MULTIPLE NIK ADDRESSES (batch)
     */
    async fetchMultipleNIKAddresses(nikList) {
        const results = {};
        // Fetch secara parallel dengan limit
        const batchSize = 5;
        for (let i = 0; i < nikList.length; i += batchSize) {
            const batch = nikList.slice(i, i + batchSize);
            const promises = batch.map(async (nik) => {
                const address = await this.fetchNIKAddress(nik);
                return { nik, address };
            });
            const batchResults = await Promise.all(promises);
            batchResults.forEach(r => {
                if (r.address) results[r.nik] = r.address;
            });
        }
        return results;
    }

    /**
     * Handle error
     */
    handleError(error) {
        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
            return {
                success: false,
                error: 'Request timeout, silakan coba lagi',
                refund: true
            };
        }

        if (error.response) {
            return {
                success: false,
                error: `API Error: ${error.response.status}`,
                refund: true
            };
        }

        return {
            success: false,
            error: 'Gagal menghubungi server, silakan coba lagi',
            refund: true
        };
    }

    /**
     * Delay function
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * CEK NOPOL (Plat Nomor Kendaraan)
     * /nopol <plat> | /nopol mesin <no_mesin> | /nopol rangka <no_rangka> | /nopol nik <nik>
     * @param {string} query - Nilai yang dicari (plat, nomor mesin, nomor rangka, atau NIK)
     * @param {string} type - Tipe pencarian: 'nopol' (default), 'mesin', 'rangka', 'nik'
     */
    async checkNopol(query, type = 'nopol') {
        try {
            const apiKey = this.getApiKey('nopol');
            const url = `${this.nopolBaseUrl}/check-nopol`;
            
            // Mapping tipe ke label
            const typeLabels = {
                'nopol': 'Plat Nomor',
                'mesin': 'Nomor Mesin',
                'rangka': 'Nomor Rangka',
                'nik': 'NIK Pemilik'
            };
            
            const response = await axios.post(url, 
                `api_key=${apiKey}&${type}=${encodeURIComponent(query)}`,
                {
                    timeout: 30000,
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                }
            );

            const data = response.data;

            if (data.status !== 'success' || !data.data || data.data.length === 0) {
                return {
                    success: false,
                    error: data.message || `Data tidak ditemukan untuk ${typeLabels[type] || type} tersebut`,
                    refund: true,
                    searchType: type
                };
            }

            return {
                success: true,
                data: data.data[0],
                refund: false,
                searchType: type
            };

        } catch (error) {
            console.error('NOPOL API Error:', error.message);
            return this.handleError(error);
        }
    }
}

module.exports = new APIService();
