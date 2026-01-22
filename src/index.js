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
                
                // Handle check deposit status
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

        // Graceful shutdown
        process.on('SIGINT', () => {
            console.log('\n👋 Shutting down bot...');
            bot.stopPolling();
            process.exit(0);
        });

        process.on('SIGTERM', () => {
            console.log('\n👋 Shutting down bot...');
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
