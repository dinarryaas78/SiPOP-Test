// ════════════════════════════════════════════════
// SiPOP – Frontend Logic
// Mode SEMI-OFFLINE:
//  - App shell (HTML/JS) di-cache oleh sw.js sehingga bisa dibuka tanpa internet.
//  - Jika laporan dikirim saat offline / gagal terkirim, disimpan sementara
//    di IndexedDB perangkat, lalu otomatis disinkronkan saat koneksi kembali.
// ════════════════════════════════════════════════

// GANTI dengan URL hasil Deploy Apps Script Anda
var API_URL = 'https://script.google.com/macros/s/AKfycby1Y8VpCMtz7azAYucMtBAt2sHqAx0QqG90TM65Ff_z7iW6qszzfi9k0vIAeNUEgOP9/exec';

// ════════════════════════════════════════════════
// INISIALISASI
// ════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', function() {
  var now = new Date();
  document.getElementById('tanggal').value = now.toISOString().slice(0, 10);
  document.getElementById('waktu').value   = now.toTimeString().slice(0, 5);

  updateConnectionStatus();
  updatePendingBanner();
});

// ════════════════════════════════════════════════
// STATUS KONEKSI (ONLINE / OFFLINE)
// ════════════════════════════════════════════════

function updateConnectionStatus() {
  var dot  = document.getElementById('statusDot');
  var text = document.getElementById('statusText');

  if (navigator.onLine) {
    if (dot)  dot.classList.add('on');
    if (text) text.textContent = 'Online';
    // Setiap kali online, coba sinkronkan laporan yang masih tertunda
    syncPendingReports();
  } else {
    if (dot)  dot.classList.remove('on');
    if (text) text.textContent = 'Offline – Mode Lokal';
    showToast('Anda sedang offline. Laporan akan disimpan di perangkat.', 'warn');
  }
}

window.addEventListener('online', updateConnectionStatus);
window.addEventListener('offline', updateConnectionStatus);

// ════════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════════

var currentStep = 0;
var TOTAL_STEPS = 3; // step 0,1,2 = form aktif; step 3 = sukses
var fotoList = [];   // { base64, mimeType, filename, previewUrl }
var MAX_FOTO = 5;
var sedangSinkron = false; // guard agar sinkronisasi tidak dobel jalan

// ════════════════════════════════════════════════
// PENYIMPANAN OFFLINE (IndexedDB)
// Menyimpan laporan yang gagal/tidak bisa dikirim saat offline,
// termasuk foto (base64), untuk dikirim ulang otomatis nanti.
// ════════════════════════════════════════════════

var DB_NAME       = 'sipopOfflineDB';
var DB_VERSION    = 1;
var STORE_LAPORAN = 'pendingReports';

function bukaDB() {
  return new Promise(function(resolve, reject) {
    if (!window.indexedDB) {
      reject(new Error('IndexedDB tidak didukung perangkat ini.'));
      return;
    }
    var req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = function(e) {
      var db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_LAPORAN)) {
        db.createObjectStore(STORE_LAPORAN, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = function(e) { resolve(e.target.result); };
    req.onerror   = function(e) { reject(e.target.error); };
  });
}

function simpanLaporanOffline(payload) {
  return bukaDB().then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx    = db.transaction(STORE_LAPORAN, 'readwrite');
      var store = tx.objectStore(STORE_LAPORAN);
      var req   = store.add({ payload: payload, savedAt: new Date().toISOString() });
      req.onsuccess = function() { resolve(req.result); };
      req.onerror   = function(e) { reject(e.target.error); };
    });
  });
}

function ambilLaporanOffline() {
  return bukaDB().then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx    = db.transaction(STORE_LAPORAN, 'readonly');
      var store = tx.objectStore(STORE_LAPORAN);
      var req   = store.getAll();
      req.onsuccess = function() { resolve(req.result || []); };
      req.onerror   = function(e) { reject(e.target.error); };
    });
  });
}

function hapusLaporanOffline(id) {
  return bukaDB().then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx    = db.transaction(STORE_LAPORAN, 'readwrite');
      var store = tx.objectStore(STORE_LAPORAN);
      var req   = store.delete(id);
      req.onsuccess = function() { resolve(); };
      req.onerror   = function(e) { reject(e.target.error); };
    });
  });
}

function updatePendingBanner() {
  ambilLaporanOffline().then(function(items) {
    var banner  = document.getElementById('pendingBanner');
    var countEl = document.getElementById('pendingCount');
    if (!banner) return;
    if (items.length > 0) {
      banner.style.display = 'flex';
      if (countEl) countEl.textContent = items.length;
    } else {
      banner.style.display = 'none';
    }
  }).catch(function() {
    // IndexedDB tidak tersedia — sembunyikan banner saja, fitur offline nonaktif
    var banner = document.getElementById('pendingBanner');
    if (banner) banner.style.display = 'none';
  });
}

// Kirim satu payload ke Apps Script (mode no-cors: resolve jika request
// terkirim ke jaringan, reject jika benar-benar tidak ada koneksi)
function kirimKeServer(payload) {
  return fetch(API_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(payload)
  });
}

// Coba kirim semua laporan yang tertunda di IndexedDB, satu per satu
function syncPendingReports() {
  if (sedangSinkron || !navigator.onLine) return;

  ambilLaporanOffline().then(function(items) {
    if (items.length === 0) { updatePendingBanner(); return; }

    sedangSinkron = true;
    var btnSync = document.getElementById('btnSync');
    if (btnSync) { btnSync.disabled = true; btnSync.textContent = '🔄 Menyinkronkan…'; }

    var berhasil = 0, gagal = 0;
    var rantai = Promise.resolve();

    items.forEach(function(item) {
      rantai = rantai.then(function() {
        return kirimKeServer(item.payload)
          .then(function() { return hapusLaporanOffline(item.id); })
          .then(function() { berhasil++; })
          .catch(function(err) {
            gagal++;
            console.warn('Sinkronisasi gagal untuk laporan #' + item.id, err);
          });
      });
    });

    rantai.then(function() {
      sedangSinkron = false;
      if (btnSync) { btnSync.disabled = false; btnSync.textContent = '🔄 Sinkronkan Sekarang'; }
      updatePendingBanner();
      if (berhasil > 0) {
        showToast(berhasil + ' laporan tersimpan berhasil disinkronkan.', 'success');
      }
      if (gagal > 0) {
        showToast(gagal + ' laporan masih gagal disinkronkan, akan dicoba lagi.', 'warn');
      }
    });
  });
}

// ════════════════════════════════════════════════
// NAVIGASI STEP
// ════════════════════════════════════════════════

function goStep(target) {
  if (target > currentStep && !validateStep(currentStep)) return;

  var prevPage = document.getElementById('page' + currentStep);
  var prevDot  = document.getElementById('si'   + currentStep);
  if (prevPage) prevPage.classList.remove('active');
  if (prevDot)  prevDot.classList.remove('active');
  if (prevDot && target > currentStep) prevDot.classList.add('done');

  currentStep = target;

  var nextPage = document.getElementById('page' + currentStep);
  var nextDot  = document.getElementById('si'   + currentStep);
  if (nextPage) nextPage.classList.add('active');
  if (nextDot)  { nextDot.classList.remove('done'); nextDot.classList.add('active'); }

  updateProgress();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateProgress() {
  var fill = document.getElementById('trackFill');
  if (!fill) return;
  var stepForPct = Math.min(currentStep, TOTAL_STEPS - 1);
  var pct = stepForPct === 0 ? 0 : (stepForPct / (TOTAL_STEPS - 1)) * 100;
  fill.style.width = pct + '%';
}

// ════════════════════════════════════════════════
// VALIDASI PER STEP
// ════════════════════════════════════════════════

function validateStep(step) {
  if (step === 0) {
    if (!val('jabatan'))     { showToast('Pilih jabatan terlebih dahulu.', 'warn'); return false; }
    if (!val('namaPetugas')) { showToast('Nama petugas wajib diisi.',      'warn'); return false; }
    if (!val('tanggal'))     { showToast('Tanggal wajib diisi.',           'warn'); return false; }
    if (!val('waktu'))       { showToast('Waktu wajib diisi.',             'warn'); return false; }
  }
  if (step === 1) {
    if (!val('namaDI'))      { showToast('Nama daerah irigasi wajib diisi.', 'warn'); return false; }
    if (!val('namaSaluran')) { showToast('Nama saluran wajib diisi.',        'warn'); return false; }
  }
  if (step === 2) {
    var kegiatan = getCheckedKegiatan();
    if (kegiatan.length === 0) { showToast('Pilih minimal satu kegiatan.', 'warn'); return false; }
  }
  return true;
}

function val(id) {
  var el = document.getElementById(id);
  return el && el.value.trim() !== '';
}

// ════════════════════════════════════════════════
// CHECKBOX KEGIATAN
// ════════════════════════════════════════════════

function toggleCheck(labelEl) {
  if (!labelEl) return;
  var input = labelEl.querySelector('input[type="checkbox"]');
  setTimeout(function() {
    if (input && input.checked) {
      labelEl.classList.add('selected');
    } else {
      labelEl.classList.remove('selected');
    }
  }, 0);
}

function getCheckedKegiatan() {
  var results = [];
  document.querySelectorAll('#kegiatanList input[type="checkbox"]:checked').forEach(function(cb) {
    results.push(cb.value);
  });
  return results;
}

// ════════════════════════════════════════════════
// GPS
// ════════════════════════════════════════════════

function getGPS() {
  if (!navigator.geolocation) {
    showToast('Perangkat tidak mendukung GPS.', 'error');
    return;
  }
  showToast('Mendeteksi lokasi...', 'info');
  navigator.geolocation.getCurrentPosition(
    function(pos) {
      var lat = pos.coords.latitude.toFixed(6);
      var lng = pos.coords.longitude.toFixed(6);
      var acc = Math.round(pos.coords.accuracy);
      document.getElementById('koordinat').value = lat + ', ' + lng;
      showToast('GPS berhasil (akurasi +/-' + acc + 'm)', 'success');
    },
    function(err) {
      showToast('Gagal mendapatkan GPS: ' + err.message, 'error');
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

// ════════════════════════════════════════════════
// UPLOAD FOTO — konversi ke base64, preview lokal
// ════════════════════════════════════════════════

function handleFiles(fileListRaw) {
  var files = Array.prototype.slice.call(fileListRaw);

  if (fotoList.length + files.length > MAX_FOTO) {
    showToast('Maksimal ' + MAX_FOTO + ' foto per laporan.', 'warn');
    files = files.slice(0, MAX_FOTO - fotoList.length);
  }

  files.forEach(function(file) {
    if (!file.type.startsWith('image/')) {
      showToast('File "' + file.name + '" bukan gambar, dilewati.', 'warn');
      return;
    }

    // Kompres dulu sebelum jadi base64 agar payload tidak terlalu besar
    kompresGambar(file, function(base64Compressed) {
      var item = {
        base64: base64Compressed,
        mimeType: 'image/jpeg',
        filename: file.name.replace(/\.[^/.]+$/, '') + '.jpg',
        previewUrl: base64Compressed
      };
      fotoList.push(item);
      renderPhotoGrid();
    });
  });

  // Reset input supaya bisa pilih file sama lagi jika perlu
  document.getElementById('fotoInput').value = '';
}

// Kompres gambar via canvas agar ukuran base64 wajar (max ~1200px, quality 0.7)
function kompresGambar(file, callback) {
  var reader = new FileReader();
  reader.onload = function(e) {
    var img = new Image();
    img.onload = function() {
      var maxDim = 1200;
      var w = img.width, h = img.height;
      if (w > h && w > maxDim) { h = h * (maxDim / w); w = maxDim; }
      else if (h > maxDim) { w = w * (maxDim / h); h = maxDim; }

      var canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);

      var dataUrl = canvas.toDataURL('image/jpeg', 0.7);
      callback(dataUrl);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function renderPhotoGrid() {
  var grid = document.getElementById('photoGrid');
  var status = document.getElementById('uploadStatus');
  if (!grid) return;

  grid.innerHTML = '';
  fotoList.forEach(function(item, idx) {
    var thumb = document.createElement('div');
    thumb.className = 'photo-thumb';
    thumb.innerHTML =
      '<img src="' + item.previewUrl + '" alt="foto ' + (idx + 1) + '">' +
      '<button class="remove-btn" onclick="hapusFoto(' + idx + ')">✕</button>';
    grid.appendChild(thumb);
  });

  if (status) {
    status.textContent = fotoList.length > 0
      ? fotoList.length + ' foto siap dikirim (maks ' + MAX_FOTO + ').'
      : '';
  }
}

function hapusFoto(idx) {
  fotoList.splice(idx, 1);
  renderPhotoGrid();
}

// Drag & drop support
document.addEventListener('DOMContentLoaded', function() {
  var zone = document.getElementById('uploadZone');
  if (!zone) return;

  zone.addEventListener('dragover', function(e) {
    e.preventDefault();
    zone.classList.add('dragover');
  });
  zone.addEventListener('dragleave', function() {
    zone.classList.remove('dragover');
  });
  zone.addEventListener('drop', function(e) {
    e.preventDefault();
    zone.classList.remove('dragover');
    handleFiles(e.dataTransfer.files);
  });
});

// ════════════════════════════════════════════════
// SUBMIT — kirim data + foto (base64) ke Apps Script
// ════════════════════════════════════════════════

function submitForm() {
  if (!validateStep(2)) return;

  var btnSubmit  = document.getElementById('btnSubmit');
  var spinner    = document.getElementById('submitSpinner');
  var submitText = document.getElementById('submitText');
  var uploadProgress = document.getElementById('uploadProgress');
  var progressFill   = document.getElementById('progressFill');
  var uploadLabel     = document.getElementById('uploadLabel');
  var uploadPct        = document.getElementById('uploadPct');

  if (btnSubmit)  btnSubmit.disabled     = true;
  if (spinner)    spinner.style.display  = 'inline-block';
  if (submitText) submitText.textContent = 'Mengirim...';
  if (uploadProgress && fotoList.length > 0) uploadProgress.style.display = 'block';

  var payload = {
    tanggal:          document.getElementById('tanggal').value,
    waktu:            document.getElementById('waktu').value,
    jabatan:          document.getElementById('jabatan').value,
    namaPetugas:      document.getElementById('namaPetugas').value,
    namaDI:           document.getElementById('namaDI').value,
    namaSaluran:      document.getElementById('namaSaluran').value,
    namaDesa:         document.getElementById('namaDesa').value,
    kecamatan:        document.getElementById('kecamatan').value,
    kabupaten:        document.getElementById('kabupaten').value,
    koordinat:        document.getElementById('koordinat').value,
    kegiatan:         getCheckedKegiatan().join(', '),
    catatanTambahan:  document.getElementById('catatanTambahan').value,
    foto: fotoList.map(function(f) {
      return { base64: f.base64, mimeType: f.mimeType, filename: f.filename };
    })
  };

  // Simulasi progress bar (karena fetch no-cors tidak punya progress event)
  var simPct = 0;
  var simInterval = null;
  if (fotoList.length > 0) {
    simInterval = setInterval(function() {
      simPct = Math.min(simPct + 8, 92);
      if (progressFill) progressFill.style.width = simPct + '%';
      if (uploadPct) uploadPct.textContent = simPct + '%';
    }, 200);
  }

  function selesaiProgress() {
    if (simInterval) clearInterval(simInterval);
    if (progressFill) progressFill.style.width = '100%';
    if (uploadPct) uploadPct.textContent = '100%';
  }

  function simpanKeAntrianOffline(alasan) {
    simpanLaporanOffline(payload).then(function() {
      selesaiProgress();
      updatePendingBanner();
      setTimeout(function() { tampilkanSuksesOffline(payload); }, 300);
    }).catch(function(err) {
      if (simInterval) clearInterval(simInterval);
      showToast('Gagal menyimpan laporan di perangkat: ' + err.message, 'error');
      if (btnSubmit)  btnSubmit.disabled     = false;
      if (spinner)    spinner.style.display  = 'none';
      if (submitText) submitText.textContent = '📤 Kirim Laporan';
      if (uploadProgress) uploadProgress.style.display = 'none';
    });
  }

  // Tidak ada koneksi: langsung simpan lokal, jangan coba fetch
  if (!navigator.onLine) {
    simpanKeAntrianOffline('offline');
    return;
  }

  // Ada koneksi: coba kirim langsung ke server
  kirimKeServer(payload)
  .then(function() {
    selesaiProgress();
    setTimeout(function() { tampilkanSukses(payload); }, 300);
  })
  .catch(function(err) {
    // Gagal terkirim meski status "online" (mis. sinyal putus-putus) —
    // simpan sebagai laporan tertunda alih-alih menampilkan error saja
    simpanKeAntrianOffline('gagal-kirim');
  });
}

function tampilkanSukses(payload) {
  var btnSubmit  = document.getElementById('btnSubmit');
  var spinner    = document.getElementById('submitSpinner');
  var submitText = document.getElementById('submitText');

  if (btnSubmit)  btnSubmit.disabled     = false;
  if (spinner)    spinner.style.display  = 'none';
  if (submitText) submitText.textContent = '📤 Kirim Laporan';

  var prevPage = document.getElementById('page' + currentStep);
  var prevDot  = document.getElementById('si'   + currentStep);
  if (prevPage) prevPage.classList.remove('active');
  if (prevDot)  { prevDot.classList.remove('active'); prevDot.classList.add('done'); }

  currentStep = 3;
  var successPage = document.getElementById('page3');
  if (successPage) successPage.classList.add('active');

  updateProgress();
  var fill = document.getElementById('trackFill');
  if (fill) fill.style.width = '100%';

  showSummary(payload);
  showToast('Laporan berhasil dikirim!', 'success');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ════════════════════════════════════════════════
// TAMPILAN SUKSES — TERSIMPAN OFFLINE (BELUM TERKIRIM)
// ════════════════════════════════════════════════

function tampilkanSuksesOffline(payload) {
  var btnSubmit  = document.getElementById('btnSubmit');
  var spinner    = document.getElementById('submitSpinner');
  var submitText = document.getElementById('submitText');

  if (btnSubmit)  btnSubmit.disabled     = false;
  if (spinner)    spinner.style.display  = 'none';
  if (submitText) submitText.textContent = '📤 Kirim Laporan';

  var prevPage = document.getElementById('page' + currentStep);
  var prevDot  = document.getElementById('si'   + currentStep);
  if (prevPage) prevPage.classList.remove('active');
  if (prevDot)  { prevDot.classList.remove('active'); prevDot.classList.add('done'); }

  currentStep = 3;
  var successPage = document.getElementById('page3');
  if (successPage) successPage.classList.add('active');

  updateProgress();
  var fill = document.getElementById('trackFill');
  if (fill) fill.style.width = '100%';

  showSummary(payload, true);
  showToast('Tidak ada koneksi — laporan disimpan di perangkat & akan terkirim otomatis nanti.', 'warn');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ════════════════════════════════════════════════
// RINGKASAN SUKSES
// ════════════════════════════════════════════════

function showSummary(data, tersimpanOffline) {
  var box = document.getElementById('summaryBox');
  if (!box) return;
  var statusRow = tersimpanOffline
    ? sumRow('Status', '⏳ Tersimpan di perangkat, menunggu koneksi untuk dikirim')
    : sumRow('Status', '✅ Terkirim ke server');
  box.innerHTML =
    '<table>' +
    statusRow +
    sumRow('Tanggal', data.tanggal + ' ' + data.waktu) +
    sumRow('Petugas', data.namaPetugas + ' (' + data.jabatan + ')') +
    sumRow('Lokasi', data.namaDI + ' – ' + data.namaSaluran) +
    sumRow('Wilayah', [data.namaDesa, data.kecamatan, data.kabupaten].filter(Boolean).join(', ') || '-') +
    sumRow('Kegiatan', data.kegiatan || '-') +
    sumRow('Foto', (data.foto ? data.foto.length : 0) + ' foto terlampir') +
    '</table>';
}

function sumRow(label, value) {
  return '<tr><td>' + label + '</td><td>' + (value || '-') + '</td></tr>';
}

// ════════════════════════════════════════════════
// RESET
// ════════════════════════════════════════════════

function resetForm() {
  document.querySelectorAll('input, textarea, select').forEach(function(el) {
    if (el.type === 'checkbox' || el.type === 'radio') {
      el.checked = false;
    } else if (el.type !== 'file') {
      el.value = '';
    }
  });

  document.querySelectorAll('.check-item').forEach(function(el) {
    el.classList.remove('selected');
  });

  fotoList = [];
  renderPhotoGrid();
  var uploadProgress = document.getElementById('uploadProgress');
  if (uploadProgress) uploadProgress.style.display = 'none';

  var now = new Date();
  document.getElementById('tanggal').value = now.toISOString().slice(0, 10);
  document.getElementById('waktu').value   = now.toTimeString().slice(0, 5);

  var activePage = document.getElementById('page' + currentStep);
  if (activePage) activePage.classList.remove('active');

  currentStep = 0;
  var page0 = document.getElementById('page0');
  if (page0) page0.classList.add('active');

  document.querySelectorAll('.step-item').forEach(function(s) {
    s.classList.remove('active', 'done');
  });
  var si0 = document.getElementById('si0');
  if (si0) si0.classList.add('active');

  updateProgress();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ════════════════════════════════════════════════
// TOAST
// ════════════════════════════════════════════════

var toastTimer = null;

function showToast(msg, type) {
  type = type || 'info';
  var toast     = document.getElementById('toast');
  var toastMsg  = document.getElementById('toastMsg');
  var toastIcon = document.getElementById('toastIcon');
  if (!toast) return;

  var icons = { info: 'ℹ️', success: '✅', warn: '⚠️', error: '❌' };
  if (toastIcon) toastIcon.textContent = icons[type] || 'ℹ️';
  if (toastMsg)  toastMsg.textContent  = msg;

  toast.className = 'toast show ' + type;

  clearTimeout(toastTimer);
  toastTimer = setTimeout(function() {
    toast.className = 'toast';
  }, 3500);
}
