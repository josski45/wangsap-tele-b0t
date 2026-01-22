/**
 * BPJS Ketenagakerjaan API Service
 * API untuk cek data BPJS Ketenagakerjaan berdasarkan NIK
 * 
 * Endpoint: https://e-plkk.bpjsketenagakerjaan.go.id
 * - Login: /login.bpjs (dengan captcha)
 * - Captcha: /captcha.php
 * - Check: /act/eligble.bpjs
 */

const axios = require('axios');
const https = require('https');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

// BPJS Ketenagakerjaan Configuration
const BPJS_BASE_URL = 'https://e-plkk.bpjsketenagakerjaan.go.id';
const BPJS_LOGIN_URL = `${BPJS_BASE_URL}/login.bpjs`;
const BPJS_CAPTCHA_URL = `${BPJS_BASE_URL}/captcha.php`;
const BPJS_CHECK_URL = `${BPJS_BASE_URL}/act/eligble.bpjs`;

// Multiple OCR API Keys for rotation (bypass rate limit)
const OCR_API_KEYS = [
    'helloworld',           // Free key 1
    'K87899142388957',      // Free key 2
    'K83908818388957',      // Free key 3
    'K81182398588957',      // Free key 4
    'blinkcatch',           // Alternative free key
];
const OCR_API_URL = 'https://api.ocr.space/Parse/Image';
let currentOcrKeyIndex = 0; // Rotate keys

// Session file path
const DATA_DIR = process.env.DATA_DIR || './data';
const BPJS_SESSION_FILE = path.join(DATA_DIR, 'bpjstk_session.json');

// HTTPS Agent
const httpsAgent = new https.Agent({
    rejectUnauthorized: false,
    timeout: 120000,
});

// Random User-Agent list
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
];

class BPJSTKService {
    constructor() {
        this.session = {
            cookies: {},
            userAgent: null,
            lastLogin: null,
            isLoggedIn: false,
            expiresAt: null,
        };
        
        // Credentials dari .env
        this.email = process.env.BPJS_EMAIL || 'info.rsusyifamedika@gmail.com';
        this.password = process.env.BPJS_PASSWORD || 'BPJSTK2023';
        
        // Load session on startup
        this.loadSession();
    }

    /**
     * Get random User-Agent
     */
    getRandomUserAgent() {
        return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    }

    /**
     * Load BPJS session from file
     */
    loadSession() {
        try {
            if (fs.existsSync(BPJS_SESSION_FILE)) {
                const data = fs.readFileSync(BPJS_SESSION_FILE, 'utf8');
                const saved = JSON.parse(data);
                
                if (saved.expiresAt && saved.expiresAt > Date.now()) {
                    this.session = saved;
                    console.log('[BPJSTK] Session loaded from file');
                    return true;
                } else {
                    console.log('[BPJSTK] Saved session expired');
                    fs.unlinkSync(BPJS_SESSION_FILE);
                }
            }
        } catch (error) {
            console.error('[BPJSTK] Error loading session:', error.message);
        }
        return false;
    }

    /**
     * Save BPJS session to file
     */
    saveSession() {
        try {
            if (!fs.existsSync(DATA_DIR)) {
                fs.mkdirSync(DATA_DIR, { recursive: true });
            }
            fs.writeFileSync(BPJS_SESSION_FILE, JSON.stringify(this.session, null, 2), 'utf8');
            console.log('[BPJSTK] Session saved to file');
        } catch (error) {
            console.error('[BPJSTK] Error saving session:', error.message);
        }
    }

    /**
     * Clear session
     */
    clearSession() {
        this.session = {
            cookies: {},
            userAgent: null,
            lastLogin: null,
            isLoggedIn: false,
            expiresAt: null,
        };
        
        try {
            if (fs.existsSync(BPJS_SESSION_FILE)) {
                fs.unlinkSync(BPJS_SESSION_FILE);
            }
        } catch (error) {
            console.error('[BPJSTK] Error deleting session file:', error.message);
        }
    }

    /**
     * Parse Set-Cookie headers
     */
    parseCookies(setCookieHeaders) {
        if (!setCookieHeaders) return;
        const cookies = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
        cookies.forEach(cookie => {
            const parts = cookie.split(';')[0].split('=');
            if (parts.length >= 2) {
                const name = parts[0].trim();
                const value = parts.slice(1).join('=').trim();
                this.session.cookies[name] = value;
            }
        });
    }

    /**
     * Get cookie string
     */
    getCookieString() {
        return Object.entries(this.session.cookies)
            .map(([name, value]) => `${name}=${value}`)
            .join('; ');
    }

    /**
     * Get next OCR API key (rotation)
     */
    getNextOcrKey() {
        const key = OCR_API_KEYS[currentOcrKeyIndex];
        currentOcrKeyIndex = (currentOcrKeyIndex + 1) % OCR_API_KEYS.length;
        return key;
    }

    /**
     * Solve captcha using OCR.space API with key rotation
     */
    async solveCaptcha(imageBuffer) {
        // Try each API key until one works
        for (let attempt = 0; attempt < OCR_API_KEYS.length; attempt++) {
            const apiKey = this.getNextOcrKey();
            console.log(`[BPJSTK] Trying OCR with key: ${apiKey.substring(0, 6)}...`);
            
            try {
                const formData = new FormData();
                formData.append('file', imageBuffer, {
                    filename: 'captcha.png',
                    contentType: 'image/png',
                });
                formData.append('language', 'eng');
                formData.append('isOverlayRequired', 'false');
                formData.append('detectOrientation', 'false');
                formData.append('scale', 'true');
                formData.append('OCREngine', '2');

                const response = await axios.post(OCR_API_URL, formData, {
                    headers: {
                        ...formData.getHeaders(),
                        'apikey': apiKey,
                    },
                    timeout: 30000,
                });

                const result = response.data;

                // Check if rate limited
                if (result.ErrorMessage && result.ErrorMessage.includes('rate limit')) {
                    console.log(`[BPJSTK] OCR key ${apiKey.substring(0, 6)}... rate limited, trying next...`);
                    continue;
                }

                if (result.OCRExitCode === 1 && result.ParsedResults?.[0]?.ParsedText) {
                    const captchaText = result.ParsedResults[0].ParsedText
                        .replace(/[\r\n\s]/g, '')
                        .toLowerCase()
                        .trim();

                    console.log(`[BPJSTK] Captcha solved: "${captchaText}"`);
                    return { success: true, text: captchaText };
                }

                return { success: false, error: 'OCR failed to parse captcha' };
            } catch (error) {
                console.error(`[BPJSTK] OCR Error with key ${apiKey.substring(0, 6)}...:`, error.message);
                // Try next key on error
                continue;
            }
        }
        
        return { success: false, error: 'All OCR API keys exhausted' };
    }

    /**
     * Step 1: Get session cookies
     */
    async getSession() {
        console.log('[BPJSTK] Getting session...');
        
        this.session.userAgent = this.getRandomUserAgent();
        this.session.cookies = {};

        const response = await axios.get(BPJS_LOGIN_URL, {
            headers: {
                'User-Agent': this.session.userAgent,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
            httpsAgent,
            timeout: 30000,
            validateStatus: () => true,
        });

        this.parseCookies(response.headers['set-cookie']);
        console.log(`[BPJSTK] Got cookies: ${Object.keys(this.session.cookies).join(', ')}`);
        return { success: true };
    }

    /**
     * Step 2: Get captcha image
     */
    async getCaptcha() {
        console.log('[BPJSTK] Getting captcha...');

        const response = await axios.get(BPJS_CAPTCHA_URL, {
            headers: {
                'User-Agent': this.session.userAgent,
                'Accept': 'image/*',
                'Referer': BPJS_LOGIN_URL,
                'Cookie': this.getCookieString(),
            },
            httpsAgent,
            responseType: 'arraybuffer',
            timeout: 30000,
            validateStatus: () => true,
        });

        this.parseCookies(response.headers['set-cookie']);
        console.log(`[BPJSTK] Got captcha: ${response.data.length} bytes`);
        return { success: true, imageBuffer: Buffer.from(response.data) };
    }

    /**
     * Step 3: Submit login
     */
    async submitLogin(captcha) {
        console.log('[BPJSTK] Submitting login...');

        const payload = new URLSearchParams({
            'vc': '',
            'emailppk': this.email,
            'pass': this.password,
            'captcha': captcha,
            'submit': 'Log In'
        });

        const response = await axios.post(BPJS_LOGIN_URL, payload.toString(), {
            headers: {
                'User-Agent': this.session.userAgent,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Content-Type': 'application/x-www-form-urlencoded',
                'Origin': BPJS_BASE_URL,
                'Referer': BPJS_LOGIN_URL,
                'Cookie': this.getCookieString(),
            },
            httpsAgent,
            timeout: 30000,
            maxRedirects: 0,
            validateStatus: () => true,
        });

        this.parseCookies(response.headers['set-cookie']);

        const html = typeof response.data === 'string' ? response.data : '';

        // Check for errors
        const hasError = html.includes('Silahkan Login ulang') ||
            html.includes('error=') ||
            html.includes('Captcha salah') ||
            html.includes('captcha tidak valid') ||
            html.includes('Password salah');

        if (hasError) {
            const hasCaptchaError = html.includes('Captcha') || html.includes('captcha');
            console.log(`[BPJSTK] Login failed - ${hasCaptchaError ? 'Wrong captcha' : 'Error'}`);
            return { success: false, wrongCaptcha: hasCaptchaError };
        }

        // Check success
        const isSuccess = html.includes('dashboard') ||
            html.includes('eligble.bpjs') ||
            html.includes('Logout') ||
            html.includes('Selamat Datang') ||
            (response.status === 302 && response.headers['location'] && !response.headers['location'].includes('login'));

        if (isSuccess) {
            this.session.isLoggedIn = true;
            this.session.lastLogin = Date.now();
            this.session.expiresAt = Date.now() + (60 * 60 * 1000); // 60 minutes
            this.saveSession();
            console.log('[BPJSTK] Login successful!');
            return { success: true };
        }

        console.log('[BPJSTK] Login failed - Unknown response');
        return { success: false, wrongCaptcha: false };
    }

    /**
     * Auto-login with OCR captcha
     */
    async autoLogin(maxRetries = 10) {
        console.log(`[BPJSTK] Starting auto-login (max ${maxRetries} retries)...`);

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            console.log(`[BPJSTK] Attempt ${attempt}/${maxRetries}`);

            try {
                // Step 1: Get session
                await this.getSession();

                // Step 2: Get captcha
                const captchaResult = await this.getCaptcha();
                if (!captchaResult.success) continue;

                // Step 3: Solve captcha
                const ocrResult = await this.solveCaptcha(captchaResult.imageBuffer);
                if (!ocrResult.success) continue;

                // Step 4: Submit login
                const loginResult = await this.submitLogin(ocrResult.text);
                if (loginResult.success) {
                    return { success: true };
                }

                // Wrong captcha - retry
                if (loginResult.wrongCaptcha) {
                    console.log('[BPJSTK] Wrong captcha, retrying...');
                    continue;
                }

            } catch (error) {
                console.error(`[BPJSTK] Attempt ${attempt} error:`, error.message);
            }

            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        return { success: false, error: 'Login gagal setelah beberapa percobaan' };
    }

    /**
     * Internal: Check BPJS data
     */
    async checkDataInternal(nik) {
        const now = new Date();
        const day = String(now.getDate()).padStart(2, '0');
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const year = now.getFullYear();
        const currentDate = `${day}-${month}-${year}`;
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const currentTime = `${hours}:${minutes}`;

        const payload = new URLSearchParams({
            'tgl_berobat': currentDate,
            'kpj': nik,
            'tgl': currentDate,
            'jamKecelakaan': currentTime,
            'jenisKasusParam': 'KS01'
        });

        const response = await axios.post(BPJS_CHECK_URL, payload.toString(), {
            headers: {
                'User-Agent': this.session.userAgent || this.getRandomUserAgent(),
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Content-Type': 'application/x-www-form-urlencoded',
                'Origin': BPJS_BASE_URL,
                'Referer': `${BPJS_BASE_URL}/form/eligble.bpjs`,
                'X-Requested-With': 'XMLHttpRequest',
                'Cookie': this.getCookieString(),
            },
            httpsAgent,
            timeout: 60000,
            maxRedirects: 0,
            validateStatus: (status) => status < 400 || status === 302,
        });

        const html = response.data;

        // Check if needs re-login
        if (
            (html.includes('window.location') && html.includes('login.bpjs')) ||
            html.includes('Silahkan Login ulang') ||
            html.includes('id="captcha"') ||
            html.includes('name="captcha"') ||
            html.includes('formLogin')
        ) {
            return { needsRelogin: true };
        }

        // Parse data from response HTML
        const dataMatch = html.match(/var\s+data\s*=\s*(\[[\s\S]*?\]);/);

        if (!dataMatch) {
            if (
                html.includes('Data Tidak Ditemukan') ||
                html.includes('tidak ditemukan') ||
                html.includes('belum dapat dilakukan') ||
                html.includes('data peserta yang diinput')
            ) {
                return {
                    success: false,
                    error: 'Data BPJS Ketenagakerjaan tidak ditemukan untuk NIK ini.',
                    refund: true
                };
            }

            return {
                success: false,
                error: 'Data tidak ditemukan',
                refund: true
            };
        }

        // Parse JSON
        let bpjsData;
        try {
            bpjsData = JSON.parse(dataMatch[1]);
        } catch (parseError) {
            return {
                success: false,
                error: 'Gagal parsing data BPJS',
                refund: true
            };
        }

        if (!Array.isArray(bpjsData)) {
            bpjsData = [bpjsData];
        }

        if (bpjsData.length === 0) {
            return {
                success: false,
                error: 'Data tidak ditemukan',
                refund: true
            };
        }

        console.log(`[BPJSTK] SUCCESS - Found ${bpjsData.length} record(s)`);

        return {
            success: true,
            data: bpjsData,
            count: bpjsData.length
        };
    }

    /**
     * Check if session is valid
     */
    isSessionValid() {
        return this.session.isLoggedIn && 
               this.session.expiresAt && 
               Date.now() < this.session.expiresAt &&
               Object.keys(this.session.cookies).length > 0;
    }

    /**
     * Check BPJS Ketenagakerjaan by NIK
     */
    async checkByNIK(nik) {
        console.log(`[BPJSTK] Checking NIK: ${nik}`);

        try {
            // IMPORTANT: Login first if no valid session
            if (!this.isSessionValid()) {
                console.log('[BPJSTK] No valid session, logging in first...');
                const loginResult = await this.autoLogin(3);
                
                if (!loginResult.success) {
                    return {
                        success: false,
                        error: 'Gagal login ke BPJS Ketenagakerjaan. Silakan coba lagi.',
                        refund: true
                    };
                }
            }

            // Now check data
            let result = await this.checkDataInternal(nik);

            // If session expired during check, auto-login and retry
            if (result.needsRelogin) {
                console.log('[BPJSTK] Session expired during check, re-logging in...');
                this.clearSession();

                const loginResult = await this.autoLogin(3);

                if (!loginResult.success) {
                    return {
                        success: false,
                        error: 'Gagal login ke BPJS Ketenagakerjaan. Silakan coba lagi.',
                        refund: true
                    };
                }

                // Retry data check
                console.log('[BPJSTK] Login successful, retrying...');
                result = await this.checkDataInternal(nik);
            }

            return result;

        } catch (error) {
            console.error('[BPJSTK] Error:', error.message);

            if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
                return {
                    success: false,
                    error: 'Request timeout - Server BPJS tidak merespon',
                    refund: true
                };
            }

            if (error.response?.status === 403) {
                return {
                    success: false,
                    error: 'Akses diblokir oleh BPJS. Silakan coba lagi nanti.',
                    refund: true
                };
            }

            return {
                success: false,
                error: error.message || 'Terjadi kesalahan sistem',
                refund: true
            };
        }
    }
}

module.exports = new BPJSTKService();
