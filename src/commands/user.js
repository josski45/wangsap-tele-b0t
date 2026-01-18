const config = require('../config');
const db = require('../database');
const apiService = require('../services/api');
const paymentService = require('../services/payment');
const { isValidNIK, isValidKK } = require('../utils/helper');
const formatter = require('../utils/formatter');
const axios = require('axios');
const https = require('https');
const QRCode = require('qrcode');

/**
 * User Commands untuk Telegram Bot
 */

// Cooldown untuk anti-spam
const commandCooldowns = new Map();

function checkCooldown(userId, command, cooldownMs = 3000) {
    const key = `${userId}:${command}`;
    const now = Date.now();
    const lastTime = commandCooldowns.get(key);
    
    if (lastTime && (now - lastTime) < cooldownMs) {
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
     * Command: /start
     */
    async start(bot, msg) {
        const userId = msg.from.id;
        const firstName = msg.from.first_name || 'User';
        const username = msg.from.username || null;
        
        if (!checkCooldown(userId, 'start', 5000)) return;
        
        const user = db.getOrCreateUser(userId, username, firstName);
        const todayChecks = db.getTodayCheckCount(userId);
        
        const text = formatter.welcomeMessage(firstName, user.token_balance, todayChecks);
        
        await bot.sendMessage(msg.chat.id, text, { parse_mode: 'HTML' });
    },

    /**
     * Command: /menu
     */
    async menu(bot, msg) {
        const text = formatter.menuMessage();
        await bot.sendMessage(msg.chat.id, text, { 
            parse_mode: 'HTML',
            reply_to_message_id: msg.message_id 
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

        const result = await apiService.checkNIK(nik);
        const updatedUser = db.getUser(userId);
        const remainingToken = updatedUser?.token_balance || 0;

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

        db.updateApiRequest(requestId, 'success', 'Data ditemukan', null, null, result.data);
        db.createTransaction(userId, 'check', checkCost, `Cek NIK berhasil`, nik, 'success');

        const text = formatter.nikResultMessage(result.data, checkCost, requestId, remainingToken);
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

        const result = await apiService.searchByName(namaQuery);
        const updatedUser = db.getUser(userId);
        const remainingToken = updatedUser?.token_balance || 0;

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
        db.updateApiRequest(requestId, 'success', `${totalData} data`, null, null, result.data);
        db.createTransaction(userId, 'check', namaCost, `Cari nama: ${namaQuery}`, null, 'success');

        // Generate file txt
        const dataList = result.data?.data || [];
        let fileContent = `==========================================\n`;
        fileContent += `HASIL PENCARIAN NAMA: ${result.searchName}\n`;
        fileContent += `Total Data: ${totalData}\n`;
        fileContent += `Request ID: ${requestId}\n`;
        fileContent += `Bot: ${config.botName}\n`;
        fileContent += `==========================================\n\n`;

        if (dataList.length > 0) {
            dataList.forEach((item, index) => {
                fileContent += `${index + 1}. ${item.NAMA || '-'}\n`;
                fileContent += `   NIK        : ${item.NIK || '-'}\n`;
                fileContent += `   TTL        : ${item.TEMPAT_LAHIR || '-'}, ${item.TANGGAL_LAHIR || '-'}\n`;
                fileContent += `   JK         : ${item.JENIS_KELAMIN || '-'}\n`;
                fileContent += `   STATUS     : ${item.STATUS || '-'}\n`;
                fileContent += `   ALAMAT     : ${item.ALAMAT || '-'}\n`;
                fileContent += `   KEC/KAB    : ${item.KECAMATAN || '-'} - ${item.KABUPATEN || '-'}\n`;
                fileContent += `   PROVINSI   : ${item.PROVINSI || '-'}\n`;
                fileContent += `------------------------------------------\n`;
            });
        }

        fileContent += `\nGenerate Date: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`;

        const fileName = `HASIL_${namaQuery.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()}_${requestId}.txt`;
        const captionText = formatter.namaResultMessage(result.data, result.searchName, namaCost, requestId, remainingToken);

        // Delete processing message
        await bot.deleteMessage(msg.chat.id, processingMsg.message_id);

        // Send document
        await bot.sendDocument(msg.chat.id, Buffer.from(fileContent, 'utf-8'), {
            filename: fileName,
            caption: captionText,
            parse_mode: 'HTML'
        }, {
            reply_to_message_id: msg.message_id
        });
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

        const result = await apiService.checkKK(kkNumber);
        const updatedUser = db.getUser(userId);
        const remainingToken = updatedUser?.token_balance || 0;

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

        db.updateApiRequest(requestId, 'success', `${result.data?.length || 0} anggota`, null, null, { members: result.data, nkk: result.nkk });
        db.createTransaction(userId, 'check', kkCost, `Cek KK berhasil`, kkNumber, 'success');

        const text = formatter.kkResultMessage(result.data, result.nkk, kkCost, requestId, remainingToken);
        await bot.editMessageText(text, {
            chat_id: msg.chat.id,
            message_id: processingMsg.message_id,
            parse_mode: 'HTML'
        });
    },

    /**
     * Command: /foto <NIK>
     */
    async foto(bot, msg, args) {
        const userId = msg.from.id;
        const firstName = msg.from.first_name || 'User';
        const username = msg.from.username || null;
        
        if (args.length === 0) {
            await bot.sendMessage(msg.chat.id,
                `❌ <b>Format Salah</b>\n\nGunakan: <code>/foto &lt;NIK&gt;</code>\nContoh: <code>/foto 1234567890123456</code>\n\n⚠️ <i>Proses ~30 detik karena callback</i>`,
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

        if (settings.mt_foto === 'true') {
            await bot.sendMessage(msg.chat.id,
                `⚠️ <b>MAINTENANCE</b>\n\nFitur <b>CEK FOTO</b> sedang dalam perbaikan.`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        const fotoCost = parseInt(settings.foto_cost) || config.fotoCost;

        if (user.token_balance < fotoCost) {
            await bot.sendMessage(msg.chat.id,
                `❌ <b>Saldo Tidak Cukup</b>\n\n🪙 Saldo: <b>${user.token_balance} token</b>\n💰 Biaya: <b>${fotoCost} token</b>\n\nKetik <code>/deposit</code> untuk top up`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        const requestId = db.createApiRequest(userId, 'foto', nik, 'starkiller', fotoCost);

        const processingMsg = await bot.sendMessage(msg.chat.id,
            `⏳ <b>Sedang Proses...</b>\n\n📷 Mencari NIK + Foto: <b>${nik}</b>\n🆔 ID: <code>${requestId}</code>\n\n<i>⚠️ Proses ini membutuhkan ~30 detik</i>`,
            { parse_mode: 'HTML' }
        );

        db.deductTokens(userId, fotoCost);

        // Step 1: Request ke Starkiller
        const initResult = await apiService.checkNIKFoto(nik);

        if (!initResult.success) {
            if (initResult.refund) {
                db.refundTokens(userId, fotoCost);
            }
            db.updateApiRequest(requestId, 'failed', null, null, initResult.error);
            
            await bot.editMessageText(
                `❌ <b>Gagal</b>\n\n${formatter.escapeHtml(initResult.error)}\n\n${initResult.refund ? `🪙 Token dikembalikan: <b>${fotoCost} token</b>\n` : ''}🆔 ID: <code>${requestId}</code>`,
                { chat_id: msg.chat.id, message_id: processingMsg.message_id, parse_mode: 'HTML' }
            );
            return;
        }

        // Step 2: Poll callback
        await bot.editMessageText(
            `⏳ <b>Menunggu Data...</b>\n\n📷 NIK: <b>${nik}</b>\n🆔 ID: <code>${requestId}</code>\n\n<i>🔄 Sedang dalam antrian server...</i>`,
            { chat_id: msg.chat.id, message_id: processingMsg.message_id, parse_mode: 'HTML' }
        );

        const result = await apiService.pollStarkillerCallback(initResult.callbackUrl, 20, 5000);
        const updatedUser = db.getUser(userId);
        const remainingToken = updatedUser?.token_balance || 0;

        if (!result.success) {
            if (result.refund) {
                db.refundTokens(userId, fotoCost);
            }
            db.updateApiRequest(requestId, 'failed', null, null, result.error);
            db.createTransaction(userId, 'check', fotoCost, `Cek foto gagal`, nik, 'failed');
            
            await bot.editMessageText(
                `❌ <b>Gagal</b>\n\n${formatter.escapeHtml(result.error)}\n\n${result.refund ? `🪙 Token dikembalikan: <b>${fotoCost} token</b>\n` : ''}🆔 ID: <code>${requestId}</code>`,
                { chat_id: msg.chat.id, message_id: processingMsg.message_id, parse_mode: 'HTML' }
            );
            return;
        }

        db.updateApiRequest(requestId, 'success', 'Data + Foto ditemukan', null, null, result.data);
        db.createTransaction(userId, 'check', fotoCost, `Cek foto berhasil`, nik, 'success');

        const fotoData = result.data[0]?.data?.[0] || {};
        const captionText = formatter.fotoResultMessage(result.data, fotoCost, requestId, remainingToken);

        // Delete processing message
        await bot.deleteMessage(msg.chat.id, processingMsg.message_id);

        // Send photo if available
        if (fotoData.foto && fotoData.foto.startsWith('data:image')) {
            try {
                const base64Data = fotoData.foto.split(',')[1];
                const imgBuffer = Buffer.from(base64Data, 'base64');
                
                await bot.sendPhoto(msg.chat.id, imgBuffer, {
                    caption: captionText,
                    parse_mode: 'HTML',
                    reply_to_message_id: msg.message_id
                });
            } catch (e) {
                console.error('Error sending photo:', e);
                await bot.sendMessage(msg.chat.id, captionText, { 
                    parse_mode: 'HTML',
                    reply_to_message_id: msg.message_id 
                });
            }
        } else if (fotoData.srcmedia) {
            try {
                const imgResponse = await axios.get(fotoData.srcmedia, {
                    responseType: 'arraybuffer',
                    httpsAgent: new https.Agent({ rejectUnauthorized: false }),
                    timeout: 60000
                });

                await bot.sendPhoto(msg.chat.id, Buffer.from(imgResponse.data), {
                    caption: captionText,
                    parse_mode: 'HTML',
                    reply_to_message_id: msg.message_id
                });
            } catch (err) {
                console.error('Failed to download photo:', err);
                await bot.sendPhoto(msg.chat.id, fotoData.srcmedia, {
                    caption: captionText,
                    parse_mode: 'HTML',
                    reply_to_message_id: msg.message_id
                });
            }
        } else {
            await bot.sendMessage(msg.chat.id, captionText, { 
                parse_mode: 'HTML',
                reply_to_message_id: msg.message_id 
            });
        }
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

        const result = await apiService.checkEdabu(nik);
        const updatedUser = db.getUser(userId);
        const remainingToken = updatedUser?.token_balance || 0;

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

        db.updateApiRequest(requestId, 'success', 'Data BPJS ditemukan', null, null, result.data);
        db.createTransaction(userId, 'check', edabuCost, `Cek BPJS berhasil`, nik, 'success');

        const text = formatter.edabuResultMessage(result.data, edabuCost, requestId, remainingToken);
        await bot.editMessageText(text, {
            chat_id: msg.chat.id,
            message_id: processingMsg.message_id,
            parse_mode: 'HTML'
        });
    },

    /**
     * Command: /deposit <jumlah>
     */
    async deposit(bot, msg, args) {
        const userId = msg.from.id;
        const firstName = msg.from.first_name || 'User';
        const username = msg.from.username || null;
        
        const settings = db.getAllSettings();
        const tokenPrice = parseInt(settings.token_price) || config.tokenPrice;
        const minTopup = parseInt(settings.min_topup) || config.minTopupToken;

        if (args.length === 0) {
            await bot.sendMessage(msg.chat.id,
                `💳 <b>DEPOSIT TOKEN</b>\n\nGunakan: <code>/deposit &lt;jumlah&gt;</code>\nContoh: <code>/deposit 10</code>\n\n💰 Harga: <b>${formatter.formatRupiah(tokenPrice)}/token</b>\n📦 Minimum: <b>${minTopup} token</b>`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        const tokenAmount = parseInt(args[0]);

        if (isNaN(tokenAmount) || tokenAmount < minTopup) {
            await bot.sendMessage(msg.chat.id,
                `❌ <b>Jumlah Tidak Valid</b>\n\nMinimum deposit: <b>${minTopup} token</b>`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        db.getOrCreateUser(userId, username, firstName);

        const totalPrice = tokenAmount * tokenPrice;
        const statusMsg = await bot.sendMessage(msg.chat.id, '⏳ <i>Membuat Invoice QRIS...</i>', {
            parse_mode: 'HTML',
            reply_to_message_id: msg.message_id
        });

        // Create Order with fancy ID
        const orderId = paymentService.generateOrderId(userId);
        const cashiResult = await paymentService.createQRISOrder(orderId, totalPrice);
        
        // Delete "Loading..."
        await bot.deleteMessage(msg.chat.id, statusMsg.message_id).catch(() => {});

        let depositId;
        
        if (!cashiResult.success) {
            await bot.sendMessage(msg.chat.id, formatter.errorMessage('Gagal Membuat Deposit', cashiResult.error || 'Gateway Error'), { parse_mode: 'HTML' });
            return;
        }

        // Save to DB
        depositId = db.createDeposit(userId, totalPrice, tokenAmount, 'cashi', {
            orderId: cashiResult.orderId,
            checkoutUrl: cashiResult.checkoutUrl,
            expiresAt: cashiResult.expiresAt
        });

        const text = formatter.depositRequestMessage(tokenAmount, totalPrice, orderId, true, cashiResult.expiresAt);
        
        // Generate QR Image
        let qrBuffer;
        try {
            // Check if qrUrl is http link or raw string
            const qrData = cashiResult.qrUrl;
            
            if (qrData && qrData.startsWith('http')) {
                qrBuffer = qrData; // Let Telegram download it
            } else if (qrData && (qrData.startsWith('data:') || qrData.length > 1000)) {
                // If data URI or very long string, assume it's Base64 Image
                const base64Data = qrData.replace(/^data:image\/[a-z]+;base64,/, "");
                qrBuffer = Buffer.from(base64Data, 'base64');
            } else {
                // Short string = Raw QR Payload -> Generate QR Image
                qrBuffer = await QRCode.toBuffer(qrData);
            }
        } catch (e) {
            console.error('QR Gen Error:', e);
            await bot.sendMessage(msg.chat.id, '❌ Gagal membuat gambar QRIS', { parse_mode: 'HTML' });
            return;
        }

        // Build inline keyboard for Support
        const inlineKeyboard = [];
        
        // Add support buttons from config.ownerIds
        if (config.ownerIds && config.ownerIds.length > 0) {
            const supportButtons = config.ownerIds.map((id, index) => ({
                text: `📞 Support ${config.ownerIds.length > 1 ? (index + 1) : ''}`,
                url: `tg://user?id=${id}`
            }));
            
            // Chunk buttons into rows of 2
            for (let i = 0; i < supportButtons.length; i += 2) {
                inlineKeyboard.push(supportButtons.slice(i, i + 2));
            }
        }

        // Send Photo
        const sentMsg = await bot.sendPhoto(msg.chat.id, qrBuffer, {
            caption: text,
            parse_mode: 'HTML',
            reply_to_message_id: msg.message_id,
            reply_markup: {
                inline_keyboard: inlineKeyboard
            }
        });

        // Start Polling (Every 5s)
        const pollInterval = 5000;
        const maxTime = 9 * 60 * 1000 + 30000; // 9 Minutes 30 seconds
        const startTime = Date.now();
        const chatId = msg.chat.id;
        const messageId = sentMsg.message_id;

        const interval = setInterval(async () => {
            try {
                // Check if expired time
                if (Date.now() - startTime > maxTime) {
                    clearInterval(interval);
                    await bot.deleteMessage(chatId, messageId).catch(() => {});
                    await bot.sendMessage(chatId, `❌ <b>Deposit #${depositId} Expired</b>\nSilakan buat request baru.`, { parse_mode: 'HTML' });
                    db.rejectDeposit(depositId); // Update DB locally
                    return;
                }

                // Check Status via API
                const check = await paymentService.checkPaymentStatus(orderId);
                const currentDep = db.getDeposit(depositId);

                // If already approved (anyway)
                if (currentDep && currentDep.status === 'approved') {
                    clearInterval(interval);
                    await bot.deleteMessage(chatId, messageId).catch(() => {});
                    await bot.sendMessage(chatId, `✅ <b>Deposit ${orderId} Berhasil!</b>\n🪙 <b>${tokenAmount} token</b> telah masuk ke akun Anda.`, { parse_mode: 'HTML' });
                    return;
                }

                // If Paid at Gateway
                if (check.success && (check.status === 'SETTLED' || check.status === 'PAID')) {
                    clearInterval(interval);
                    db.approveDeposit(depositId, 'SYSTEM_AUTO');
                    await bot.deleteMessage(chatId, messageId).catch(() => {});
                    await bot.sendMessage(chatId, `✅ <b>Deposit ${orderId} Berhasil!</b>\n🪙 <b>${tokenAmount} token</b> telah masuk ke akun Anda.`, { parse_mode: 'HTML' });
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
                'foto': '📷',
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
    }
};

module.exports = userCommands;
