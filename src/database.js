const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const config = require('./config');

// Pastikan folder data ada
const dataFolder = path.join(__dirname, '..', config.dataFolder);
if (!fs.existsSync(dataFolder)) {
    fs.mkdirSync(dataFolder, { recursive: true });
}

const dbPath = path.join(dataFolder, 'database.db');

let db;
let SQL;

// Initialize database
async function initialize() {
    if (db) return;
    
    SQL = await initSqlJs();
    
    try {
        if (fs.existsSync(dbPath)) {
            const buffer = fs.readFileSync(dbPath);
            db = new SQL.Database(buffer);
            console.log('📂 Database loaded from file');
        } else {
            db = new SQL.Database();
            console.log('📂 New database created');
        }
    } catch (error) {
        console.error('Error loading database:', error);
        db = new SQL.Database();
    }
    
    createTables();
}

// Save database to file
function saveDb() {
    if (!db) return;
    try {
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(dbPath, buffer);
    } catch (error) {
        console.error('Error saving database:', error);
    }
}

// Auto-save every 5 seconds
setInterval(saveDb, 5000);

// Save on exit
process.on('exit', saveDb);
process.on('SIGINT', () => {
    saveDb();
    process.exit();
});

// Execute query wrapper
function exec(sql) {
    if (!db) throw new Error('Database not initialized');
    db.run(sql);
    saveDb();
}

// Prepare statement wrapper
function prepare(sql) {
    if (!db) throw new Error('Database not initialized');
    return {
        run: (...params) => {
            const stmt = db.prepare(sql);
            stmt.bind(params);
            stmt.step();
            const lastId = db.exec('SELECT last_insert_rowid() as id')[0]?.values[0]?.[0];
            stmt.free();
            saveDb();
            return { lastInsertRowid: lastId };
        },
        get: (...params) => {
            const stmt = db.prepare(sql);
            stmt.bind(params);
            const result = stmt.step() ? stmt.getAsObject() : null;
            stmt.free();
            return result;
        },
        all: (...params) => {
            const stmt = db.prepare(sql);
            stmt.bind(params);
            const results = [];
            while (stmt.step()) {
                results.push(stmt.getAsObject());
            }
            stmt.free();
            return results;
        }
    };
}

// Generate unique request ID
function generateRequestId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Create tables
function createTables() {
    // Users table - using Telegram user_id
    exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT UNIQUE NOT NULL,
            username TEXT,
            first_name TEXT,
            token_balance INTEGER DEFAULT 0,
            total_spent INTEGER DEFAULT 0,
            total_checks INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Deposits table
    exec(`
        CREATE TABLE IF NOT EXISTS deposits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            amount INTEGER NOT NULL,
            token_amount INTEGER NOT NULL,
            status TEXT DEFAULT 'pending',
            approved_by TEXT,
            cashi_order_id TEXT,
            cashi_checkout_url TEXT,
            cashi_expires_at TEXT,
            payment_method TEXT DEFAULT 'manual',
            message_id TEXT,
            chat_id TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(user_id)
        )
    `);

    // Transactions table
    exec(`
        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            type TEXT NOT NULL,
            amount REAL NOT NULL,
            description TEXT,
            reference TEXT,
            status TEXT DEFAULT 'success',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(user_id)
        )
    `);

    // API requests table
    exec(`
        CREATE TABLE IF NOT EXISTS api_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            request_id TEXT UNIQUE NOT NULL,
            user_id TEXT NOT NULL,
            command TEXT NOT NULL,
            query TEXT,
            api_type TEXT,
            token_cost REAL DEFAULT 0,
            status TEXT DEFAULT 'pending',
            response_summary TEXT,
            response_data TEXT,
            api_remaining TEXT,
            error_message TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(user_id)
        )
    `);

    // Settings table
    exec(`
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // ═══════════════════════════════════════════
    // REFERRAL SYSTEM TABLES
    // ═══════════════════════════════════════════
    
    // Referrals table - Track who invited who
    exec(`
        CREATE TABLE IF NOT EXISTS referrals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            referrer_id TEXT NOT NULL,
            referred_id TEXT UNIQUE NOT NULL,
            bonus_claimed INTEGER DEFAULT 0,
            bonus_amount INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            bonus_claimed_at DATETIME,
            FOREIGN KEY (referrer_id) REFERENCES users(user_id),
            FOREIGN KEY (referred_id) REFERENCES users(user_id)
        )
    `);

    // Referral codes table - Each user has unique code
    exec(`
        CREATE TABLE IF NOT EXISTS referral_codes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT UNIQUE NOT NULL,
            code TEXT UNIQUE NOT NULL,
            total_referrals INTEGER DEFAULT 0,
            total_bonus_earned INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(user_id)
        )
    `);
}

// ═══════════════════════════════════════════
// USER FUNCTIONS
// ═══════════════════════════════════════════

function getUser(userId) {
    return prepare('SELECT * FROM users WHERE user_id = ?').get(String(userId));
}

function createUser(userId, username = null, firstName = null) {
    prepare('INSERT OR IGNORE INTO users (user_id, username, first_name) VALUES (?, ?, ?)')
        .run(String(userId), username, firstName);
    return getUser(userId);
}

function getOrCreateUser(userId, username = null, firstName = null) {
    let user = getUser(userId);
    if (!user) {
        user = createUser(userId, username, firstName);
    } else if ((username || firstName) && (user.username !== username || user.first_name !== firstName)) {
        prepare('UPDATE users SET username = ?, first_name = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?')
            .run(username, firstName, String(userId));
        user = getUser(userId);
    }
    return user;
}

function updateTokenBalance(userId, amount) {
    prepare('UPDATE users SET token_balance = token_balance + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?')
        .run(amount, String(userId));
    const user = getUser(userId);
    return user?.token_balance || 0;
}

function deductTokens(userId, amount) {
    prepare('UPDATE users SET token_balance = token_balance - ?, total_checks = total_checks + 1, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?')
        .run(amount, String(userId));
}

function refundTokens(userId, amount) {
    prepare('UPDATE users SET token_balance = token_balance + ?, total_checks = total_checks - 1, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?')
        .run(amount, String(userId));
}

function getAllUsers() {
    return prepare('SELECT * FROM users ORDER BY created_at DESC').all();
}

// ═══════════════════════════════════════════
// DEPOSIT FUNCTIONS
// ═══════════════════════════════════════════

function createDeposit(userId, amount, tokenAmount, paymentMethod = 'manual', cashiData = null) {
    const result = prepare(`
        INSERT INTO deposits (user_id, amount, token_amount, payment_method, cashi_order_id, cashi_checkout_url, cashi_expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
        String(userId),
        amount,
        tokenAmount,
        paymentMethod,
        cashiData?.orderId || null,
        cashiData?.checkoutUrl || null,
        cashiData?.expiresAt || null
    );
    return result.lastInsertRowid;
}

function getPendingDeposits() {
    return prepare("SELECT * FROM deposits WHERE status = 'pending' ORDER BY created_at DESC").all();
}

function approveDeposit(depositId, approvedBy) {
    const deposit = prepare('SELECT * FROM deposits WHERE id = ? AND status = ?').get(depositId, 'pending');
    if (!deposit) return null;

    prepare("UPDATE deposits SET status = 'approved', approved_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(approvedBy, depositId);
    
    updateTokenBalance(deposit.user_id, deposit.token_amount);
    createTransaction(deposit.user_id, 'deposit', deposit.token_amount, `Deposit approved`, null, 'success');
    
    // Process referral bonus if applicable (deposit >= 100 tokens)
    const referralResult = processReferralBonus(deposit.user_id, deposit.token_amount);
    
    return { ...deposit, referralBonus: referralResult };
}

function rejectDeposit(depositId) {
    prepare("UPDATE deposits SET status = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(depositId);
}

function getDeposit(depositId) {
    return prepare('SELECT * FROM deposits WHERE id = ?').get(depositId);
}

function getDepositByOrderId(orderId) {
    return prepare('SELECT * FROM deposits WHERE cashi_order_id = ?').get(orderId);
}

// ═══════════════════════════════════════════
// TRANSACTION FUNCTIONS
// ═══════════════════════════════════════════

function createTransaction(userId, type, amount, description, reference = null, status = 'success') {
    prepare('INSERT INTO transactions (user_id, type, amount, description, reference, status) VALUES (?, ?, ?, ?, ?, ?)')
        .run(String(userId), type, amount, description, reference, status);
}

function getUserTransactions(userId, limit = 10) {
    return prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?').all(String(userId), limit);
}

// ═══════════════════════════════════════════
// API REQUEST FUNCTIONS
// ═══════════════════════════════════════════

function createApiRequest(userId, command, query, apiType, tokenCost) {
    const requestId = `REQ-${generateRequestId()}`;
    prepare('INSERT INTO api_requests (request_id, user_id, command, query, api_type, token_cost) VALUES (?, ?, ?, ?, ?, ?)')
        .run(requestId, String(userId), command, query, apiType, tokenCost);
    return requestId;
}

function updateApiRequest(requestId, status, responseSummary = null, apiRemaining = null, errorMessage = null, responseData = null) {
    const dataJson = responseData ? JSON.stringify(responseData) : null;
    prepare('UPDATE api_requests SET status = ?, response_summary = ?, api_remaining = ?, error_message = ?, response_data = ? WHERE request_id = ?')
        .run(status, responseSummary, apiRemaining, errorMessage, dataJson, requestId);
}

function getApiRequestWithData(requestId) {
    const request = prepare('SELECT * FROM api_requests WHERE request_id = ?').get(requestId);
    if (request && request.response_data) {
        try {
            request.response_data = JSON.parse(request.response_data);
        } catch (e) {
            request.response_data = null;
        }
    }
    return request;
}

function getUserApiRequestsWithinDays(userId, days, limit = 30) {
    return prepare(`
        SELECT request_id, command, query, status, token_cost, created_at 
        FROM api_requests 
        WHERE user_id = ? AND created_at >= datetime('now', '-' || ? || ' days')
        ORDER BY created_at DESC 
        LIMIT ?
    `).all(String(userId), days, limit);
}

function getTodayCheckCount(userId) {
    const result = prepare(`
        SELECT COUNT(*) as count FROM api_requests 
        WHERE user_id = ? AND date(created_at) = date('now')
    `).get(String(userId));
    return result?.count || 0;
}

// ═══════════════════════════════════════════
// SETTINGS FUNCTIONS
// ═══════════════════════════════════════════

function getSetting(key) {
    const result = prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return result?.value;
}

function setSetting(key, value) {
    prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)')
        .run(key, String(value));
}

function getAllSettings() {
    const results = prepare('SELECT key, value FROM settings').all();
    const settings = {};
    results.forEach(r => { settings[r.key] = r.value; });
    return settings;
}

// ═══════════════════════════════════════════
// STATS FUNCTIONS
// ═══════════════════════════════════════════

function getStats() {
    const totalUsers = prepare('SELECT COUNT(*) as count FROM users').get()?.count || 0;
    const dailyUsers = prepare("SELECT COUNT(*) as count FROM users WHERE date(created_at, 'localtime') = date('now', 'localtime')").get()?.count || 0;
    
    // Deposits Aggregation
    const depositStats = prepare(`
        SELECT 
            COUNT(CASE WHEN status = 'approved' THEN 1 END) as success_count,
            COALESCE(SUM(CASE WHEN status = 'approved' THEN amount END), 0) as total_amount,
            COALESCE(SUM(CASE WHEN status = 'approved' THEN token_amount END), 0) as total_tokens,
            COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
            COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_count
        FROM deposits
    `).get();

    const totalChecks = prepare('SELECT COALESCE(SUM(total_checks), 0) as total FROM users').get()?.total || 0;
    
    return {
        totalUsers,
        dailyUsers,
        totalDeposits: depositStats.total_amount,
        totalTokensSold: depositStats.total_tokens,
        successDepositCount: depositStats.success_count,
        rejectedDepositCount: depositStats.rejected_count,
        pendingDeposits: depositStats.pending_count,
        totalChecks
    };
}

function getApiStats() {
    const today = prepare(`
        SELECT command, COUNT(*) as count, SUM(token_cost) as tokens
        FROM api_requests WHERE date(created_at) = date('now')
        GROUP BY command
    `).all();
    
    const total = prepare(`
        SELECT command, COUNT(*) as count, SUM(token_cost) as tokens
        FROM api_requests GROUP BY command
    `).all();
    
    return { today, total };
}

// ═══════════════════════════════════════════
// CACHE FUNCTIONS - Lookup cached API responses
// ═══════════════════════════════════════════

/**
 * Get cached API response by query and command
 * Used as fallback when API fails
 */
function getCachedApiResponse(command, query, maxAgeDays = 30) {
    const request = prepare(`
        SELECT * FROM api_requests 
        WHERE command = ? AND query = ? AND status = 'success' AND response_data IS NOT NULL
        AND created_at >= datetime('now', '-' || ? || ' days')
        ORDER BY created_at DESC 
        LIMIT 1
    `).get(command, query, maxAgeDays);
    
    if (request && request.response_data) {
        try {
            request.response_data = JSON.parse(request.response_data);
            request.fromCache = true;
            return request;
        } catch (e) {
            return null;
        }
    }
    return null;
}

/**
 * Check if query exists in cache
 */
function hasCachedResponse(command, query) {
    const result = prepare(`
        SELECT COUNT(*) as count FROM api_requests 
        WHERE command = ? AND query = ? AND status = 'success' AND response_data IS NOT NULL
    `).get(command, query);
    return (result?.count || 0) > 0;
}

// ═══════════════════════════════════════════
// REFERRAL FUNCTIONS
// ═══════════════════════════════════════════

/**
 * Generate unique referral code for user
 */
function generateReferralCode(userId) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `${code}${String(userId).slice(-4)}`;
}

/**
 * Get or create referral code for user
 */
function getOrCreateReferralCode(userId) {
    let refCode = prepare('SELECT * FROM referral_codes WHERE user_id = ?').get(String(userId));
    
    if (!refCode) {
        const code = generateReferralCode(userId);
        prepare('INSERT INTO referral_codes (user_id, code) VALUES (?, ?)').run(String(userId), code);
        refCode = prepare('SELECT * FROM referral_codes WHERE user_id = ?').get(String(userId));
    }
    
    return refCode;
}

/**
 * Get referral code info by code
 */
function getReferralByCode(code) {
    return prepare('SELECT * FROM referral_codes WHERE code = ?').get(code);
}

/**
 * Check if user was already referred by someone
 */
function isUserReferred(userId) {
    const ref = prepare('SELECT * FROM referrals WHERE referred_id = ?').get(String(userId));
    return !!ref;
}

/**
 * Create referral relationship
 * Returns: { success: boolean, message: string }
 */
function createReferral(referrerId, referredId) {
    // Can't refer yourself
    if (String(referrerId) === String(referredId)) {
        return { success: false, message: 'Tidak bisa referral diri sendiri' };
    }
    
    // Check if already referred
    if (isUserReferred(referredId)) {
        return { success: false, message: 'Anda sudah terdaftar melalui referral lain' };
    }
    
    // Check referrer exists
    const referrer = getUser(referrerId);
    if (!referrer) {
        return { success: false, message: 'Kode referral tidak valid' };
    }
    
    try {
        prepare('INSERT INTO referrals (referrer_id, referred_id) VALUES (?, ?)')
            .run(String(referrerId), String(referredId));
        
        // Update referrer stats
        prepare('UPDATE referral_codes SET total_referrals = total_referrals + 1 WHERE user_id = ?')
            .run(String(referrerId));
        
        return { success: true, message: 'Berhasil terdaftar dengan referral' };
    } catch (e) {
        return { success: false, message: 'Gagal membuat referral: ' + e.message };
    }
}

/**
 * Get referral stats for user
 */
function getReferralStats(userId) {
    const refCode = getOrCreateReferralCode(userId);
    
    const totalReferred = prepare(`
        SELECT COUNT(*) as count FROM referrals WHERE referrer_id = ?
    `).get(String(userId))?.count || 0;
    
    const pendingBonus = prepare(`
        SELECT COUNT(*) as count FROM referrals 
        WHERE referrer_id = ? AND bonus_claimed = 0
    `).get(String(userId))?.count || 0;
    
    const totalBonusEarned = refCode?.total_bonus_earned || 0;
    
    return {
        code: refCode?.code || '',
        totalReferred,
        pendingBonus,
        totalBonusEarned
    };
}

/**
 * Process referral bonus when deposit is approved
 * Gives 20 tokens to referrer when referred user deposits >= 100 tokens
 */
function processReferralBonus(referredUserId, depositAmount) {
    const BONUS_AMOUNT = 20;
    const MIN_DEPOSIT_FOR_BONUS = 100;
    
    // Check if this user was referred and bonus not claimed yet
    const referral = prepare(`
        SELECT * FROM referrals 
        WHERE referred_id = ? AND bonus_claimed = 0
    `).get(String(referredUserId));
    
    if (!referral) return null;
    
    // Check if deposit meets minimum
    if (depositAmount < MIN_DEPOSIT_FOR_BONUS) return null;
    
    // Give bonus to referrer
    updateTokenBalance(referral.referrer_id, BONUS_AMOUNT);
    
    // Mark bonus as claimed
    prepare(`
        UPDATE referrals 
        SET bonus_claimed = 1, bonus_amount = ?, bonus_claimed_at = CURRENT_TIMESTAMP 
        WHERE id = ?
    `).run(BONUS_AMOUNT, referral.id);
    
    // Update referrer stats
    prepare(`
        UPDATE referral_codes 
        SET total_bonus_earned = total_bonus_earned + ? 
        WHERE user_id = ?
    `).run(BONUS_AMOUNT, referral.referrer_id);
    
    // Create transaction record for referrer
    createTransaction(referral.referrer_id, 'referral_bonus', BONUS_AMOUNT, 
        `Bonus referral dari user ${referredUserId}`, null, 'success');
    
    return {
        referrerId: referral.referrer_id,
        bonusAmount: BONUS_AMOUNT
    };
}

/**
 * Get referrer info for a user (who invited them)
 */
function getReferrer(userId) {
    const ref = prepare('SELECT * FROM referrals WHERE referred_id = ?').get(String(userId));
    if (!ref) return null;
    
    const referrer = getUser(ref.referrer_id);
    return referrer;
}

/**
 * Get list of users referred by someone
 */
function getReferredUsers(userId, limit = 10) {
    return prepare(`
        SELECT r.*, u.username, u.first_name, u.token_balance
        FROM referrals r
        LEFT JOIN users u ON r.referred_id = u.user_id
        WHERE r.referrer_id = ?
        ORDER BY r.created_at DESC
        LIMIT ?
    `).all(String(userId), limit);
}

module.exports = {
    initialize,
    getUser,
    createUser,
    getOrCreateUser,
    updateTokenBalance,
    deductTokens,
    refundTokens,
    getAllUsers,
    createDeposit,
    getPendingDeposits,
    approveDeposit,
    rejectDeposit,
    getDeposit,
    getDepositByOrderId,
    createTransaction,
    getUserTransactions,
    createApiRequest,
    updateApiRequest,
    getApiRequestWithData,
    getUserApiRequestsWithinDays,
    getTodayCheckCount,
    getSetting,
    setSetting,
    getAllSettings,
    getStats,
    getApiStats,
    getCachedApiResponse,
    hasCachedResponse,
    // Referral functions
    getOrCreateReferralCode,
    getReferralByCode,
    isUserReferred,
    createReferral,
    getReferralStats,
    processReferralBonus,
    getReferrer,
    getReferredUsers
};
