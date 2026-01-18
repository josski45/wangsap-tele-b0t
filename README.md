# 🤖 Bot Telegram NIK Validator

Bot Telegram untuk validasi NIK (Nomor Induk Kependudukan) Indonesia dengan fitur lengkap dan payment gateway terintegrasi.

## ✨ Fitur

### 🔍 Pencarian Data
- `/ceknik <NIK>` - Cek data berdasarkan NIK (16 digit)
- `/nama <Nama>` - Cari NIK berdasarkan nama lengkap
- `/kk <No.KK>` - Cek anggota Kartu Keluarga
- `/foto <NIK>` - Cek NIK + Foto KTP
- `/edabu <NIK>` - Cek status BPJS

### 💰 Sistem Token
- `/deposit <jumlah>` - Request deposit token
- `/saldo` - Cek saldo token
- `/riwayat` - Lihat riwayat pencarian
- `/getdata <ID>` - Ambil data dari riwayat

### 👑 Owner Commands
- `/ownermenu` - Menu owner
- `/listuser` - List semua user
- `/pending` - Deposit pending
- `/approve <id>` - Approve deposit
- `/reject <id>` - Reject deposit
- `/addtoken <user_id> <jml>` - Tambah token user
- `/reducetoken <user_id> <jml>` - Kurangi token user
- `/stats` - Statistik bot
- `/apistats` - Statistik API
- `/broadcast <pesan>` - Broadcast ke semua user
- `/setmt <fitur> <on/off>` - Set maintenance
- `/setprice <harga>` - Set harga token
- `/setcost <fitur> <cost>` - Set biaya fitur
- `/setapi <type> <key>` - Set API key
- `/settings` - Lihat semua settings

## 🚀 Installation

### 1. Clone & Install Dependencies

```bash
cd telegram-bot
npm install
```

### 2. Konfigurasi

Copy file `.env.example` ke `.env`:

```bash
cp .env.example .env
```

Edit `.env` dan isi:

```env
# Telegram Bot Token (dari @BotFather)
TELEGRAM_BOT_TOKEN=your_bot_token_here

# Owner Telegram User ID (bisa dapat dari @userinfobot)
OWNER_ID=123456789

# API Keys
API_KEY=your_nik_api_key
EYEX_API_KEY=your_eyex_key
STARKILLER_API_KEY=your_starkiller_key
EDABU_API_KEY=your_edabu_key

# Cashi.id Payment (opsional)
CASHI_API_KEY=your_cashi_key
CASHI_WEBHOOK_SECRET=your_webhook_secret
```

### 3. Jalankan Bot

```bash
# Development
npm run dev

# Production
npm start
```

## 📁 Struktur Folder

```
telegram-bot/
├── package.json
├── .env.example
├── README.md
├── data/
│   └── database.db
└── src/
    ├── index.js          # Entry point
    ├── config.js         # Konfigurasi
    ├── database.js       # SQLite database
    ├── commands/
    │   ├── user.js       # User commands
    │   └── owner.js      # Owner commands
    ├── services/
    │   ├── api.js        # API service
    │   └── payment.js    # Payment service
    └── utils/
        ├── formatter.js  # Message formatter
        └── helper.js     # Helper functions
```

## 🎨 Telegram vs WhatsApp

Bot Telegram ini memiliki beberapa keunggulan styling dibanding WhatsApp:

| Fitur | Telegram | WhatsApp |
|-------|----------|----------|
| HTML Formatting | ✅ `<b>`, `<i>`, `<code>` | ❌ Hanya `*bold*` |
| Clickable Links | ✅ `<a href="">` | ✅ Auto-detect |
| Inline Code | ✅ `<code>` | ✅ \`backtick\` |
| Edit Message | ✅ Lebih fleksibel | ✅ Terbatas |
| Document Caption | ✅ HTML support | ❌ Plain text |
| File Size | ✅ 50MB | ✅ 16MB |
| Bot API | ✅ Full featured | ❌ Unofficial |

## 🔒 Keamanan

- User hanya bisa mengakses data riwayat milik sendiri
- Rate limiting untuk mencegah spam
- Owner authentication dengan Telegram User ID
- Token system untuk monetisasi

## 📝 Mendapatkan Bot Token

1. Buka Telegram, cari `@BotFather`
2. Kirim `/newbot`
3. Ikuti instruksi, masukkan nama bot
4. Setelah selesai, copy token yang diberikan
5. Paste ke `.env` file

## 📝 Mendapatkan User ID

1. Buka Telegram, cari `@userinfobot`
2. Kirim `/start`
3. Bot akan membalas dengan User ID kamu
4. Gunakan ID tersebut sebagai `OWNER_ID` di `.env`

## 🛠️ Tech Stack

- **Runtime:** Node.js
- **Bot Library:** node-telegram-bot-api
- **Database:** SQLite (sql.js)
- **HTTP Client:** Axios
- **Image Processing:** Jimp

## 📄 License

ISC License

---

**Made with ❤️ by JOSSKIDS**
