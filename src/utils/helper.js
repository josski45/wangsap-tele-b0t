const config = require('../config');

/**
 * Helper utilities untuk Telegram Bot
 */

// Rate limiter storage
const rateLimitMap = new Map();

/**
 * Format angka ke format Rupiah
 */
function formatRupiah(amount) {
    return 'Rp ' + amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Format tanggal
 */
function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

/**
 * Validasi NIK (16 digit)
 */
function isValidNIK(nik) {
    if (!nik) return false;
    const cleanNik = nik.replace(/\D/g, '');
    return cleanNik.length === 16;
}

/**
 * Validasi nomor KK (16 digit)
 */
function isValidKK(kk) {
    if (!kk) return false;
    const cleanKk = kk.replace(/\D/g, '');
    return cleanKk.length === 16;
}

/**
 * Check if user is owner
 */
function isOwner(userId) {
    return config.isOwner(userId);
}

/**
 * Rate limiter
 */
const rateLimiter = {
    check(userId, maxRequests = 30, windowMs = 60000) {
        const key = String(userId);
        const now = Date.now();
        
        if (!rateLimitMap.has(key)) {
            rateLimitMap.set(key, { count: 1, startTime: now });
            return true;
        }
        
        const data = rateLimitMap.get(key);
        
        if (now - data.startTime > windowMs) {
            rateLimitMap.set(key, { count: 1, startTime: now });
            return true;
        }
        
        if (data.count >= maxRequests) {
            return false;
        }
        
        data.count++;
        return true;
    }
};

/**
 * Delay function
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Escape HTML characters
 */
function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * Censor NIK (tampilkan sebagian)
 */
function censorNIK(nik) {
    if (!nik || nik.length < 16) return nik;
    return nik.slice(0, 6) + '******' + nik.slice(-4);
}

/**
 * Censor nama (tampilkan sebagian)
 */
function censorName(name) {
    if (!name || name.length < 3) return name;
    const words = name.split(' ');
    return words.map(word => {
        if (word.length <= 2) return word;
        return word[0] + '*'.repeat(word.length - 2) + word[word.length - 1];
    }).join(' ');
}

/**
 * Generate random string
 */
function generateRandomString(length = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

/**
 * Parse command arguments
 */
function parseArgs(text) {
    if (!text) return [];
    return text.trim().split(/\s+/).filter(arg => arg.length > 0);
}

/**
 * Get user display name from Telegram message
 */
function getUserDisplayName(from) {
    if (from.first_name && from.last_name) {
        return `${from.first_name} ${from.last_name}`;
    }
    return from.first_name || from.username || 'User';
}

module.exports = {
    formatRupiah,
    formatDate,
    isValidNIK,
    isValidKK,
    isOwner,
    rateLimiter,
    delay,
    escapeHtml,
    censorNIK,
    censorName,
    generateRandomString,
    parseArgs,
    getUserDisplayName
};
