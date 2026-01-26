require('dotenv').config();

module.exports = {
    // Telegram Bot Token
    telegramToken: process.env.TELEGRAM_BOT_TOKEN || '',
    
    // Owner settings - support multiple owners (comma separated Telegram User IDs)
    ownerIds: (process.env.OWNER_ID || '123456789').split(',').map(n => n.trim()),
    
    // API settings - Original NIK
    apiKey: process.env.API_KEY || '',
    apiBaseUrl: process.env.API_BASE_URL || 'https://apiv2.terbangbebas.cyou/',
    
    // EYEX API (untuk /nama dan /kk)
    eyexApiKey: process.env.EYEX_API_KEY || 'nOwjxZrYAK2P',
    eyexBaseUrl: process.env.EYEX_BASE_URL || 'https://api.eyex.dev',
    
    // STARKILLER API (untuk /foto)
    starkillerApiKey: process.env.STARKILLER_API_KEY || '',
    starkillerBaseUrl: process.env.STARKILLER_BASE_URL || 'https://starkiller.space/api/v1',
    
    // EDABU API (untuk /edabu - BPJS)
    edabuApiKey: process.env.EDABU_API_KEY || '',
    edabuBaseUrl: process.env.EDABU_BASE_URL || 'http://164.92.180.153:2006/api',

    // NOPOL API (untuk /nopol - Cek Plat Nomor)
    nopolApiKey: process.env.NOPOL_API_KEY || '',
    nopolBaseUrl: process.env.NOPOL_BASE_URL || 'https://siakses.my.id/api',
    
    // Cashi.id Payment Gateway
    cashiApiKey: process.env.CASHI_API_KEY || '',
    cashiWebhookSecret: process.env.CASHI_WEBHOOK_SECRET || '',

    // Watermark Settings
    watermarkText: process.env.WATERMARK_TEXT || 'CONFIDENTIAL',
    enableWatermark: process.env.SET_WATERMARK === 'true',
    
    // Token settings
    tokenPrice: parseInt(process.env.TOKEN_PRICE) || 5000,
    minTopupToken: parseInt(process.env.MIN_TOPUP_TOKEN) || 10,
    checkCost: parseInt(process.env.CHECK_COST) || 2,
    
    // Cost per feature (dalam token)
    namaCost: parseInt(process.env.NAMA_COST) || 3,
    kkCost: parseInt(process.env.KK_COST) || 3,
    fotoCost: parseInt(process.env.FOTO_COST) || 5,
    edabuCost: parseInt(process.env.EDABU_COST) || 3,
    bpjstkCost: parseInt(process.env.BPJSTK_COST) || 3,
    nopolCost: parseInt(process.env.NOPOL_COST) || 3,
    regnikCost: parseInt(process.env.REGNIK_COST) || 3,
    regsimCost: parseInt(process.env.REGSIM_COST) || 3,
    databocorCost: parseInt(process.env.DATABOCOR_COST) || 3,
    riwayatCost: parseFloat(process.env.RIWAYAT_COST) || 0,
    getdataCost: parseFloat(process.env.GETDATA_COST) || 0.5,
    riwayatDays: parseInt(process.env.RIWAYAT_DAYS) || 10,
    
    // LeakOSINT API (untuk /databocor)
    leakosintApiUrl: process.env.LEAKOSINT_API_URL || 'https://leakosintapi.com/',
    leakosintToken: process.env.LEAKOSINT_TOKEN || '6755393038:mSL1e8JU',
    
    // Bot settings
    botName: process.env.BOT_NAME || 'NIK Validator Bot',
    prefix: '/', // Telegram uses slash commands
    orderIdPrefix: process.env.ORDER_ID_PREFIX || 'TELE',
    
    // Data folder
    dataFolder: 'data',
    
    // Rate limiting
    maxMessagesPerMinute: 30,
    
    // Check if user is owner
    isOwner(userId) {
        return this.ownerIds.includes(String(userId));
    }
};
