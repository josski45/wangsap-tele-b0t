/**
 * TerbangBebas API Service
 * For vehicle lookups: nopol, noka, nosin, nik
 * API: https://apiv2.terbangbebas.cyou/
 */
const axios = require('axios');
const config = require('../config');
const db = require('../database');

class TerbangBebasService {
    constructor() {
        this.baseUrl = 'https://apiv2.terbangbebas.cyou';
        this.defaultTimeout = 60000;
    }

    /**
     * Get API key from database or config
     */
    getApiKey() {
        const settings = db.getAllSettings();
        return settings.terbangbebas_api_key || config.terbangbebasApiKey || 'bb1939cc65b3f5dc732c8f94ce14bc92';
    }

    /**
     * Detect query type based on format
     */
    detectQueryType(query) {
        // NIK: exactly 16 digits
        if (/^\d{16}$/.test(query)) {
            return 'nik';
        }
        
        // NOPOL format: 1-2 letters + 1-4 digits + 0-3 letters
        const nopolRegex = /^[A-Z]{1,2}[0-9]{1,4}[A-Z]{0,3}$/;
        if (nopolRegex.test(query) && query.length >= 2 && query.length <= 9) {
            return 'nopol';
        }
        
        // NOKA (NoRangka): alphanumeric, typically 17+ chars
        // NOSIN (NoMesin): alphanumeric, typically 8-15 chars
        if (/^[A-Z0-9]+$/.test(query)) {
            if (query.length >= 15) {
                return 'noka';
            }
            return 'nosin';
        }
        
        return 'unknown';
    }

    /**
     * Search by NOPOL (plat nomor)
     */
    async searchByNopol(nopol) {
        return await this.search(nopol, 'nopol');
    }

    /**
     * Search by NoRangka
     */
    async searchByNoka(noka) {
        return await this.search(noka, 'nopol');
    }

    /**
     * Search by NoMesin
     */
    async searchByNosin(nosin) {
        return await this.search(nosin, 'nopol');
    }

    /**
     * Search vehicles by NIK (can return multiple vehicles)
     */
    async searchByNik(nik) {
        return await this.search(nik, 'nopol');
    }

    /**
     * Generic search function
     */
    async search(query, endpoint = 'nopol') {
        try {
            const apiKey = this.getApiKey();
            const url = `${this.baseUrl}/?apikey=${apiKey}&endpoint=${endpoint}&query=${encodeURIComponent(query)}`;

            console.log(`🚗 [TerbangBebas] Searching: ${query}`);

            const response = await axios.get(url, {
                timeout: this.defaultTimeout,
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            const data = response.data;

            // Check for error response
            if (!data.result || data.result.length === 0) {
                return {
                    success: false,
                    error: data.message || 'Data tidak ditemukan',
                    refund: true,
                    vehicles: []
                };
            }

            // Filter null values - API returns [null, {...data}]
            const vehicles = data.result.filter(item => item !== null && typeof item === 'object');
            
            if (vehicles.length === 0) {
                return {
                    success: false,
                    error: 'Data tidak ditemukan',
                    refund: true,
                    vehicles: []
                };
            }

            // Success - return all vehicles
            console.log(`✅ [TerbangBebas] Found ${vehicles.length} vehicle(s) for: ${query}`);

            return {
                success: true,
                vehicles: vehicles,
                totalVehicles: vehicles.length,
                apiStatus: data.status_apikey,
                message: data.message || 'OK',
                refund: false
            };

        } catch (error) {
            console.error('❌ [TerbangBebas] API Error:', error.message);
            return this.handleError(error);
        }
    }

    /**
     * Format single vehicle data for display
     */
    formatVehicle(vehicle, index = 1, total = 1) {
        const wilayah = vehicle.wilayah || '';
        const nopol = vehicle.nopol || '';
        const seri = vehicle.seri || '';
        const platNomor = `${wilayah} ${nopol} ${seri}`.trim() || '-';

        return {
            platNomor,
            wilayah: vehicle.wilayah || '-',
            nopol: vehicle.nopol || '-',
            seri: vehicle.seri || '-',
            alamat: vehicle.alamat || '-',
            nikPemilik: vehicle.NoKTP || '-',
            noKK: vehicle.NoKK || '-',
            noHP: vehicle.NoHP || '-',
            namaPemilik: vehicle.NamaPemilik || '-',
            noRangka: vehicle.NoRangka || '-',
            noMesin: vehicle.NoMesin || '-',
            merk: vehicle.Merk || '-',
            type: vehicle.Type || '-',
            tahunPembuatan: vehicle.TahunPembuatan || '-',
            warna: vehicle.Warna || '-',
            isiCylinder: vehicle.IsiCylinder || '-',
            noBPKB: vehicle.NoBPKB || '-',
            noSTNK: vehicle.NoSTNK || '-',
            tanggalDaftar: vehicle.TanggalDaftar || '-',
            apm: vehicle.APM || '-',
            index,
            total,
            raw: vehicle
        };
    }

    /**
     * Handle various error types
     */
    handleError(error) {
        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
            return {
                success: false,
                error: 'Request timeout, silakan coba lagi',
                refund: true,
                vehicles: []
            };
        }

        if (error.response) {
            return {
                success: false,
                error: `API Error: ${error.response.status}`,
                refund: true,
                vehicles: []
            };
        }

        return {
            success: false,
            error: 'Gagal menghubungi server, silakan coba lagi',
            refund: true,
            vehicles: []
        };
    }
}

module.exports = new TerbangBebasService();
