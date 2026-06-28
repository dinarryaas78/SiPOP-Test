/* ================================================================
   SiPOP – Sistem Pelaporan Operasional dan Pemeliharaan
           Jaringan Irigasi NTT
   app.js — Semua logika JavaScript terpisah dari HTML
   ================================================================
   DAFTAR ISI:
     1.  KONFIGURASI
     2.  STATE GLOBAL
     3.  INISIALISASI (DOMContentLoaded)
     4.  TAB NAVIGATION
     5.  STEPPER
     6.  NAVIGASI LANGKAH (next / prev)
     7.  VALIDASI PER LANGKAH
     8.  GPS
     9.  FOTO (pilih, preview, hapus)
    10.  KUMPULKAN DATA FORM
    11.  KIRIM LAPORAN
    12.  TAMPILKAN SUKSES
    13.  BUAT LAPORAN BARU (reset)
    14.  RIWAYAT (localStorage)
   ================================================================ */


/* ============================================================
   1. KONFIGURASI
   Ganti URL di bawah setelah deploy Google Apps Script.
   Lihat tab Panduan di aplikasi untuk langkah lengkapnya.
============================================================ */
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwhwpeYCzlrbmLomWaW_rNRMx6HARS_XMW4aSMPuESZv6ggs-e8SsLGyE06IqjCzzPC/exec";

/* ============================================================
   2. STATE GLOBAL
============================================================ */
let currentStep = 1;          // Langkah aktif saat ini (1–4)
const TOTAL_STEPS = 4;        // Jumlah total langkah

// Array base64 untuk masing-masing slot foto (maks 6)
const fotoData = [null, null, null, null, null, null];

// Koordinat GPS yang sudah diambil
let gpsLat = null;
let gpsLng = null;

// Label & ikon slot foto — dipakai di beberapa fungsi
const FOTO_LABELS = ['Kondisi Umum', 'Pintu Air', 'Saluran', 'Bendung', 'Kegiatan', 'Lainnya'];
const FOTO_ICONS  = ['📷', '🚪', '🌊', '🏗️', '👷', '➕'];


/* ============================================================
   3. INISIALISASI
   Dijalankan setelah seluruh DOM siap.
============================================================ */
window.addEventListener('DOMContentLoaded', () => {
  // Isi tanggal & waktu secara otomatis dengan nilai sekarang
  const now = new Date();
  document.getElementById('tanggal').value = now.toISOString().split('T')[0];
  document.getElementById('waktu').value   = now.toTimeString().slice(0, 5);

  // Tampilkan riwayat yang sudah tersimpan
  renderRiwayat();
});


/* ============================================================
   4. TAB NAVIGATION
   Menampilkan satu tab dan menyembunyikan dua lainnya.
   Tab yang tersedia: 'form', 'riwayat', 'panduan'
============================================================ */
function showTab(tab) {
  const tabs = ['form', 'riwayat', 'panduan'];

  tabs.forEach(t => {
    // Tampilkan / sembunyikan konten tab
    document.getElementById('tab-' + t).style.display = (t === tab) ? 'block' : 'none';

    // Aktifkan / nonaktifkan tombol nav bawah
    document.getElementById('nav-' + t).classList.toggle('active', t === tab);
  });

  // Muat ulang riwayat setiap kali tab Riwayat dibuka
  if (tab === 'riwayat') renderRiwayat();
}


/* ============================================================
   5. STEPPER
   Memperbarui tampilan visual progress bar langkah.
============================================================ */

/**
 * Memperbarui kelas CSS setiap .step-item sesuai posisi saat ini.
 * @param {number} step - Langkah yang sedang aktif (1–4)
 */
function updateStepper(step) {
  document.querySelectorAll('.step-item').forEach((el, i) => {
    el.classList.remove('active', 'done');
    if (i + 1 <  step) el.classList.add('done');   // langkah sebelumnya → selesai
    if (i + 1 === step) el.classList.add('active'); // langkah ini → aktif
  });
}

/**
 * Menampilkan konten langkah tertentu dan menyembunyikan yang lain.
 * Juga mereset tampilan halaman sukses dan scroll ke atas.
 * @param {number} step - Nomor langkah yang akan ditampilkan
 */
function showStepEl(step) {
  for (let i = 1; i <= TOTAL_STEPS; i++) {
    const el = document.getElementById('step' + i);
    if (el) el.style.display = (i === step) ? 'block' : 'none';
  }

  // Pastikan halaman sukses tidak tampil saat berpindah langkah
  document.getElementById('successPage').classList.remove('show');

  updateStepper(step);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}


/* ============================================================
   6. NAVIGASI LANGKAH (next / prev)
============================================================ */

/**
 * Maju ke langkah berikutnya, hanya jika validasi langkah saat ini lulus.
 * @param {number} step - Nomor langkah tujuan
 */
function nextStep(step) {
  if (!validateStep(currentStep)) return;
  currentStep = step;
  showStepEl(step);
}

/**
 * Kembali ke langkah sebelumnya (tanpa validasi).
 * @param {number} step - Nomor langkah tujuan
 */
function prevStep(step) {
  currentStep = step;
  showStepEl(step);
}


/* ============================================================
   7. VALIDASI PER LANGKAH
   Memeriksa apakah semua field wajib sudah diisi sebelum lanjut.
============================================================ */

/**
 * Memvalidasi field wajib sesuai nomor langkah.
 * Menampilkan alert jika ada field kosong.
 * @param {number} step - Langkah yang akan divalidasi
 * @returns {boolean} true jika valid, false jika ada yang kosong
 */
function validateStep(step) {
  // ── Langkah 1: Identitas ──
  if (step === 1) {
    if (!v('jabatan'))     return showAlert('Pilih jabatan terlebih dahulu!');
    if (!v('namaPetugas')) return showAlert('Nama petugas wajib diisi!');
    if (!v('tanggal'))     return showAlert('Tanggal wajib diisi!');
    if (!v('waktu'))       return showAlert('Waktu wajib diisi!');
  }

  // ── Langkah 2: Lokasi ──
  if (step === 2) {
    if (!v('daerahIrigasi')) return showAlert('Nama Daerah Irigasi wajib diisi!');
    if (!v('ruasKerja'))     return showAlert('Ruas Kerja wajib diisi!');
    if (!v('desa'))          return showAlert('Nama Desa wajib diisi!');
    if (!v('kecamatan'))     return showAlert('Kecamatan wajib diisi!');
    if (!v('kabupaten'))     return showAlert('Kabupaten wajib diisi!');
  }

  // ── Langkah 3: Kehadiran ──
  if (step === 3) {
    if (!v('keterangan')) return showAlert('Keterangan wajib diisi!');
  }

  return true; // Semua valid
}

/**
 * Shortcut: ambil nilai yang sudah di-trim dari elemen berdasarkan ID.
 * @param {string} id - ID elemen input
 * @returns {string}
 */
function v(id) {
  return document.getElementById(id).value.trim();
}

/**
 * Tampilkan pesan peringatan dan kembalikan false (untuk chaining validasi).
 * @param {string} pesan - Isi pesan peringatan
 * @returns {boolean} selalu false
 */
function showAlert(pesan) {
  alert('⚠️ ' + pesan);
  return false;
}


/* ============================================================
   8. GPS
   Mengambil koordinat lokasi petugas menggunakan Geolocation API.
============================================================ */

/**
 * Meminta izin lokasi browser dan menampilkan koordinat GPS.
 * Dipanggil dari tombol "Ambil Lokasi GPS Sekarang".
 */
function ambilGPS() {
  const statusEl = document.getElementById('gpsStatus');
  const coordEl  = document.getElementById('gpsCoords');

  // Tampilkan status "sedang mengambil"
  statusEl.textContent = '📡 Mengambil lokasi GPS...';
  statusEl.className   = 'gps-status';

  // Periksa dukungan browser
  if (!navigator.geolocation) {
    statusEl.textContent = '❌ Browser tidak mendukung GPS';
    statusEl.className   = 'gps-status error';
    return;
  }

  // Minta lokasi dengan akurasi tinggi
  navigator.geolocation.getCurrentPosition(
    // Berhasil
    pos => {
      gpsLat = pos.coords.latitude.toFixed(6);
      gpsLng = pos.coords.longitude.toFixed(6);
      const akurasi = Math.round(pos.coords.accuracy);

      statusEl.textContent = `✅ Lokasi berhasil diambil (akurasi ±${akurasi}m)`;
      statusEl.className   = 'gps-status success';

      coordEl.textContent = `Lat: ${gpsLat}\nLng: ${gpsLng}`;
      coordEl.classList.add('show');
    },

    // Gagal
    err => {
      statusEl.textContent = `❌ Gagal mengambil lokasi: ${err.message}`;
      statusEl.className   = 'gps-status error';
    },

    // Opsi
    { enableHighAccuracy: true, timeout: 15000 }
  );
}


/* ============================================================
   9. FOTO
   Memilih, menampilkan preview, dan menghapus foto dari slot.
============================================================ */

/**
 * Membuka dialog pemilihan file untuk slot foto tertentu.
 * @param {number} idx - Indeks slot foto (0–5)
 */
function pilihFoto(idx) {
  document.getElementById('fileInput' + idx).click();
}

/**
 * Dipanggil saat pengguna memilih file.
 * Membaca file sebagai base64 dan menampilkan thumbnail.
 * @param {number} idx   - Indeks slot foto (0–5)
 * @param {HTMLInputElement} input - Elemen file input yang berubah
 */
function previewFoto(idx, input) {
  const file = input.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = e => {
    // Simpan data base64 ke array state
    fotoData[idx] = {
      data:     e.target.result.split(',')[1], // hanya bagian base64, tanpa prefix
      mimeType: file.type,
      name:     file.name
    };

    // Tampilkan thumbnail di slot
    const slot = document.getElementById('slot' + idx);
    slot.innerHTML = `
      <img src="${e.target.result}" alt="Foto ${idx + 1}" />
      <button class="remove-foto" onclick="hapusFoto(event, ${idx})">✕</button>
    `;
  };

  reader.readAsDataURL(file);
}

/**
 * Menghapus foto dari slot tertentu dan mengembalikan tampilan slot ke kondisi awal.
 * @param {Event}  e   - Event klik (untuk stopPropagation)
 * @param {number} idx - Indeks slot foto (0–5)
 */
function hapusFoto(e, idx) {
  e.stopPropagation(); // Cegah klik meneruskan ke slot (yang akan membuka file picker)

  // Hapus dari state
  fotoData[idx] = null;

  // Kembalikan tampilan slot ke kondisi awal
  const slot = document.getElementById('slot' + idx);
  slot.onclick = () => pilihFoto(idx);
  slot.innerHTML = `
    <span class="slot-icon">${FOTO_ICONS[idx]}</span>
    <span class="slot-label">${FOTO_LABELS[idx]}</span>
  `;

  // Reset nilai input file agar file yang sama bisa dipilih ulang
  document.getElementById('fileInput' + idx).value = '';
}


/* ============================================================
   10. KUMPULKAN DATA FORM
   Mengambil semua nilai dari form dan menyusunnya menjadi objek payload.
============================================================ */

/**
 * Membaca semua nilai input dan mengembalikan objek data laporan.
 * @returns {Object} Payload lengkap siap dikirim ke Apps Script
 */
function kumpulkanData() {
  // Kumpulkan semua kegiatan yang dicentang
  const kegiatan = [];
  document.querySelectorAll('.check-item:checked').forEach(el => {
    kegiatan.push(el.value);
  });

  return {
    timestamp:     new Date().toISOString(),
    jabatan:       v('jabatan'),
    nama:          v('namaPetugas'),
    tanggal:       v('tanggal'),
    waktu:         v('waktu'),
    daerahIrigasi: v('daerahIrigasi'),
    ruasKerja:     v('ruasKerja'),
    desa:          v('desa'),
    kecamatan:     v('kecamatan'),
    kabupaten:     v('kabupaten'),
    status:        document.querySelector('input[name="status"]:checked').value,
    keterangan:    v('keterangan'),
    lat:           gpsLat || '-',
    lng:           gpsLng || '-',
    kegiatan,
    catatan:       v('catatan'),
    fotos:         fotoData.filter(Boolean) // hanya slot yang terisi
  };
}


/* ============================================================
   11. KIRIM LAPORAN
   Memvalidasi, menyimpan ke riwayat, mengirim ke Apps Script,
   lalu menampilkan halaman sukses.
============================================================ */

/**
 * Dipanggil dari tombol "Kirim Laporan".
 * Async karena menunggu respons dari Apps Script.
 */
async function kirimLaporan() {
  // Validasi: minimal 1 kegiatan harus dicentang
  const checkedCount = document.querySelectorAll('.check-item:checked').length;
  if (checkedCount === 0) {
    alert('⚠️ Pilih minimal satu kegiatan yang dilakukan!');
    return;
  }

  // Kumpulkan semua data form
  const payload = kumpulkanData();

  // Tampilkan loading overlay
  const overlay = document.getElementById('sendingOverlay');
  overlay.classList.add('show');

  // Simpan ke riwayat lokal terlebih dahulu (agar tidak hilang jika jaringan gagal)
  simpanRiwayat(payload);

  // Kirim ke Google Apps Script (jika URL sudah dikonfigurasi)
  const urlSudahDiatur = APPS_SCRIPT_URL !== "PASTE_WEB_APP_URL_DISINI";
  if (urlSudahDiatur) {
    try {
      await fetch(APPS_SCRIPT_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
        mode:    'no-cors' // Apps Script tidak mengirim CORS header
      });
    } catch (err) {
      // Gagal kirim tidak menghentikan alur — data sudah tersimpan lokal
      console.warn('Gagal mengirim ke server:', err);
    }
  }

  // Tunda minimal 2 detik agar pengguna melihat animasi loading
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Sembunyikan loading, tampilkan halaman sukses
  overlay.classList.remove('show');
  tampilkanSukses(payload);
}


/* ============================================================
   12. TAMPILKAN SUKSES
   Menyembunyikan card form dan menampilkan ringkasan laporan.
============================================================ */

/**
 * Menampilkan halaman sukses setelah laporan berhasil dikirim.
 * @param {Object} data - Payload yang sudah dikirim
 */
function tampilkanSukses(data) {
  // Sembunyikan semua card & baris tombol di step 4
  document.querySelectorAll('#step4 > .card, #step4 > .btn-row')
    .forEach(el => el.style.display = 'none');

  // Tampilkan halaman sukses
  const sp = document.getElementById('successPage');
  sp.classList.add('show');

  // Isi tabel ringkasan dengan data laporan
  document.getElementById('successMeta').innerHTML = `
    <div class="meta-row"><span>👤 Petugas</span><strong>${data.nama}</strong></div>
    <div class="meta-row"><span>🏷️ Jabatan</span><strong>${data.jabatan}</strong></div>
    <div class="meta-row"><span>📅 Tanggal</span><strong>${data.tanggal} ${data.waktu}</strong></div>
    <div class="meta-row"><span>🌾 D.I</span><strong>${data.daerahIrigasi}</strong></div>
    <div class="meta-row"><span>✅ Status</span><strong>${data.status}</strong></div>
    <div class="meta-row"><span>📋 Kegiatan</span><strong>${data.kegiatan.length} item</strong></div>
    <div class="meta-row"><span>📸 Foto</span><strong>${data.fotos.length} foto</strong></div>
  `;

  window.scrollTo({ top: 0, behavior: 'smooth' });
}


/* ============================================================
   13. BUAT LAPORAN BARU (RESET)
   Mengosongkan semua input dan mengembalikan aplikasi ke langkah 1.
============================================================ */

/**
 * Dipanggil dari tombol "Buat Laporan Baru" di halaman sukses.
 * Me-reset seluruh state dan tampilan form.
 */
function buatBaru() {
  // ── Reset nilai input teks ──
  const fieldsToReset = [
    'jabatan', 'namaPetugas', 'daerahIrigasi', 'ruasKerja',
    'desa', 'kecamatan', 'kabupaten', 'keterangan', 'catatan'
  ];
  fieldsToReset.forEach(id => {
    document.getElementById(id).value = '';
  });

  // ── Isi ulang tanggal & waktu dengan nilai sekarang ──
  const now = new Date();
  document.getElementById('tanggal').value = now.toISOString().split('T')[0];
  document.getElementById('waktu').value   = now.toTimeString().slice(0, 5);

  // ── Reset GPS ──
  gpsLat = null;
  gpsLng = null;
  document.getElementById('gpsStatus').textContent = '🛰️ Belum diambil — Tap tombol untuk capture lokasi';
  document.getElementById('gpsStatus').className   = 'gps-status';
  document.getElementById('gpsCoords').classList.remove('show');

  // ── Reset checklist kegiatan ──
  document.querySelectorAll('.check-item').forEach(el => el.checked = false);

  // ── Reset status kehadiran ke "Hadir" ──
  document.getElementById('status-hadir').checked = true;

  // ── Reset semua slot foto ──
  fotoData.fill(null);
  for (let i = 0; i < 6; i++) {
    const slot = document.getElementById('slot' + i);
    slot.onclick = () => pilihFoto(i);
    slot.innerHTML = `
      <span class="slot-icon">${FOTO_ICONS[i]}</span>
      <span class="slot-label">${FOTO_LABELS[i]}</span>
    `;
    document.getElementById('fileInput' + i).value = '';
  }

  // ── Tampilkan kembali card dan tombol di step 4 ──
  document.querySelectorAll('#step4 > .card, #step4 > .btn-row')
    .forEach(el => el.style.display = '');

  // ── Sembunyikan halaman sukses ──
  document.getElementById('successPage').classList.remove('show');

  // ── Kembali ke langkah pertama ──
  currentStep = 1;
  showStepEl(1);
}


/* ============================================================
   14. RIWAYAT (localStorage)
   Menyimpan ringkasan laporan ke penyimpanan lokal browser
   dan menampilkannya di tab Riwayat.
============================================================ */

/**
 * Menyimpan ringkasan data laporan ke localStorage.
 * Maks 50 entri tersimpan; entri terlama dihapus otomatis.
 * @param {Object} data - Payload lengkap laporan
 */
function simpanRiwayat(data) {
  try {
    const raw  = localStorage.getItem('sipop_riwayat') || '[]';
    const list = JSON.parse(raw);

    // Tambahkan entri baru di posisi pertama (terbaru di atas)
    list.unshift({
      id:       Date.now(),
      nama:     data.nama,
      jabatan:  data.jabatan,
      tanggal:  data.tanggal,
      waktu:    data.waktu,
      status:   data.status,
      di:       data.daerahIrigasi,
      kegiatan: data.kegiatan.length,
      foto:     data.fotos.length
    });

    // Batasi maksimum 50 riwayat
    if (list.length > 50) list.pop();

    localStorage.setItem('sipop_riwayat', JSON.stringify(list));
  } catch (e) {
    console.warn('Gagal menyimpan riwayat:', e);
  }
}

/**
 * Membaca riwayat dari localStorage dan merender kartu-kartu di tab Riwayat.
 */
function renderRiwayat() {
  const container = document.getElementById('riwayatList');

  try {
    const raw  = localStorage.getItem('sipop_riwayat') || '[]';
    const list = JSON.parse(raw);

    // Tampilkan pesan kosong jika belum ada riwayat
    if (list.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📭</div>
          <p>Belum ada riwayat laporan</p>
        </div>`;
      return;
    }

    // Render setiap entri sebagai kartu riwayat
    container.innerHTML = list.map(r => {
      // Tentukan kelas warna berdasarkan status
      const cls = r.status === 'Ijin/Sakit'   ? 'ijin'
                : r.status === 'Tidak Hadir'  ? 'tidak'
                : '';

      return `
        <div class="riwayat-card ${cls}">
          <div class="rw-head">
            <div class="rw-name">${r.nama}</div>
            <div class="rw-badge">${r.status}</div>
          </div>
          <div class="rw-info">📅 ${r.tanggal} ${r.waktu} &nbsp;|&nbsp; 🌾 ${r.di}</div>
          <div class="rw-info" style="margin-top:3px">
            🏷️ ${r.jabatan} &nbsp;|&nbsp;
            📋 ${r.kegiatan} kegiatan &nbsp;|&nbsp;
            📸 ${r.foto} foto
          </div>
        </div>`;
    }).join('');

  } catch (e) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <p>Gagal memuat riwayat</p>
      </div>`;
  }
}
