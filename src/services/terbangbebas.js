/**
 * Vehicle Lookup API Service
 * For vehicle lookups: nopol, noka, nosin, nik
 * 
 * NEW API: Google Apps Script
 * OLD API (disabled): https://apiv2.terbangbebas.cyou/
 */
const axios = require('axios');
const config = require('../config');
const db = require('../database');

class TerbangBebasService {
    constructor() {
        // ===== OLD TerbangBebas API (disabled) =====
        // this.baseUrl = 'https://apiv2.terbangbebas.cyou';
        // this.defaultTimeout = 60000;
        // ===== END OLD API =====

        // ===== NEW Google Apps Script API =====
        this.baseUrl = 'https://script.google.com/macros/s/AKfycbwRRyawDaC7AEJQE4u0aiTVSNWW4foVaqXkqHa_B6TCS_YJZzT7FJWTHod5F2kErqyaRQ/exec';
        this.defaultTimeout = 120000; // 2 menit, Google Script lebih lambat
        // ===== END NEW API =====
    }

    /**
     * Get API key from database or config
     */
    getApiKey() {
        const settings = db.getAllSettings();
        // ===== OLD API KEY (disabled) =====
        // return settings.terbangbebas_api_key || config.terbangbebasApiKey || 'bb1939cc65b3f5dc732c8f94ce14bc92';
        // ===== END OLD API KEY =====
        return settings.terbangbebas_api_key || config.terbangbebasApiKey || '911b74942ec4fcf944dca6cc322022f';
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
     * Normalize vehicle data fields from new API to match old format
     * New API uses: SeriWilayah, Nopol, Seri, Alamat, PlatNomor
     * Old API used: wilayah, nopol, seri, alamat
     */
    normalizeVehicle(vehicle) {
        // Parse PlatNomor (e.g. "T-6258-NP") to extract wilayah, nopol, seri
        if (vehicle.PlatNomor) {
            const parts = vehicle.PlatNomor.split('-');
            if (parts.length >= 2) {
                vehicle.wilayah = vehicle.wilayah || vehicle.SeriWilayah || parts[0] || '';
                vehicle.nopol = vehicle.nopol || parts[1] || '';
                vehicle.seri = vehicle.seri || (parts.length >= 3 ? parts[2] : '') || '';
            }
        }
        
        // Map new field names to old field names (for backward compatibility with formatters)
        if (!vehicle.wilayah && vehicle.SeriWilayah) vehicle.wilayah = vehicle.SeriWilayah;
        if (!vehicle.nopol && vehicle.Nopol) vehicle.nopol = vehicle.Nopol;
        if (!vehicle.seri && vehicle.Seri) vehicle.seri = vehicle.Seri;
        if (!vehicle.alamat && vehicle.Alamat) vehicle.alamat = vehicle.Alamat;
        
        return vehicle;
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
        return await this.search(noka, 'noka');
    }

    /**
     * Search by NoMesin
     */
    async searchByNosin(nosin) {
        return await this.search(nosin, 'nosin');
    }

    /**
     * Search vehicles by NIK (can return multiple vehicles)
     */
    async searchByNik(nik) {
        return await this.search(nik, 'nik');
    }

    /**
     * Generic search function
     */
    async search(query, endpoint = 'nopol') {
        try {
            const apiKey = this.getApiKey();
            
            // ===== OLD TerbangBebas URL (disabled) =====
            // const url = `${this.baseUrl}/?apikey=${apiKey}&endpoint=${endpoint}&query=${encodeURIComponent(query)}&bypass=1`;
            // ===== END OLD URL =====
            
            // ===== NEW Google Apps Script URL =====
            const url = `${this.baseUrl}?apikey=${apiKey}&endpoint=${endpoint}&keyword=${encodeURIComponent(query)}`;
            // ===== END NEW URL =====

            console.log(`🚗 [VehicleLookup] Searching ${endpoint}: ${query}`);

            const response = await axios.get(url, {
                timeout: this.defaultTimeout,
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                // Google Apps Script redirects, need to follow
                maxRedirects: 5
            });

            const data = response.data;

            // ===== OLD response parsing (disabled) =====
            // if (!data.result || data.result.length === 0) {
            //     return { success: false, error: data.message || 'Data tidak ditemukan', refund: true, vehicles: [] };
            // }
            // const vehicles = data.result.filter(item => item !== null && typeof item === 'object');
            // ===== END OLD parsing =====

            // ===== NEW response parsing =====
            // New API returns: { success: true, data: [...], informasi: "...", requests_today: N, limit: N }
            if (!data.success || !data.data || data.data.length === 0) {
                return {
                    success: false,
                    error: data.informasi || data.message || 'Data tidak ditemukan',
                    refund: true,
                    vehicles: []
                };
            }

            // Normalize field names for backward compatibility with formatters
            const vehicles = data.data
                .filter(item => item !== null && typeof item === 'object')
                .map(v => this.normalizeVehicle(v));
            // ===== END NEW parsing =====
            
            if (vehicles.length === 0) {
                return {
                    success: false,
                    error: 'Data tidak ditemukan',
                    refund: true,
                    vehicles: []
                };
            }

            // Success - return all vehicles
            console.log(`✅ [VehicleLookup] Found ${vehicles.length} vehicle(s) for ${endpoint}: ${query}`);

            return {
                success: true,
                vehicles: vehicles,
                totalVehicles: vehicles.length,
                apiInfo: data.informasi || '',
                requestsToday: data.requests_today || 0,
                apiLimit: data.limit || 0,
                message: data.informasi || 'OK',
                refund: false
            };

        } catch (error) {
            console.error('❌ [VehicleLookup] API Error:', error.message);
            return this.handleError(error);
        }
    }

    /**
     * Format single vehicle data for display
     */
    formatVehicle(vehicle, index = 1, total = 1) {
        const wilayah = vehicle.wilayah || vehicle.SeriWilayah || '';
        const nopol = vehicle.nopol || vehicle.Nopol || '';
        const seri = vehicle.seri || vehicle.Seri || '';
        const platNomor = vehicle.PlatNomor || `${wilayah} ${nopol} ${seri}`.trim() || '-';

        return {
            platNomor,
            wilayah: vehicle.wilayah || vehicle.SeriWilayah || '-',
            nopol: vehicle.nopol || vehicle.Nopol || '-',
            seri: vehicle.seri || vehicle.Seri || '-',
            alamat: vehicle.alamat || vehicle.Alamat || '-',
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
                error: 'Request timeout, silakan coba lagi (Google Script lambat, coba lagi)',
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
