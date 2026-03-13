const config = require('../config');
const db = require('../database');
const apiService = require('../services/api');
const paymentService = require('../services/payment');
const asexVehicleService = require('../services/asexVehicle');
const bugwaService = require('../services/bugwa');
const { isValidNIK, isValidKK } = require('../utils/helper');
const formatter = require('../utils/formatter');
const { ceknomorResultMessage } = require('../utils/formatter');
const axios = require('axios');
const https = require('https');
const QRCode = require('qrcode');

/**
 * User Commands untuk Telegram Bot
 */

// Cooldown untuk anti-spam
const commandCooldowns = new Map();

// Default cooldown settings (dalam detik)
const DEFAULT_COOLDOWNS = {
    // deposit: no cooldown
    nik: 5,
    kk: 5,
    start: 5,
    ref: 3,
    myref: 3,
    databocor: 5,
    getcontact: 5,
    default: 3
};

function getCooldownSetting(command) {
    const settings = db.getAllSettings();
    const savedCooldowns = settings.cooldowns ? JSON.parse(settings.cooldowns) : {};
    return (savedCooldowns[command] || DEFAULT_COOLDOWNS[command] || DEFAULT_COOLDOWNS.default) * 1000;
}

function checkCooldown(userId, command, cooldownMs = null) {
    const key = `${userId}:${command}`;
    const now = Date.now();
    const lastTime = commandCooldowns.get(key);
    const actualCooldown = cooldownMs || getCooldownSetting(command);
    
    if (lastTime && (now - lastTime) < actualCooldown) {
        return false;
    }
    
    commandCooldowns.set(key, now);
    return true;
}

// Cleanup cooldowns
setInterval(() => {
    const now = Date.now();
    for (const [key, time] of commandCooldowns.entries()) {
        if (now - time > 60000) {
            commandCooldowns.delete(key);
        }
    }
}, 60000);

const userCommands = {
    /**
     * Command: /start [ref_CODE]
     * Handle normal start and referral deep links
     */
    async start(bot, msg, args) {
        const userId = msg.from.id;
        const firstName = msg.from.first_name || 'User';
        const username = msg.from.username || null;
        
        if (!checkCooldown(userId, 'start', 5000)) return;
        
        // Check if this is a referral start
        let referralText = '';
        if (args && args.length > 0 && args[0].startsWith('ref_')) {
            const refCode = args[0].replace('ref_', '');
            
            // Find referrer by code
            const refData = db.getReferralByCode(refCode);
            
            if (refData) {
                // Check if user is already referred
                if (db.isUserReferred(userId)) {
                    // Already registered through referral
                    await bot.sendMessage(msg.chat.id, formatter.referralAlreadyRegisteredMessage(), { 
                        parse_mode: 'HTML' 
                    });
                    return;
                }
                
                // Create user first if not exists
                db.getOrCreateUser(userId, username, firstName);
                
                // Create referral relationship
                const result = db.createReferral(refData.user_id, userId);
                
                if (result.success) {
                    const referrer = db.getUser(refData.user_id);
                    const referrerName = referrer?.username ? `@${referrer.username}` : (referrer?.first_name || 'User');
                    referralText = formatter.referralWelcomeMessage(referrerName);
                    console.log(`✅ Referral created: ${refData.user_id} -> ${userId}`);
                }
            }
        }
        
        const user = db.getOrCreateUser(userId, username, firstName);
        const todayChecks = db.getTodayCheckCount(userId);
        
        let text = formatter.welcomeMessage(firstName, user.token_balance, todayChecks);
        text += referralText;
        
        // Send with keyboard buttons
        await bot.sendMessage(msg.chat.id, text, { 
            parse_mode: 'HTML',
            reply_markup: {
                keyboard: [
                    [{ text: '💳 Deposit' }, { text: '🪙 Saldo' }],
                    [{ text: '📋 Menu' }, { text: '❓ Bantuan' }]
                ],
                resize_keyboard: true,
                one_time_keyboard: false
            }
        });
    },

    /**
     * Command: /menu - Show interactive menu with inline buttons
     */
    async menu(bot, msg) {
        const userId = msg.from.id;
        const settings = db.getAllSettings();
        
        // Get all costs from settings
        const checkCost = parseInt(settings.check_cost) || config.checkCost;
        const namaCost = parseInt(settings.nama_cost) || config.namaCost;
        const kkCost = parseInt(settings.kk_cost) || config.kkCost;
        const ceknomorCost = parseInt(settings.ceknomor_cost) || config.ceknomorCost;
        const edabuCost = parseInt(settings.edabu_cost) || config.edabuCost;
        const bpjstkCost = parseInt(settings.bpjstk_cost) || config.bpjstkCost || 3;
        const nopolCost = parseInt(settings.nopol_cost) || config.nopolCost;
        const databocorCost = parseInt(settings.databocor_cost) || config.databocorCost || 3;
        const getcontactCost = parseInt(settings.getcontact_cost) || config.getcontactCost || 3;
        const bugwaCost = parseInt(settings.bugwa_cost) || config.bugwaCost || 3;
        
        const text = `📋 <b>MENU PENCARIAN</b>

Pilih fitur yang ingin digunakan:
<i>(Tap tombol untuk memulai)</i>`;
        
        // Build inline keyboard with costs
        const inlineKeyboard = [
            [
                { text: `📱 CekNomor (${ceknomorCost}t)`, callback_data: 'menu_ceknomor' }
            ],
            [
                { text: `🔍 CekNIK (${checkCost}t)`, callback_data: 'menu_ceknik' },
                { text: `👤 Nama (${namaCost}t)`, callback_data: 'menu_nama' }
            ],
            [
                { text: `👨‍👩‍👧‍👦 KK (${kkCost}t)`, callback_data: 'menu_kk' }
            ],
            [
                { text: `🏥 BPJS (${edabuCost}t)`, callback_data: 'menu_edabu' },
                { text: `👷 BPJS TK (${bpjstkCost}t)`, callback_data: 'menu_bpjstk' }
            ],
            [
                { text: `🚗 Nopol (${nopolCost}t)`, callback_data: 'menu_nopol' },
                { text: `🔧 Noka (${parseInt(settings.noka_cost) || config.nokaCost}t)`, callback_data: 'menu_noka' }
            ],
            [
                { text: `🔩 Nosin (${parseInt(settings.nosin_cost) || config.nosinCost}t)`, callback_data: 'menu_nosin' },
                { text: `🪪 NikPlat (${parseInt(settings.nikplat_cost) || config.nikplatCost}t)`, callback_data: 'menu_nikplat' }
            ],
            [
                { text: ` DataBocor (${databocorCost}t)`, callback_data: 'menu_databocor' },
                { text: `📱 GetContact (${getcontactCost}t)`, callback_data: 'menu_getcontact' }
            ],
            [
                { text: `💥 BugWA (${bugwaCost}t)`, callback_data: 'menu_bugwa' },
            ],
            [
                { text: '💳 Deposit', callback_data: 'goto_deposit' },
                { text: '🪙 Saldo', callback_data: 'goto_saldo' }
            ]
        ];
        
        await bot.sendMessage(msg.chat.id, text, { 
            parse_mode: 'HTML',
            reply_to_message_id: msg.message_id,
            reply_markup: {
                inline_keyboard: inlineKeyboard
            }
        });
    },

    /**
     * Command: /bantuan atau /help
     */
    async bantuan(bot, msg) {
        const text = formatter.helpMessage();
        await bot.sendMessage(msg.chat.id, text, { 
            parse_mode: 'HTML',
            reply_to_message_id: msg.message_id 
        });
    },

    async help(bot, msg) {
        return this.bantuan(bot, msg);
    },

    /**
     * Command: /saldo
     */
    async saldo(bot, msg) {
        const userId = msg.from.id;
        const firstName = msg.from.first_name || 'User';
        const username = msg.from.username || null;
        
        const user = db.getOrCreateUser(userId, username, firstName);
        const text = formatter.balanceMessage(user);
        
        await bot.sendMessage(msg.chat.id, text, { 
            parse_mode: 'HTML',
            reply_to_message_id: msg.message_id 
        });
    },

    /**
     * Command: /support - Hubungi support/owner
     */
    async support(bot, msg) {
        const text = formatter.supportMessage(config.botName);
        
        // Build inline keyboard dengan semua owner IDs
        const inlineKeyboard = [];
        
        if (config.ownerIds.length === 1) {
            // Single owner
            inlineKeyboard.push([
                { text: '💬 Chat dengan Admin', url: `tg://user?id=${config.ownerIds[0]}` }
            ]);
        } else {
            // Multiple owners - tampilkan semua
            config.ownerIds.forEach((ownerId, index) => {
                inlineKeyboard.push([
                    { text: `👤 Admin ${index + 1}`, url: `tg://user?id=${ownerId}` }
                ]);
            });
        }
        
        await bot.sendMessage(msg.chat.id, text, { 
            parse_mode: 'HTML',
            reply_to_message_id: msg.message_id,
            reply_markup: {
                inline_keyboard: inlineKeyboard
            }
        });
    },

    /**
     * Command: /ceknomor <nomor HP>
     * Cek data dari nomor HP
     */
    async ceknomor(bot, msg, args) {
        const userId = msg.from.id;
        const firstName = msg.from.first_name || 'User';
        const username = msg.from.username || null;

        if (args.length === 0) {
            await bot.sendMessage(msg.chat.id,
                `❌ <b>Format Salah</b>\n\nGunakan: <code>/ceknomor &lt;NoHP&gt;</code>\nContoh: <code>/ceknomor 081234567890</code>\nContoh: <code>/ceknomor 6281234567890</code>`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        // Normalize phone number: strip non-digits, convert leading 0 to 62
        let nomorInput = args[0].replace(/[^0-9]/g, '');
        if (nomorInput.startsWith('0')) {
            nomorInput = '62' + nomorInput.substring(1);
        }

        if (nomorInput.length < 10 || nomorInput.length > 15) {
            await bot.sendMessage(msg.chat.id,
                `❌ <b>Nomor HP Tidak Valid</b>\n\nMasukkan nomor HP yang valid (10-15 digit)`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        const user = db.getOrCreateUser(userId, username, firstName);
        const settings = db.getAllSettings();

        if (settings.mt_ceknomor === 'true') {
            await bot.sendMessage(msg.chat.id,
                `⚠️ <b>MAINTENANCE</b>\n\nFitur <b>CEK NOMOR</b> sedang dalam perbaikan.`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        const ceknomorCost = parseInt(settings.ceknomor_cost) || config.ceknomorCost;

        if (user.token_balance < ceknomorCost) {
            await bot.sendMessage(msg.chat.id,
                `❌ <b>Saldo Tidak Cukup</b>\n\n🪙 Saldo: <b>${user.token_balance} token</b>\n💰 Biaya: <b>${ceknomorCost} token</b>\n\nKetik <code>/deposit</code> untuk top up`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        const requestId = db.createApiRequest(userId, 'ceknomor', nomorInput, 'ceknomor', ceknomorCost);

        const processingMsg = await bot.sendMessage(msg.chat.id,
            `⏳ <b>Sedang Proses...</b>\n\n📱 Mencari data nomor: <b>${nomorInput}</b>\n🆔 ID: <code>${requestId}</code>\n<i>Mohon tunggu sebentar</i>`,
            { parse_mode: 'HTML' }
        );

        db.deductTokens(userId, ceknomorCost);

        const result = await apiService.checkNomor(nomorInput);

        const updatedUser = db.getUser(userId);
        const remainingToken = updatedUser?.token_balance || 0;

        if (!result.success) {
            if (result.refund) {
                db.refundTokens(userId, ceknomorCost);
            }
            db.updateApiRequest(requestId, 'failed', null, null, result.error);
            db.createTransaction(userId, 'check', ceknomorCost, `Cek nomor gagal${result.refund ? ' (refund)' : ''}`, nomorInput, 'failed');

            await bot.editMessageText(
                `❌ <b>Gagal</b>\n\n${formatter.escapeHtml(result.error)}\n\n${result.refund ? `🪙 Token dikembalikan: <b>${ceknomorCost} token</b>\n` : ''}🆔 ID: <code>${requestId}</code>`,
                { chat_id: msg.chat.id, message_id: processingMsg.message_id, parse_mode: 'HTML' }
            );
            return;
        }

        db.updateApiRequest(requestId, 'success', 'Data ditemukan', null, null, result.data);
        db.createTransaction(userId, 'check', ceknomorCost, `Cek nomor berhasil`, nomorInput, 'success');

        const text = ceknomorResultMessage(result.data, ceknomorCost, requestId, remainingToken);
        await bot.editMessageText(text, {
            chat_id: msg.chat.id,
            message_id: processingMsg.message_id,
            parse_mode: 'HTML'
        });
    },

    /**
     * Command: /ceknik <NIK>
     */
    async ceknik(bot, msg, args) {
        const userId = msg.from.id;
        const firstName = msg.from.first_name || 'User';
        const username = msg.from.username || null;
        
        if (args.length === 0) {
            await bot.sendMessage(msg.chat.id, 
                `❌ <b>Format Salah</b>\n\nGunakan: <code>/ceknik &lt;NIK&gt;</code>\nContoh: <code>/ceknik 1234567890123456</code>`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        const nik = args[0].replace(/\D/g, '');

        if (!isValidNIK(nik)) {
            await bot.sendMessage(msg.chat.id,
                `❌ <b>NIK Tidak Valid</b>\n\nNIK harus <b>16 digit angka</b>`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        const user = db.getOrCreateUser(userId, username, firstName);
        const settings = db.getAllSettings();
        
        // Cek Maintenance
        if (settings.mt_ceknik === 'true') {
            await bot.sendMessage(msg.chat.id,
                `⚠️ <b>MAINTENANCE</b>\n\nFitur <b>CEK NIK</b> sedang dalam perbaikan.`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }
        
        const checkCost = parseInt(settings.check_cost) || config.checkCost;

        if (user.token_balance < checkCost) {
            await bot.sendMessage(msg.chat.id,
                `❌ <b>Saldo Tidak Cukup</b>\n\n🪙 Saldo: <b>${user.token_balance} token</b>\n💰 Biaya: <b>${checkCost} token</b>\n\nKetik <code>/deposit</code> untuk top up`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        const requestId = db.createApiRequest(userId, 'ceknik', nik, 'nik', checkCost);

        const processingMsg = await bot.sendMessage(msg.chat.id,
            formatter.processingMessage(nik, requestId),
            { parse_mode: 'HTML' }
        );

        db.deductTokens(userId, checkCost);

        let result = await apiService.checkNIK(nik);
        const updatedUser = db.getUser(userId);
        const remainingToken = updatedUser?.token_balance || 0;

        // If API fails, try to get from cache
        if (!result.success) {
            const cached = db.getCachedApiResponse('ceknik', nik);
            if (cached && cached.response_data) {
                console.log(`📦 Using cached data for NIK: ${nik}`);
                result = {
                    success: true,
                    data: cached.response_data,
                    fromCache: true
                };
            }
        }

        if (!result.success) {
            if (result.refund) {
                db.refundTokens(userId, checkCost);
            }
            db.updateApiRequest(requestId, 'failed', null, null, result.error);
            db.createTransaction(userId, 'check', checkCost, `Cek NIK gagal`, nik, 'failed');
            
            await bot.editMessageText(
                `❌ <b>Gagal</b>\n\n${formatter.escapeHtml(result.error)}\n\n${result.refund ? `🪙 Token dikembalikan: <b>${checkCost} token</b>\n` : ''}🆔 ID: <code>${requestId}</code>`,
                { 
                    chat_id: msg.chat.id, 
                    message_id: processingMsg.message_id,
                    parse_mode: 'HTML'
                }
            );
            return;
        }

        if (!result.fromCache) {
            db.updateApiRequest(requestId, 'success', 'Data ditemukan', null, null, result.data);
        }
        db.createTransaction(userId, 'check', checkCost, `Cek NIK berhasil${result.fromCache ? ' (cache)' : ''}`, nik, 'success');

        let text = formatter.nikResultMessage(result.data, checkCost, requestId, remainingToken);
        if (result.fromCache) {
            text = `📦 <i>Data dari SIGMABOY</i>\n\n` + text;
        }
        await bot.editMessageText(text, {
            chat_id: msg.chat.id,
            message_id: processingMsg.message_id,
            parse_mode: 'HTML'
        });
    },

    /**
     * Command: /nama <nama lengkap>
     */
    async nama(bot, msg, args) {
        const userId = msg.from.id;
        const firstName = msg.from.first_name || 'User';
        const username = msg.from.username || null;
        
        if (args.length === 0) {
            await bot.sendMessage(msg.chat.id,
                `❌ <b>Format Salah</b>\n\nGunakan: <code>/nama &lt;nama lengkap&gt;</code>\nContoh: <code>/nama Muhammad Anggara</code>`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        const namaQuery = args.join(' ').trim();
        if (namaQuery.length < 3) {
            await bot.sendMessage(msg.chat.id,
                `❌ <b>Nama Terlalu Pendek</b>\n\nMasukkan minimal 3 karakter`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        const user = db.getOrCreateUser(userId, username, firstName);
        const settings = db.getAllSettings();

        if (settings.mt_nama === 'true') {
            await bot.sendMessage(msg.chat.id,
                `⚠️ <b>MAINTENANCE</b>\n\nFitur <b>CARI NAMA</b> sedang dalam perbaikan.`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        const namaCost = parseInt(settings.nama_cost) || config.namaCost;

        if (user.token_balance < namaCost) {
            await bot.sendMessage(msg.chat.id,
                `❌ <b>Saldo Tidak Cukup</b>\n\n🪙 Saldo: <b>${user.token_balance} token</b>\n💰 Biaya: <b>${namaCost} token</b>\n\nKetik <code>/deposit</code> untuk top up`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        const requestId = db.createApiRequest(userId, 'nama', namaQuery, 'eyex_nama', namaCost);

        const processingMsg = await bot.sendMessage(msg.chat.id,
            formatter.processingMessage(namaQuery, requestId),
            { parse_mode: 'HTML' }
        );

        db.deductTokens(userId, namaCost);

        let result = await apiService.searchByName(namaQuery);
        const updatedUser = db.getUser(userId);
        const remainingToken = updatedUser?.token_balance || 0;

        // If API fails, try to get from cache
        if (!result.success) {
            const cached = db.getCachedApiResponse('nama', namaQuery);
            if (cached && cached.response_data) {
                console.log(`📦 Using cached data for nama: ${namaQuery}`);
                result = {
                    success: true,
                    data: cached.response_data,
                    searchName: namaQuery,
                    fromCache: true
                };
            }
        }

        if (!result.success) {
            if (result.refund) {
                db.refundTokens(userId, namaCost);
            }
            db.updateApiRequest(requestId, 'failed', null, null, result.error);
            db.createTransaction(userId, 'check', namaCost, `Cari nama gagal`, namaQuery, 'failed');
            
            await bot.editMessageText(
                `❌ <b>Gagal</b>\n\n${formatter.escapeHtml(result.error)}\n\n${result.refund ? `🪙 Token dikembalikan: <b>${namaCost} token</b>\n` : ''}🆔 ID: <code>${requestId}</code>`,
                { chat_id: msg.chat.id, message_id: processingMsg.message_id, parse_mode: 'HTML' }
            );
            return;
        }

        const totalData = result.data?.total_data || result.data?.data?.length || 0;
        
        // Double check: jika totalData = 0, refund token
        if (totalData === 0) {
            db.refundTokens(userId, namaCost);
            db.updateApiRequest(requestId, 'failed', null, null, 'Data tidak ditemukan (0 hasil)');
            db.createTransaction(userId, 'check', namaCost, `Cari nama gagal (0 data)`, namaQuery, 'failed');
            
            await bot.editMessageText(
                `❌ <b>Tidak Ada Data</b>\n\n🔍 Query: <b>${formatter.escapeHtml(namaQuery)}</b>\n📊 Total: <b>0 data</b>\n\n🪙 Token dikembalikan: <b>${namaCost} token</b>\n🆔 ID: <code>${requestId}</code>`,
                { chat_id: msg.chat.id, message_id: processingMsg.message_id, parse_mode: 'HTML' }
            );
            return;
        }
        
        // Don't save to DB if from cache (already exists)
        if (!result.fromCache) {
            db.updateApiRequest(requestId, 'success', `${totalData} data`, null, null, result.data);
        }
        db.createTransaction(userId, 'check', namaCost, `Cari nama: ${namaQuery}${result.fromCache ? ' (cache)' : ''}`, null, 'success');

        // Generate file txt
        const dataList = result.data?.data || [];
        let fileContent = `==========================================\n`;
        fileContent += `HASIL PENCARIAN NAMA: ${result.searchName || namaQuery}\n`;
        fileContent += `Total Data: ${totalData}\n`;
        fileContent += `Request ID: ${requestId}\n`;
        fileContent += `Bot: ${config.botName}\n`;
        if (result.fromCache) {
            fileContent += `Source: SIGMABOY\n`;
        }
        fileContent += `==========================================\n\n`;

        if (dataList.length > 0) {
            dataList.forEach((item, index) => {
                fileContent += `${index + 1}. ${item.NAMA || '-'}\n`;
                fileContent += `   NIK          : ${item.NIK || '-'}\n`;
                fileContent += `   NO. KK       : ${item.KK || '-'}\n`;
                fileContent += `   TTL          : ${item.TEMPAT_LAHIR || '-'}, ${item.TANGGAL_LAHIR || '-'}\n`;
                fileContent += `   JENIS KELAMIN: ${item.JENIS_KELAMIN || '-'}\n`;
                fileContent += `   AGAMA        : ${item.AGAMA || '-'}\n`;
                fileContent += `   STATUS       : ${item.STATUS || '-'}\n`;
                fileContent += `   HUBUNGAN     : ${item.HUBUNGAN || '-'}\n`;
                fileContent += `   GOL. DARAH   : ${item.GOL_DARAH || '-'}\n`;
                fileContent += `   PEKERJAAN    : ${item.PEKERJAAN || '-'}\n`;
                fileContent += `   PENDIDIKAN   : ${item.PENDIDIKAN || '-'}\n`;
                fileContent += `   NAMA AYAH    : ${item.NAMA_AYAH || '-'}\n`;
                fileContent += `   NAMA IBU     : ${item.NAMA_IBU || '-'}\n`;
                fileContent += `   ALAMAT       : ${item.ALAMAT || '-'}\n`;
                fileContent += `------------------------------------------\n`;
            });
        } else {
            fileContent += "Tidak ada data ditemukan.\n";
        }

        fileContent += `\nGenerate Date: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`;

        const fileName = `HASIL_${namaQuery.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()}_${requestId}.txt`;
        let captionText = formatter.namaResultMessage(result.data, result.searchName || namaQuery, namaCost, requestId, remainingToken);
        
        // Add cache indicator to caption
        if (result.fromCache) {
            captionText = `📦 <i>Data dari SIGMABOY</i>\n\n` + captionText;
        }

        // Delete processing message
        try {
            await bot.deleteMessage(msg.chat.id, processingMsg.message_id);
        } catch (e) {
            console.error('Failed to delete processing msg:', e.message);
        }

        // Send document - Fix: use correct sendDocument format for node-telegram-bot-api
        try {
            const fileBuffer = Buffer.from(fileContent, 'utf-8');
            await bot.sendDocument(msg.chat.id, fileBuffer, {
                caption: captionText,
                parse_mode: 'HTML',
                reply_to_message_id: msg.message_id
            }, {
                filename: fileName,
                contentType: 'text/plain'
            });

            // ═══════════════════════════════════════════
            // Send pagination buttons if multiple pages
            // ═══════════════════════════════════════════
            const currentPage = result.data?.current_page || 1;
            const totalPage = result.data?.total_page || 1;

            if (totalPage > 1) {
                // Store search context for pagination
                if (!global.namaSearchContext) global.namaSearchContext = {};
                global.namaSearchContext[userId] = {
                    query: namaQuery,
                    currentPage: currentPage,
                    totalPage: totalPage,
                    timestamp: Date.now()
                };

                const inlineButtons = [];
                if (currentPage > 1) {
                    inlineButtons.push({ text: `◀ Hal ${currentPage - 1}`, callback_data: `nama_page_${userId}_${currentPage - 1}` });
                }
                inlineButtons.push({ text: `📄 ${currentPage}/${totalPage}`, callback_data: `nama_page_${userId}_info` });
                if (currentPage < totalPage) {
                    inlineButtons.push({ text: `Hal ${currentPage + 1} ▶`, callback_data: `nama_page_${userId}_${currentPage + 1}` });
                }

                await bot.sendMessage(msg.chat.id,
                    `📄 <b>Halaman ${currentPage} dari ${totalPage}</b>\n🔍 Query: <i>${formatter.escapeHtml(namaQuery)}</i>\n💰 Biaya per halaman: <b>${namaCost} token</b>`,
                    {
                        parse_mode: 'HTML',
                        reply_markup: { inline_keyboard: [inlineButtons] }
                    }
                );
            }
        } catch (docError) {
            console.error('Error sending document:', docError.message);
            // Fallback: send as text message
            await bot.sendMessage(msg.chat.id, captionText + `\n\n<i>⚠️ Gagal membuat file, data ditampilkan di atas</i>`, {
                parse_mode: 'HTML',
                reply_to_message_id: msg.message_id
            });
        }
    },

    /**
     * Internal: Handle nama pagination from callback button
     */
    async _namaPage(bot, chatId, userId, username, firstName, targetPage) {
        // Get stored search context
        if (!global.namaSearchContext || !global.namaSearchContext[userId]) {
            await bot.sendMessage(chatId,
                `❌ <b>Sesi pencarian tidak ditemukan</b>\n\nSilakan cari ulang dengan <code>/nama &lt;nama&gt;</code>`,
                { parse_mode: 'HTML' }
            );
            return;
        }

        const ctx = global.namaSearchContext[userId];
        // Expire after 10 minutes
        if (Date.now() - ctx.timestamp > 10 * 60 * 1000) {
            delete global.namaSearchContext[userId];
            await bot.sendMessage(chatId,
                `⏰ <b>Sesi pencarian kedaluwarsa</b>\n\nSilakan cari ulang dengan <code>/nama ${formatter.escapeHtml(ctx.query)}</code>`,
                { parse_mode: 'HTML' }
            );
            return;
        }

        const namaQuery = ctx.query;
        const page = parseInt(targetPage);
        if (isNaN(page) || page < 1 || page > ctx.totalPage) return;

        // Check balance
        const user = db.getOrCreateUser(userId, username, firstName);
        const settings = db.getAllSettings();
        const namaCost = parseInt(settings.nama_cost) || config.namaCost;

        if (user.token_balance < namaCost) {
            await bot.sendMessage(chatId,
                `❌ <b>Saldo Tidak Cukup</b>\n\n🪙 Saldo: <b>${user.token_balance} token</b>\n💰 Biaya: <b>${namaCost} token</b>\n\nKetik <code>/deposit</code> untuk top up`,
                { parse_mode: 'HTML' }
            );
            return;
        }

        const requestId = db.createApiRequest(userId, 'nama', `${namaQuery} (hal ${page})`, 'eyex_nama', namaCost);

        const processingMsg = await bot.sendMessage(chatId,
            `⏳ <b>Mengambil halaman ${page}...</b>\n\n👤 Query: <b>${formatter.escapeHtml(namaQuery)}</b>\n🆔 ID: <code>${requestId}</code>`,
            { parse_mode: 'HTML' }
        );

        db.deductTokens(userId, namaCost);

        let result = await apiService.searchByName(namaQuery, page);
        const updatedUser = db.getUser(userId);
        const remainingToken = updatedUser?.token_balance || 0;

        if (!result.success) {
            db.refundTokens(userId, namaCost);
            db.updateApiRequest(requestId, 'failed', null, null, result.error);
            db.createTransaction(userId, 'check', namaCost, `Cari nama gagal (hal ${page})`, namaQuery, 'failed');
            await bot.editMessageText(
                `❌ <b>Gagal</b>\n\n${formatter.escapeHtml(result.error)}\n\n🪙 Token dikembalikan: <b>${namaCost} token</b>\n🆔 ID: <code>${requestId}</code>`,
                { chat_id: chatId, message_id: processingMsg.message_id, parse_mode: 'HTML' }
            );
            return;
        }

        const totalData = result.data?.total_data || result.data?.data?.length || 0;
        if (totalData === 0) {
            db.refundTokens(userId, namaCost);
            db.updateApiRequest(requestId, 'failed', null, null, 'Tidak ada data di halaman ini');
            db.createTransaction(userId, 'check', namaCost, `Cari nama gagal (hal ${page}, 0 data)`, namaQuery, 'failed');
            await bot.editMessageText(
                `❌ <b>Tidak Ada Data</b>\n\n🔍 Query: <b>${formatter.escapeHtml(namaQuery)}</b>\n📄 Halaman: <b>${page}</b>\n\n🪙 Token dikembalikan: <b>${namaCost} token</b>`,
                { chat_id: chatId, message_id: processingMsg.message_id, parse_mode: 'HTML' }
            );
            return;
        }

        db.updateApiRequest(requestId, 'success', `${totalData} data (hal ${page})`, null, null, result.data);
        db.createTransaction(userId, 'check', namaCost, `Cari nama: ${namaQuery} (hal ${page})`, null, 'success');

        let captionText = formatter.namaResultMessage(result.data, result.searchName || namaQuery, namaCost, requestId, remainingToken);

        // Generate TXT file
        const dataList = result.data?.data || [];
        let fileContent = `==========================================\n`;
        fileContent += `HASIL PENCARIAN NAMA: ${namaQuery} (Halaman ${page})\n`;
        fileContent += `Total Data: ${totalData}\n`;
        fileContent += `Request ID: ${requestId}\n`;
        fileContent += `Bot: ${config.botName}\n`;
        fileContent += `==========================================\n\n`;

        if (dataList.length > 0) {
            dataList.forEach((item, index) => {
                fileContent += `${index + 1}. ${item.NAMA || '-'}\n`;
                fileContent += `   NIK          : ${item.NIK || '-'}\n`;
                fileContent += `   NO. KK       : ${item.KK || '-'}\n`;
                fileContent += `   TTL          : ${item.TEMPAT_LAHIR || '-'}, ${item.TANGGAL_LAHIR || '-'}\n`;
                fileContent += `   JENIS KELAMIN: ${item.JENIS_KELAMIN || '-'}\n`;
                fileContent += `   AGAMA        : ${item.AGAMA || '-'}\n`;
                fileContent += `   STATUS       : ${item.STATUS || '-'}\n`;
                fileContent += `   HUBUNGAN     : ${item.HUBUNGAN || '-'}\n`;
                fileContent += `   GOL. DARAH   : ${item.GOL_DARAH || '-'}\n`;
                fileContent += `   PEKERJAAN    : ${item.PEKERJAAN || '-'}\n`;
                fileContent += `   PENDIDIKAN   : ${item.PENDIDIKAN || '-'}\n`;
                fileContent += `   NAMA AYAH    : ${item.NAMA_AYAH || '-'}\n`;
                fileContent += `   NAMA IBU     : ${item.NAMA_IBU || '-'}\n`;
                fileContent += `   ALAMAT       : ${item.ALAMAT || '-'}\n`;
                fileContent += `------------------------------------------\n`;
            });
        }
        fileContent += `\nGenerate Date: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`;

        const fileName = `HASIL_${namaQuery.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()}_P${page}_${requestId}.txt`;

        try { await bot.deleteMessage(chatId, processingMsg.message_id); } catch (e) {}

        const fileBuffer = Buffer.from(fileContent, 'utf-8');
        await bot.sendDocument(chatId, fileBuffer, {
            caption: captionText,
            parse_mode: 'HTML'
        }, {
            filename: fileName,
            contentType: 'text/plain'
        });

        // Update context and send new pagination buttons
        const currentPage = result.data?.current_page || page;
        const totalPage = result.data?.total_page || ctx.totalPage;
        global.namaSearchContext[userId] = {
            query: namaQuery,
            currentPage: currentPage,
            totalPage: totalPage,
            timestamp: Date.now()
        };

        if (totalPage > 1) {
            const inlineButtons = [];
            if (currentPage > 1) {
                inlineButtons.push({ text: `◀ Hal ${currentPage - 1}`, callback_data: `nama_page_${userId}_${currentPage - 1}` });
            }
            inlineButtons.push({ text: `📄 ${currentPage}/${totalPage}`, callback_data: `nama_page_${userId}_info` });
            if (currentPage < totalPage) {
                inlineButtons.push({ text: `Hal ${currentPage + 1} ▶`, callback_data: `nama_page_${userId}_${currentPage + 1}` });
            }

            await bot.sendMessage(chatId,
                `📄 <b>Halaman ${currentPage} dari ${totalPage}</b>\n🔍 Query: <i>${formatter.escapeHtml(namaQuery)}</i>\n💰 Biaya per halaman: <b>${namaCost} token</b>`,
                {
                    parse_mode: 'HTML',
                    reply_markup: { inline_keyboard: [inlineButtons] }
                }
            );
        }
    },

    /**
     * Command: /kk <nomor KK>
     */
    async kk(bot, msg, args) {
        const userId = msg.from.id;
        const firstName = msg.from.first_name || 'User';
        const username = msg.from.username || null;
        
        if (args.length === 0) {
            await bot.sendMessage(msg.chat.id,
                `❌ <b>Format Salah</b>\n\nGunakan: <code>/kk &lt;No.KK&gt;</code>\nContoh: <code>/kk 3603301311150001</code>`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        const kkNumber = args[0].replace(/\D/g, '');

        if (!isValidKK(kkNumber)) {
            await bot.sendMessage(msg.chat.id,
                `❌ <b>No. KK Tidak Valid</b>\n\nNo. KK harus <b>16 digit angka</b>`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        const user = db.getOrCreateUser(userId, username, firstName);
        const settings = db.getAllSettings();

        if (settings.mt_kk === 'true') {
            await bot.sendMessage(msg.chat.id,
                `⚠️ <b>MAINTENANCE</b>\n\nFitur <b>CEK KK</b> sedang dalam perbaikan.`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        const kkCost = parseInt(settings.kk_cost) || config.kkCost;

        if (user.token_balance < kkCost) {
            await bot.sendMessage(msg.chat.id,
                `❌ <b>Saldo Tidak Cukup</b>\n\n🪙 Saldo: <b>${user.token_balance} token</b>\n💰 Biaya: <b>${kkCost} token</b>\n\nKetik <code>/deposit</code> untuk top up`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        const requestId = db.createApiRequest(userId, 'kk', kkNumber, 'eyex_kk', kkCost);

        const processingMsg = await bot.sendMessage(msg.chat.id,
            formatter.processingMessage(kkNumber, requestId),
            { parse_mode: 'HTML' }
        );

        db.deductTokens(userId, kkCost);

        let result = await apiService.checkKK(kkNumber);
        const updatedUser = db.getUser(userId);
        const remainingToken = updatedUser?.token_balance || 0;

        // If API fails, try to get from cache
        if (!result.success) {
            const cached = db.getCachedApiResponse('kk', kkNumber);
            if (cached && cached.response_data) {
                console.log(`📦 Using cached data for KK: ${kkNumber}`);
                result = {
                    success: true,
                    data: cached.response_data.members || cached.response_data,
                    nkk: cached.response_data.nkk || kkNumber,
                    fromCache: true
                };
            }
        }

        if (!result.success) {
            if (result.refund) {
                db.refundTokens(userId, kkCost);
            }
            db.updateApiRequest(requestId, 'failed', null, null, result.error);
            db.createTransaction(userId, 'check', kkCost, `Cek KK gagal`, kkNumber, 'failed');
            
            await bot.editMessageText(
                `❌ <b>Gagal</b>\n\n${formatter.escapeHtml(result.error)}\n\n${result.refund ? `🪙 Token dikembalikan: <b>${kkCost} token</b>\n` : ''}🆔 ID: <code>${requestId}</code>`,
                { chat_id: msg.chat.id, message_id: processingMsg.message_id, parse_mode: 'HTML' }
            );
            return;
        }

        if (!result.fromCache) {
            db.updateApiRequest(requestId, 'success', `${result.data?.length || 0} anggota`, null, null, { members: result.data, nkk: result.nkk });
        }
        db.createTransaction(userId, 'check', kkCost, `Cek KK berhasil${result.fromCache ? ' (cache)' : ''}`, kkNumber, 'success');

        let text = formatter.kkResultMessage(result.data, result.nkk, kkCost, requestId, remainingToken);
        if (result.fromCache) {
            text = `📦 <i>Data dari SIGMABOY</i>\n\n` + text;
        }
        await bot.editMessageText(text, {
            chat_id: msg.chat.id,
            message_id: processingMsg.message_id,
            parse_mode: 'HTML'
        });
    },

    /**
     * Command: /edabu <NIK>
     */
    async edabu(bot, msg, args) {
        const userId = msg.from.id;
        const firstName = msg.from.first_name || 'User';
        const username = msg.from.username || null;
        
        if (args.length === 0) {
            await bot.sendMessage(msg.chat.id,
                `❌ <b>Format Salah</b>\n\nGunakan: <code>/edabu &lt;NIK&gt;</code>\nContoh: <code>/edabu 1234567890123456</code>`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        const nik = args[0].replace(/\D/g, '');

        if (!isValidNIK(nik)) {
            await bot.sendMessage(msg.chat.id,
                `❌ <b>NIK Tidak Valid</b>\n\nNIK harus <b>16 digit angka</b>`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        const user = db.getOrCreateUser(userId, username, firstName);
        const settings = db.getAllSettings();

        if (settings.mt_edabu === 'true') {
            await bot.sendMessage(msg.chat.id,
                `⚠️ <b>MAINTENANCE</b>\n\nFitur <b>CEK BPJS</b> sedang dalam perbaikan.`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        const edabuCost = parseInt(settings.edabu_cost) || config.edabuCost;

        if (user.token_balance < edabuCost) {
            await bot.sendMessage(msg.chat.id,
                `❌ <b>Saldo Tidak Cukup</b>\n\n🪙 Saldo: <b>${user.token_balance} token</b>\n💰 Biaya: <b>${edabuCost} token</b>\n\nKetik <code>/deposit</code> untuk top up`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        const requestId = db.createApiRequest(userId, 'edabu', nik, 'edabu', edabuCost);

        const processingMsg = await bot.sendMessage(msg.chat.id,
            formatter.processingMessage(nik, requestId),
            { parse_mode: 'HTML' }
        );

        db.deductTokens(userId, edabuCost);

        let result = await apiService.checkEdabu(nik);
        const updatedUser = db.getUser(userId);
        const remainingToken = updatedUser?.token_balance || 0;

        // If API fails, try to get from cache
        if (!result.success) {
            const cached = db.getCachedApiResponse('edabu', nik);
            if (cached && cached.response_data) {
                console.log(`📦 Using cached data for EDABU: ${nik}`);
                result = {
                    success: true,
                    data: cached.response_data,
                    fromCache: true
                };
            }
        }

        if (!result.success) {
            if (result.refund) {
                db.refundTokens(userId, edabuCost);
            }
            db.updateApiRequest(requestId, 'failed', null, null, result.error);
            db.createTransaction(userId, 'check', edabuCost, `Cek BPJS gagal`, nik, 'failed');
            
            await bot.editMessageText(
                `❌ <b>Gagal</b>\n\n${formatter.escapeHtml(result.error)}\n\n${result.refund ? `🪙 Token dikembalikan: <b>${edabuCost} token</b>\n` : ''}🆔 ID: <code>${requestId}</code>`,
                { chat_id: msg.chat.id, message_id: processingMsg.message_id, parse_mode: 'HTML' }
            );
            return;
        }

        if (!result.fromCache) {
            db.updateApiRequest(requestId, 'success', 'Data BPJS ditemukan', null, null, result.data);
        }
        db.createTransaction(userId, 'check', edabuCost, `Cek BPJS berhasil${result.fromCache ? ' (cache)' : ''}`, nik, 'success');

        // Fetch alamat untuk setiap anggota (skip if from cache to save API calls)
        const anggota = result.data?.anggota || [];
        const nikList = anggota.map(a => a.nik).filter(n => n);
        let nikAddresses = {};
        
        if (nikList.length > 0 && !result.fromCache) {
            try {
                nikAddresses = await apiService.fetchMultipleNIKAddresses(nikList);
            } catch (e) {
                console.error('Error fetching addresses:', e.message);
            }
        }

        let textResult = formatter.edabuResultMessage(result.data, edabuCost, requestId, remainingToken, nikAddresses);
        
        // Handle multiple messages if result is array (long content)
        if (Array.isArray(textResult)) {
            // Edit processing msg with first message
            let firstMsg = result.fromCache ? `📦 <i>Data dari SIGMABOY</i>\n\n` + textResult[0] : textResult[0];
            await bot.editMessageText(firstMsg, {
                chat_id: msg.chat.id,
                message_id: processingMsg.message_id,
                parse_mode: 'HTML'
            });
            // Send remaining messages
            for (let i = 1; i < textResult.length; i++) {
                await bot.sendMessage(msg.chat.id, textResult[i], {
                    parse_mode: 'HTML',
                    reply_to_message_id: msg.message_id
                });
            }
        } else {
            if (result.fromCache) {
                textResult = `📦 <i>Data dari SIGMABOY</i>\n\n` + textResult;
            }
            await bot.editMessageText(textResult, {
                chat_id: msg.chat.id,
                message_id: processingMsg.message_id,
                parse_mode: 'HTML'
            });
        }
    },

    async _vehicleLookup(bot, msg, args, commandName, costKey, title, example) {
        const userId = msg.from.id;
        const firstName = msg.from.first_name || 'User';
        const username = msg.from.username || null;

        if (args.length === 0) {
            await bot.sendMessage(msg.chat.id,
                `❌ <b>Format Salah</b>\n\nGunakan: <code>/${commandName} &lt;input&gt;</code>\nContoh: <code>/${commandName} ${example}</code>`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        const query = args.join('').toUpperCase().replace(/\s/g, '');
        if (query.length < 2 || query.length > 40) {
            await bot.sendMessage(msg.chat.id,
                `❌ <b>Input Tidak Valid</b>\n\nPanjang harus 2-40 karakter.`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        const user = db.getOrCreateUser(userId, username, firstName);
        const settings = db.getAllSettings();

        if (settings.mt_nopol === 'true') {
            await bot.sendMessage(msg.chat.id,
                `⚠️ <b>MAINTENANCE</b>\n\nFitur <b>${formatter.escapeHtml(title.toUpperCase())}</b> sedang dalam perbaikan.`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        const configCostMap = {
            nopol_cost: config.nopolCost,
            noka_cost: config.nokaCost,
            nosin_cost: config.nosinCost,
            nikplat_cost: config.nikplatCost
        };
        const lookupCost = parseInt(settings[costKey]) || configCostMap[costKey];

        if (user.token_balance < lookupCost) {
            await bot.sendMessage(msg.chat.id,
                `❌ <b>Saldo Tidak Cukup</b>\n\n🪙 Saldo: <b>${user.token_balance} token</b>\n💰 Biaya: <b>${lookupCost} token</b>\n\nKetik <code>/deposit</code> untuk top up`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        const requestId = db.createApiRequest(userId, commandName, query, 'asex_vehicle', lookupCost);
        const processingMsg = await bot.sendMessage(msg.chat.id,
            `⏳ <b>Sedang Proses...</b>\n\n🔍 ${formatter.escapeHtml(title)}: <b>${formatter.escapeHtml(query)}</b>\n🆔 ID: <code>${requestId}</code>\n<i>Masuk antrian, hasil bisa 2 menit atau lebih</i>`,
            { parse_mode: 'HTML' }
        );

        db.deductTokens(userId, lookupCost);

        const submit = await asexVehicleService.submitLookup(commandName, query);
        if (!submit.success) {
            if (submit.refund) db.refundTokens(userId, lookupCost);
            db.updateApiRequest(requestId, 'failed', null, null, submit.error);
            db.createTransaction(userId, 'check', lookupCost, `${title} gagal`, query, 'failed');
            await bot.editMessageText(
                `❌ <b>Gagal</b>\n\n${formatter.escapeHtml(submit.error)}\n\n${submit.refund ? `🪙 Token dikembalikan: <b>${lookupCost} token</b>\n` : ''}🆔 ID: <code>${requestId}</code>`,
                { chat_id: msg.chat.id, message_id: processingMsg.message_id, parse_mode: 'HTML' }
            );
            return;
        }

        await bot.editMessageText(
            `⏳ <b>Request Masuk Antrian</b>\n\n🔍 ${formatter.escapeHtml(title)}: <b>${formatter.escapeHtml(query)}</b>\n🆔 ID: <code>${requestId}</code>\n📮 Request Code: <code>${submit.requestCode}</code>\n\n<i>Bot akan mengirim hasil otomatis setelah selesai.</i>`,
            { chat_id: msg.chat.id, message_id: processingMsg.message_id, parse_mode: 'HTML' }
        );

        asexVehicleService.startPolling(submit.requestCode, async () => {
            const result = await asexVehicleService.waitForResult(submit.requestCode);

            if (!result.success) {
                if (result.refund) db.refundTokens(userId, lookupCost);
                db.updateApiRequest(requestId, 'failed', null, null, result.error);
                db.createTransaction(userId, 'check', lookupCost, `${title} gagal`, query, 'failed');
                await bot.sendMessage(msg.chat.id,
                    `❌ <b>${formatter.escapeHtml(title.toUpperCase())} GAGAL</b>\n\n${formatter.escapeHtml(result.error)}\n🆔 ID: <code>${requestId}</code>${result.refund ? `\n🪙 Token dikembalikan: <b>${lookupCost}</b>` : ''}`,
                    { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
                ).catch(() => {});
                return;
            }

            db.updateApiRequest(requestId, 'success', `${result.result?.nama_pemilik || 'Data kendaraan'}`, null, null, result.result);
            db.createTransaction(userId, 'check', lookupCost, `${title} berhasil`, query, 'success');

            const latestUser = db.getUser(userId);
            const latestRemaining = latestUser?.token_balance || 0;
            const text = formatter.nopolResultMessage(result.result, lookupCost, requestId, latestRemaining);
            await bot.sendMessage(msg.chat.id, text, { parse_mode: 'HTML', reply_to_message_id: msg.message_id }).catch(() => {});
        }).catch(() => {});
    },

    async nopol(bot, msg, args) {
        return this._vehicleLookup(bot, msg, args, 'nopol', 'nopol_cost', 'Cek Nopol', 'F1331GW');
    },

    async noka(bot, msg, args) {
        return this._vehicleLookup(bot, msg, args, 'noka', 'noka_cost', 'Cek Noka', 'MHL2020230L032555');
    },

    async nosin(bot, msg, args) {
        return this._vehicleLookup(bot, msg, args, 'nosin', 'nosin_cost', 'Cek Nosin', '11197460005377');
    },

    async nikplat(bot, msg, args) {
        return this._vehicleLookup(bot, msg, args, 'nikplat', 'nikplat_cost', 'Cek NikPlat', '3201381611850001');
    },

    async nik(bot, msg, args) {
        return this.nikplat(bot, msg, args);
    },

    /**
     * Command: /bpjstk <NIK>
     * Cek data BPJS Ketenagakerjaan
     */
    async bpjstk(bot, msg, args) {
        const userId = msg.from.id;
        const firstName = msg.from.first_name || 'User';
        const username = msg.from.username || null;
        
        if (args.length === 0) {
            await bot.sendMessage(msg.chat.id,
                `❌ <b>Format Salah</b>\n\nGunakan: <code>/bpjstk &lt;NIK&gt;</code>\nContoh: <code>/bpjstk 1234567890123456</code>`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        const nik = args[0].replace(/\D/g, '');

        if (!isValidNIK(nik)) {
            await bot.sendMessage(msg.chat.id,
                `❌ <b>NIK Tidak Valid</b>\n\nNIK harus <b>16 digit angka</b>`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        const user = db.getOrCreateUser(userId, username, firstName);
        const settings = db.getAllSettings();

        if (settings.mt_bpjstk === 'true') {
            await bot.sendMessage(msg.chat.id,
                `⚠️ <b>MAINTENANCE</b>\n\nFitur <b>CEK BPJS Ketenagakerjaan</b> sedang dalam perbaikan.`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        const bpjstkCost = parseInt(settings.bpjstk_cost) || config.bpjstkCost || 3;

        if (user.token_balance < bpjstkCost) {
            await bot.sendMessage(msg.chat.id,
                `❌ <b>Saldo Tidak Cukup</b>\n\n🪙 Saldo: <b>${user.token_balance} token</b>\n💰 Biaya: <b>${bpjstkCost} token</b>\n\nKetik <code>/deposit</code> untuk top up`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        const requestId = db.createApiRequest(userId, 'bpjstk', nik, 'bpjstk', bpjstkCost);

        const processingMsg = await bot.sendMessage(msg.chat.id,
            `⏳ <b>Sedang Proses...</b>\n\n🏢 Mencari data BPJS Ketenagakerjaan: <b>${nik}</b>\n🆔 ID: <code>${requestId}</code>\n\n<i>Mohon tunggu sebentar...</i>`,
            { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
        );

        db.deductTokens(userId, bpjstkCost);

        try {
            let result = await apiService.checkBPJSTK(nik);
            
            const updatedUser = db.getUser(userId);
            const remainingToken = updatedUser?.token_balance || 0;

            // If API fails, try to get from cache
            if (!result.success) {
                const cached = db.getCachedApiResponse('bpjstk', nik);
                if (cached && cached.response_data) {
                    console.log(`📦 Using cached data for BPJSTK: ${nik}`);
                    result = {
                        success: true,
                        data: cached.response_data,
                        fromCache: true
                    };
                }
            }

            if (!result.success) {
                if (result.refund) {
                    db.refundTokens(userId, bpjstkCost);
                }
                db.updateApiRequest(requestId, 'failed', null, null, result.error);
                db.createTransaction(userId, 'check', bpjstkCost, `Cek BPJS Ketenagakerjaan gagal`, nik, 'failed');
                
                await bot.editMessageText(
                    `❌ <b>Gagal</b>\n\n${formatter.escapeHtml(result.error)}\n\n${result.refund ? `🪙 Token dikembalikan: <b>${bpjstkCost} token</b>\n` : ''}🆔 ID: <code>${requestId}</code>`,
                    { chat_id: msg.chat.id, message_id: processingMsg.message_id, parse_mode: 'HTML' }
                );
                return;
            }

            const apiRemaining = result.data?.quota?.remaining || null;
            if (!result.fromCache) {
                db.updateApiRequest(requestId, 'success', `Data BPJSTK`, apiRemaining?.toString(), null, result.data);
            }
            db.createTransaction(userId, 'check', bpjstkCost, `Cek BPJS Ketenagakerjaan berhasil${result.fromCache ? ' (cache)' : ''}`, nik, 'success');

            let text = formatter.bpjstkResultMessage(result.data, bpjstkCost, requestId, remainingToken, apiRemaining);
            if (result.fromCache) {
                text = `📦 <i>Data dari Cache</i>\n\n` + text;
            }
            
            await bot.editMessageText(text, {
                chat_id: msg.chat.id,
                message_id: processingMsg.message_id,
                parse_mode: 'HTML'
            });

        } catch (error) {
            console.error('BPJSTK Error:', error);
            db.refundTokens(userId, bpjstkCost);
            db.updateApiRequest(requestId, 'failed', null, null, error.message);
            
            await bot.editMessageText(
                `❌ <b>Error</b>\n\n${formatter.escapeHtml(error.message)}\n\n🪙 Token dikembalikan: <b>${bpjstkCost} token</b>\n🆔 ID: <code>${requestId}</code>`,
                { chat_id: msg.chat.id, message_id: processingMsg.message_id, parse_mode: 'HTML' }
            );
        }
    },

    /**
     * Command: /deposit [jumlah] [kode_promo]
     * Show interactive deposit menu with +/- buttons OR process specific amount
     * Support promo code untuk bonus token
     */
    async deposit(bot, msg, args) {
        const userId = msg.from.id;
        const firstName = msg.from.first_name || 'User';
        const username = msg.from.username || null;
        
        const settings = db.getAllSettings();
        const tokenPrice = parseInt(settings.token_price) || config.tokenPrice;
        const minDeposit = parseInt(settings.min_deposit) || 2000; // Min deposit dari settings
        const minTopup = Math.ceil(minDeposit / tokenPrice); // Hitung min token dari min rupiah

        db.getOrCreateUser(userId, username, firstName);

        // If has args, process directly
        if (args.length > 0) {
            const tokenAmount = parseInt(args[0]);
            const promoCode = args[1] ? args[1].toUpperCase() : null;

            if (isNaN(tokenAmount) || tokenAmount < minTopup) {
                await bot.sendMessage(msg.chat.id,
                    `❌ <b>Jumlah Tidak Valid</b>\n\nMinimum deposit: <b>${minTopup} token</b>`,
                    { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
                );
                return;
            }

            // Validate promo code or auto-apply best promo
            let promoInfo = null;
            if (promoCode) {
                // User entered promo code
                const promoValidation = db.validatePromo(promoCode, userId.toString(), tokenAmount);
                if (!promoValidation.valid) {
                    await bot.sendMessage(msg.chat.id,
                        `❌ <b>Promo Tidak Valid</b>\n\n${formatter.escapeHtml(promoValidation.error)}`,
                        { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
                    );
                    return;
                }
                promoInfo = promoValidation;
            } else {
                // Auto-apply best promo
                const activePromos = db.getActivePromos();
                let bestPromo = null;
                let bestBonus = 0;
                
                for (const promo of activePromos) {
                    const validation = db.validatePromo(promo.code, userId.toString(), tokenAmount);
                    if (validation.valid && validation.bonusAmount > bestBonus) {
                        bestPromo = validation;
                        bestBonus = validation.bonusAmount;
                    }
                }
                
                if (bestPromo) {
                    promoInfo = bestPromo;
                    promoInfo.autoApplied = true;
                }
            }

            // Process deposit directly with promo info
            await this._processDeposit(bot, msg.chat.id, userId, username, firstName, tokenAmount, msg.message_id, promoInfo);
            return;
        }

        // Get active promos for display
        const activePromos = db.getActivePromos();
        let promoText = '';
        if (activePromos.length > 0) {
            promoText = `\n\n🎁 <b>PROMO AKTIF:</b>\n`;
            activePromos.slice(0, 3).forEach(p => {
                promoText += `• <b>${p.code}</b> - Bonus ${p.bonus_percent}%${p.min_deposit > 0 ? ` (min ${p.min_deposit}t)` : ''}\n`;
            });
            promoText += `\n<i>Pakai: /deposit &lt;jumlah&gt; &lt;kode&gt;</i>`;
        }

        // Show interactive deposit menu with +/- buttons
        const defaultAmount = 5;
        await this._sendDepositMenu(bot, msg.chat.id, userId, defaultAmount, msg.message_id, null, promoText);
    },

    /**
     * Send interactive deposit menu with +/- buttons
     */
    async _sendDepositMenu(bot, chatId, userId, currentAmount, replyToMsgId = null, editMessageId = null, promoText = '') {
        const settings = db.getAllSettings();
        const tokenPrice = parseInt(settings.token_price) || config.tokenPrice;
        const minDeposit = parseInt(settings.min_deposit) || 2000; // Min deposit dari settings
        const minTopup = Math.ceil(minDeposit / tokenPrice); // Hitung min token dari min rupiah
        const totalPrice = currentAmount * tokenPrice;

        const text = `💳 <b>DEPOSIT TOKEN</b>\n\n` +
            `💰 Harga: <b>${formatter.formatRupiah(tokenPrice)}/token</b>\n` +
            `📦 Minimum: <b>${minTopup} token</b>\n\n` +
            `━━━━━━━━━━━━━━━━━━━\n` +
            `🪙 <b>Jumlah:</b> <code>${currentAmount}</code> token\n` +
            `💵 <b>Total:</b> <code>${formatter.formatRupiah(totalPrice)}</code>\n` +
            `━━━━━━━━━━━━━━━━━━━${promoText}\n\n` +
            `👇 <i>Atur jumlah token:</i>`;

        // Build interactive keyboard
        const inlineKeyboard = [
            // Row 1: -10, -5, -1, +1, +5, +10
            [
                { text: '-10', callback_data: `dep_dec_${userId}_${currentAmount}_10` },
                { text: '-5', callback_data: `dep_dec_${userId}_${currentAmount}_5` },
                { text: '-1', callback_data: `dep_dec_${userId}_${currentAmount}_1` },
                { text: '+1', callback_data: `dep_inc_${userId}_${currentAmount}_1` },
                { text: '+5', callback_data: `dep_inc_${userId}_${currentAmount}_5` },
                { text: '+10', callback_data: `dep_inc_${userId}_${currentAmount}_10` }
            ],
            // Row 2: Quick amounts
            [
                { text: '🪙 10', callback_data: `dep_set_${userId}_10` },
                { text: '🪙 25', callback_data: `dep_set_${userId}_25` },
                { text: '🪙 50', callback_data: `dep_set_${userId}_50` },
                { text: '🪙 100', callback_data: `dep_set_${userId}_100` }
            ],
            // Row 3: Confirm button
            [
                { text: `✅ Deposit ${currentAmount} Token (${formatter.formatRupiah(totalPrice)})`, callback_data: `dep_confirm_${userId}_${currentAmount}` }
            ],
            // Row 4: Cancel
            [
                { text: '❌ Batal', callback_data: `dep_cancel_${userId}` }
            ]
        ];

        const options = {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: inlineKeyboard
            }
        };

        if (editMessageId) {
            // Edit existing message
            await bot.editMessageText(text, {
                chat_id: chatId,
                message_id: editMessageId,
                ...options
            }).catch(() => {});
        } else {
            // Send new message
            await bot.sendMessage(chatId, text, {
                ...options,
                reply_to_message_id: replyToMsgId
            });
        }
    },

    /**
     * Internal: Process deposit request
     */
    async _processDeposit(bot, chatId, userId, username, firstName, tokenAmount, replyToMsgId = null, promoInfo = null) {
        const settings = db.getAllSettings();
        const tokenPrice = parseInt(settings.token_price) || config.tokenPrice;

        db.getOrCreateUser(userId, username, firstName);

        const totalPrice = tokenAmount * tokenPrice;
        const statusMsg = await bot.sendMessage(chatId, '⏳ <i>Membuat Invoice QRIS...</i>', {
            parse_mode: 'HTML',
            reply_to_message_id: replyToMsgId
        });

        // Create Order with fancy ID
        const orderId = paymentService.generateOrderId(userId);
        const midtransResult = await paymentService.createQRISOrder(orderId, totalPrice);
        
        // Delete "Loading..."
        await bot.deleteMessage(chatId, statusMsg.message_id).catch(() => {});

        let depositId;
        
        if (!midtransResult.success) {
            await bot.sendMessage(chatId, formatter.errorMessage('Gagal Membuat Deposit', midtransResult.error || 'Gateway Error'), { parse_mode: 'HTML' });
            return;
        }

        // Save to DB
        depositId = db.createDeposit(userId, totalPrice, tokenAmount, 'midtrans', {
            orderId: midtransResult.orderId,
            checkoutUrl: midtransResult.paymentUrl,
            expiresAt: midtransResult.expiresAt
        });

        // Build promo text if applicable
        let promoText = '';
        if (promoInfo) {
            const autoAppliedText = promoInfo.autoApplied ? ' (Otomatis Diterapkan ✨)' : '';
            promoText = `\n\n🎁 <b>PROMO ${promoInfo.promo.code}${autoAppliedText}</b>\n   Bonus: <b>+${promoInfo.bonusAmount} token</b> (${promoInfo.bonusPercent}%)\n   Total Akhir: <b>${tokenAmount + promoInfo.bonusAmount} token</b>`;
            
            // Simpan info promo untuk processing nanti
            db.setSetting(`promo_order_${orderId}`, JSON.stringify({
                code: promoInfo.promo.code,
                promoId: promoInfo.promo.id,
                bonusAmount: promoInfo.bonusAmount,
                bonusPercent: promoInfo.bonusPercent
            }));
        }

        const text = formatter.depositRequestMessage(tokenAmount, totalPrice, orderId, true, midtransResult.expiresAt) + promoText;
        
        // Build inline keyboard
        const inlineKeyboard = [];
        
        // If no QR string, add payment link button as fallback
        if (!midtransResult.qrString && midtransResult.redirectUrl) {
            inlineKeyboard.push([
                { text: '💳 Bayar Sekarang', url: midtransResult.redirectUrl }
            ]);
        }
        
        // Check status button (stores depositId and userId for validation)
        inlineKeyboard.push([
            { text: '🔄 Cek Status Pembayaran', callback_data: `checkpay_${userId}_${depositId}` }
        ]);
        
        // Cancel button
        inlineKeyboard.push([
            { text: '❌ Batalkan', callback_data: `cancelpay_${userId}_${depositId}` }
        ]);
        
        // Add support buttons
        if (config.ownerIds && config.ownerIds.length > 0) {
            const supportButtons = config.ownerIds.map((id, index) => ({
                text: `📞 Support ${config.ownerIds.length > 1 ? (index + 1) : ''}`,
                url: `tg://user?id=${id}`
            }));
            
            for (let i = 0; i < supportButtons.length; i += 2) {
                inlineKeyboard.push(supportButtons.slice(i, i + 2));
            }
        }

        let sentMsg;
        if (midtransResult.qrString) {
            // Generate QR image from QRIS string
            const qrBuffer = await QRCode.toBuffer(midtransResult.qrString, {
                type: 'png',
                width: 500,
                margin: 2,
                color: { dark: '#000000', light: '#FFFFFF' }
            });
            sentMsg = await bot.sendPhoto(chatId, qrBuffer, {
                caption: text,
                parse_mode: 'HTML',
                reply_to_message_id: replyToMsgId,
                reply_markup: {
                    inline_keyboard: inlineKeyboard
                }
            });
        } else {
            // Fallback: send text with payment link
            const fallbackText = text + `\n\n🔗 <b>Link Pembayaran:</b>\n${midtransResult.redirectUrl}`;
            sentMsg = await bot.sendMessage(chatId, fallbackText, {
                parse_mode: 'HTML',
                reply_to_message_id: replyToMsgId,
                reply_markup: {
                    inline_keyboard: inlineKeyboard
                }
            });
        }

        // Start Polling (Every 5s)
        const pollInterval = 5000;
        const maxTime = 9 * 60 * 1000 + 30000;
        const startTime = Date.now();
        const messageId = sentMsg.message_id;

        const interval = setInterval(async () => {
            try {
                if (Date.now() - startTime > maxTime) {
                    clearInterval(interval);
                    await bot.deleteMessage(chatId, messageId).catch(() => {});
                    await bot.sendMessage(chatId, `❌ <b>Deposit #${depositId} Expired</b>\nSilakan buat request baru.`, { parse_mode: 'HTML' });
                    db.rejectDeposit(depositId);
                    return;
                }

                const check = await paymentService.checkPaymentStatus(orderId, totalPrice);
                const currentDep = db.getDeposit(depositId);

                if (currentDep && currentDep.status === 'approved') {
                    clearInterval(interval);
                    await bot.deleteMessage(chatId, messageId).catch(() => {});
                    
                    // Check for promo bonus
                    let successMsg = `✅ <b>Deposit ${orderId} Berhasil!</b>\n🪙 <b>${tokenAmount} token</b> telah masuk ke akun Anda.`;
                    const promoDataStr = db.getSetting(`promo_order_${orderId}`);
                    if (promoDataStr) {
                        try {
                            const promoData = JSON.parse(promoDataStr);
                            if (promoData.bonusAmount > 0) {
                                successMsg = `✅ <b>Deposit ${orderId} Berhasil!</b>\n\n🪙 Token Deposit: <b>${tokenAmount}</b>\n🎁 Bonus Promo (${promoData.code}): <b>+${promoData.bonusAmount}</b>\n━━━━━━━━━━━━━━━\n💰 Total Token: <b>${tokenAmount + promoData.bonusAmount}</b>`;
                            }
                        } catch (e) {}
                    }
                    
                    await bot.sendMessage(chatId, successMsg, { parse_mode: 'HTML' });
                    return;
                }

                if (check.success && (check.status === 'SETTLED' || check.status === 'PAID')) {
                    clearInterval(interval);
                    db.approveDeposit(depositId, 'SYSTEM_AUTO');
                    
                    // Process promo bonus
                    let bonusAmount = 0;
                    let promoCode = '';
                    const promoDataStr = db.getSetting(`promo_order_${orderId}`);
                    if (promoDataStr) {
                        try {
                            const promoData = JSON.parse(promoDataStr);
                            bonusAmount = promoData.bonusAmount;
                            promoCode = promoData.code;
                            
                            if (bonusAmount > 0 && promoData.promoId) {
                                // Add bonus tokens
                                db.updateTokenBalance(userId, bonusAmount);
                                // Record promo usage
                                db.usePromo(promoData.promoId, userId, tokenAmount, bonusAmount);
                                // Create transaction record
                                db.createTransaction(userId, 'promo_bonus', bonusAmount, 
                                    `Bonus promo ${promoCode} untuk deposit ${orderId}`, orderId, 'success');
                                // Clean up
                                db.setSetting(`promo_order_${orderId}`, '');
                            }
                        } catch (e) {
                            console.error('Error processing promo bonus:', e);
                        }
                    }
                    
                    await bot.deleteMessage(chatId, messageId).catch(() => {});
                    
                    let successMsg = `✅ <b>Deposit ${orderId} Berhasil!</b>\n🪙 <b>${tokenAmount} token</b> telah masuk ke akun Anda.`;
                    if (bonusAmount > 0) {
                        successMsg = `✅ <b>Deposit ${orderId} Berhasil!</b>\n\n🪙 Token Deposit: <b>${tokenAmount}</b>\n🎁 Bonus Promo (${promoCode}): <b>+${bonusAmount}</b>\n━━━━━━━━━━━━━━━\n💰 Total Token: <b>${tokenAmount + bonusAmount}</b>`;
                    }
                    
                    await bot.sendMessage(chatId, successMsg, { parse_mode: 'HTML' });
                } 
                else if (check.success && check.status === 'EXPIRED') {
                    clearInterval(interval);
                    db.rejectDeposit(depositId);
                    await bot.deleteMessage(chatId, messageId).catch(() => {});
                    await bot.sendMessage(chatId, `❌ <b>Deposit ${orderId} Expired</b>\nSilakan buat deposit baru.`, { parse_mode: 'HTML' });
                }
            } catch (err) {
                console.error(`[Poll #${depositId}] Error:`, err.message);
            }
        }, pollInterval);
    },

    /**
     * Command: /riwayat
     */
    async riwayat(bot, msg, args) {
        const userId = msg.from.id;
        const firstName = msg.from.first_name || 'User';
        const username = msg.from.username || null;
        
        const user = db.getOrCreateUser(userId, username, firstName);
        const settings = db.getAllSettings();
        const riwayatDays = parseInt(settings.riwayat_days) || config.riwayatDays;

        const apiRequests = db.getUserApiRequestsWithinDays(userId, riwayatDays, 30);
        
        if (apiRequests.length === 0) {
            await bot.sendMessage(msg.chat.id,
                `<b>📋 RIWAYAT ${riwayatDays} HARI TERAKHIR</b>\n\n📭 Belum ada riwayat pencarian\n\n🪙 Saldo: <b>${user.token_balance} token</b>`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        let historyText = `<b>╔════════════════╗</b>\n<b>║</b>  📋 <b>RIWAYAT (${riwayatDays} Hari)</b>\n<b>╚════════════════╝</b>\n`;
        
        apiRequests.slice(0, 10).forEach((req, idx) => {
            const date = new Date(req.created_at).toLocaleString('id-ID', { 
                day: '2-digit', month: '2-digit', year: '2-digit',
                hour: '2-digit', minute: '2-digit',
                timeZone: 'Asia/Jakarta'
            });
            const statusIcon = req.status === 'success' ? '✅' : '❌';
            const cmdIcon = {
                'ceknik': '🔍',
                'nama': '👤',
                'kk': '👨‍👩‍👧‍👦',
                'ceknomor': '📱',
                'edabu': '🏥'
            }[req.command] || '📝';
            
            historyText += `\n${idx + 1}. ${cmdIcon} <b>${req.command.toUpperCase()}</b>\n`;
            historyText += `   📝 ${formatter.escapeHtml(req.query || '-')}\n`;
            historyText += `   ${statusIcon} ${req.status} | 🪙 -${req.token_cost}t\n`;
            historyText += `   🆔 <code>${req.request_id}</code>\n`;
            historyText += `   📅 ${date}\n`;
        });
        
        historyText += `\n<b>╔════════════════╗</b>\n<b>║</b> 📊 Total: <b>${apiRequests.length}</b> data\n<b>║</b> 🪙 Saldo: <b>${user.token_balance} token</b>\n<b>╚════════════════╝</b>`;
        historyText += `\n\n💡 <i>Ketik <code>/getdata &lt;ID&gt;</code> untuk detail</i>`;

        await bot.sendMessage(msg.chat.id, historyText, { 
            parse_mode: 'HTML',
            reply_to_message_id: msg.message_id 
        });
    },

    /**
     * Command: /getdata <request_id>
     */
    async getdata(bot, msg, args) {
        const userId = msg.from.id;
        const firstName = msg.from.first_name || 'User';
        const username = msg.from.username || null;
        const settings = db.getAllSettings();
        const riwayatDays = parseInt(settings.riwayat_days) || config.riwayatDays;
        const getdataCost = parseFloat(settings.getdata_cost) || config.getdataCost;
        
        if (args.length === 0) {
            await bot.sendMessage(msg.chat.id,
                `❌ <b>Format Salah</b>\n\nGunakan: <code>/getdata &lt;ID&gt;</code>\nContoh: <code>/getdata REQ-ABC123</code>\n\n💰 Biaya: <b>${getdataCost} token</b>`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        const user = db.getOrCreateUser(userId, username, firstName);
        if (user.token_balance < getdataCost) {
            await bot.sendMessage(msg.chat.id,
                `❌ <b>Saldo Tidak Cukup</b>\n\n🪙 Saldo: <b>${user.token_balance} token</b>\n💰 Biaya: <b>${getdataCost} token</b>`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        const requestId = args[0].toUpperCase();
        const request = db.getApiRequestWithData(requestId);

        if (!request) {
            await bot.sendMessage(msg.chat.id,
                `❌ <b>Data Tidak Ditemukan</b>\n\nID <code>${requestId}</code> tidak ditemukan.`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        if (String(request.user_id) !== String(userId)) {
            await bot.sendMessage(msg.chat.id,
                `❌ <b>Akses Ditolak</b>\n\n🚫 ID ini milik user lain.`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        const createdDate = new Date(request.created_at);
        const now = new Date();
        const daysDiff = Math.floor((now - createdDate) / (1000 * 60 * 60 * 24));
        
        if (daysDiff > riwayatDays) {
            await bot.sendMessage(msg.chat.id,
                `❌ <b>Data Kadaluarsa</b>\n\nData lebih dari ${riwayatDays} hari.`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        if (request.status !== 'success' || !request.response_data) {
            await bot.sendMessage(msg.chat.id,
                `❌ <b>Data Tidak Tersedia</b>\n\nData hasil pencarian tidak tersimpan.`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        db.deductTokens(userId, getdataCost);
        db.createTransaction(userId, 'check', getdataCost, `Ambil data riwayat`, requestId, 'success');

        const data = request.response_data;
        const updatedUser = db.getUser(userId);
        let resultText = '';

        switch (request.command) {
            case 'ceknik':
                resultText = formatter.nikResultMessage(data, getdataCost, requestId, updatedUser.token_balance);
                break;
            case 'kk':
                resultText = formatter.kkResultMessage(data.members || [], data.nkk || request.query, getdataCost, requestId, updatedUser.token_balance);
                break;
            case 'edabu':
                resultText = formatter.edabuResultMessage(data, getdataCost, requestId, updatedUser.token_balance);
                break;
            default:
                resultText = `<b>📋 DATA TERSIMPAN</b>\n\n<code>${JSON.stringify(data, null, 2).substring(0, 3000)}</code>`;
        }

        await bot.sendMessage(msg.chat.id, resultText, { 
            parse_mode: 'HTML',
            reply_to_message_id: msg.message_id 
        });
    },

    /**
     * Command: /ref atau /reff - Get referral link
     */
    async ref(bot, msg) {
        const userId = msg.from.id;
        const firstName = msg.from.first_name || 'User';
        const username = msg.from.username || null;
        
        if (!checkCooldown(userId, 'ref', 3000)) return;
        
        db.getOrCreateUser(userId, username, firstName);
        
        const refCode = db.getOrCreateReferralCode(userId);
        const botInfo = await bot.getMe();
        const text = formatter.referralMessage(refCode.code, botInfo.username);
        
        await bot.sendMessage(msg.chat.id, text, { 
            parse_mode: 'HTML',
            reply_to_message_id: msg.message_id 
        });
    },

    async reff(bot, msg) {
        return this.ref(bot, msg);
    },

    async referral(bot, msg) {
        return this.ref(bot, msg);
    },

    /**
     * Command: /myref - Referral statistics
     */
    async myref(bot, msg) {
        const userId = msg.from.id;
        const firstName = msg.from.first_name || 'User';
        const username = msg.from.username || null;
        
        if (!checkCooldown(userId, 'myref', 3000)) return;
        
        db.getOrCreateUser(userId, username, firstName);
        
        const stats = db.getReferralStats(userId);
        const botInfo = await bot.getMe();
        const text = formatter.referralStatsMessage(stats, botInfo.username);
        
        // Get list of referred users
        const referredUsers = db.getReferredUsers(userId, 5);
        let listText = '';
        
        if (referredUsers.length > 0) {
            listText = '\n\n👥 <b>Referral Terbaru:</b>';
            referredUsers.forEach((r, i) => {
                const name = r.username ? `@${r.username}` : (r.first_name || 'User');
                const bonusStatus = r.bonus_claimed ? '✅' : '⏳';
                listText += `\n${i + 1}. ${name} ${bonusStatus}`;
            });
        }
        
        await bot.sendMessage(msg.chat.id, text + listText, { 
            parse_mode: 'HTML',
            reply_to_message_id: msg.message_id 
        });
    },

    /**
     * Command: /databocor <query> - Search leaked data (LeakOSINT API)
     */
    async databocor(bot, msg, args) {
        const userId = msg.from.id;
        const firstName = msg.from.first_name || 'User';
        const username = msg.from.username || null;
        
        if (!checkCooldown(userId, 'databocor', 5000)) return;
        
        db.getOrCreateUser(userId, username, firstName);
        
        // Check if feature is enabled (maintenance check)
        const isMaintenanceMode = db.getMaintenance?.('databocor') || false;
        if (isMaintenanceMode) {
            await bot.sendMessage(msg.chat.id, '🔧 <b>Fitur DATABOCOR sedang dalam maintenance</b>\n\nSilakan coba beberapa saat lagi.', {
                parse_mode: 'HTML',
                reply_to_message_id: msg.message_id
            });
            return;
        }
        
        // Usage info
        if (!args || args.length === 0) {
            await bot.sendMessage(msg.chat.id,
                `📝 <b>CARA PENGGUNAAN DATABOCOR</b>\n\n` +
                `Format: /databocor &lt;query&gt;\n\n` +
                `📋 <b>Contoh:</b>\n` +
                `• /databocor ABDUL ROZAQ - cari nama\n` +
                `• /databocor email@gmail.com - cari email\n` +
                `• /databocor 081234567890 - cari nomor HP\n` +
                `• /databocor 3201XXXXXXXXXXXX - cari NIK\n\n` +
                `💰 Cost: <b>${config.databocorCost} token</b>\n\n` +
                `<i>Mencari data dari berbagai sumber kebocoran data.</i>`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }
        
        const query = args.join(' ');
        
        // Validate query length
        if (query.length < 3) {
            await bot.sendMessage(msg.chat.id, '❌ Query terlalu pendek!\n\n<i>Minimal 3 karakter untuk pencarian.</i>', {
                parse_mode: 'HTML',
                reply_to_message_id: msg.message_id
            });
            return;
        }
        
        // Check balance
        const user = db.getUser(userId);
        if (!user || user.token_balance < config.databocorCost) {
            await bot.sendMessage(msg.chat.id,
                `❌ <b>TOKEN TIDAK CUKUP</b>\n\n` +
                `💰 Dibutuhkan: <b>${config.databocorCost} token</b>\n` +
                `💳 Saldo Anda: <b>${user?.token_balance || 0} token</b>\n\n` +
                `Ketik /deposit untuk top up token.`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }
        
        // Send processing message
        const processingMsg = await bot.sendMessage(msg.chat.id,
            `⏳ <b>Memproses Permintaan</b>\n\n🔍 Query: <code>${query}</code>\n\n<i>Mencari di berbagai database kebocoran...</i>`,
            { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
        );
        
        try {
            // Create API request for tracking
            const requestId = db.createApiRequest(userId, 'databocor', query, 'leakosint', config.databocorCost);
            
            // Call LeakOSINT API
            const response = await axios.post(config.leakosintApiUrl, {
                token: config.leakosintToken,
                request: query,
                limit: 100,
                lang: 'id',
                type: 'json'
            }, {
                timeout: 60000,
                headers: { 'Content-Type': 'application/json' }
            });
            
            const result = response.data;
            
            // Delete processing message
            await bot.deleteMessage(msg.chat.id, processingMsg.message_id).catch(() => {});
            
            if (!result || result.NumOfResults === 0) {
                db.updateApiRequest(requestId, 'failed', null, null, 'No data found');
                await bot.sendMessage(msg.chat.id,
                    `❌ <b>Data Tidak Ditemukan</b>\n\n🔍 Query: <code>${query}</code>\n🆔 ID: <code>${requestId}</code>\n\n<i>Tidak ada data ditemukan di database kebocoran.</i>`,
                    { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
                );
                return;
            }
            
            // Deduct tokens
            db.deductTokens(userId, config.databocorCost);
            
            // Update API request status
            db.updateApiRequest(requestId, 'success', `${result.NumOfResults || 0} hasil dari ${result.NumOfDatabase || 0} database`, null, null, result);
            
            // Format response as plain text for file
            let fileContent = `DATA BOCOR - SEARCH RESULT\n`;
            fileContent += `Request ID: ${requestId}\n`;
            fileContent += `${'='.repeat(50)}\n\n`;
            fileContent += `Query: ${query}\n`;
            fileContent += `Total: ${result.NumOfResults || 0} hasil\n`;
            fileContent += `Database: ${result.NumOfDatabase || 0}\n\n`;
            fileContent += `${'='.repeat(50)}\n\n`;
            
            // Format each database result
            if (result.List) {
                for (const [dbName, dbData] of Object.entries(result.List)) {
                    fileContent += `📁 ${dbName} (${dbData.NumOfResults || 0} hasil)\n`;
                    fileContent += `${'-'.repeat(50)}\n`;
                    
                    if (dbData.Data && dbData.Data.length > 0) {
                        for (const item of dbData.Data) {
                            for (const [key, value] of Object.entries(item)) {
                                if (value) {
                                    fileContent += `${key.padEnd(15)}: ${value}\n`;
                                }
                            }
                            fileContent += `\n`;
                        }
                    }
                    
                    if (dbData.InfoLeak) {
                        fileContent += `Info: ${dbData.InfoLeak}\n`;
                    }
                    fileContent += `\n`;
                }
            }
            
            const newBalance = db.getUser(userId)?.token_balance || 0;
            fileContent += `${'='.repeat(50)}\n`;
            fileContent += `Cost: -${config.databocorCost} token | Remaining: ${newBalance} token\n`;
            fileContent += `Generated: ${new Date().toLocaleString('id-ID')}\n`;
            
            // Send as file
            const fileName = `databocor_${query.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.txt`;
            await bot.sendDocument(msg.chat.id, Buffer.from(fileContent, 'utf-8'), {
                caption: `🔓 <b>Data Bocor Result</b>\n\n🔍 Query: <code>${query}</code>\n📊 Total: ${result.NumOfResults || 0} hasil\n🆔 ID: <code>${requestId}</code>\n💰 -${config.databocorCost} token | Sisa: ${newBalance}`,
                parse_mode: 'HTML',
                reply_to_message_id: msg.message_id
            }, {
                filename: fileName,
                contentType: 'text/plain'
            });
            
        } catch (error) {
            console.error('❌ DATABOCOR ERROR:', error.message);
            await bot.deleteMessage(msg.chat.id, processingMsg.message_id).catch(() => {});
            await bot.sendMessage(msg.chat.id,
                `❌ <b>Terjadi Kesalahan</b>\n\n<i>${error.message}</i>\n\nSilakan coba lagi nanti.`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
        }
    },
    
    /**
     * Command: /getcontact <phone>
     * Cari nama dari nomor HP via multiple sources
     */
    async getcontact(bot, msg, args) {
        const userId = msg.from.id;
        const firstName = msg.from.first_name || 'User';
        const username = msg.from.username || null;
        
        if (!checkCooldown(userId, 'getcontact', 5000)) return;
        
        const user = db.getOrCreateUser(userId, username, firstName);
        
        // Cek maintenance mode
        const settings = db.getAllSettings();
        if (settings.maintenance_mode === '1') {
            await bot.sendMessage(msg.chat.id, 
                `⚠️ <b>Mode Maintenance</b>\n\nFitur getcontact sedang dalam perbaikan.`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }
        
        // Cek input
        if (!args || args.length === 0) {
            await bot.sendMessage(msg.chat.id,
                `📱 <b>GetContact - Lookup Nomor HP</b>\n\n` +
                `Gunakan: <code>/getcontact [nomor_hp]</code>\n\n` +
                `Contoh:\n` +
                `• <code>/getcontact 081234567890</code>\n` +
                `• <code>/getcontact +6281234567890</code>\n\n` +
                `💰 Biaya: <b>${config.getcontactCost} token</b>\n` +
                `🪙 Saldo: <b>${user.token_balance} token</b>`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }
        
        // Clean phone number
        let phoneNumber = args[0].replace(/[^0-9+]/g, '');
        if (phoneNumber.startsWith('+')) phoneNumber = phoneNumber.slice(1);
        if (phoneNumber.startsWith('0')) phoneNumber = '62' + phoneNumber.slice(1);
        
        // Validasi nomor HP
        if (phoneNumber.length < 10 || phoneNumber.length > 15) {
            await bot.sendMessage(msg.chat.id,
                `❌ <b>Nomor HP Tidak Valid</b>\n\nPastikan nomor HP benar (10-15 digit).`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }
        
        // Cek saldo
        if (user.token_balance < config.getcontactCost) {
            await bot.sendMessage(msg.chat.id,
                `❌ <b>Saldo Tidak Cukup</b>\n\n🪙 Saldo: <b>${user.token_balance} token</b>\n💰 Biaya: <b>${config.getcontactCost} token</b>\n\nSilakan deposit terlebih dahulu dengan /deposit`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }
        
        // Processing message
        const processingMsg = await bot.sendMessage(msg.chat.id,
            `🔍 <b>Mencari info nomor...</b>\n\n📱 ${phoneNumber}\n\n⏳ Mohon tunggu, mengecek dari berbagai sumber...`,
            { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
        );
        
        try {
            // Call GetContact API
            const response = await axios.post(config.getcontactApiUrl, {
                phoneNumber: phoneNumber,
                key: config.getcontactKey
            }, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
                    'Content-Type': 'application/json',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Origin': 'https://data-publik.com',
                    'Referer': 'https://data-publik.com/getcontact-multi'
                },
                timeout: 30000
            });
            
            await bot.deleteMessage(msg.chat.id, processingMsg.message_id).catch(() => {});
            
            if (!response.data.success) {
                throw new Error(response.data.message || 'API request failed');
            }
            
            const data = response.data.data;
            const sources = data.sources || [];
            
            // Deduct tokens
            console.log(`💰 [GETCONTACT] Token before: ${user.token_balance}`);
            db.deductTokens(userId, config.getcontactCost);
            const newBalance = db.getUser(userId)?.token_balance || 0;
            console.log(`💰 [GETCONTACT] Token after: ${newBalance} (-${config.getcontactCost})`);
            
            // Create request record
            const requestId = db.createApiRequest(userId, 'getcontact', phoneNumber, 'getcontact', config.getcontactCost);
            db.updateApiRequest(requestId, 'completed', JSON.stringify(data));
            
            // Build response text
            let fileContent = `${'='.repeat(50)}\n`;
            fileContent += `       GETCONTACT RESULT - Multi Source\n`;
            fileContent += `${'='.repeat(50)}\n\n`;
            fileContent += `Request ID: ${requestId}\n`;
            fileContent += `Phone Number: ${data.request || phoneNumber}\n`;
            fileContent += `Generated: ${new Date().toLocaleString('id-ID')}\n\n`;
            
            let successSources = 0;
            let primaryName = null;
            let tags = [];
            let avatar = null;
            
            for (const source of sources) {
                const result = source.results?.response;
                const status = source.results?.statusCode;
                const sourceName = source.source?.toUpperCase() || 'UNKNOWN';
                
                if (status === 200 && result && !result.error) {
                    successSources++;
                    fileContent += `${'─'.repeat(40)}\n`;
                    fileContent += `📌 SOURCE: ${sourceName}\n`;
                    fileContent += `${'─'.repeat(40)}\n`;
                    
                    if (result.name) {
                        fileContent += `👤 Nama: ${result.name}\n`;
                        if (!primaryName) primaryName = result.name;
                    }
                    if (result.displayName) {
                        fileContent += `👤 Display Name: ${result.displayName}\n`;
                        if (!primaryName) primaryName = result.displayName;
                    }
                    if (result.operator) {
                        fileContent += `📡 Operator: ${result.operator}\n`;
                    }
                    if (result.urlAvatar || result.avatar || result.profileImage) {
                        avatar = result.urlAvatar || result.avatar || result.profileImage;
                        fileContent += `🖼️ Avatar: ${avatar}\n`;
                    }
                    if (result.extra?.profileImage) {
                        avatar = result.extra.profileImage;
                        fileContent += `🖼️ Profile: ${avatar}\n`;
                    }
                    if (result.networks && result.networks.length > 0) {
                        fileContent += `🌐 Networks: ${result.networks.join(', ')}\n`;
                    }
                    
                    // Handle tags from getcontact source - tampilkan semua
                    if (result.extra?.tags && result.extra.tags.length > 0) {
                        fileContent += `\n📋 TAGS (${result.extra.tagCount || result.extra.tags.length} total):\n`;
                        for (const t of result.extra.tags) {
                            fileContent += `   • ${t.tag} (${t.count}x)\n`;
                            tags.push(t.tag);
                        }
                    }
                    fileContent += `\n`;
                }
            }
            
            if (successSources === 0) {
                fileContent += `\n❌ Tidak ditemukan data untuk nomor ini.\n`;
            }
            
            fileContent += `\n${'='.repeat(50)}\n`;
            fileContent += `Sources checked: ${sources.length}\n`;
            fileContent += `Success: ${successSources}\n`;
            fileContent += `Cost: -${config.getcontactCost} token | Saldo: ${newBalance} token\n`;
            fileContent += `${'='.repeat(50)}\n`;
            
            // Build summary caption
            let caption = `📱 <b>GetContact Result</b>\n\n`;
            caption += `📞 <b>Nomor:</b> ${data.request || phoneNumber}\n`;
            if (primaryName) caption += `👤 <b>Nama:</b> ${primaryName}\n`;
            if (tags.length > 0) caption += `🏷️ <b>Top Tags:</b> ${tags.slice(0, 5).join(', ')}\n`;
            caption += `\n📊 <b>${successSources}/${sources.length}</b> sumber ditemukan\n`;
            caption += `🆔 ID: <code>${requestId}</code>\n`;
            caption += `💰 -${config.getcontactCost} token | Sisa: ${newBalance}`;
            
            const fileName = `getcontact_${phoneNumber}_${Date.now()}.txt`;
            await bot.sendDocument(msg.chat.id, Buffer.from(fileContent, 'utf-8'), {
                caption: caption,
                parse_mode: 'HTML',
                reply_to_message_id: msg.message_id
            }, {
                filename: fileName,
                contentType: 'text/plain'
            });
            
        } catch (error) {
            console.error('❌ GETCONTACT ERROR:', error.message);
            await bot.deleteMessage(msg.chat.id, processingMsg.message_id).catch(() => {});
            await bot.sendMessage(msg.chat.id,
                `❌ <b>Terjadi Kesalahan</b>\n\n<i>${error.message}</i>\n\nSilakan coba lagi nanti.`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
        }
    },

    /**
     * ═══════════════════════════════════════════
     * Command: /bugwa <target> <mode>
     * BugWA - WhatsApp Bug/Crash Sender
     * Mode: crashinvis, invisdelay
     * ═══════════════════════════════════════════
     */
    async bugwa(bot, msg, args) {
        const userId = String(msg.from.id);
        const validModes = bugwaService.getValidModes();
        const modeList = Object.entries(validModes).map(([k, v]) => `• <b>${k}</b> - ${v.name}`).join('\n');

        if (args.length < 2) {
            await bot.sendMessage(msg.chat.id,
                `❌ <b>Format Salah</b>\n\n📋 <b>Cara Penggunaan:</b>\n<code>/bugwa &lt;target&gt; &lt;mode&gt;</code>\n\n✅ <b>Mode:</b>\n${modeList}\n\n📱 <b>Contoh:</b>\n<code>/bugwa 081234567890 crashinvis</code>\n<code>/bugwa 6281234567890 crashios</code>\n<code>/bugwa 6281234567890 invisdelay</code>\n\n📋 <b>Sub-command:</b>\n<code>/bugwa stop &lt;target&gt; &lt;mode&gt;</code> - Hentikan attack\n<code>/bugwa &lt;nomor&gt; status</code> - Lihat attack aktif\n<code>/bugwa status</code> - Lihat semua attack aktif`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        // Sub-command: stop
        if (args[0].toLowerCase() === 'stop') {
            if (args.length < 3) {
                await bot.sendMessage(msg.chat.id,
                    `❌ <b>Format:</b> <code>/bugwa stop &lt;target&gt; &lt;mode&gt;</code>\nContoh: <code>/bugwa stop 081234567890 crashinvis</code>`,
                    { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
                );
                return;
            }
            
            const stopResult = await bugwaService.stopAttack(args[1], args[2], userId);
            if (stopResult.success) {
                await bot.sendMessage(msg.chat.id,
                    `✅ <b>Attack Dihentikan</b>\n\n📞 Target: <b>${stopResult.target}</b>\n⚙️ Mode: <b>${stopResult.mode}</b>`,
                    { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
                );
            } else {
                await bot.sendMessage(msg.chat.id,
                    `❌ <b>Gagal Stop</b>\n\n${stopResult.error}`,
                    { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
                );
            }
            return;
        }

        // Sub-command: status
        if (args[0].toLowerCase() === 'status') {
            const statusResult = await bugwaService.getActiveAttacks(userId);
            
            if (!statusResult.success) {
                await bot.sendMessage(msg.chat.id,
                    `❌ <b>Gagal Cek Status</b>\n\n${statusResult.error}`,
                    { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
                );
                return;
            }

            if (statusResult.total === 0) {
                await bot.sendMessage(msg.chat.id,
                    `📊 <b>ATTACK STATUS</b>\n\n📭 Tidak ada attack aktif`,
                    { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
                );
                return;
            }

            let statusText = `📊 <b>ATTACK AKTIF</b> (${statusResult.total})\n────────────────\n\n`;
            statusResult.attacks.forEach((atk, i) => {
                statusText += `${i + 1}. 📞 <b>${atk.target}</b>\n`;
                statusText += `   ⚙️ Mode: <b>${atk.mode}</b>\n`;
                statusText += `   📤 Sent: <b>${atk.count}x</b> (${atk.senderCount} sender)\n`;
                statusText += `────────────────\n`;
            });
            statusText += `\n💡 <i>Stop: /bugwa stop &lt;target&gt; &lt;mode&gt;</i>`;

            await bot.sendMessage(msg.chat.id, statusText, { parse_mode: 'HTML', reply_to_message_id: msg.message_id });
            return;
        }

        // Main attack
        const target = args[0];
        const mode = args[1].toLowerCase();

        if (!validModes[mode]) {
            await bot.sendMessage(msg.chat.id,
                `❌ <b>Mode tidak valid</b>\n\n✅ <b>Mode tersedia:</b>\n${modeList}`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        // Cek user dan saldo
        const user = db.getOrCreateUser(userId, msg.from.first_name);
        const settings = db.getAllSettings();

        // Cek Maintenance
        if (settings.mt_bugwa === 'true') {
            await bot.sendMessage(msg.chat.id,
                '⚠️ <b>MAINTENANCE</b>\n\nFitur <b>BUGWA</b> sedang dalam perbaikan sementara.\nSilakan coba lagi nanti.',
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        const bugwaCost = parseInt(settings.bugwa_cost) || config.bugwaCost || 3;

        if (user.token_balance < bugwaCost) {
            await bot.sendMessage(msg.chat.id,
                `❌ <b>Saldo Tidak Cukup</b>\n\n🪙 Saldo: <b>${user.token_balance} token</b>\n💰 Biaya: <b>${bugwaCost} token</b>\n\nKetik /deposit untuk top up`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        // Generate request ID
        const requestId = db.createApiRequest(userId, 'bugwa', `${target} ${mode}`, 'bugwa', bugwaCost);

        // Processing message
        const processingMsg = await bot.sendMessage(msg.chat.id,
            `⏳ <b>Sedang Proses...</b>\n\n${validModes[mode].icon} Mode: <b>${validModes[mode].name}</b>\n📞 Target: <b>${target}</b>\n🆔 ID: <code>${requestId}</code>\n<i>Mengirim bug...</i>`,
            { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
        );

        // Potong token
        db.deductTokens(userId, bugwaCost);

        // Send attack
        const result = await bugwaService.attack(target, mode, userId);

        const updatedUser = db.getUser(userId);
        const remainingToken = updatedUser?.token_balance || 0;

        if (!result.success) {
            if (result.refund) {
                db.refundTokens(userId, bugwaCost);
            }
            db.updateApiRequest(requestId, 'failed', null, null, result.error);
            db.createTransaction(userId, 'check', bugwaCost, `BugWA gagal`, `${target} ${mode}`, 'failed');

            await bot.editMessageText(
                `❌ <b>Gagal</b>\n\n${result.error}\n\n${result.refund ? `🪙 Token dikembalikan: <b>${bugwaCost} token</b>\n` : ''}🆔 ID: <code>${requestId}</code>`,
                { chat_id: msg.chat.id, message_id: processingMsg.message_id, parse_mode: 'HTML' }
            );
            return;
        }

        // Berhasil
        db.updateApiRequest(requestId, 'success', result.data.formattedTarget, null, null);
        db.createTransaction(userId, 'check', bugwaCost, `BugWA ${result.data.modeName} ke ${result.data.formattedTarget}`, `${target} ${mode}`, 'success');

        const successText = `${result.data.modeIcon} <b>BUGWA TERKIRIM</b>
────────────────

📞 <b>TARGET</b>
Nomor: <b>${result.data.formattedTarget}</b>
Negara: ${result.data.country}
────────────────

⚙️ <b>DETAIL</b>
Mode: <b>${result.data.modeName}</b>
Sender: ${result.data.senderCount} bot(s)
────────────────

🆔 ID: <code>${requestId}</code>
🪙 Token: <b>-${bugwaCost}</b> (Sisa: <b>${remainingToken}</b>)

💡 <i>Cek status: /bugwa status</i>
🛑 <i>Stop: /bugwa stop ${target} ${mode}</i>`;

        await bot.editMessageText(successText, 
            { chat_id: msg.chat.id, message_id: processingMsg.message_id, parse_mode: 'HTML' }
        );
    }
};

module.exports = userCommands;
