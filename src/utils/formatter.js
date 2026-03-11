const config = require('../config');
const db = require('../database');

/**
 * Telegram Formatter - Enhanced Styling dengan HTML/Markdown
 * Telegram mendukung lebih banyak formatting dibanding WhatsApp
 */

// ═══════════════════════════════════════════
// EMOJI DECORATIONS
// ═══════════════════════════════════════════
const EMOJI = {
    star: '⭐',
    sparkle: '✨',
    fire: '🔥',
    rocket: '🚀',
    crown: '👑',
    diamond: '💎',
    money: '💰',
    coin: '🪙',
    check: '✅',
    cross: '❌',
    warning: '⚠️',
    info: 'ℹ️',
    phone: '📱',
    card: '💳',
    chart: '📊',
    list: '📋',
    search: '🔍',
    user: '👤',
    home: '🏠',
    calendar: '📅',
    clock: '⏰',
    gift: '🎁',
    party: '🎉',
    camera: '📷',
    hospital: '🏥',
    family: '👨‍👩‍👧‍👦',
    id: '🆔',
    lock: '🔒',
    key: '🔑',
    gear: '⚙️',
    bell: '🔔'
};

// ═══════════════════════════════════════════
// LINE DECORATIONS - Modern Style
// ═══════════════════════════════════════════
const LINE = {
    sep:    '────────────────',
    thin:   '┄┄┄┄┄┄┄┄┄┄┄┄',
    double: '════════════════'
};

// ═══════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════
function formatRupiah(amount) {
    return 'Rp ' + amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// ═══════════════════════════════════════════
// MENU MESSAGE - MODERN TELEGRAM STYLE
// ═══════════════════════════════════════════
function menuMessage() {
    const settings = db.getAllSettings();
    const tokenPrice = parseInt(settings.token_price) || config.tokenPrice;
    const checkCost = parseInt(settings.check_cost) || config.checkCost;
    const namaCost = parseInt(settings.nama_cost) || config.namaCost;
    const kkCost = parseInt(settings.kk_cost) || config.kkCost;
    const fotoCost = parseInt(settings.foto_cost) || config.fotoCost;
    const edabuCost = parseInt(settings.edabu_cost) || config.edabuCost;
    const bpjstkCost = parseInt(settings.bpjstk_cost) || config.bpjstkCost || 3;
    const nopolCost = parseInt(settings.nopol_cost) || config.nopolCost;
    const databocorCost = parseInt(settings.databocor_cost) || config.databocorCost || 3;
    const getcontactCost = parseInt(settings.getcontact_cost) || config.getcontactCost || 3;
    const bugwaCost = parseInt(settings.bugwa_cost) || config.bugwaCost || 3;

    return `
${EMOJI.diamond} <b>${config.botName.toUpperCase()}</b>
💰 Harga: <b>${formatRupiah(tokenPrice)}/token</b>

${EMOJI.search} <b>MENU PENCARIAN</b>
${LINE.sep}
📱 /ceknomor • <code>${ceknomorCost} token</code>
🔍 /ceknik • <code>${checkCost} token</code>
👤 /nama • <code>${namaCost} token</code>
👨‍👩‍👧‍👦 /kk • <code>${kkCost} token</code>
🏥 /edabu • <code>${edabuCost} token</code>
👷 /bpjstk • <code>${bpjstkCost} token</code>
🚗 /nopol • <code>${nopolCost} token</code> <i>PLAT/NOKA/NOSIN/NIK</i>
🔓 /databocor • <code>${databocorCost} token</code>
📱 /getcontact • <code>${getcontactCost} token</code>
💥 /bugwa • <code>${bugwaCost} token</code>

${EMOJI.user} <b>MENU USER</b>
${LINE.sep}
💳 /deposit
💰 /saldo
📋 /riwayat
🎁 /ref • <i>Dapatkan link referral</i>
📊 /myref • <i>Statistik referral</i>
📞 /support

<i>Ketik /bantuan untuk info lengkap</i>
`
;
}

// ═══════════════════════════════════════════
// HELP MESSAGE
// ═══════════════════════════════════════════
function helpMessage() {
    const settings = db.getAllSettings();
    const tokenPrice = parseInt(settings.token_price) || config.tokenPrice;
    const ceknomorCost = parseInt(settings.ceknomor_cost) || config.ceknomorCost;
    const checkCost = parseInt(settings.check_cost) || config.checkCost;
    const namaCost = parseInt(settings.nama_cost) || config.namaCost;
    const kkCost = parseInt(settings.kk_cost) || config.kkCost;
    const edabuCost = parseInt(settings.edabu_cost) || config.edabuCost;
    const bpjstkCost = parseInt(settings.bpjstk_cost) || config.bpjstkCost || 3;
    const nopolCost = parseInt(settings.nopol_cost) || config.nopolCost;
    const databocorCost = parseInt(settings.databocor_cost) || config.databocorCost || 3;
    const getcontactCost = parseInt(settings.getcontact_cost) || config.getcontactCost || 3;
    const bugwaCost = parseInt(settings.bugwa_cost) || config.bugwaCost || 3;
    const getdataCost = parseFloat(settings.getdata_cost) || config.getdataCost;
    const riwayatDays = parseInt(settings.riwayat_days) || config.riwayatDays;
    const minTopup = parseInt(settings.min_topup) || config.minTopupToken;

    return `
${EMOJI.sparkle} <b>PANDUAN BOT</b> ${EMOJI.sparkle}

<b>1️⃣ DEPOSIT TOKEN</b>
Ketik: <code>/deposit 10</code>
Min: ${minTopup} token
Harga: ${formatRupiah(tokenPrice)}/token

<b>2️⃣ CEK DATA</b>

� <b>/ceknomor</b> &lt;NoHP&gt;
   Biaya: <code>${ceknomorCost} token</code>
   Data: Nama, NIK, Provider, Alamat

🔍 <b>/ceknik</b> &lt;NIK&gt;
   Biaya: <code>${checkCost} token</code>
   Data: Nama, TTL, Alamat

👤 <b>/nama</b> &lt;Nama&gt;
   Biaya: <code>${namaCost} token</code>
   Data: Semua NIK dengan nama sama

👨‍👩‍👧‍👦 <b>/kk</b> &lt;No.KK&gt;
   Biaya: <code>${kkCost} token</code>
   Data: Anggota Keluarga

🏥 <b>/edabu</b> &lt;NIK&gt;
   Biaya: <code>${edabuCost} token</code>
   Data: Status BPJS

 👷 <b>/bpjstk</b> &lt;NIK&gt;
   Biaya: <code>${bpjstkCost} token</code>
   Data: BPJS Ketenagakerjaan

 🚗 <b>/nopol</b> &lt;PLAT/NOKA/NOSIN/NIK&gt;
   Biaya: <code>${nopolCost} token</code>
   Data: Info Kendaraan (auto-detect)

� <b>/databocor</b> &lt;query&gt;
   Biaya: <code>${databocorCost} token</code>
   Data: Leak OSINT (email/phone/name/domain)

📱 <b>/getcontact</b> &lt;HP&gt;
   Biaya: <code>${getcontactCost} token</code>
   Data: Multi-source caller ID lookup

💥 <b>/bugwa</b> &lt;target&gt; &lt;mode&gt;
   Biaya: <code>${bugwaCost} token</code>
   Mode: <code>crashinvis</code> | <code>invisdelay</code>
   Sub: <code>/bugwa stop</code> | <code>/bugwa status</code>

�📋 <b>/riwayat</b>
   Biaya: <code>GRATIS</code>
   Data: ${riwayatDays} hari terakhir

📂 <b>/getdata</b> &lt;ID&gt;
   Biaya: <code>${getdataCost} token</code>
   Data: Ambil hasil dari riwayat

📞 <b>/support</b>
   Biaya: <code>GRATIS</code>
   Hubungi admin/support

${LINE.double}
${EMOJI.warning} <i>NIK/KK harus 16 digit</i>
`;
}

// ═══════════════════════════════════════════
// WELCOME MESSAGE
// ═══════════════════════════════════════════
function welcomeMessage(firstName, tokenBalance, todayChecks) {
    return `
${EMOJI.party} <b>SELAMAT DATANG!</b>

Halo, <b>${escapeHtml(firstName)}</b>! ${EMOJI.sparkle}

Selamat datang di <b>${config.botName}</b>
Bot pencarian data NIK Indonesia.

🪙 Saldo: <b>${tokenBalance} token</b>
📊 Cek Hari Ini: <b>${todayChecks}x</b>

${EMOJI.sparkle} <b>FITUR PENCARIAN:</b>
� /ceknomor - Cek Nomor HP
🔍 /ceknik - Cek NIK Basic
👤 /nama - Cari berdasarkan Nama
👨‍👩‍👧‍👦 /kk - Cek Kartu Keluarga
🏥 /edabu - Cek BPJS Kesehatan
👷 /bpjstk - Cek BPJS TK
🚗 /nopol - Cek Kendaraan (PLAT/NOKA/NOSIN/NIK)
 /databocor - Leak OSINT
📱 /getcontact - Caller ID Lookup
💥 /bugwa - WA Crash Sender

<i>Ketik /menu untuk info lengkap</i>
`;
}

// ═══════════════════════════════════════════
// BALANCE MESSAGE
// ═══════════════════════════════════════════
function balanceMessage(user) {
    const settings = db.getAllSettings();
    const tokenPrice = parseInt(settings.token_price) || config.tokenPrice;
    
    return `
${EMOJI.money} <b>SALDO KAMU</b>
${LINE.sep}
👤 ${escapeHtml(user.first_name || user.username || 'User')}
🆔 <code>${user.user_id}</code>

🪙 Token: <b>${user.token_balance}</b>
💵 Value: ${formatRupiah(user.token_balance * tokenPrice)}
📊 Total Cek: <b>${user.total_checks}x</b>
📅 Join: ${formatDate(user.created_at)}

<i>Ketik /deposit untuk isi ulang</i>
`;
}

// ═══════════════════════════════════════════
// CEK NOMOR HP RESULT MESSAGE
// ═══════════════════════════════════════════
function ceknomorResultMessage(data, tokenUsed, requestId = '', remainingToken = 0) {
    return `
📱 <b>HASIL CEK NOMOR HP</b>
${LINE.double}

<b>📋 IDENTITAS</b>
👤 Nama: <b>${escapeHtml(data.nama || '-')}</b>
🆔 NIK: <code>${data.nik || '-'}</code>
⚧️ Kelamin: ${escapeHtml(data.kelamin || '-')}
📅 Lahir: ${escapeHtml(data.lahir || '-')}

<b>📱 INFO NOMOR</b>
📞 Phone: <code>${data.phone || '-'}</code>
📡 Provider: ${escapeHtml(data.provider || '-')}
📅 Reg Date: ${escapeHtml(data.reg_date || '-')}

<b>🏠 ALAMAT</b>
🏙️ Kecamatan: ${escapeHtml(data.kecamatan || '-')}
🌆 Kota/Kab: ${escapeHtml(data.kotakab || '-')}
🗺️ Provinsi: ${escapeHtml(data.provinsi || '-')}

${LINE.thin}
🆔 ID: <code>${requestId}</code>
🪙 Token: <b>-${tokenUsed}</b> (Sisa: <b>${remainingToken}</b>)
`;
}

// ═══════════════════════════════════════════
// NIK RESULT MESSAGE
// ═══════════════════════════════════════════
function nikResultMessage(data, tokenUsed, requestId = '', remainingToken = 0) {
    // Helper untuk prioritas data yang valid (skip '-' dan '0')
    const getVal = (v1, v2, v3) => {
        if (v1 && v1 !== '-' && v1 !== '0') return v1;
        if (v2 && v2 !== '-' && v2 !== '0') return v2;
        if (v3 && v3 !== '-' && v3 !== '0') return v3;
        return '-';
    };

    let result = `
<b>╔════════════════╗</b>
<b>║</b>  ${EMOJI.check} <b>HASIL CEK NIK</b>
<b>╚════════════════╝</b>

<b>━━━ 📋 IDENTITAS ━━━</b>
🆔 NIK: <code>${data.nik || data.NIK || '-'}</code>
👤 Nama: <b>${escapeHtml(data.nama_lengkap || data.NAMA || '-')}</b>
📅 TTL: ${escapeHtml(data.tanggal_lahir || data.TGL_LHR || '-')}
⚧️ JK: ${escapeHtml(data.jenis_kelamin || data.JENIS_KLMIN || '-')}

<b>━━━ 🏠 ALAMAT ━━━</b>
${escapeHtml(data.alamat || data.ALAMAT || '-')}
RT/RW: ${data.no_rt ?? data.NO_RT ?? '-'}/${data.no_rw ?? data.NO_RW ?? '-'}
🏘️ Kel: ${escapeHtml(getVal(data.kelurahan, data.kelurahan_id_text, data.KEL_NAMA))}
🏙️ Kec: ${escapeHtml(getVal(data.kecamatan, data.kecamatan_id_text, data.KEC_NAMA))}
🌆 Kab: ${escapeHtml(getVal(data.kabupaten, data.kabupaten_id_text, data.KAB_NAMA))}
🗺️ Prov: ${escapeHtml(getVal(data.provinsi, data.provinsi_id_text, data.PROP_NAMA))}`;

    if (data.full_address) {
        result += `\n\n📍 <b>Alamat Lengkap:</b>\n${escapeHtml(data.full_address)}`;
    }
    if (data.maps) {
        result += `\n🗺️ Maps: ${escapeHtml(data.maps)}`;
    }

    result += `

<b>╔════════════════╗</b>
<b>║</b> 🆔 ID: <code>${requestId}</code>
<b>║</b> 🪙 Token: <b>-${tokenUsed}</b> (Sisa: <b>${remainingToken}</b>)
<b>╚════════════════╝</b>
`;
    return result;
}

// ═══════════════════════════════════════════
// NAMA RESULT MESSAGE
// ═══════════════════════════════════════════
function namaResultMessage(results, searchName, tokenUsed, requestId = '', remainingToken = 0) {
    const totalData = results?.total_data || results?.data?.length || 0;
    const currentPage = results?.current_page || 1;
    const totalPage = results?.total_page || 1;
    
    return `
${EMOJI.user} <b>HASIL CARI NAMA</b>
${LINE.double}

🔍 Query: <b>${escapeHtml(searchName)}</b>
📄 Page: <b>${currentPage}/${totalPage}</b>
📊 Total: <b>${totalData} data</b>

<i>📎 File detail terlampir</i>

${LINE.thin}
🆔 ID: <code>${requestId}</code>
🪙 Token: <b>-${tokenUsed}</b> (Sisa: <b>${remainingToken}</b>)
`;
}

// ═══════════════════════════════════════════
// KK RESULT MESSAGE
// ═══════════════════════════════════════════
function kkResultMessage(data, nkk, tokenUsed, requestId = '', remainingToken = 0) {
    let msg = `
${EMOJI.family} <b>HASIL CEK KK</b>
${LINE.double}

📋 No. KK: <code>${nkk || '-'}</code>
👥 Anggota: <b>${data.length} orang</b>
`;

    if (data.length > 0) {
        msg += `\n${LINE.sep}\n`;
        data.forEach((member, index) => {
            msg += `
<b>${index + 1}. ${escapeHtml(member.NAMA || '-')}</b>
   🆔 NIK: <code>${member.KTP_ID || member.NIK || '-'}</code>
   📅 TTL: ${escapeHtml(member.TEMPAT_LAHIR || '-')}, ${escapeHtml(member.TANGGAL_LAHIR || '-')}
   ⚧️ JK: ${escapeHtml(member.JENIS_KELAMIN || '-')}
   🕌 Agama: ${escapeHtml(member.AGAMA || '-')}
   💍 Status: ${escapeHtml(member.STATUS || '-')} (${escapeHtml(member.HUBUNGAN || '-')})
   🩸 Gol. Darah: ${escapeHtml(member.GOLONGAN_DARAH || member.GOL_DARAH || '-')}
   🎓 Pendidikan: ${escapeHtml(member.PENDIDIKAN || '-')}
   💼 Pekerjaan: ${escapeHtml(member.PEKERJAAN || '-')}
   👨 Ayah: ${escapeHtml(member.NAMA_AYAH || '-')}
   👩 Ibu: ${escapeHtml(member.NAMA_IBU || '-')}
`;
        });

        const first = data[0];
        msg += `
${LINE.sep}
<b>🏠 ALAMAT KK</b>
${escapeHtml(first.ALAMAT || '-')}
Dusun: ${escapeHtml(first.DUSUN || '-')}
RT/RW: ${first.RT || '-'}/${first.RW || '-'}
🏘️ Kel: ${escapeHtml(first.DESA_KEL || '-')}
🏙️ Kec: ${escapeHtml(first.KECAMATAN || '-')}
🌆 Kab: ${escapeHtml(first.KAB_KOTA || '-')}
🗺️ Prov: ${escapeHtml(first.PROVINSI || '-')}
📮 Kodepos: ${first.KODEPOS || '-'}
`;
    }

    msg += `
${LINE.thin}
🆔 ID: <code>${requestId}</code>
🪙 Token: <b>-${tokenUsed}</b> (Sisa: <b>${remainingToken}</b>)
`;
    return msg;
}

// ═══════════════════════════════════════════
// EDABU RESULT MESSAGE
// ═══════════════════════════════════════════
// ═══════════════════════════════════════════
// BPJS KETENAGAKERJAAN RESULT MESSAGE
// ═══════════════════════════════════════════
function bpjstkResultMessage(data, tokenUsed, requestId = '', remainingToken = 0, apiRemaining = null) {
    // Data is array from API
    const items = Array.isArray(data) ? data : [data];
    const totalData = items.length;
    
    let msg = `
👷 <b>HASIL CEK BPJS KETENAGAKERJAAN</b>
${LINE.double}

📊 Total: <b>${totalData}</b> data ditemukan
`;

    items.forEach((d, idx) => {
        if (totalData > 1) {
            msg += `\n${LINE.double}\n<b>${idx + 1}. ${escapeHtml(d.namaPerusahaan || 'Data')}</b>\n${LINE.double}\n`;
        }
        
        msg += `
${LINE.sep}
${EMOJI.user} <b>DATA PESERTA</b>
${LINE.thin}
👤 Nama: <b>${escapeHtml(d.namaPeserta || '-')}</b>
🆔 NIK KTP: <code>${d.nikKtp || '-'}</code>
💳 No Kartu BPJS: <code>${d.kpj || '-'}</code>
🔢 Kode TK: ${escapeHtml(d.kodeTk || '-')}
📅 Tanggal Lahir: ${escapeHtml(d.tglLahir || '-')}
📄 Jenis Identitas: ${escapeHtml(d.jenisIdentitas || '-')}
🌍 Kewarganegaraan: ${escapeHtml(d.kewarganegaraan || '-')}
💼 Jenis Pekerjaan: ${escapeHtml(d.jenisPekerjaan || '-')}

${LINE.sep}
🏢 <b>DATA PERUSAHAAN</b>
${LINE.thin}
Nama: <b>${escapeHtml(d.namaPerusahaan || '-')}</b>
Kode Perusahaan: ${escapeHtml(d.kodePerusahaan || '-')}
NPP: <code>${d.npp || '-'}</code>
Kode Divisi: ${escapeHtml(d.kodeDivisi || '-')}
Kode Segmen: ${escapeHtml(d.kodeSegmen || '-')}
Kode Kantor: ${escapeHtml(d.kodeKantor || '-')}

${LINE.sep}
📋 <b>STATUS KEPESERTAAN</b>
${LINE.thin}
🟢 Tgl Aktif: ${escapeHtml(d.tglAktif || '-')}
🔴 Tgl Non-Aktif: ${escapeHtml(d.tglNa || '-')}
`;

        if (d.alamatDomisili) {
            msg += `
${LINE.sep}
🏠 <b>ALAMAT DOMISILI</b>
${LINE.thin}
${escapeHtml(d.alamatDomisili)}
`;
        }

        if (d.namaPicPerusahaan || d.kontakPicPerusahaan || d.emailPicPerusahaan) {
            msg += `
${LINE.sep}
📞 <b>PIC PERUSAHAAN</b>
${LINE.thin}
Nama: ${escapeHtml(d.namaPicPerusahaan || '-')}
Kontak: ${escapeHtml(d.kontakPicPerusahaan || '-')}
Email: ${escapeHtml(d.emailPicPerusahaan || '-')}
`;
        }
    });

    msg += `
${LINE.double}
🆔 ID: <code>${requestId}</code>
🪙 Token: <b>-${tokenUsed}</b> (Sisa: <b>${remainingToken}</b>)
`;
    
    if (apiRemaining !== null && apiRemaining !== undefined) {
        msg += `📊 API Quota: <b>${apiRemaining}</b>\n`;
    }
    
    return msg;
}

// ═══════════════════════════════════════════
// BPJS REFERENCE DATA
// ═══════════════════════════════════════════
const BPJS_REF = {
    JENIS_KELAMIN: {
        "1": "Laki-laki",
        "2": "Perempuan"
    },
    HUBUNGAN_KELUARGA: {
        "00": "Diri Sendiri",
        "10": "Suami/Istri",
        "4": "Anak",
        "11": "Anak 1",
        "12": "Anak 2",
        "13": "Anak 3",
        "14": "Anak 4",
        "15": "Anak 5",
        "16": "Anak 6",
        "17": "Anak 7",
        "18": "Anak 8",
        "19": "Anak 9",
        "21": "Anak 1 (Istri/Suami Kedua)",
        "22": "Anak 2 (Istri/Suami Kedua)",
        "23": "Anak 3 (Istri/Suami Kedua)",
        "24": "Anak 4 (Istri/Suami Kedua)",
        "25": "Anak 5 (Istri/Suami Kedua)",
        "26": "Anak 6 (Istri/Suami Kedua)",
        "27": "Anak 7 (Istri/Suami Kedua)",
        "28": "Anak 8 (Istri/Suami Kedua)",
        "29": "Anak 9 (Istri/Suami Kedua)",
        "30": "Ayah",
        "31": "Ibu",
        "32": "Mertua Ayah",
        "33": "Mertua Ibu",
        "41": "Anak Tiri 1",
        "42": "Anak Tiri 2",
        "43": "Anak Tiri 3",
        "44": "Anak Tiri 4",
        "45": "Anak Tiri 5"
    },
    JENIS_PESERTA_GRUP: {
        "1": "PPU Penyelenggara Negara",
        "2": "PPU Badan Usaha",
        "3": "PBPU/BP",
        "4": "PBI JK"
    },
    JENIS_PESERTA_DETIL: {
        "11": "PNS Pusat",
        "12": "PNS Daerah",
        "13": "PNS TNI",
        "14": "PNS Polri",
        "15": "PNS Diperbantukan",
        "16": "PNS Dipekerjakan",
        "17": "Pejabat Negara",
        "18": "Kepala Desa",
        "19": "PPNPN (Pegawai Pemerintah Non PNS)",
        "21": "Prajurit TNI",
        "22": "Prajurit Polri",
        "23": "Penerima Pensiun PNS",
        "24": "Penerima Pensiun TNI",
        "25": "Penerima Pensiun Polri",
        "26": "Penerima Pensiun Pejabat Negara",
        "27": "Veteran",
        "28": "Perintis Kemerdekaan",
        "31": "BUMN",
        "32": "BUMD",
        "33": "Badan Usaha Swasta",
        "41": "PBPU (Pekerja Bukan Penerima Upah)",
        "42": "BP (Bukan Pekerja)",
        "51": "PBI JK (Penerima Bantuan Iuran)",
        "52": "Non PBI"
    },
    STATUS_KAWIN: {
        "0": "Tidak Terdefinisi",
        "1": "Belum Kawin",
        "2": "Kawin",
        "3": "Cerai",
        "4": "Cerai Mati"
    },
    STATUS_PESERTA: {
        "0": "Aktif",
        "1": "Non Aktif"
    }
};

// ═══════════════════════════════════════════
// EDABU RESULT MESSAGE (BPJS Kesehatan) with BPJS bridging
// Returns array of messages if content is too long
// ═══════════════════════════════════════════
function edabuResultMessage(data, tokenUsed, requestId = '', remainingToken = 0, nikAddresses = {}) {
    const anggota = data?.anggota || [];
    const raw = data?.raw || [];
    const nikDicari = data?.nik_dicari || '-';
    const jumlahAnggota = data?.jumlah_anggota || anggota.length;
    const alamat = data?.alamat || '-';
    
    // Function to get hubungan keluarga from raw data with bridging
    const getHubungan = (nik) => {
        const rawData = raw.find(r => r.NIK === nik);
        if (!rawData) return '-';
        const kode = rawData.KDHUBKEL?.toString();
        return BPJS_REF.HUBUNGAN_KELUARGA[kode] || rawData.NMHUBKEL || '-';
    };
    
    // Function to get jenis peserta detail
    // COMMENTED: Plotting masih salah, perlu fix mapping
    // const getJenisPeserta = (nik) => {
    //     const rawData = raw.find(r => r.NIK === nik);
    //     if (!rawData?.JNSPST) return '-';
    //     const kodeGrup = rawData.JNSPST.KDJNSKPST?.toString();
    //     const kodeDetil = rawData.JNSPST.KDJNSPESERTA?.toString();
    //     const grupName = BPJS_REF.JENIS_PESERTA_GRUP[kodeGrup] || '';
    //     const detilName = BPJS_REF.JENIS_PESERTA_DETIL[kodeDetil] || '';
    //     return detilName || grupName || '-';
    // };
    
    // Function to get perusahaan from raw data
    const getPerusahaan = (nik) => {
        const rawData = raw.find(r => r.NIK === nik);
        return rawData?.JNSPST?.NMPKS || '-';
    };

    // Function to get alamat from nikAddresses
    const getAlamat = (nik) => {
        const addr = nikAddresses[nik];
        if (!addr) return '-';
        return addr.alamat_lengkap || '-';
    };
    
    // Build header
    let header = `
${EMOJI.hospital} <b>HASIL CEK BPJS</b>
${LINE.double}

🔍 NIK Dicari: <code>${nikDicari}</code>
👥 Jumlah Anggota: <b>${jumlahAnggota}</b>
`;

    // Build member sections
    let memberSections = [];
    if (anggota.length > 0) {
        anggota.forEach((p, index) => {
            const hubungan = getHubungan(p.nik);
            const perusahaan = getPerusahaan(p.nik);
            const alamatAnggota = getAlamat(p.nik);
            // const jenisPeserta = getJenisPeserta(p.nik); // COMMENTED: Plotting masih salah
            const statusIcon = p.status?.toLowerCase().includes('aktif') ? '🟢' : '🔴';
            
            // Fix tanggal lahir: API mundur 1 hari, perlu ditambah 1 hari
            let ttlFixed = p.ttl || '-';
            if (p.ttl && p.ttl !== '-') {
                try {
                    const ttlMatch = p.ttl.match(/(.*?),\s*(\d{2})-(\d{2})-(\d{4})/);
                    if (ttlMatch) {
                        const [, tempat, day, month, year] = ttlMatch;
                        const date = new Date(year, month - 1, day);
                        date.setDate(date.getDate() + 1); // Tambah 1 hari
                        const fixedDay = String(date.getDate()).padStart(2, '0');
                        const fixedMonth = String(date.getMonth() + 1).padStart(2, '0');
                        const fixedYear = date.getFullYear();
                        ttlFixed = `${tempat}, ${fixedDay}-${fixedMonth}-${fixedYear}`;
                    }
                } catch (e) {
                    ttlFixed = p.ttl; // Fallback ke original jika error
                }
            }
            
            let section = `
${LINE.sep}
<b>ANGGOTA ${index + 1}</b> ( ${escapeHtml(hubungan.toLowerCase())} )
${LINE.thin}
👤 Nama: ${escapeHtml(p.nama || '-')}
🆔 NIK: <code>${p.nik || '-'}</code>
💳 No Kartu: <code>${p.noKartu || '-'}</code>
⚧️ Jenis Kelamin: ${escapeHtml(p.jenisKelamin || '-')}
📅 TTL: ${escapeHtml(ttlFixed)}
📧 Email: ${escapeHtml(p.email || '-')}
📱 No HP: ${escapeHtml(p.noHP || '-')}
🏠 Alamat: ${escapeHtml(alamatAnggota)}
💼 Status Hubungan: <b>${escapeHtml(hubungan || '-')}</b>
${statusIcon} Status: <b>${escapeHtml(p.status || '-')}</b>
🏢 Perusahaan: ${escapeHtml(perusahaan || '-')}
`;
            memberSections.push(section);
        });
    } else {
        memberSections.push('\n<i>Data BPJS tidak ditemukan</i>\n');
    }

    const footer = `
${LINE.double}
🆔 ID: <code>${requestId}</code>
🪙 Token: <b>-${tokenUsed}</b> (Sisa: <b>${remainingToken}</b>)
`;
    
    // Combine and check length - Telegram limit 4096 chars
    const MAX_MSG_LENGTH = 3800;
    let messages = [];
    let currentMsg = header;
    
    for (const section of memberSections) {
        if ((currentMsg + section).length > MAX_MSG_LENGTH) {
            messages.push(currentMsg);
            currentMsg = `\n${EMOJI.hospital} <b>HASIL CEK BPJS (lanjutan)</b>\n${LINE.double}` + section;
        } else {
            currentMsg += section;
        }
    }
    
    // Add footer to last message
    currentMsg += footer;
    messages.push(currentMsg);
    
    // Return single string if only one message, array if multiple
    return messages.length === 1 ? messages[0] : messages;
}

// ═══════════════════════════════════════════
// NOPOL RESULT MESSAGE (Legacy - kept for backwards compatibility)
// ═══════════════════════════════════════════
function nopolResultMessage(data, tokenUsed, requestId = '', remainingToken = 0) {
    const platNomor = `${data.wilayah || ''} ${data.nopol || ''} ${data.seri || ''}`.trim();
    
    return `
🚗 <b>HASIL CEK NOPOL</b>
${LINE.double}

🔖 <b>INFO KENDARAAN</b>
Plat: <b>${escapeHtml(platNomor)}</b>
Merk: ${escapeHtml(data.Merk || '-')}
Type: ${escapeHtml(data.Type || '-')}
Tahun: ${escapeHtml(data.TahunPembuatan || '-')}
Warna: ${escapeHtml(data.Warna || '-')}
CC: ${escapeHtml(data.IsiCylinder || '-')}
Roda: ${data.JumlahRoda || '-'}

📋 <b>DOKUMEN</b>
No. Rangka: <code>${data.NoRangka || '-'}</code>
No. Mesin: <code>${data.NoMesin || '-'}</code>
No. BPKB: <code>${data.NoBPKB || '-'}</code>
No. STNK: <code>${data.NoSTNK || '-'}</code>
APM: ${escapeHtml(data.APM || '-')}

👤 <b>PEMILIK</b>
Nama: <b>${escapeHtml(data.NamaPemilik || '-')}</b>
NIK: <code>${data.NoKTP || '-'}</code>
No. KK: <code>${data.NoKK || '-'}</code>
HP: ${escapeHtml(data.NoHP || '-')}
Pekerjaan: ${escapeHtml(data.Pekerjaan || '-')}

🏠 <b>ALAMAT</b>
${escapeHtml(data.alamat || '-')}

${LINE.thin}
🆔 ID: <code>${requestId}</code>
🪙 Token: <b>-${tokenUsed}</b> (Sisa: <b>${remainingToken}</b>)
`;
}

// ═══════════════════════════════════════════
// VEHICLE RESULT MESSAGE (TerbangBebas API - for multiple vehicles)
// ═══════════════════════════════════════════
function vehicleResultMessage(data, index = 1, total = 1, query = '', tokenUsed = 0, requestId = '', remainingToken = 0) {
    const platNomor = `${data.wilayah || ''} ${data.nopol || ''} ${data.seri || ''}`.trim();
    
    const header = total > 1 
        ? `🚗 <b>HASIL CEK NOPOL (${index}/${total})</b>`
        : `🚗 <b>HASIL CEK NOPOL</b>`;
    
    return `
${header}
${LINE.double}
${total > 1 ? `🔍 Query: <b>${escapeHtml(query)}</b>\n` : ''}
🔖 <b>INFO KENDARAAN</b>
Plat: <b>${escapeHtml(platNomor)}</b>
Merk: ${escapeHtml(data.Merk || '-')}
Type: ${escapeHtml(data.Type || '-')}
Tahun: ${escapeHtml(data.TahunPembuatan || '-')}
Warna: ${escapeHtml(data.Warna || '-')}
CC: ${escapeHtml(data.IsiCylinder || '-')}
Roda: ${data.JumlahRoda || '-'}

📋 <b>DOKUMEN</b>
No. Rangka: <code>${data.NoRangka || '-'}</code>
No. Mesin: <code>${data.NoMesin || '-'}</code>
No. BPKB: <code>${data.NoBPKB || '-'}</code>
No. STNK: <code>${data.NoSTNK || '-'}</code>
APM: ${escapeHtml(data.APM || '-')}

👤 <b>PEMILIK</b>
Nama: <b>${escapeHtml(data.NamaPemilik || '-')}</b>
NIK: <code>${data.NoKTP || '-'}</code>
No. KK: <code>${data.NoKK || '-'}</code>
HP: ${escapeHtml(data.NoHP || '-')}
Pekerjaan: ${escapeHtml(data.Pekerjaan || '-')}

🏠 <b>ALAMAT</b>
${escapeHtml(data.alamat || '-')}

${LINE.thin}
🆔 ID: <code>${requestId}</code>
🪙 Token: <b>-${tokenUsed}</b> (Sisa: <b>${remainingToken}</b>)
`;
}

// ═══════════════════════════════════════════
// NOKA RESULT MESSAGE (Nomor Rangka)
// ═══════════════════════════════════════════
function nokaResultMessage(data, tokenUsed, requestId = '', remainingToken = 0) {
    const platNomor = `${data.wilayah || ''} ${data.nopol || ''} ${data.seri || ''}`.trim();
    
    return `
🔧 <b>HASIL CEK NO RANGKA</b>
${LINE.double}

🔖 <b>INFO KENDARAAN</b>
Plat: <b>${escapeHtml(platNomor)}</b>
Merk: ${escapeHtml(data.Merk || '-')}
Type: ${escapeHtml(data.Type || '-')}
Tahun: ${escapeHtml(data.TahunPembuatan || '-')}
Warna: ${escapeHtml(data.Warna || '-')}
CC: ${escapeHtml(data.IsiCylinder || '-')}
Roda: ${data.JumlahRoda || '-'}

📋 <b>DOKUMEN</b>
No. Rangka: <code>${data.NoRangka || '-'}</code>
No. Mesin: <code>${data.NoMesin || '-'}</code>
No. BPKB: <code>${data.NoBPKB || '-'}</code>
No. STNK: <code>${data.NoSTNK || '-'}</code>
APM: ${escapeHtml(data.APM || '-')}

👤 <b>PEMILIK</b>
Nama: <b>${escapeHtml(data.NamaPemilik || '-')}</b>
NIK: <code>${data.NoKTP || '-'}</code>
No. KK: <code>${data.NoKK || '-'}</code>
HP: ${escapeHtml(data.NoHP || '-')}
Pekerjaan: ${escapeHtml(data.Pekerjaan || '-')}

🏠 <b>ALAMAT</b>
${escapeHtml(data.alamat || '-')}

${LINE.thin}
🆔 ID: <code>${requestId}</code>
🪙 Token: <b>-${tokenUsed}</b> (Sisa: <b>${remainingToken}</b>)
`;
}

// ═══════════════════════════════════════════
// NOSIN RESULT MESSAGE (Nomor Mesin)
// ═══════════════════════════════════════════
function nosinResultMessage(data, tokenUsed, requestId = '', remainingToken = 0) {
    const platNomor = `${data.wilayah || ''} ${data.nopol || ''} ${data.seri || ''}`.trim();
    
    return `
⚙️ <b>HASIL CEK NO MESIN</b>
${LINE.double}

🔖 <b>INFO KENDARAAN</b>
Plat: <b>${escapeHtml(platNomor)}</b>
Merk: ${escapeHtml(data.Merk || '-')}
Type: ${escapeHtml(data.Type || '-')}
Tahun: ${escapeHtml(data.TahunPembuatan || '-')}
Warna: ${escapeHtml(data.Warna || '-')}
CC: ${escapeHtml(data.IsiCylinder || '-')}
Roda: ${data.JumlahRoda || '-'}

📋 <b>DOKUMEN</b>
No. Rangka: <code>${data.NoRangka || '-'}</code>
No. Mesin: <code>${data.NoMesin || '-'}</code>
No. BPKB: <code>${data.NoBPKB || '-'}</code>
No. STNK: <code>${data.NoSTNK || '-'}</code>
APM: ${escapeHtml(data.APM || '-')}

👤 <b>PEMILIK</b>
Nama: <b>${escapeHtml(data.NamaPemilik || '-')}</b>
NIK: <code>${data.NoKTP || '-'}</code>
No. KK: <code>${data.NoKK || '-'}</code>
HP: ${escapeHtml(data.NoHP || '-')}
Pekerjaan: ${escapeHtml(data.Pekerjaan || '-')}

🏠 <b>ALAMAT</b>
${escapeHtml(data.alamat || '-')}

${LINE.thin}
🆔 ID: <code>${requestId}</code>
🪙 Token: <b>-${tokenUsed}</b> (Sisa: <b>${remainingToken}</b>)
`;
}

// ═══════════════════════════════════════════
// DEPOSIT REQUEST MESSAGE
// ═══════════════════════════════════════════
function depositRequestMessage(tokenAmount, totalPrice, depositId, hasPaymentLink = false, expiresAt = null) {
    let expiredStr = '10 menit';
    if (expiresAt) {
        const date = new Date(expiresAt);
        expiredStr = date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Jakarta' }) + ' WIB';
    }

    let msg = `
<b>╔════════════════╗</b>
<b>║</b> 💳 <b>INVOICE DEPOSIT</b>
<b>╚════════════════╝</b>

🆔 ID: <code>${depositId}</code>
🪙 Token: <b>${tokenAmount}</b>
💵 Total: <b>${formatRupiah(totalPrice)}</b>

<b>INSTRUKSI PEMBAYARAN</b>
${LINE.thin}
1️⃣ Scan QRIS di atas dengan e-wallet/m-banking
2️⃣ Bayar tepat <b>${formatRupiah(totalPrice)}</b>
3️⃣ Tunggu konfirmasi otomatis

⏰ <i>Expired: <b>${expiredStr}</b></i>
❌ <i>Jangan transfer jika expired</i>

${LINE.sep}
📞 <b>Butuh Bantuan?</b>
Klik tombol Support di bawah untuk
hubungi admin jika ada kendala.
`;

    if (!hasPaymentLink) {
        msg += `
${LINE.sep}
<b>⚠️ QRIS ERROR</b>
Silakan hubungi admin untuk pembayaran manual.
Klik tombol <b>"📞 Support"</b> di bawah.
`;
    }

    return msg;
}

// ═══════════════════════════════════════════
// SUPPORT MESSAGE
// ═══════════════════════════════════════════
function supportMessage(botName) {
    return `
📞 <b>HUBUNGI SUPPORT</b>
${LINE.sep}

Butuh bantuan? Ada pertanyaan?
Atau ingin melaporkan masalah?

Klik tombol di bawah untuk
menghubungi tim support kami.

<i>🕐 Respon dalam 1x24 jam</i>

${EMOJI.warning} <i>Jika ada kendala, langsung hubungi support ya!</i>
`;
}

// ═══════════════════════════════════════════
// REFERRAL MESSAGES
// ═══════════════════════════════════════════
function referralMessage(refCode, botUsername) {
    const refLink = `https://t.me/${botUsername}?start=ref_${refCode}`;
    return `
${EMOJI.gift} <b>PROGRAM REFERRAL</b>
${LINE.sep}

🔗 <b>Link Referral Anda:</b>
<code>${refLink}</code>

<i>Tap link di atas untuk copy</i>

${LINE.thin}
${EMOJI.star} <b>CARA DAPAT BONUS:</b>
1️⃣ Bagikan link ke teman
2️⃣ Teman daftar via link Anda
3️⃣ Teman deposit <b>100+ token</b>
4️⃣ Anda dapat <b>+20 token GRATIS!</b>

${EMOJI.info} <i>Ketik /myref untuk statistik</i>

${EMOJI.warning} Ada kendala? Ketik <code>/support</code>
`;
}

function referralStatsMessage(stats, botUsername) {
    const refLink = `https://t.me/${botUsername}?start=ref_${stats.code}`;
    return `
${EMOJI.chart} <b>STATISTIK REFERRAL</b>
${LINE.sep}

🔗 <b>Kode:</b> <code>${stats.code}</code>
🔗 <b>Link:</b> <code>${refLink}</code>

${LINE.thin}
👥 Total Referral: <b>${stats.totalReferred}</b>
⏳ Pending Bonus: <b>${stats.pendingBonus}</b>
💰 Total Bonus: <b>${stats.totalBonusEarned} token</b>

${LINE.thin}
${EMOJI.info} <i>Bonus +20 token per referral yang deposit 100+ token</i>

${EMOJI.warning} Ada kendala? Ketik <code>/support</code>
`;
}

function referralWelcomeMessage(referrerName) {
    return `\n\n🎁 <i>Anda diundang oleh <b>${escapeHtml(referrerName)}</b>. Deposit min 100 token, referrer dapat bonus!</i>`;
}

function referralAlreadyRegisteredMessage() {
    return `
${EMOJI.warning} <b>SUDAH TERDAFTAR</b>

Anda sudah terdaftar sebelumnya.
Link referral hanya bisa digunakan sekali.

${EMOJI.warning} Ada kendala? Ketik <code>/support</code>
`;
}

function referralBonusNotification(referredUsername, bonusAmount) {
    return `
${EMOJI.gift} <b>BONUS REFERRAL!</b>
${LINE.sep}

${EMOJI.party} Selamat! Anda mendapat bonus referral.

👤 Dari: <b>${escapeHtml(referredUsername || 'User')}</b>
💰 Bonus: <b>+${bonusAmount} token</b>

<i>Terima kasih sudah mengajak teman!</i>

${EMOJI.warning} Ada kendala? Ketik <code>/support</code>
`;
}

// ═══════════════════════════════════════════
// TRANSACTION HISTORY MESSAGE
// ═══════════════════════════════════════════
function transactionHistoryMessage(transactions, user) {
    if (!transactions || transactions.length === 0) {
        return `
${EMOJI.list} <b>RIWAYAT TRANSAKSI</b>
${LINE.double}

📭 <i>Belum ada transaksi</i>
`;
    }

    let msg = `
${EMOJI.list} <b>RIWAYAT TRANSAKSI</b>
${LINE.double}
`;

    transactions.forEach((t, index) => {
        const icon = t.type === 'deposit' ? '💰' : '🔍';
        const status = t.status === 'success' ? '✅' : '❌';
        const date = new Date(t.created_at).toLocaleString('id-ID', { 
            timeZone: 'Asia/Jakarta',
            day: '2-digit', month: '2-digit', year: '2-digit',
            hour: '2-digit', minute: '2-digit'
        });
        
        msg += `
${index + 1}. ${icon} <b>${escapeHtml(t.description || t.type)}</b>
   ${status} ${t.amount > 0 ? '+' : ''}${t.amount} token
   📅 ${date}
`;
    });

    msg += `
${LINE.thin}
🪙 Saldo: <b>${user.token_balance} token</b>
`;
    return msg;
}

// ═══════════════════════════════════════════
// OWNER MENU MESSAGE
// ═══════════════════════════════════════════
function ownerMenuMessage() {
    return `
${EMOJI.crown} <b>OWNER PANEL</b>
${LINE.double}

<b>📊 USER</b>
👥 /listuser
📊 /stats
📈 /apistats
⏳ /pending

<b>💰 TOKEN</b>
✅ /approve &lt;id&gt;
❌ /reject &lt;id&gt;
➕ /addtoken &lt;user_id&gt; &lt;jml&gt;
➖ /reducetoken &lt;user_id&gt; &lt;jml&gt;

<b>🎁 PROMO</b>
🎟️ /setpromo

<b>⚙️ SETTINGS</b>
💰 /setprice &lt;harga&gt;
🪙 /setcost &lt;fitur&gt; &lt;cost&gt;
� /setdeposit &lt;min&gt; (min deposit)
�🔑 /setapi &lt;type&gt; &lt;key&gt;
🛠️ /setmt &lt;fitur&gt; &lt;on/off&gt;
⚙️ /settings

<b>📢 OTHER</b>
📢 /broadcast &lt;pesan&gt;
📝 /apilogs

<b>💾 BACKUP</b>
💾 /backup (manual)
⚙️ /setbackup (setting)
`;
}

// ═══════════════════════════════════════════
// STATS MESSAGE
// ═══════════════════════════════════════════
function statsMessage(stats) {
    return `
${EMOJI.chart} <b>STATISTIK BOT</b>
${LINE.double}

<b>👥 USERS</b>
Total User: <b>${stats.totalUsers}</b>
User Baru Hari Ini: <b>${stats.dailyUsers}</b>

<b>💰 KEUANGAN</b>
Total Deposit (Rp): <b>${formatRupiah(stats.totalDeposits)}</b>
Total Token Terjual: <b>${stats.totalTokensSold}</b>

<b>💳 STATUS DEPOSIT</b>
✅ Sukses: <b>${stats.successDepositCount}</b>
⏳ Pending: <b>${stats.pendingDeposits}</b>
❌ Ditolak: <b>${stats.rejectedDepositCount}</b>

<b>📊 PENGGUNAAN</b>
Total Request Data: <b>${stats.totalChecks}x</b>
`;
}

// ═══════════════════════════════════════════
// USER LIST MESSAGE
// ═══════════════════════════════════════════
function userListMessage(users) {
    if (!users || users.length === 0) {
        return '<b>📭 Belum ada user terdaftar</b>';
    }

    let msg = `
👥 <b>DAFTAR USER</b>
${LINE.double}
Total: ${users.length}
${LINE.sep}
`;

    users.slice(0, 20).forEach((user, index) => {
        msg += `
${index + 1}. <b>${escapeHtml(user.first_name || user.username || 'User')}</b>
   🆔 <code>${user.user_id}</code>
   🪙 ${user.token_balance}t | 📊 ${user.total_checks}x
`;
    });

    if (users.length > 20) {
        msg += `\n<i>...dan ${users.length - 20} user lainnya</i>`;
    }

    return msg;
}

// ═══════════════════════════════════════════
// PENDING DEPOSITS MESSAGE
// ═══════════════════════════════════════════
function pendingDepositsMessage(deposits) {
    if (!deposits || deposits.length === 0) {
        return '<b>✅ Tidak ada deposit pending</b>';
    }

    let msg = `
⏳ <b>DEPOSIT PENDING</b>
Total: <b>${deposits.length}</b>
${LINE.double}
`;

    deposits.forEach((d, index) => {
        const date = new Date(d.created_at).toLocaleString('id-ID', { 
            timeZone: 'Asia/Jakarta',
            day: '2-digit', month: '2-digit',
            hour: '2-digit', minute: '2-digit'
        });
        
        msg += `
${index + 1}. <b>#${d.id}</b>
   👤 <code>${d.user_id}</code>
   💵 ${formatRupiah(d.amount)} → 🪙 ${d.token_amount}t
   📅 ${date}
   <code>/approve ${d.id}</code> | <code>/reject ${d.id}</code>
`;
    });

    return msg;
}

// ═══════════════════════════════════════════
// ERROR MESSAGE
// ═══════════════════════════════════════════
function errorMessage(title, description) {
    return `
<b>❌ ${escapeHtml(title)}</b>

${escapeHtml(description)}
`;
}

// ═══════════════════════════════════════════
// SUCCESS MESSAGE
// ═══════════════════════════════════════════
function successMessage(title, description) {
    return `
<b>✅ ${escapeHtml(title)}</b>

${description}
`;
}

// ═══════════════════════════════════════════
// PROCESSING MESSAGE
// ═══════════════════════════════════════════
function processingMessage(query, requestId) {
    return `
<b>⏳ Sedang Proses...</b>

🔍 Mencari: <b>${escapeHtml(query)}</b>
🆔 ID: <code>${requestId}</code>

<i>Mohon tunggu sebentar...</i>
`;
}

module.exports = {
    EMOJI,
    LINE,
    formatRupiah,
    formatDate,
    escapeHtml,
    menuMessage,
    helpMessage,
    welcomeMessage,
    balanceMessage,
    nikResultMessage,
    ceknomorResultMessage,
    namaResultMessage,
    kkResultMessage,
    edabuResultMessage,
    bpjstkResultMessage,
    nopolResultMessage,
    vehicleResultMessage,
    nokaResultMessage,
    nosinResultMessage,
    depositRequestMessage,
    supportMessage,
    transactionHistoryMessage,
    ownerMenuMessage,
    statsMessage,
    userListMessage,
    pendingDepositsMessage,
    errorMessage,
    successMessage,
    processingMessage,
    // Referral functions
    referralMessage,
    referralStatsMessage,
    referralWelcomeMessage,
    referralAlreadyRegisteredMessage,
    referralBonusNotification
};
