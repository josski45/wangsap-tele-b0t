const axios = require('axios');
const https = require('https');
const config = require('../config');

/**
 * Satsiber API Service - NIK to Photo with Queue System
 * Rate Limit: 3 requests per minute (1 request every 20 seconds)
 */

// API Configuration
const API_BASE_URL = 'https://access.satsiber.it';
const API_AUTH = 'Basic eW9naTpZb2dpQDk5OQ==';

// HTTPS Agent
const httpsAgent = new https.Agent({
    rejectUnauthorized: false
});

// Common headers
const browserHeaders = {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.6',
    'Authorization': API_AUTH,
    'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36',
    'sec-ch-ua-mobile': '?1',
    'sec-fetch-dest': 'document',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': 'none',
    'sec-fetch-user': '?1',
    'sec-gpc': '1',
    'upgrade-insecure-requests': '1',
    'priority': 'u=0, i'
};

// Queue configuration
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 3;
const MIN_DELAY_BETWEEN_REQUESTS = 20000; // 20 seconds

// Queue state
const requestQueue = [];
let isProcessingQueue = false;
let requestTimestamps = [];

/**
 * Sleep helper
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if we can make a request
 */
function canMakeRequest() {
    const now = Date.now();
    requestTimestamps = requestTimestamps.filter(ts => now - ts < RATE_LIMIT_WINDOW_MS);
    return requestTimestamps.length < MAX_REQUESTS_PER_WINDOW;
}

/**
 * Get wait time until next slot
 */
function getWaitTime() {
    if (requestTimestamps.length < MAX_REQUESTS_PER_WINDOW) {
        if (requestTimestamps.length > 0) {
            const lastRequest = requestTimestamps[requestTimestamps.length - 1];
            const timeSinceLastRequest = Date.now() - lastRequest;
            if (timeSinceLastRequest < MIN_DELAY_BETWEEN_REQUESTS) {
                return MIN_DELAY_BETWEEN_REQUESTS - timeSinceLastRequest;
            }
        }
        return 0;
    }
    
    const oldestTimestamp = requestTimestamps[0];
    const waitUntil = oldestTimestamp + RATE_LIMIT_WINDOW_MS;
    return Math.max(0, waitUntil - Date.now()) + 1000;
}

/**
 * Record a request
 */
function recordRequest() {
    requestTimestamps.push(Date.now());
}

/**
 * Queue a request
 */
function queueRequest(requestFn, onQueueUpdate = null) {
    return new Promise((resolve, reject) => {
        const queueItem = { fn: requestFn, resolve, reject, onQueueUpdate };
        requestQueue.push(queueItem);
        
        // Notify about queue position
        if (onQueueUpdate) {
            onQueueUpdate({
                position: requestQueue.length,
                estimatedWait: getEstimatedWaitTime()
            });
        }
        
        processQueue();
    });
}

/**
 * Process queue with rate limiting
 */
async function processQueue() {
    if (isProcessingQueue) return;
    isProcessingQueue = true;
    
    while (requestQueue.length > 0) {
        // Wait for rate limit slot
        while (!canMakeRequest()) {
            const waitTime = getWaitTime();
            console.log(`[SATSIBER_QUEUE] Rate limit active, waiting ${Math.ceil(waitTime / 1000)}s...`);
            await sleep(waitTime);
        }
        
        // Check minimum delay
        const waitTime = getWaitTime();
        if (waitTime > 0) {
            console.log(`[SATSIBER_QUEUE] Waiting ${Math.ceil(waitTime / 1000)}s before next request...`);
            await sleep(waitTime);
        }
        
        const item = requestQueue.shift();
        if (!item) continue;
        
        // Notify remaining queue items about their new position
        requestQueue.forEach((queuedItem, index) => {
            if (queuedItem.onQueueUpdate) {
                queuedItem.onQueueUpdate({
                    position: index + 1,
                    estimatedWait: getEstimatedWaitTime()
                });
            }
        });
        
        try {
            recordRequest();
            const result = await item.fn();
            item.resolve(result);
        } catch (error) {
            item.reject(error);
        }
    }
    
    isProcessingQueue = false;
}

/**
 * Get queue status
 */
function getQueueStatus() {
    const now = Date.now();
    requestTimestamps = requestTimestamps.filter(ts => now - ts < RATE_LIMIT_WINDOW_MS);
    
    return {
        queueLength: requestQueue.length,
        requestsInWindow: requestTimestamps.length,
        maxRequestsPerWindow: MAX_REQUESTS_PER_WINDOW,
        canMakeRequest: canMakeRequest(),
        waitTime: getWaitTime(),
        isProcessing: isProcessingQueue
    };
}

/**
 * Get estimated wait time
 */
function getEstimatedWaitTime() {
    const status = getQueueStatus();
    const baseWait = status.queueLength * MIN_DELAY_BETWEEN_REQUESTS;
    const rateWait = status.waitTime;
    return Math.max(baseWait, rateWait);
}

/**
 * Search NIK - Internal
 */
async function searchNikInternal(nik) {
    const requestId = `satsiber_${Date.now()}`;
    console.log(`[SATSIBER_API] [${requestId}] Searching NIK: ${nik.substring(0, 6)}***`);
    
    try {
        const response = await axios.get(`${API_BASE_URL}/nikfoto`, {
            params: { query: nik },
            headers: browserHeaders,
            httpsAgent,
            timeout: 60000
        });
        
        console.log(`[SATSIBER_API] [${requestId}] Response status: ${response.status}`);
        console.log(`[SATSIBER_API] [${requestId}] Response data:`, JSON.stringify(response.data).substring(0, 500));
        
        // Log photo-related fields specifically
        if (response.data?.message) {
            const msg = response.data.message;
            console.log(`[SATSIBER_API] [${requestId}] Photo fields - image_desc: ${msg.image_desc}, photo_path: ${msg.photo_path ? 'EXISTS' : 'EMPTY'}`);
        }
        
        return response.data;
    } catch (error) {
        console.error(`[SATSIBER_API] [${requestId}] Error:`, error.message);
        
        // Sanitize error message
        let errorMsg = 'Terjadi kesalahan pada server';
        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
            errorMsg = 'Request timeout, silakan coba lagi';
        } else if (error.code === 'ECONNREFUSED') {
            errorMsg = 'Server tidak dapat dihubungi';
        } else if (error.response?.status === 429) {
            errorMsg = 'Rate limit tercapai, silakan tunggu beberapa saat';
        } else if (error.response?.status === 401) {
            errorMsg = 'Autentikasi gagal';
        } else if (error.response?.status >= 500) {
            errorMsg = 'Server sedang bermasalah';
        }
        
        return {
            status: false,
            message: errorMsg
        };
    }
}

/**
 * Download image from URL
 */
async function downloadImage(url) {
    try {
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': browserHeaders['User-Agent'],
                'Authorization': API_AUTH
            },
            httpsAgent,
            timeout: 60000
        });
        
        return {
            success: true,
            buffer: Buffer.from(response.data)
        };
    } catch (error) {
        console.error('[SATSIBER_API] Error downloading image:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * NIK TO PHOTO - Main function
 * @param {string} nik - 16-digit NIK
 * @param {Function} onQueueUpdate - Callback for queue updates
 * @returns {Promise<Object>}
 */
async function requestNikToPhoto(nik, onQueueUpdate = null) {
    // Queue the request
    const data = await queueRequest(() => searchNikInternal(nik), onQueueUpdate);
    
    // Handle API response
    if (!data.status) {
        return {
            status: 'error',
            message: data.message || 'API Error',
            data: null,
            refund: true
        };
    }
    
    // Extract data from message object
    const result = data.message;
    
    // Check if data exists
    if (!result || !result.nik) {
        return {
            status: 'not_found',
            message: 'Data tidak ditemukan untuk NIK tersebut',
            data: null,
            refund: true
        };
    }
    
    // Check if photo is available (just check photo_path exists)
    const hasPhoto = !!(result.photo_path && result.photo_path.trim());
    
    if (!hasPhoto) {
        return {
            status: 'no_photo',
            message: 'Data ditemukan tapi foto tidak tersedia',
            data: {
                nama: result.nama,
                nik: result.nik,
                no_kk: result.no_kk,
                tempat_lahir: result.tempat_lahir,
                tanggal_lahir: result.tanggal_lahir,
                agama: result.agama,
                status_kawin: result.status_kawin,
                pekerjaan: result.pekerjaan,
                pendidikan: result.pendidikan,
                provinsi: result.provinsi,
                kabupaten: result.kabupaten,
                kecamatan: result.kecamatan,
                kelurahan: result.kelurahan,
                alamat: result.alamat,
                nama_ibu: result.nama_ibu,
                nama_ayah: result.nama_ayah
            },
            remaining: data.remaining,
            refund: false
        };
    }
    
    // Download photo
    const imageResult = await downloadImage(result.photo_path);
    
    if (!imageResult.success) {
        return {
            status: 'download_error',
            message: 'Gagal mengunduh foto',
            data: {
                nama: result.nama,
                nik: result.nik,
                no_kk: result.no_kk,
                tempat_lahir: result.tempat_lahir,
                tanggal_lahir: result.tanggal_lahir,
                agama: result.agama,
                status_kawin: result.status_kawin,
                pekerjaan: result.pekerjaan,
                pendidikan: result.pendidikan,
                provinsi: result.provinsi,
                kabupaten: result.kabupaten,
                kecamatan: result.kecamatan,
                kelurahan: result.kelurahan,
                alamat: result.alamat,
                nama_ibu: result.nama_ibu,
                nama_ayah: result.nama_ayah
            },
            remaining: data.remaining,
            refund: false
        };
    }
    
    return {
        status: 'success',
        message: 'Data dan foto ditemukan',
        data: {
            nama: result.nama,
            nik: result.nik,
            no_kk: result.no_kk,
            tempat_lahir: result.tempat_lahir,
            tanggal_lahir: result.tanggal_lahir,
            agama: result.agama,
            status_kawin: result.status_kawin,
            pekerjaan: result.pekerjaan,
            pendidikan: result.pendidikan,
            provinsi: result.provinsi,
            kabupaten: result.kabupaten,
            kecamatan: result.kecamatan,
            kelurahan: result.kelurahan,
            alamat: result.alamat,
            nama_ibu: result.nama_ibu,
            nama_ayah: result.nama_ayah,
            photoBuffer: imageResult.buffer,
            originalPhotoUrl: result.photo_path
        },
        remaining: data.remaining,
        level: data.level,
        refund: false
    };
}

module.exports = {
    requestNikToPhoto,
    getQueueStatus,
    getEstimatedWaitTime,
    downloadImage
};
