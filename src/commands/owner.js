const config = require('../config');
const db = require('../database');
const paymentService = require('../services/payment');
const formatter = require('../utils/formatter');
const { isOwner } = require('../utils/helper');

/**
 * Owner Commands untuk Telegram Bot
 */
const ownerCommands = {
    /**
     * Command: /ownermenu
     */
    async ownermenu(bot, msg) {
        const text = formatter.ownerMenuMessage();
        await bot.sendMessage(msg.chat.id, text, { 
            parse_mode: 'HTML',
            reply_to_message_id: msg.message_id 
        });
    },

    /**
     * Command: /listuser
     */
    async listuser(bot, msg) {
        const users = db.getAllUsers();
        const text = formatter.userListMessage(users);
        await bot.sendMessage(msg.chat.id, text, { 
            parse_mode: 'HTML',
            reply_to_message_id: msg.message_id 
        });
    },

    /**
     * Command: /broadcast <pesan>
     * Kirim pesan ke semua user (support multi-line & image)
     * Reply ke foto untuk broadcast foto dengan caption
     * Atau upload foto langsung dengan caption /broadcast <message>
     */
    async broadcast(bot, msg, args, rawText) {
        try {
            
            // Cek apakah ada foto (reply ke foto atau langsung kirim foto)
            let photoFileId = null;
            let message = '';
            
            // Priority 1: Cek foto langsung di message (upload foto dengan caption)
            if (msg.photo && msg.photo.length > 0) {
                const photos = msg.photo;
                photoFileId = photos[photos.length - 1].file_id; // Ambil resolusi tertinggi
                // Message diambil dari rawText (caption setelah /broadcast)
                message = (rawText && rawText.trim().length > 0) ? rawText : args.join(' ');
            }
            // Priority 2: Cek reply ke foto
            else if (msg.reply_to_message && msg.reply_to_message.photo) {
                const photos = msg.reply_to_message.photo;
                photoFileId = photos[photos.length - 1].file_id;
                // Message dari command atau caption foto yang direply
                message = (rawText && rawText.trim().length > 0) ? rawText : 
                          (args.length > 0 ? args.join(' ') : msg.reply_to_message.caption || '');
            }
            // Priority 3: Text only
            else {
                message = (rawText && rawText.trim().length > 0) ? rawText : args.join(' ');
            }
            
            // Jika tidak ada pesan dan tidak ada foto
            if ((!message || message.trim().length === 0) && !photoFileId) {
                await bot.sendMessage(msg.chat.id,
                    `📢 <b>Broadcast</b>\n\nFormat: <code>/broadcast &lt;pesan&gt;</code>\nContoh:\n<code>/broadcast Halo semua!</code>\n\n💡 <b>Tips:</b>\n- Pesan bisa multi-line\n- Reply ke foto untuk broadcast foto + caption`,
                    { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
                );
                return;
            }

            // Trim hanya leading/trailing whitespace, preserve internal newlines
            message = (message || '').trim();
            const users = db.getAllUsers();

            await bot.sendMessage(msg.chat.id,
                `📢 Mengirim ${photoFileId ? '📷 foto' : '📝 pesan'} ke <b>${users.length} user</b>...`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );

            let successCount = 0;
            let failCount = 0;

            for (const user of users) {
                try {
                    if (photoFileId) {
                        // Broadcast dengan foto
                        const caption = `📢 PENGUMUMAN\n\n${message}\n\n- ${config.botName}`;
                        await bot.sendPhoto(user.user_id, photoFileId, { caption });
                    } else {
                        // Broadcast text biasa
                        const broadcastText = `📢 PENGUMUMAN\n\n${message}\n\n- ${config.botName}`;
                        await bot.sendMessage(user.user_id, broadcastText);
                    }
                    successCount++;
                    
                    // Delay untuk anti-ban
                    await new Promise(resolve => setTimeout(resolve, 100));
                } catch (error) {
                    failCount++;
                }
            }

            await bot.sendMessage(msg.chat.id,
                `✅ <b>BROADCAST SELESAI</b>\n\n${photoFileId ? '📷 Dengan Foto\n' : ''}✅ Berhasil: <b>${successCount}</b>\n❌ Gagal: <b>${failCount}</b>`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
        } catch (error) {
            console.error('❌ BROADCAST ERROR:', error);
            await bot.sendMessage(msg.chat.id, `❌ Error: ${error.message}`, { reply_to_message_id: msg.message_id });
        }
    },

    /**
     * Command: /pending
     */
    async pending(bot, msg) {
        const deposits = db.getPendingDeposits();
        const text = formatter.pendingDepositsMessage(deposits);
        await bot.sendMessage(msg.chat.id, text, { 
            parse_mode: 'HTML',
            reply_to_message_id: msg.message_id 
        });
    },

    /**
     * Command: /approve <id>
     */
    async approve(bot, msg, args) {
        if (args.length === 0) {
            await bot.sendMessage(msg.chat.id,
                `📋 <b>Approve Deposit</b>\n\nFormat: <code>/approve &lt;id&gt;</code>\nContoh: <code>/approve 1</code>`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        const depositId = parseInt(args[0]);
        const ownerId = msg.from.id;
        
        const result = db.approveDeposit(depositId, String(ownerId));
        
        if (!result) {
            await bot.sendMessage(msg.chat.id,
                `❌ <b>Gagal</b>\n\nDeposit tidak ditemukan atau sudah diproses`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        // Notifikasi ke owner
        let ownerMsg = `✅ <b>Deposit Approved</b>\n\n👤 User: <code>${result.user_id}</code>\n🪙 Token: <b>+${result.token_amount}</b>\n💵 Amount: <b>${formatter.formatRupiah(result.amount)}</b>`;
        
        // Add referral bonus info if applicable
        if (result.referralBonus) {
            ownerMsg += `\n\n🎁 <b>Referral Bonus:</b>\n👤 Referrer: <code>${result.referralBonus.referrerId}</code>\n💰 Bonus: <b>+${result.referralBonus.bonusAmount} token</b>`;
        }
        
        await bot.sendMessage(msg.chat.id, ownerMsg, { parse_mode: 'HTML', reply_to_message_id: msg.message_id });

        // Notifikasi ke user
        try {
            await bot.sendMessage(result.user_id,
                `🎉 <b>DEPOSIT BERHASIL!</b>\n\nDeposit Anda telah dikonfirmasi!\n\n🪙 Token: <b>+${result.token_amount}</b>\n💵 Amount: <b>${formatter.formatRupiah(result.amount)}</b>\n\n<i>Ketik /saldo untuk cek saldo</i>`,
                { parse_mode: 'HTML' }
            );
        } catch (error) {
            console.error('Error notifying user:', error);
        }
        
        // Notify referrer if bonus was given
        if (result.referralBonus) {
            try {
                const referrer = db.getUser(result.referralBonus.referrerId);
                const referredUser = db.getUser(result.user_id);
                const referredName = referredUser?.username ? `@${referredUser.username}` : (referredUser?.first_name || 'User');
                
                await bot.sendMessage(result.referralBonus.referrerId,
                    formatter.referralBonusNotification(referredName, result.referralBonus.bonusAmount),
                    { parse_mode: 'HTML' }
                );
            } catch (error) {
                console.error('Error notifying referrer:', error);
            }
        }
    },

    /**
     * Command: /reject <id>
     */
    async reject(bot, msg, args) {
        if (args.length === 0) {
            await bot.sendMessage(msg.chat.id,
                `❌ Format: <code>/reject &lt;id&gt;</code>`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        const depositId = parseInt(args[0]);
        db.rejectDeposit(depositId);

        await bot.sendMessage(msg.chat.id,
            `✅ Deposit #${depositId} telah di-reject`,
            { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
        );
    },

    /**
     * Command: /addtoken <user_id> <jumlah>
     */
    async addtoken(bot, msg, args) {
        if (args.length < 2) {
            await bot.sendMessage(msg.chat.id,
                `📋 <b>Add Token</b>\n\nFormat: <code>/addtoken &lt;user_id&gt; &lt;jumlah&gt;</code>\nContoh: <code>/addtoken 123456789 10</code>`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        const targetUserId = args[0];
        const amount = parseInt(args[1]);

        if (isNaN(amount) || amount <= 0) {
            await bot.sendMessage(msg.chat.id,
                `❌ Jumlah token harus angka positif`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        const user = db.getUser(targetUserId);
        if (!user) {
            await bot.sendMessage(msg.chat.id,
                `❌ User tidak ditemukan`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        const newBalance = db.updateTokenBalance(targetUserId, amount);
        db.createTransaction(targetUserId, 'deposit', amount, `Admin add token`, null, 'success');

        await bot.sendMessage(msg.chat.id,
            `✅ <b>Berhasil</b>\n\n+${amount} token ke <code>${targetUserId}</code>\n🪙 Saldo baru: <b>${newBalance} token</b>`,
            { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
        );

        // Notifikasi ke user
        try {
            await bot.sendMessage(targetUserId,
                `🎁 <b>BONUS TOKEN!</b>\n\nAnda mendapat <b>${amount} token</b> dari admin!\n\n🪙 Saldo baru: <b>${newBalance} token</b>`,
                { parse_mode: 'HTML' }
            );
        } catch (error) {
            console.error('Error notifying user:', error);
        }
    },

    /**
     * Command: /reducetoken <user_id> <jumlah>
     */
    async reducetoken(bot, msg, args) {
        if (args.length < 2) {
            await bot.sendMessage(msg.chat.id,
                `❌ Format: <code>/reducetoken &lt;user_id&gt; &lt;jumlah&gt;</code>`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        const targetUserId = args[0];
        const amount = parseInt(args[1]);

        const user = db.getUser(targetUserId);
        if (!user) {
            await bot.sendMessage(msg.chat.id,
                `❌ User tidak ditemukan`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        if (user.token_balance < amount) {
            await bot.sendMessage(msg.chat.id,
                `❌ Saldo user tidak mencukupi (${user.token_balance} token)`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        const newBalance = db.updateTokenBalance(targetUserId, -amount);

        await bot.sendMessage(msg.chat.id,
            `✅ Berhasil mengurangi ${amount} token dari <code>${targetUserId}</code>\n\n🪙 Saldo baru: ${newBalance} token`,
            { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
        );
    },

    /**
     * Command: /setpromo
     * Manage promo codes
     * Usage:
     *   /setpromo add <code> <bonus%> [minDepo] [maxUses] [expireDays]
     *   /setpromo list
     *   /setpromo delete <code>
     *   /setpromo info <code>
     *   /setpromo on <code>
     *   /setpromo off <code>
     */
    async setpromo(bot, msg, args) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;

        if (args.length === 0) {
            await bot.sendMessage(chatId,
                `📋 <b>MANAGE PROMO CODES</b>\n\n` +
                `<b>Commands:</b>\n` +
                `• <code>/setpromo add &lt;code&gt; &lt;bonus%&gt; [minDepo] [maxUses] [expireDays]</code>\n` +
                `• <code>/setpromo list</code>\n` +
                `• <code>/setpromo delete &lt;code&gt;</code>\n` +
                `• <code>/setpromo info &lt;code&gt;</code>\n` +
                `• <code>/setpromo on &lt;code&gt;</code>\n` +
                `• <code>/setpromo off &lt;code&gt;</code>\n\n` +
                `<b>Example:</b>\n` +
                `<code>/setpromo add BONUS100 100 50 100 30</code>`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        const action = args[0].toLowerCase();

        switch (action) {
            case 'add':
                await ownerCommands._setpromoAdd(bot, chatId, userId, args.slice(1), msg.message_id);
                break;
            case 'list':
                await ownerCommands._setpromoList(bot, chatId, msg.message_id);
                break;
            case 'delete':
            case 'del':
                await ownerCommands._setpromoDelete(bot, chatId, args.slice(1), msg.message_id);
                break;
            case 'info':
                await ownerCommands._setpromoInfo(bot, chatId, args.slice(1), msg.message_id);
                break;
            case 'on':
            case 'enable':
                await ownerCommands._setpromoToggle(bot, chatId, args.slice(1), true, msg.message_id);
                break;
            case 'off':
            case 'disable':
                await ownerCommands._setpromoToggle(bot, chatId, args.slice(1), false, msg.message_id);
                break;
            default:
                await bot.sendMessage(chatId,
                    `❌ Action tidak dikenal: ${action}`,
                    { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
                );
        }
    },

    async _setpromoAdd(bot, chatId, userId, args, replyToMsgId) {
        try {
            if (args.length < 2) {
                await bot.sendMessage(chatId,
                    `❌ Format: <code>/setpromo add &lt;code&gt; &lt;bonus%&gt; [minDepo] [maxUses] [expireDays]</code>`,
                    { parse_mode: 'HTML', reply_to_message_id: replyToMsgId }
                );
                return;
            }

            const code = args[0].toUpperCase();
            const bonusPercent = parseInt(args[1]);
            const minDeposit = args[2] ? parseInt(args[2]) : 0;
            const maxUses = args[3] ? parseInt(args[3]) : 0;
            const expireDays = args[4] ? parseInt(args[4]) : null;

            // Validasi
            if (isNaN(bonusPercent) || bonusPercent < 1 || bonusPercent > 500) {
                await bot.sendMessage(chatId,
                    `❌ Bonus harus antara 1-500%`,
                    { parse_mode: 'HTML', reply_to_message_id: replyToMsgId }
                );
                return;
            }

            // Hitung expiry date
            let expiresAt = null;
            if (expireDays) {
                const expiry = new Date();
                expiry.setDate(expiry.getDate() + expireDays);
                expiresAt = expiry.toISOString();
            }

            // Create promo
            const promo = db.createPromo(code, bonusPercent, minDeposit, maxUses, expiresAt, userId.toString());

            if (!promo) {
                await bot.sendMessage(chatId,
                    `❌ Gagal: Kode promo sudah ada`,
                    { parse_mode: 'HTML', reply_to_message_id: replyToMsgId }
                );
                return;
            }

            let text = `✅ <b>Promo Created!</b>\n\n`;
            text += `🎟️ Code: <b>${promo.code}</b>\n`;
            text += `💰 Bonus: <b>${promo.bonus_percent}%</b>\n`;
            text += `📊 Min Deposit: <b>${promo.min_deposit} token</b>\n`;
            text += `🔢 Max Uses: <b>${promo.max_uses === 0 ? 'Unlimited' : promo.max_uses}</b>\n`;
            text += `⏰ Expires: <b>${promo.expires_at ? new Date(promo.expires_at).toLocaleString('id-ID') : 'Never'}</b>\n`;
            text += `✅ Status: <b>Active</b>`;

            await bot.sendMessage(chatId, text, { parse_mode: 'HTML', reply_to_message_id: replyToMsgId });
        } catch (error) {
            console.error('Error in _setpromoAdd:', error);
            await bot.sendMessage(chatId,
                `❌ Error: ${error.message}`,
                { parse_mode: 'HTML', reply_to_message_id: replyToMsgId }
            );
        }
    },

    async _setpromoList(bot, chatId, replyToMsgId) {
        const promos = db.getAllPromos();

        if (promos.length === 0) {
            await bot.sendMessage(chatId,
                `📋 Tidak ada promo code`,
                { parse_mode: 'HTML', reply_to_message_id: replyToMsgId }
            );
            return;
        }

        let text = `📋 <b>PROMO CODES (${promos.length})</b>\n\n`;

        promos.forEach((p, i) => {
            const status = p.is_active ? '✅' : '❌';
            const expired = p.expires_at && new Date(p.expires_at) < new Date() ? ' [EXPIRED]' : '';
            text += `${i + 1}. ${status} <b>${p.code}</b>\n`;
            text += `   Bonus: ${p.bonus_percent}% | Min: ${p.min_deposit}t\n`;
            text += `   Uses: ${p.current_uses}/${p.max_uses === 0 ? '∞' : p.max_uses}${expired}\n\n`;
        });

        await bot.sendMessage(chatId, text, { parse_mode: 'HTML', reply_to_message_id: replyToMsgId });
    },

    async _setpromoDelete(bot, chatId, args, replyToMsgId) {
        if (args.length === 0) {
            await bot.sendMessage(chatId,
                `❌ Format: <code>/setpromo delete &lt;code&gt;</code>`,
                { parse_mode: 'HTML', reply_to_message_id: replyToMsgId }
            );
            return;
        }

        const code = args[0].toUpperCase();
        const success = db.deletePromo(code);

        if (!success) {
            await bot.sendMessage(chatId,
                `❌ Promo tidak ditemukan`,
                { parse_mode: 'HTML', reply_to_message_id: replyToMsgId }
            );
            return;
        }

        await bot.sendMessage(chatId,
            `✅ Promo <b>${code}</b> berhasil dihapus`,
            { parse_mode: 'HTML', reply_to_message_id: replyToMsgId }
        );
    },

    async _setpromoInfo(bot, chatId, args, replyToMsgId) {
        if (args.length === 0) {
            await bot.sendMessage(chatId,
                `❌ Format: <code>/setpromo info &lt;code&gt;</code>`,
                { parse_mode: 'HTML', reply_to_message_id: replyToMsgId }
            );
            return;
        }

        const code = args[0].toUpperCase();
        const stats = db.getPromoStats(code);

        if (!stats) {
            await bot.sendMessage(chatId,
                `❌ Promo tidak ditemukan`,
                { parse_mode: 'HTML', reply_to_message_id: replyToMsgId }
            );
            return;
        }

        const promo = stats.promo;
        const expired = promo.expires_at && new Date(promo.expires_at) < new Date();

        let text = `🎟️ <b>PROMO: ${promo.code}</b>\n\n`;
        text += `💰 Bonus: <b>${promo.bonus_percent}%</b>\n`;
        text += `📊 Min Deposit: <b>${promo.min_deposit} token</b>\n`;
        text += `🔢 Max Uses: <b>${promo.max_uses === 0 ? 'Unlimited' : promo.max_uses}</b>\n`;
        text += `📈 Current Uses: <b>${promo.current_uses}</b>\n`;
        text += `⏰ Expires: <b>${promo.expires_at ? new Date(promo.expires_at).toLocaleString('id-ID') : 'Never'}</b>\n`;
        text += `✅ Status: <b>${promo.is_active && !expired ? 'Active' : 'Inactive'}</b>\n\n`;
        text += `📊 <b>STATISTICS</b>\n`;
        text += `Total Bonus Given: <b>${stats.totalBonus} token</b>\n`;
        text += `Total Deposits: <b>${stats.totalDeposit} token</b>\n`;
        text += `Users: <b>${stats.usages.length}</b>`;

        await bot.sendMessage(chatId, text, { parse_mode: 'HTML', reply_to_message_id: replyToMsgId });
    },

    async _setpromoToggle(bot, chatId, args, isActive, replyToMsgId) {
        if (args.length === 0) {
            await bot.sendMessage(chatId,
                `❌ Format: <code>/setpromo ${isActive ? 'on' : 'off'} &lt;code&gt;</code>`,
                { parse_mode: 'HTML', reply_to_message_id: replyToMsgId }
            );
            return;
        }

        const code = args[0].toUpperCase();
        const promo = db.togglePromo(code, isActive);

        if (!promo) {
            await bot.sendMessage(chatId,
                `❌ Promo tidak ditemukan`,
                { parse_mode: 'HTML', reply_to_message_id: replyToMsgId }
            );
            return;
        }

        await bot.sendMessage(chatId,
            `✅ Promo <b>${code}</b> ${isActive ? 'diaktifkan' : 'dinonaktifkan'}`,
            { parse_mode: 'HTML', reply_to_message_id: replyToMsgId }
        );
    },

    /**
     * Command: /stats
     */
    async stats(bot, msg) {
        const stats = db.getStats();
        const text = formatter.statsMessage(stats);
        await bot.sendMessage(msg.chat.id, text, { 
            parse_mode: 'HTML',
            reply_to_message_id: msg.message_id 
        });
    },

    /**
     * Command: /apistats
     */
    async apistats(bot, msg) {
        const stats = db.getApiStats();
        
        let text = `<b>╔════════════════╗</b>\n<b>║</b>  📈 <b>API STATISTICS</b>\n<b>╚════════════════╝</b>\n`;
        
        text += '\n<b>━━━ HARI INI ━━━</b>\n';
        if (stats.today.length > 0) {
            stats.today.forEach(s => {
                text += `${s.command}: <b>${s.count}x</b> (${s.tokens}t)\n`;
            });
        } else {
            text += '<i>Belum ada data</i>\n';
        }
        
        text += '\n<b>━━━ TOTAL ━━━</b>\n';
        if (stats.total.length > 0) {
            stats.total.forEach(s => {
                text += `${s.command}: <b>${s.count}x</b> (${s.tokens}t)\n`;
            });
        } else {
            text += '<i>Belum ada data</i>\n';
        }

        await bot.sendMessage(msg.chat.id, text, { 
            parse_mode: 'HTML',
            reply_to_message_id: msg.message_id 
        });
    },

    /**
     * Command: /setmt <fitur> <on/off>
     */
    async setmt(bot, msg, args) {
        if (args.length < 2) {
            await bot.sendMessage(msg.chat.id,
                `❌ <b>Format Salah</b>\n\nGunakan: <code>/setmt &lt;fitur&gt; &lt;on/off&gt;</code>\nFitur: all, ceknik, nama, kk, foto, edabu, bpjstk, nopol, regnik, regsim`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        const feature = args[0].toLowerCase();
        const status = args[1].toLowerCase();
        
        if (!['on', 'off'].includes(status)) {
            await bot.sendMessage(msg.chat.id,
                `❌ Status harus 'on' atau 'off'`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        const validFeatures = ['all', 'ceknik', 'nama', 'kk', 'foto', 'edabu', 'bpjstk', 'nopol', 'regnik', 'regsim', 'getcontact'];
        if (!validFeatures.includes(feature)) {
            await bot.sendMessage(msg.chat.id,
                `❌ Fitur tidak valid. Pilih: ${validFeatures.join(', ')}`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        if (feature === 'all') {
            validFeatures.forEach(f => {
                if (f !== 'all') db.setSetting(`mt_${f}`, status === 'on' ? 'true' : 'false');
            });
        } else {
            db.setSetting(`mt_${feature}`, status === 'on' ? 'true' : 'false');
        }

        await bot.sendMessage(msg.chat.id,
            `✅ Maintenance <b>${feature.toUpperCase()}</b> di-set ke <b>${status.toUpperCase()}</b>`,
            { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
        );
    },

    /**
     * Command: /setprice <harga>
     */
    async setprice(bot, msg, args) {
        if (args.length === 0) {
            await bot.sendMessage(msg.chat.id,
                `💰 <b>Set Harga Token</b>\n\nFormat: <code>/setprice &lt;harga&gt;</code>\nContoh: <code>/setprice 5000</code>`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        const price = parseInt(args[0]);
        if (isNaN(price) || price < 100) {
            await bot.sendMessage(msg.chat.id,
                `❌ Harga harus minimal Rp 100`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        db.setSetting('token_price', price);

        await bot.sendMessage(msg.chat.id,
            `✅ Harga token berhasil diubah ke <b>${formatter.formatRupiah(price)}</b>`,
            { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
        );
    },

    /**
     * Command: /setcost <fitur> <cost>
     */
    async setcost(bot, msg, args) {
        if (args.length < 2) {
            await bot.sendMessage(msg.chat.id,
                `🪙 <b>Set Biaya Fitur</b>\n\nFormat: <code>/setcost &lt;fitur&gt; &lt;cost&gt;</code>\nFitur: check, nama, kk, foto, edabu, bpjstk, nopol, regnik, regsim, databocor, getdata\nContoh: <code>/setcost check 2</code>`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        const feature = args[0].toLowerCase();
        const cost = parseFloat(args[1]);
        
        const validFeatures = ['check', 'nama', 'kk', 'foto', 'edabu', 'bpjstk', 'nopol', 'regnik', 'regsim', 'databocor', 'getcontact', 'getdata'];
        if (!validFeatures.includes(feature)) {
            await bot.sendMessage(msg.chat.id,
                `❌ Fitur tidak valid. Pilih: ${validFeatures.join(', ')}`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        if (isNaN(cost) || cost < 0) {
            await bot.sendMessage(msg.chat.id,
                `❌ Biaya harus angka positif`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        db.setSetting(`${feature}_cost`, cost);

        await bot.sendMessage(msg.chat.id,
            `✅ Biaya <b>${feature.toUpperCase()}</b> diubah ke <b>${cost} token</b>`,
            { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
        );
    },

    /**
     * Command: /setapi <type> <key>
     */
    async setapi(bot, msg, args) {
        if (args.length < 2) {
            await bot.sendMessage(msg.chat.id,
                `🔑 <b>Set API Key</b>\n\nFormat: <code>/setapi &lt;type&gt; &lt;key&gt;</code>\nType: nik, eyex, starkiller, edabu, nopol, nopol_tb`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        const type = args[0].toLowerCase();
        const key = args[1];
        
        const validTypes = ['nik', 'eyex', 'starkiller', 'edabu', 'nopol', 'nopol_tb'];
        if (!validTypes.includes(type)) {
            await bot.sendMessage(msg.chat.id,
                `❌ Type tidak valid. Pilih: ${validTypes.join(', ')}`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        const settingKeyMap = {
            'nik': 'api_key',
            'eyex': 'eyex_api_key',
            'starkiller': 'starkiller_api_key',
            'edabu': 'edabu_api_key',
            'nopol': 'nopol_api_key',
            'nopol_tb': 'nopol_terbangbebas_api_key'
        };
        const settingKey = settingKeyMap[type];
        db.setSetting(settingKey, key);

        await bot.sendMessage(msg.chat.id,
            `✅ API Key <b>${type.toUpperCase()}</b> berhasil diupdate`,
            { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
        );
    },

    /**
     * Command: /settings
     */
    async settings(bot, msg) {
        const settings = db.getAllSettings();
        const tokenPrice = parseInt(settings.token_price) || config.tokenPrice;
        const checkCost = parseInt(settings.check_cost) || config.checkCost;
        const namaCost = parseInt(settings.nama_cost) || config.namaCost;
        const kkCost = parseInt(settings.kk_cost) || config.kkCost;
        const fotoCost = parseInt(settings.foto_cost) || config.fotoCost;
        const edabuCost = parseInt(settings.edabu_cost) || config.edabuCost;
        const nopolCost = parseInt(settings.nopol_cost) || config.nopolCost;
        const regnikCost = parseInt(settings.regnik_cost) || config.regnikCost || 3;
        const regsimCost = parseInt(settings.regsim_cost) || config.regsimCost || 3;
        const databocorCost = parseInt(settings.databocor_cost) || config.databocorCost || 3;
        const getcontactCost = parseInt(settings.getcontact_cost) || config.getcontactCost || 3;
        const getdataCost = parseFloat(settings.getdata_cost) || config.getdataCost;
        
        const mtCeknik = settings.mt_ceknik === 'true' ? '🔴 ON' : '🟢 OFF';
        const mtNama = settings.mt_nama === 'true' ? '🔴 ON' : '🟢 OFF';
        const mtKk = settings.mt_kk === 'true' ? '🔴 ON' : '🟢 OFF';
        const mtFoto = settings.mt_foto === 'true' ? '🔴 ON' : '🟢 OFF';
        const mtEdabu = settings.mt_edabu === 'true' ? '🔴 ON' : '🟢 OFF';
        const mtNopol = settings.mt_nopol === 'true' ? '🔴 ON' : '🟢 OFF';
        const mtRegnik = settings.mt_regnik === 'true' ? '🔴 ON' : '🟢 OFF';
        const mtRegsim = settings.mt_regsim === 'true' ? '🔴 ON' : '🟢 OFF';

        let text = `<b>╔════════════════╗</b>\n<b>║</b>  ⚙️ <b>SETTINGS</b>\n<b>╚════════════════╝</b>\n`;
        
        text += '\n<b>━━━ 💰 HARGA ━━━</b>\n';
        text += `Token: <b>${formatter.formatRupiah(tokenPrice)}</b>\n`;
        
        text += '\n<b>━━━ 🪙 BIAYA ━━━</b>\n';
        text += `ceknik: ${checkCost}t\n`;
        text += `nama: ${namaCost}t\n`;
        text += `kk: ${kkCost}t\n`;
        text += `foto: ${fotoCost}t\n`;
        text += `edabu: ${edabuCost}t\n`;
        text += `nopol: ${nopolCost}t\n`;
        text += `regnik: ${regnikCost}t\n`;
        text += `regsim: ${regsimCost}t\n`;
        text += `databocor: ${databocorCost}t\n`;
        text += `getcontact: ${getcontactCost}t\n`;
        text += `getdata: ${getdataCost}t\n`;
        
        text += '\n<b>━━━ 🛠️ MAINTENANCE ━━━</b>\n';
        text += `ceknik: ${mtCeknik}\n`;
        text += `nama: ${mtNama}\n`;
        text += `kk: ${mtKk}\n`;
        text += `foto: ${mtFoto}\n`;
        text += `edabu: ${mtEdabu}\n`;
        text += `nopol: ${mtNopol}\n`;
        text += `regnik: ${mtRegnik}\n`;
        text += `regsim: ${mtRegsim}\n`;

        await bot.sendMessage(msg.chat.id, text, { 
            parse_mode: 'HTML',
            reply_to_message_id: msg.message_id 
        });
    },

    /**
     * Command: /setdeposit <min_amount>
     * Set minimum deposit amount dalam Rupiah
     */
    async setdeposit(bot, msg, args) {
        if (args.length === 0) {
            const settings = db.getAllSettings();
            const currentMin = parseInt(settings.min_deposit) || 2000;
            
            await bot.sendMessage(msg.chat.id,
                `💰 <b>SET MINIMUM DEPOSIT</b>\n\nFormat: <code>/setdeposit &lt;min_rupiah&gt;</code>\n\n📊 Current: <b>${formatter.formatRupiah(currentMin)}</b>\n\nContoh:\n<code>/setdeposit 2000</code> (min Rp 2.000)\n<code>/setdeposit 5000</code> (min Rp 5.000)\n<code>/setdeposit 10000</code> (min Rp 10.000)`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        const minAmount = parseInt(args[0]);

        if (isNaN(minAmount) || minAmount < 1000) {
            await bot.sendMessage(msg.chat.id,
                `❌ Jumlah tidak valid!\n\nMinimal deposit harus >= Rp 1.000`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        // Simpan ke database
        db.setSetting('min_deposit', minAmount);

        await bot.sendMessage(msg.chat.id,
            `✅ <b>MINIMUM DEPOSIT UPDATED</b>\n\n💰 Minimal deposit baru: <b>${formatter.formatRupiah(minAmount)}</b>\n\nUser harus deposit minimal ${formatter.formatRupiah(minAmount)} untuk bisa melakukan transaksi.`,
            { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
        );
    },

    // ═══════════════════════════════════════════
    // BACKUP COMMANDS
    // ═══════════════════════════════════════════

    /**
     * Command: /setbackup <add/remove/list> [target]
     * Set target backup (user_id atau group_id Telegram)
     */
    async setbackup(bot, msg, args) {
        if (args.length === 0) {
            const settings = db.getAllSettings();
            const targets = settings.backup_targets_tg ? JSON.parse(settings.backup_targets_tg) : [];
            const backupTime = settings.backup_time_tg || '03:00';
            const backupEnabled = settings.backup_enabled_tg === 'true';
            
            let targetList = targets.length > 0 
                ? targets.map((t, i) => `${i + 1}. <code>${t}</code>`).join('\n')
                : '<i>Belum ada target</i>';
            
            await bot.sendMessage(msg.chat.id,
                `💾 <b>BACKUP SETTINGS</b>\n\n📊 Status: <b>${backupEnabled ? '✅ AKTIF' : '❌ NONAKTIF'}</b>\n⏰ Jadwal: <b>${backupTime} WIB</b>\n\n📋 <b>Target Backup:</b>\n${targetList}\n\n━━━━━━━━━━━━━━━━━\n<b>Commands:</b>\n• <code>/setbackup add &lt;id&gt;</code>\n• <code>/setbackup remove &lt;id&gt;</code>\n• <code>/setbackup list</code>\n• <code>/setbackup time &lt;HH:MM&gt;</code>\n• <code>/setbackup on/off</code>\n• <code>/setbackup here</code> (tambah chat ini)\n\n<b>Contoh:</b>\n<code>/setbackup add 123456789</code>\n<code>/setbackup here</code> (untuk grup)\n<code>/setbackup time 03:00</code>`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        const action = args[0].toLowerCase();
        const settings = db.getAllSettings();
        let targets = settings.backup_targets_tg ? JSON.parse(settings.backup_targets_tg) : [];

        if (action === 'add' && args[1]) {
            const target = args[1].replace(/[^0-9-]/g, '');
            if (target.length < 5) {
                await bot.sendMessage(msg.chat.id, `❌ ID tidak valid!`, { parse_mode: 'HTML', reply_to_message_id: msg.message_id });
                return;
            }
            if (!targets.includes(target)) {
                targets.push(target);
                db.setSetting('backup_targets_tg', JSON.stringify(targets));
            }
            await bot.sendMessage(msg.chat.id,
                `✅ Target backup ditambahkan: <code>${target}</code>\n\n📋 Total target: ${targets.length}`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
        } else if (action === 'here') {
            // Add current chat as backup target
            const chatId = msg.chat.id.toString();
            if (!targets.includes(chatId)) {
                targets.push(chatId);
                db.setSetting('backup_targets_tg', JSON.stringify(targets));
            }
            await bot.sendMessage(msg.chat.id,
                `✅ Chat ini ditambahkan sebagai target backup\n\n📋 Chat ID: <code>${chatId}</code>\n📋 Total target: ${targets.length}`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
        } else if (action === 'remove' && args[1]) {
            const target = args[1].replace(/[^0-9-]/g, '');
            targets = targets.filter(t => t !== target);
            db.setSetting('backup_targets_tg', JSON.stringify(targets));
            await bot.sendMessage(msg.chat.id,
                `✅ Target backup dihapus: <code>${target}</code>\n\n📋 Sisa target: ${targets.length}`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
        } else if (action === 'list') {
            let targetList = targets.length > 0 
                ? targets.map((t, i) => `${i + 1}. <code>${t}</code>`).join('\n')
                : '<i>Belum ada target</i>';
            await bot.sendMessage(msg.chat.id,
                `📋 <b>TARGET BACKUP:</b>\n\n${targetList}`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
        } else if (action === 'time' && args[1]) {
            const timeRegex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
            if (!timeRegex.test(args[1])) {
                await bot.sendMessage(msg.chat.id,
                    `❌ Format waktu salah!\n\nGunakan format: HH:MM (24 jam)\nContoh: 03:00, 14:30`,
                    { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
                );
                return;
            }
            db.setSetting('backup_time_tg', args[1]);
            await bot.sendMessage(msg.chat.id,
                `✅ Jadwal backup diubah: <b>${args[1]} WIB</b>`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
        } else if (action === 'on') {
            db.setSetting('backup_enabled_tg', 'true');
            await bot.sendMessage(msg.chat.id,
                `✅ Backup otomatis <b>DIAKTIFKAN</b>`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
        } else if (action === 'off') {
            db.setSetting('backup_enabled_tg', 'false');
            await bot.sendMessage(msg.chat.id,
                `✅ Backup otomatis <b>DINONAKTIFKAN</b>`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
        } else {
            await bot.sendMessage(msg.chat.id,
                `❌ Action tidak valid!\n\nGunakan: add, remove, list, time, on, off, here`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
        }
    },

    /**
     * Command: /backup
     * Manual backup sekarang
     */
    async backup(bot, msg, args) {
        const settings = db.getAllSettings();
        const targets = settings.backup_targets_tg ? JSON.parse(settings.backup_targets_tg) : [];
        
        if (targets.length === 0) {
            await bot.sendMessage(msg.chat.id,
                `❌ Belum ada target backup!\n\nGunakan: <code>/setbackup add &lt;id&gt;</code> atau <code>/setbackup here</code>`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        await bot.sendMessage(msg.chat.id,
            `⏳ <b>Memulai backup...</b>\n\n🔄 Mengekspor database...\n📤 Mengirim ke ${targets.length} target...`,
            { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
        );

        try {
            // Create backup file
            const backupResult = await this._createBackup();
            
            if (!backupResult.success) {
                await bot.sendMessage(msg.chat.id,
                    `❌ Backup gagal: ${formatter.escapeHtml(backupResult.error)}`,
                    { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
                );
                return;
            }

            // Send to all targets
            let successCount = 0;
            let failCount = 0;

            for (const target of targets) {
                try {
                    await bot.sendDocument(target, backupResult.path, {
                        caption: `💾 <b>DATABASE BACKUP</b>\n\n📅 Tanggal: ${new Date().toLocaleDateString('id-ID')}\n⏰ Waktu: ${new Date().toLocaleTimeString('id-ID')}\n📊 Size: ${backupResult.size}\n\n<i>Backup dari ${config.botName}</i>`,
                        parse_mode: 'HTML'
                    }, {
                        filename: backupResult.filename,
                        contentType: 'application/x-sqlite3'
                    });
                    successCount++;
                    await new Promise(r => setTimeout(r, 500));
                } catch (err) {
                    console.error(`Backup send error to ${target}:`, err.message);
                    failCount++;
                }
            }

            // Cleanup temp file
            const fs = require('fs');
            try { fs.unlinkSync(backupResult.path); } catch (e) {}

            await bot.sendMessage(msg.chat.id,
                `✅ <b>BACKUP SELESAI</b>\n\n📤 Terkirim: ${successCount}\n❌ Gagal: ${failCount}\n📊 Size: ${backupResult.size}`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );

        } catch (error) {
            console.error('Backup error:', error);
            await bot.sendMessage(msg.chat.id,
                `❌ Backup error: ${formatter.escapeHtml(error.message)}`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
        }
    },

    /**
     * Internal: Create backup file
     */
    async _createBackup() {
        const fs = require('fs');
        const path = require('path');
        
        try {
            const dataFolder = path.join(__dirname, '..', '..', 'data');
            const dbPath = path.join(dataFolder, 'database.db');
            
            if (!fs.existsSync(dbPath)) {
                return { success: false, error: 'Database file tidak ditemukan' };
            }

            // Create backup folder
            const backupFolder = path.join(dataFolder, 'backups');
            if (!fs.existsSync(backupFolder)) {
                fs.mkdirSync(backupFolder, { recursive: true });
            }

            // Create backup filename with timestamp
            const now = new Date();
            const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const filename = `backup_${config.botName}_TG_${timestamp}.db`;
            const backupPath = path.join(backupFolder, filename);

            // Copy database file
            fs.copyFileSync(dbPath, backupPath);

            // Get file size
            const stats = fs.statSync(backupPath);
            const sizeKB = (stats.size / 1024).toFixed(2);
            const size = stats.size > 1024 * 1024 
                ? `${(stats.size / 1024 / 1024).toFixed(2)} MB`
                : `${sizeKB} KB`;

            return {
                success: true,
                path: backupPath,
                filename: filename,
                size: size
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
};

module.exports = ownerCommands;
