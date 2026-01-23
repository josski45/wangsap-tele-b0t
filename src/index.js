/**
 * Bot Telegram NIK Validator
 * Main Entry Point - Enhanced Edition v2.0
 * With Cashi.id Payment Gateway Integration
 */

const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');
const database = require('./database');
const userCommands = require('./commands/user');
const ownerCommands = require('./commands/owner');
const { isOwner, rateLimiter } = require('./utils/helper');

// Banner
console.log('');
console.log('╔══════════════════════════════════════════════════╗');
console.log('║       🤖 BOT TELEGRAM NIK VALIDATOR              ║');
console.log('║          Enhanced Edition v2.0                   ║');
console.log('║     💳 Cashi.id Payment Gateway Active           ║');
console.log('╚══════════════════════════════════════════════════╝');
console.log('');

// Check token
if (!config.telegramToken) {
    console.error('❌ TELEGRAM_BOT_TOKEN tidak ditemukan di .env');
    console.error('   Silakan copy .env.example ke .env dan isi token dari @BotFather');
    process.exit(1);
}

/**
 * Main function
 */
async function startBot() {
    try {
        // Initialize database
        console.log('🔄 Initializing database...');
        await database.initialize();
        console.log('✅ Database ready');

        // Create bot instance
        const bot = new TelegramBot(config.telegramToken, { polling: true });
        
        console.log('🚀 Bot started! Waiting for messages...');
        
        // Get bot info
        const botInfo = await bot.getMe();
        console.log(`📱 Bot: @${botInfo.username} (ID: ${botInfo.id})`);
        console.log(`👑 Owner IDs: ${config.ownerIds.join(', ')}`);

        // ═══════════════════════════════════════════
        // MESSAGE HANDLER
        // ═══════════════════════════════════════════
        bot.on('message', async (msg) => {
            try {
                // Ignore non-text messages
                if (!msg.text) return;
                
                // Ignore group messages (optional, bisa diubah)
                if (msg.chat.type !== 'private') return;
                
                const text = msg.text.trim();
                
                // Check for command (starts with /)
                if (!text.startsWith('/')) return;
                
                // Parse command dan arguments
                const parts = text.split(/\s+/);
                let command = parts[0].substring(1).toLowerCase(); // Remove / dan lowercase
                
                // Handle command dengan @botusername
                if (command.includes('@')) {
                    command = command.split('@')[0];
                }
                
                const args = parts.slice(1);
                
                // rawText = teks setelah command (untuk multi-line support seperti broadcast)
                // Gunakan regex untuk match command di awal, lalu ambil sisanya
                const commandMatch = text.match(/^\/\w+(@\w+)?/);
                let rawText = '';
                if (commandMatch) {
                    rawText = text.slice(commandMatch[0].length);
                    // Hanya hapus spasi/tab di awal, BUKAN newlines
                    rawText = rawText.replace(/^[ \t]+/, '');
                }
                
                const userId = msg.from.id;
                const userIsOwner = isOwner(userId);
                
                console.log(`📩 [CMD] ${msg.from.username || userId}: /${command}${userIsOwner ? ' (OWNER)' : ''}`);

                // Rate limiting (kecuali owner)
                if (!userIsOwner) {
                    if (!rateLimiter.check(userId, config.maxMessagesPerMinute, 60000)) {
                        await bot.sendMessage(msg.chat.id,
                            '⚠️ Terlalu banyak request. Silakan tunggu sebentar.',
                            { reply_to_message_id: msg.message_id }
                        );
                        return;
                    }
                }

                // Send typing action
                await bot.sendChatAction(msg.chat.id, 'typing');

                // Route command
                if (userCommands[command]) {
                    await userCommands[command](bot, msg, args, rawText);
                } else if (ownerCommands[command]) {
                    if (!userIsOwner) {
                        await bot.sendMessage(msg.chat.id,
                            '❌ <b>Akses Ditolak</b>\nCommand ini khusus owner',
                            { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
                        );
                        return;
                    }
                    await ownerCommands[command](bot, msg, args, rawText);
                } else {
                    await bot.sendMessage(msg.chat.id,
                        '❌ <b>Command Tidak Dikenal</b>\n\nKetik /menu untuk melihat daftar command',
                        { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
                    );
                }

            } catch (error) {
                console.error('❌ Error handling message:', error.message);
                try {
                    await bot.sendMessage(msg.chat.id,
                        '❌ <b>Terjadi Kesalahan</b>\nSilakan coba lagi nanti',
                        { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
                    );
                } catch (e) {
                    // Silent fail
                }
            }
        });

        // ═══════════════════════════════════════════
        // CALLBACK QUERY HANDLER (untuk inline buttons)
        // ═══════════════════════════════════════════
        bot.on('callback_query', async (query) => {
            try {
                const data = query.data;
                const userId = query.from.id;
                const chatId = query.message.chat.id;
                const messageId = query.message.message_id;
                const firstName = query.from.first_name || 'User';
                const username = query.from.username || null;
                
                const settings = database.getAllSettings();
                const minTopup = parseInt(settings.min_topup) || 2;
                
                // ═══════════════════════════════════════════
                // DEPOSIT INCREMENT (+) HANDLER
                // ═══════════════════════════════════════════
                if (data.startsWith('dep_inc_')) {
                    const parts = data.split('_');
                    // Format: dep_inc_<userId>_<currentAmount>_<step>
                    const targetUserId = parseInt(parts[2]);
                    const currentAmount = parseInt(parts[3]);
                    const step = parseInt(parts[4]) || 1;
                    
                    if (targetUserId !== userId) {
                        await bot.answerCallbackQuery(query.id, {
                            text: '❌ Tombol ini bukan untuk Anda!',
                            show_alert: true
                        });
                        return;
                    }
                    
                    const newAmount = currentAmount + step;
                    await bot.answerCallbackQuery(query.id, { text: `🪙 ${newAmount} token` });
                    
                    // Update menu
                    await userCommands._sendDepositMenu(bot, chatId, userId, newAmount, null, messageId);
                    return;
                }
                
                // ═══════════════════════════════════════════
                // DEPOSIT DECREMENT (-) HANDLER
                // ═══════════════════════════════════════════
                if (data.startsWith('dep_dec_')) {
                    const parts = data.split('_');
                    // Format: dep_dec_<userId>_<currentAmount>_<step>
                    const targetUserId = parseInt(parts[2]);
                    const currentAmount = parseInt(parts[3]);
                    const step = parseInt(parts[4]) || 1;
                    
                    if (targetUserId !== userId) {
                        await bot.answerCallbackQuery(query.id, {
                            text: '❌ Tombol ini bukan untuk Anda!',
                            show_alert: true
                        });
                        return;
                    }
                    
                    let newAmount = currentAmount - step;
                    if (newAmount < minTopup) {
                        newAmount = minTopup;
                        await bot.answerCallbackQuery(query.id, { 
                            text: `⚠️ Minimum ${minTopup} token`,
                            show_alert: false 
                        });
                    } else {
                        await bot.answerCallbackQuery(query.id, { text: `🪙 ${newAmount} token` });
                    }
                    
                    // Update menu
                    await userCommands._sendDepositMenu(bot, chatId, userId, newAmount, null, messageId);
                    return;
                }
                
                // ═══════════════════════════════════════════
                // DEPOSIT SET (quick amount) HANDLER
                // ═══════════════════════════════════════════
                if (data.startsWith('dep_set_')) {
                    const parts = data.split('_');
                    // Format: dep_set_<userId>_<amount>
                    const targetUserId = parseInt(parts[2]);
                    const amount = parseInt(parts[3]);
                    
                    if (targetUserId !== userId) {
                        await bot.answerCallbackQuery(query.id, {
                            text: '❌ Tombol ini bukan untuk Anda!',
                            show_alert: true
                        });
                        return;
                    }
                    
                    await bot.answerCallbackQuery(query.id, { text: `🪙 ${amount} token` });
                    
                    // Update menu
                    await userCommands._sendDepositMenu(bot, chatId, userId, amount, null, messageId);
                    return;
                }
                
                // ═══════════════════════════════════════════
                // DEPOSIT CONFIRM HANDLER
                // ═══════════════════════════════════════════
                if (data.startsWith('dep_confirm_')) {
                    const parts = data.split('_');
                    // Format: dep_confirm_<userId>_<amount>
                    const targetUserId = parseInt(parts[2]);
                    const tokenAmount = parseInt(parts[3]);
                    
                    if (targetUserId !== userId) {
                        await bot.answerCallbackQuery(query.id, {
                            text: '❌ Tombol ini bukan untuk Anda!',
                            show_alert: true
                        });
                        return;
                    }
                    
                    if (tokenAmount < minTopup) {
                        await bot.answerCallbackQuery(query.id, {
                            text: `❌ Minimum ${minTopup} token`,
                            show_alert: true
                        });
                        return;
                    }
                    
                    await bot.answerCallbackQuery(query.id, {
                        text: `⏳ Memproses deposit ${tokenAmount} token...`
                    });
                    
                    // Delete the menu message
                    await bot.deleteMessage(chatId, messageId).catch(() => {});
                    
                    // Process deposit
                    await userCommands._processDeposit(bot, chatId, userId, username, firstName, tokenAmount);
                    return;
                }
                
                // ═══════════════════════════════════════════
                // DEPOSIT CANCEL HANDLER
                // ═══════════════════════════════════════════
                if (data.startsWith('dep_cancel_')) {
                    const parts = data.split('_');
                    const targetUserId = parseInt(parts[2]);
                    
                    if (targetUserId !== userId) {
                        await bot.answerCallbackQuery(query.id, {
                            text: '❌ Tombol ini bukan untuk Anda!',
                            show_alert: true
                        });
                        return;
                    }
                    
                    await bot.answerCallbackQuery(query.id, { text: '❌ Dibatalkan' });
                    await bot.deleteMessage(chatId, messageId).catch(() => {});
                    return;
                }
                
                // ═══════════════════════════════════════════
                // LEGACY DEPOSIT BUTTON HANDLER (for old format)
                // ═══════════════════════════════════════════
                if (data.startsWith('deposit_')) {
                    const parts = data.split('_');
                    // Format: deposit_<userId>_<amount>
                    
                    if (parts[1] === 'info') {
                        // Info button clicked
                        await bot.answerCallbackQuery(query.id, {
                            text: '💡 Ketik /deposit <jumlah> untuk custom amount',
                            show_alert: false
                        });
                        return;
                    }
                    
                    const targetUserId = parseInt(parts[1]);
                    const tokenAmount = parseInt(parts[2]);
                    
                    // Validate user - prevent other users from clicking
                    if (targetUserId !== userId) {
                        await bot.answerCallbackQuery(query.id, {
                            text: '❌ Tombol ini bukan untuk Anda!',
                            show_alert: true
                        });
                        return;
                    }
                    
                    await bot.answerCallbackQuery(query.id, {
                        text: `⏳ Memproses deposit ${tokenAmount} token...`
                    });
                    
                    // Delete the menu message
                    await bot.deleteMessage(chatId, messageId).catch(() => {});
                    
                    // Process deposit using the command handler
                    const firstName = query.from.first_name || 'User';
                    const username = query.from.username || null;
                    await userCommands._processDeposit(bot, chatId, userId, username, firstName, tokenAmount);
                    return;
                }
                
                // ═══════════════════════════════════════════
                // CHECK PAYMENT STATUS BUTTON
                // ═══════════════════════════════════════════
                if (data.startsWith('checkpay_')) {
                    const parts = data.split('_');
                    // Format: checkpay_<userId>_<depositId>
                    const targetUserId = parseInt(parts[1]);
                    const depositId = parseInt(parts[2]);
                    
                    // Validate user
                    if (targetUserId !== userId && !isOwner(userId)) {
                        await bot.answerCallbackQuery(query.id, {
                            text: '❌ Ini bukan deposit Anda!',
                            show_alert: true
                        });
                        return;
                    }
                    
                    const deposit = database.getDeposit(depositId);
                    
                    if (!deposit) {
                        await bot.answerCallbackQuery(query.id, {
                            text: '❌ Deposit tidak ditemukan',
                            show_alert: true
                        });
                        return;
                    }
                    
                    const statusEmoji = {
                        'pending': '⏳',
                        'approved': '✅',
                        'rejected': '❌',
                        'expired': '⏰'
                    };
                    
                    const statusText = {
                        'pending': 'Menunggu Pembayaran',
                        'approved': 'Berhasil!',
                        'rejected': 'Ditolak',
                        'expired': 'Kadaluarsa'
                    };
                    
                    const emoji = statusEmoji[deposit.status] || '❓';
                    const text = statusText[deposit.status] || deposit.status;
                    
                    await bot.answerCallbackQuery(query.id, {
                        text: `${emoji} Status: ${text}`,
                        show_alert: true
                    });
                    return;
                }
                
                // ═══════════════════════════════════════════
                // CANCEL PAYMENT BUTTON
                // ═══════════════════════════════════════════
                if (data.startsWith('cancelpay_')) {
                    const parts = data.split('_');
                    // Format: cancelpay_<userId>_<depositId>
                    const targetUserId = parseInt(parts[1]);
                    const depositId = parseInt(parts[2]);
                    
                    // Validate user
                    if (targetUserId !== userId && !isOwner(userId)) {
                        await bot.answerCallbackQuery(query.id, {
                            text: '❌ Ini bukan deposit Anda!',
                            show_alert: true
                        });
                        return;
                    }
                    
                    const deposit = database.getDeposit(depositId);
                    
                    if (!deposit) {
                        await bot.answerCallbackQuery(query.id, {
                            text: '❌ Deposit tidak ditemukan',
                            show_alert: true
                        });
                        return;
                    }
                    
                    if (deposit.status !== 'pending') {
                        await bot.answerCallbackQuery(query.id, {
                            text: '❌ Deposit sudah diproses, tidak bisa dibatalkan',
                            show_alert: true
                        });
                        return;
                    }
                    
                    // Cancel the deposit
                    database.rejectDeposit(depositId);
                    
                    await bot.answerCallbackQuery(query.id, {
                        text: '✅ Deposit dibatalkan',
                        show_alert: false
                    });
                    
                    // Delete the QRIS message
                    await bot.deleteMessage(chatId, messageId).catch(() => {});
                    
                    await bot.sendMessage(chatId, 
                        `❌ <b>Deposit #${depositId} Dibatalkan</b>\n\nSilakan buat request baru jika ingin deposit.`,
                        { parse_mode: 'HTML' }
                    );
                    return;
                }
                
                // ═══════════════════════════════════════════
                // LEGACY: Check deposit status (old format)
                // ═══════════════════════════════════════════
                if (data.startsWith('check_deposit_')) {
                    const depositId = parseInt(data.replace('check_deposit_', ''));
                    const deposit = database.getDeposit(depositId);
                    
                    if (!deposit) {
                        await bot.answerCallbackQuery(query.id, {
                            text: '❌ Deposit tidak ditemukan',
                            show_alert: true
                        });
                        return;
                    }
                    
                    // Check if deposit belongs to user
                    if (deposit.user_id !== userId && !isOwner(userId)) {
                        await bot.answerCallbackQuery(query.id, {
                            text: '❌ Ini bukan deposit Anda',
                            show_alert: true
                        });
                        return;
                    }
                    
                    const statusEmoji = {
                        'pending': '⏳',
                        'approved': '✅',
                        'rejected': '❌',
                        'expired': '⏰'
                    };
                    
                    const statusText = {
                        'pending': 'Menunggu Verifikasi',
                        'approved': 'Berhasil Disetujui',
                        'rejected': 'Ditolak',
                        'expired': 'Kadaluarsa'
                    };
                    
                    const emoji = statusEmoji[deposit.status] || '❓';
                    const text = statusText[deposit.status] || deposit.status;
                    
                    await bot.answerCallbackQuery(query.id, {
                        text: `${emoji} Status: ${text}`,
                        show_alert: true
                    });
                    return;
                }
                
                await bot.answerCallbackQuery(query.id);
            } catch (error) {
                console.error('❌ Error handling callback:', error.message);
                await bot.answerCallbackQuery(query.id, {
                    text: '❌ Terjadi kesalahan',
                    show_alert: false
                });
            }
        });

        // ═══════════════════════════════════════════
        // ERROR HANDLERS
        // ═══════════════════════════════════════════
        bot.on('polling_error', (error) => {
            console.error('❌ Polling error:', error.message);
        });

        bot.on('error', (error) => {
            console.error('❌ Bot error:', error.message);
        });

        // ═══════════════════════════════════════════
        // BACKUP SCHEDULER
        // ═══════════════════════════════════════════
        let backupInterval = null;
        
        function startBackupScheduler() {
            backupInterval = setInterval(async () => {
                try {
                    const settings = database.getAllSettings();
                    const backupEnabled = settings.backup_enabled_tg === 'true';
                    
                    if (!backupEnabled) return;
                    
                    const backupTime = settings.backup_time_tg || '03:00';
                    const now = new Date();
                    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
                    
                    if (currentTime === backupTime) {
                        console.log('💾 [BACKUP] Starting scheduled backup...');
                        await performScheduledBackup();
                    }
                } catch (error) {
                    console.error('Backup scheduler error:', error.message);
                }
            }, 60000); // Check every minute
            
            console.log('⏰ Backup scheduler started');
        }
        
        async function performScheduledBackup() {
            const settings = database.getAllSettings();
            const targets = settings.backup_targets_tg ? JSON.parse(settings.backup_targets_tg) : [];
            
            if (targets.length === 0) {
                console.log('💾 [BACKUP] No targets configured');
                return;
            }
            
            try {
                // Set maintenance mode
                database.setSetting('backup_maintenance_tg', 'true');
                
                // Notify targets about maintenance
                for (const target of targets) {
                    try {
                        await bot.sendMessage(target, 
                            `⏳ <b>MAINTENANCE MODE</b>\n\n🔄 Backup database sedang berjalan...\n⏱️ Estimasi: 2-5 menit\n\n<i>Bot akan kembali normal setelah backup selesai</i>`,
                            { parse_mode: 'HTML' }
                        );
                    } catch (e) {}
                }
                
                await new Promise(r => setTimeout(r, 3000));
                
                // Create backup
                const backupResult = await ownerCommands._createBackup();
                
                if (!backupResult.success) {
                    console.error('💾 [BACKUP] Failed:', backupResult.error);
                    database.setSetting('backup_maintenance_tg', 'false');
                    return;
                }
                
                // Send to all targets
                let successCount = 0;
                for (const target of targets) {
                    try {
                        await bot.sendDocument(target, backupResult.path, {
                            caption: `💾 <b>BACKUP HARIAN OTOMATIS</b>\n\n📅 Tanggal: ${new Date().toLocaleDateString('id-ID')}\n⏰ Waktu: ${new Date().toLocaleTimeString('id-ID')}\n📊 Size: ${backupResult.size}\n\n<i>Auto backup dari ${config.botName}</i>`,
                            parse_mode: 'HTML'
                        }, {
                            filename: backupResult.filename,
                            contentType: 'application/x-sqlite3'
                        });
                        successCount++;
                        await new Promise(r => setTimeout(r, 500));
                    } catch (err) {
                        console.error(`Backup send error to ${target}:`, err.message);
                    }
                }
                
                // Cleanup
                const fs = require('fs');
                try { fs.unlinkSync(backupResult.path); } catch (e) {}
                
                // Disable maintenance mode
                database.setSetting('backup_maintenance_tg', 'false');
                
                // Notify completion
                for (const target of targets) {
                    try {
                        await bot.sendMessage(target,
                            `✅ <b>BACKUP SELESAI</b>\n\n📤 Terkirim ke ${successCount} target\n\n<i>Bot kembali normal</i>`,
                            { parse_mode: 'HTML' }
                        );
                    } catch (e) {}
                }
                
                console.log(`💾 [BACKUP] Completed! Sent to ${successCount}/${targets.length} targets`);
                
            } catch (error) {
                console.error('💾 [BACKUP] Error:', error.message);
                database.setSetting('backup_maintenance_tg', 'false');
            }
        }
        
        // Start backup scheduler
        startBackupScheduler();

        // Graceful shutdown
        process.on('SIGINT', () => {
            console.log('\n👋 Shutting down bot...');
            if (backupInterval) clearInterval(backupInterval);
            bot.stopPolling();
            process.exit(0);
        });

        process.on('SIGTERM', () => {
            console.log('\n👋 Shutting down bot...');
            if (backupInterval) clearInterval(backupInterval);
            bot.stopPolling();
            process.exit(0);
        });

    } catch (error) {
        console.error('❌ Failed to start bot:', error.message);
        process.exit(1);
    }
}

// Start the bot
startBot();
