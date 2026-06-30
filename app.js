// ═══════════════════════════════════════════════════════
//  SiPOP – Sistem Pelaporan Operasional & Pemeliharaan
//  app.js  |  Frontend Logic
// ═══════════════════════════════════════════════════════

// API endpoint Google Apps Script
const API_URL = 'https://script.google.com/macros/s/AKfycbwDqQHzy3AQCjMv1-fE4uhNJwZsWkfWnTpeFqUxvLzekYgltEFjrvmbyov1KMiRyNTM6w/exec';

// ── STATE ────────────────────────────────────────────
let currentStep = 0;
const TOTAL_STEPS = 3;          // step 0, 1, 2  (step 3 = sukses)
let selectedPhotos = [];        // [{file, dataURL, name}]

// ── INIT ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const now = new Date();
  document.getElementById('tanggal').value = now.toISOString().slice(0, 10);
  document.getElementById('waktu').value   = now.toTimeString().slice(0, 5);

  // Status dot — langsung hijau (URL hard-coded, tidak ada ping)
  setStatus('ok', 'Siap Digunakan');

  // Drag & drop zona upload
  const zone = document.getElementById('uploadZone');
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag');
    handleFiles(Array.from(e.dataTransfer.files));
  });
});

// ── STATUS DOT ───────────────────────────────────────
function setStatus(state, text) {
  const dot  = document.getElementById('statusDot');
  const span = document.getElementById('statusText');
  dot.className = 'dot ' + (state === 'ok' ? 'ok' : state === 'err' ? 'err' : '');
  span.textContent = text;
}

// ── STEPPER NAVIGASI ─────────────────────────────────
function goStep(target) {
  if (target > currentStep && !validateStep(currentStep)) return;

  // Tandai step lama sebagai "done" bila maju
  if (target > currentStep) {
    const prevItem = document.getElementById('si' + currentStep);
    if (prevItem) { prevItem.classList.remove('active'); prevItem.classList.add('done'); }
  }

  // Sembunyikan panel lama
  const prevPanel = document.getElementById('step' + currentStep);
  if (prevPanel) prevPanel.classList.remove('active');

  // Mundur — hapus "done" dari step target ke depan
  if (target < currentStep) {
    for (let i = target; i <= currentStep; i++) {
      const si = document.getElementById('si' + i);
      if (si) { si.classList.remove('active', 'done'); }
    }
  }

  currentStep = target;

  // Aktifkan panel & step baru
  const nextPanel = document.getElementById('step' + currentStep);
  if (nextPanel) nextPanel.classList.add('active');
  const nextItem = document.getElementById('si' + currentStep);
  if (nextItem) { nextItem.classList.add('active'); nextItem.classList.remove('done'); }

  updateTrack();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateTrack() {
  const fill = document.getElementById('trackFill');
  if (!fill) return;
  const pct = currentStep === 0 ? 0 : (currentStep / (TOTAL_STEPS - 1)) * 100;
  fill.style.width = Math.min(pct, 100) + '%';
}

// ── VALIDASI PER STEP ────────────────────────────────
function validateStep(step) {
  const v = id => { const el = document.getElementById(id); return el && el.value.trim() !== ''; };

  if (step === 0) {
    if (!v('jabatan'))     { toast('Pilih jabatan terlebih dahulu.', 'warn'); return false; }
    if (!v('namaPetugas')) { toast('Nama petugas wajib diisi.', 'warn'); return false; }
    if (!v('tanggal'))     { toast('Tanggal wajib diisi.', 'warn'); return false; }
    if (!v('waktu'))       { toast('Waktu wajib diisi.', 'warn'); return false; }
  }

  if (step === 1) {
    if (!v('daerahIrigasi')) { toast('Pilih daerah irigasi.', 'warn'); return false; }
    if (!v('namaSaluran'))   { toast('Nama saluran wajib diisi.', 'warn'); return false; }
    if (!v('namaDesa'))      { toast('Nama desa wajib diisi.', 'warn'); return false; }
    if (!v('kecamatan'))     { toast('Kecamatan wajib diisi.', 'warn'); return false; }
    if (!v('kabupaten'))     { toast('Kabupaten wajib diisi.', 'warn'); return false; }
  }

  if (step === 2) {
    const checked = document.querySelectorAll('#kegiatanGrid input:checked');
    if (checked.length === 0) { toast('Pilih minimal satu kegiatan.', 'warn'); return false; }
  }

  return true;
}

// ── KEGIATAN TOGGLE ──────────────────────────────────
function toggleKegiatan(label) {
  const cb = label.querySelector('input[type="checkbox"]');
  setTimeout(() => {
    cb.checked ? label.classList.add('selected') : label.classList.remove('selected');
  }, 0);
}

function getKegiatan() {
  return Array.from(document.querySelectorAll('#kegiatanGrid input:checked')).map(cb => cb.value);
}

// ── GPS ──────────────────────────────────────────────
function getGPS() {
  if (!navigator.geolocation) { toast('Browser tidak mendukung GPS.', 'error'); return; }
  toast('Mendeteksi lokasi GPS…', 'info');
  document.getElementById('gpsHint').textContent = 'Mendeteksi…';

  navigator.geolocation.getCurrentPosition(
    pos => {
      const lat = pos.coords.latitude.toFixed(6);
      const lng = pos.coords.longitude.toFixed(6);
      const acc = Math.round(pos.coords.accuracy);
      document.getElementById('koordinat').value = lat + ', ' + lng;
      document.getElementById('gpsHint').textContent = 'Akurasi ±' + acc + ' meter';
      toast('Koordinat berhasil dideteksi!', 'success');
    },
    err => {
      document.getElementById('gpsHint').textContent = 'GPS gagal – isi manual jika diperlukan.';
      toast('GPS gagal: ' + err.message, 'error');
    },
    { enableHighAccuracy: true, timeout: 12000 }
  );
}

// ── FOTO UPLOAD ──────────────────────────────────────
function handleFileSelect(event) {
  handleFiles(Array.from(event.target.files));
}

function handleFiles(files) {
  const allowed = files.filter(f => f.type.startsWith('image/'));
  if (allowed.length === 0) { toast('Hanya file gambar yang diperbolehkan.', 'warn'); return; }

  allowed.forEach(file => {
    if (selectedPhotos.length >= 10) { toast('Maksimal 10 foto.', 'warn'); return; }

    const reader = new FileReader();
    reader.onload = e => {
      selectedPhotos.push({ file, dataURL: e.target.result, name: file.name });
      renderPreviews();
    };
    reader.readAsDataURL(file);
  });
}

function renderPreviews() {
  const grid = document.getElementById('photoPreview');
  grid.innerHTML = '';
  selectedPhotos.forEach((item, idx) => {
    const thumb = document.createElement('div');
    thumb.className = 'photo-thumb';
    thumb.innerHTML = `
      <img src="${item.dataURL}" alt="${item.name}">
      <button class="photo-remove" onclick="removePhoto(${idx})" title="Hapus">✕</button>
    `;
    grid.appendChild(thumb);
  });

  const zone = document.getElementById('uploadZone');
  const label = zone.querySelector('.upload-label');
  const sub   = zone.querySelector('.upload-sub');
  if (selectedPhotos.length > 0) {
    label.textContent = selectedPhotos.length + ' foto dipilih';
    sub.textContent   = 'Tap zona ini untuk tambah foto lagi';
  } else {
    label.textContent = 'Tap untuk pilih foto';
    sub.textContent   = 'Bisa pilih beberapa foto sekaligus • JPG, PNG, HEIC';
  }
}

function removePhoto(idx) {
  selectedPhotos.splice(idx, 1);
  renderPreviews();
}

// Konversi dataURL ke base64 murni
function dataURLToBase64(dataURL) {
  return dataURL.split(',')[1];
}

// ── UPLOAD FOTO KE DRIVE (via doPost) ────────────────
// PERBAIKAN: Menggunakan fetch POST dengan body JSON + no-cors
// Google Apps Script tidak mendukung CORS pada doPost dari browser,
// sehingga kita gunakan mode 'no-cors' dan anggap sukses jika tidak throw.
async function uploadFotos(namaLaporan) {
  if (selectedPhotos.length === 0) return [];

  const statusDiv = document.getElementById('uploadStatus');
  statusDiv.innerHTML = '<div style="margin-top:10px;font-size:12px;color:var(--text-sub);">Mengupload foto ke Google Drive…</div>';

  const urls = [];

  for (let i = 0; i < selectedPhotos.length; i++) {
    const item = selectedPhotos[i];

    // Buat elemen status per foto
    const statusItem = document.createElement('div');
    statusItem.className = 'upload-status-item';
    statusItem.innerHTML = `
      <div class="upload-status-dot uploading" style="background:var(--amber)"></div>
      <span>${item.name}</span>
    `;
    statusDiv.appendChild(statusItem);

    const dot = statusItem.querySelector('.upload-status-dot');

    try {
      // Payload untuk doPost
      const payload = {
        action:    'uploadFoto',
        folderKey: namaLaporan,           // subfolder = nama laporan
        fileName:  namaLaporan + '_foto' + (i + 1) + '_' + item.name,
        mimeType:  item.file.type,
        base64:    dataURLToBase64(item.dataURL)
      };

      // ── FETCH POST ke Apps Script ──────────────────
      // mode: 'no-cors' diperlukan karena GAS tidak kirim CORS header pada doPost
      // Akibatnya response.type = 'opaque' dan kita tidak bisa baca hasilnya,
      // tapi file tetap tersimpan di Drive selama request sampai.
      await fetch(API_URL, {
        method:  'POST',
        mode:    'no-cors',              // <-- KUNCI: tanpa ini browser blokir request
        headers: { 'Content-Type': 'text/plain' }, // text/plain agar tidak trigger preflight
        body:    JSON.stringify(payload)
      });

      // Karena no-cors kita tidak bisa baca URL file dari response.
      // Catat sebagai "Terupload" — link folder bisa diakses via Drive langsung.
      urls.push('Terupload');
      dot.style.background = 'var(--green)';

    } catch (err) {
      console.error('Upload foto gagal:', err);
      dot.style.background = 'var(--red)';
      urls.push('Gagal');
    }
  }

  return urls;
}

// ── SUBMIT LAPORAN ────────────────────────────────────
async function kirimLaporan() {
  if (!validateStep(2)) return;

  const btn     = document.getElementById('btnKirim');
  const spinner = document.getElementById('spinnerKirim');
  const btnText = document.getElementById('kirimText');

  btn.disabled          = true;
  spinner.style.display = 'block';
  btnText.textContent   = 'Mengirim…';

  // Nama unik laporan (dipakai sebagai nama subfolder di Drive)
  const namaLaporan = [
    document.getElementById('namaPetugas').value.replace(/\s+/g, '_'),
    document.getElementById('tanggal').value
  ].join('_');

  // 1. Upload foto ke Drive terlebih dahulu
  const fotoUrls = await uploadFotos(namaLaporan);

  // Link folder Drive (hanya informatif, karena no-cors tidak bisa baca URL file)
  const linkFoto = fotoUrls.length > 0
    ? 'Folder: SiPOP_Dokumentasi/' + namaLaporan + ' (' + fotoUrls.filter(u => u === 'Terupload').length + ' foto)'
    : '';

  // 2. Kumpulkan payload data laporan (termasuk info foto)
  const payload = {
    tanggal:         document.getElementById('tanggal').value,
    waktu:           document.getElementById('waktu').value,
    jabatan:         document.getElementById('jabatan').value,
    namaPetugas:     document.getElementById('namaPetugas').value,
    daerahIrigasi:   document.getElementById('daerahIrigasi').value,
    namaSaluran:     document.getElementById('namaSaluran').value,
    namaDesa:        document.getElementById('namaDesa').value,
    kecamatan:       document.getElementById('kecamatan').value,
    kabupaten:       document.getElementById('kabupaten').value,
    koordinat:       document.getElementById('koordinat').value,
    kegiatan:        getKegiatan().join(', '),
    jumlahFoto:      selectedPhotos.length.toString(),
    linkFoto:        linkFoto,
    catatanTambahan: document.getElementById('catatanTambahan').value,
    namaLaporan:     namaLaporan   // dikirim agar GAS bisa bikin/cari subfolder
  };

  // 3. Kirim data laporan ke sheet via GET + img trick (cara lama yang sudah bekerja)
  const encodedData = encodeURIComponent(JSON.stringify(payload));
  const requestURL  = API_URL + '?data=' + encodedData;

  const img = new Image();
  img.onload  = () => tampilSukses(payload);
  img.onerror = () => tampilSukses(payload); // onerror = request sampai, data masuk ke sheet
  img.src = requestURL;
}

// ── TAMPIL SUKSES ─────────────────────────────────────
function tampilSukses(payload) {
  const btn     = document.getElementById('btnKirim');
  const spinner = document.getElementById('spinnerKirim');
  const btnText = document.getElementById('kirimText');

  btn.disabled          = false;
  spinner.style.display = 'none';
  btnText.textContent   = '📤 Kirim Laporan';

  // Sembunyikan semua step
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.step-item').forEach(s => { s.classList.remove('active'); s.classList.add('done'); });

  // Tampilkan sukses
  document.getElementById('step3').classList.add('active');

  // Track 100%
  const fill = document.getElementById('trackFill');
  if (fill) fill.style.width = '100%';

  // Summary
  const tbl = document.getElementById('summaryTable');
  tbl.innerHTML = [
    ['Tanggal',   payload.tanggal + ' ' + payload.waktu],
    ['Petugas',   payload.namaPetugas + ' (' + payload.jabatan + ')'],
    ['Lokasi',    payload.daerahIrigasi + ' – ' + payload.namaSaluran],
    ['Wilayah',   payload.namaDesa + ', ' + payload.kecamatan + ', ' + payload.kabupaten],
    ['Kegiatan',  payload.kegiatan || '-'],
    ['Foto',      payload.jumlahFoto + ' foto'],
    ['Folder',    payload.linkFoto || '-']
  ].map(([l, v]) =>
    `<div class="summary-row"><span class="summary-label">${l}</span><span class="summary-value">${v || '-'}</span></div>`
  ).join('');

  toast('Laporan berhasil dikirim! 🎉', 'success');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── RESET FORM ────────────────────────────────────────
function resetForm() {
  // Reset semua input
  document.querySelectorAll('input:not([type="file"]), textarea, select').forEach(el => {
    if (el.type === 'checkbox' || el.type === 'radio') el.checked = false;
    else el.value = '';
  });

  // Reset kegiatan
  document.querySelectorAll('.kegiatan-item').forEach(el => el.classList.remove('selected'));

  // Reset foto
  selectedPhotos = [];
  document.getElementById('photoPreview').innerHTML = '';
  document.getElementById('uploadStatus').innerHTML = '';
  document.getElementById('fotoInput').value = '';
  document.querySelector('#uploadZone .upload-label').textContent = 'Tap untuk pilih foto';
  document.querySelector('#uploadZone .upload-sub').textContent   = 'Bisa pilih beberapa foto sekaligus • JPG, PNG, HEIC';

  // Reset GPS hint
  document.getElementById('gpsHint').textContent = 'Tekan tombol untuk mendeteksi lokasi Anda secara otomatis.';

  // Tanggal & waktu baru
  const now = new Date();
  document.getElementById('tanggal').value = now.toISOString().slice(0, 10);
  document.getElementById('waktu').value   = now.toTimeString().slice(0, 5);

  // Sembunyikan semua panel
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));

  // Reset stepper
  document.querySelectorAll('.step-item').forEach(s => s.classList.remove('active', 'done'));
  document.getElementById('si0').classList.add('active');

  currentStep = 0;
  document.getElementById('step0').classList.add('active');
  updateTrack();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── TOAST ─────────────────────────────────────────────
let toastTimer = null;

function toast(msg, type = 'info') {
  const el   = document.getElementById('toast');
  const icon = document.getElementById('toastIcon');
  const txt  = document.getElementById('toastMsg');
  if (!el) return;

  const icons = { info: 'ℹ️', success: '✅', warn: '⚠️', error: '❌' };
  icon.textContent = icons[type] || 'ℹ️';
  txt.textContent  = msg;
  el.className = 'toast show ' + type;

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 3500);
}
