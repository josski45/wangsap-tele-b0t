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
     * Command: /broadcast <pesan>
     */
    async broadcast(bot, msg, args) {
        if (args.length === 0) {
            await bot.sendMessage(msg.chat.id,
                `📢 <b>Broadcast</b>\n\nFormat: <code>/broadcast &lt;pesan&gt;</code>`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        const message = args.join(' ');
        const users = db.getAllUsers();

        await bot.sendMessage(msg.chat.id,
            `📢 Mengirim ke <b>${users.length} user</b>...`,
            { parse_mode: 'HTML' }
        );

        let successCount = 0;
        let failCount = 0;

        for (const user of users) {
            try {
                await bot.sendMessage(user.user_id,
                    `📢 <b>PENGUMUMAN</b>\n\n${formatter.escapeHtml(message)}\n\n<i>- ${config.botName}</i>`,
                    { parse_mode: 'HTML' }
                );
                successCount++;
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error) {
                failCount++;
            }
        }

        await bot.sendMessage(msg.chat.id,
            `✅ <b>BROADCAST SELESAI</b>\n\n✅ Berhasil: <b>${successCount}</b>\n❌ Gagal: <b>${failCount}</b>`,
            { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
        );
    },

    /**
     * Command: /setmt <fitur> <on/off>
     */
    async setmt(bot, msg, args) {
        if (args.length < 2) {
            await bot.sendMessage(msg.chat.id,
                `❌ <b>Format Salah</b>\n\nGunakan: <code>/setmt &lt;fitur&gt; &lt;on/off&gt;</code>\nFitur: all, ceknik, nama, kk, foto, edabu`,
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

        const validFeatures = ['all', 'ceknik', 'nama', 'kk', 'foto', 'edabu'];
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
                `🪙 <b>Set Biaya Fitur</b>\n\nFormat: <code>/setcost &lt;fitur&gt; &lt;cost&gt;</code>\nFitur: check, nama, kk, foto, edabu, nopol, getdata\nContoh: <code>/setcost check 2</code>`,
                { parse_mode: 'HTML', reply_to_message_id: msg.message_id }
            );
            return;
        }

        const feature = args[0].toLowerCase();
        const cost = parseFloat(args[1]);
        
        const validFeatures = ['check', 'nama', 'kk', 'foto', 'edabu', 'nopol', 'getdata'];
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
        const getdataCost = parseFloat(settings.getdata_cost) || config.getdataCost;
        
        const mtCeknik = settings.mt_ceknik === 'true' ? '🔴 ON' : '🟢 OFF';
        const mtNama = settings.mt_nama === 'true' ? '🔴 ON' : '🟢 OFF';
        const mtKk = settings.mt_kk === 'true' ? '🔴 ON' : '🟢 OFF';
        const mtFoto = settings.mt_foto === 'true' ? '🔴 ON' : '🟢 OFF';
        const mtEdabu = settings.mt_edabu === 'true' ? '🔴 ON' : '🟢 OFF';
        const mtNopol = settings.mt_nopol === 'true' ? '🔴 ON' : '🟢 OFF';

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
        text += `getdata: ${getdataCost}t\n`;
        
        text += '\n<b>━━━ 🛠️ MAINTENANCE ━━━</b>\n';
        text += `ceknik: ${mtCeknik}\n`;
        text += `nama: ${mtNama}\n`;
        text += `kk: ${mtKk}\n`;
        text += `foto: ${mtFoto}\n`;
        text += `edabu: ${mtEdabu}\n`;
        text += `nopol: ${mtNopol}\n`;

        await bot.sendMessage(msg.chat.id, text, { 
            parse_mode: 'HTML',
            reply_to_message_id: msg.message_id 
        });
    }
};

module.exports = ownerCommands;
