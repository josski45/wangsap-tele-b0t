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
    
    return deposit;
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
    getApiStats
};
