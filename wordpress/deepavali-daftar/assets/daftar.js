(function () {
  'use strict';
  var C = window.DVD || {};
  var app = document.getElementById('dd-app');
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function api(base, path, method, body) {
    var h = { 'X-DVD': '1', 'X-DVB': '1' };
    if (C.nonce) h['X-WP-Nonce'] = C.nonce;
    if (body) h['Content-Type'] = 'application/json';
    return fetch(base + path, { method: method || 'GET', credentials: 'same-origin', headers: h, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.message || ('Ralat ' + r.status)); e.code = j.code; e.status = r.status; throw e; } return j; }); });
  }
  var HERO = '<div class="hero"><div class="k">Grand Deepavali</div><h1>Pendaftaran Orang Ramai</h1><p>Anjuran Penyelaras Parlimen Ampang &amp; ADUN Lembah Jaya · 14 November 2026</p></div>';

  /* ---------------- public form ---------------- */
  function icFmt(v) {
    var d = v.replace(/\D/g, '').slice(0, 12);
    if (d.length > 8) return d.slice(0, 6) + '-' + d.slice(6, 8) + '-' + d.slice(8);
    if (d.length > 6) return d.slice(0, 6) + '-' + d.slice(6);
    return d;
  }
  function form() {
    if (!C.open) {
      app.innerHTML = '<div class="wrap">' + HERO + '<div class="card done"><h2>Pendaftaran ditutup</h2><p>Terima kasih atas sokongan anda.</p></div></div>';
      return;
    }
    app.innerHTML = '<div class="wrap">' + HERO +
      '<form class="card" id="f" novalidate autocomplete="on">' +
      '<div class="f" data-k="name"><label for="name">Nama penuh</label><input id="name" name="name" autocomplete="name" autocapitalize="words" maxlength="160" required><div class="msg hidden"></div></div>' +
      '<div class="f" data-k="ic"><label for="ic">No Kad Pengenalan</label><input id="ic" name="ic" inputmode="numeric" placeholder="800101-14-5678" maxlength="20" required><div class="hint">12 digit seperti dalam MyKad.</div><div class="msg hidden"></div></div>' +
      '<div class="f" data-k="phone"><label for="phone">No telefon bimbit</label><input id="phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="012-345 6789" maxlength="20" required><div class="msg hidden"></div></div>' +
      '<div class="f" data-k="bantuan"><label for="bantuan">Bantuan yang diharapkan <span class="opt">(pilihan)</span></label><textarea id="bantuan" name="bantuan" maxlength="1000" placeholder="Contoh: bantuan persekolahan anak, bantuan makanan, kerja…"></textarea><div class="msg hidden"></div></div>' +
      '<div class="hp" aria-hidden="true"><input name="website" tabindex="-1" autocomplete="off"></div>' +
      '<label class="consent" id="cl"><input type="checkbox" id="consent"><span>Saya bersetuju maklumat peribadi saya dikumpul dan digunakan oleh penganjur Grand Deepavali Parlimen Ampang untuk tujuan program dan bantuan sahaja, mengikut Akta Perlindungan Data Peribadi 2010 (PDPA). Maklumat ini tidak akan dikongsi dengan pihak lain.</span></label>' +
      '<div id="err" class="alert hidden"></div>' +
      '<button class="btn pri big" id="go" type="submit">Hantar</button>' +
      '</form><div class="foot">Maklumat anda disimpan dengan selamat dan hanya dilihat oleh penganjur.</div></div>';
    var f = document.getElementById('f');
    var ic = document.getElementById('ic');
    ic.addEventListener('input', function () {
      if (/^[\d-\s]*$/.test(ic.value)) ic.value = icFmt(ic.value);
    });
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = { name: f.name.value.trim(), ic: ic.value.trim(), phone: f.phone.value.trim(), bantuan: f.bantuan.value.trim(), consent: document.getElementById('consent').checked, website: f.website.value };
      var errs = {};
      if (v.name.length < 2) errs.name = 'Sila isi nama penuh.';
      var icd = v.ic.replace(/[^0-9A-Za-z]/g, '');
      if (!/^\d{12}$/.test(icd) && !(/[A-Za-z]/.test(icd) && icd.length >= 6)) errs.ic = 'No KP mesti 12 digit. Contoh: 800101-14-5678.';
      var pd = v.phone.replace(/\D/g, '');
      if (pd.length < 9 || pd.length > 15) errs.phone = 'Sila isi no telefon bimbit yang betul.';
      f.querySelectorAll('.f').forEach(function (el) {
        var m = errs[el.getAttribute('data-k')];
        el.classList.toggle('bad', !!m);
        var box = el.querySelector('.msg'); box.textContent = m || ''; box.classList.toggle('hidden', !m);
      });
      document.getElementById('cl').classList.toggle('bad', !v.consent);
      var err = document.getElementById('err');
      if (Object.keys(errs).length || !v.consent) {
        err.textContent = !v.consent && !Object.keys(errs).length ? 'Sila tandakan kotak persetujuan PDPA.' : 'Sila semak maklumat yang bertanda merah.';
        err.classList.remove('hidden');
        var first = f.querySelector('.f.bad input, .f.bad textarea'); if (first) first.focus();
        return;
      }
      err.classList.add('hidden');
      var b = document.getElementById('go'); b.disabled = true; b.textContent = 'Menghantar…';
      api(C.rest, 'daftar', 'POST', v).then(function (j) {
        done(j.dup);
      }).catch(function (x) {
        b.disabled = false; b.textContent = 'Hantar';
        err.textContent = x.status ? x.message : 'Tiada sambungan internet. Sila cuba lagi.';
        err.classList.remove('hidden');
      });
    });
  }
  function done(dup) {
    app.innerHTML = '<div class="wrap">' + HERO + '<div class="card done"><div class="tick">✓</div>' +
      (dup ? '<h2>Sudah berdaftar</h2><p>No Kad Pengenalan ini telah pun didaftarkan sebelum ini. Terima kasih!</p>'
           : '<h2>Terima kasih!</h2><p>Pendaftaran anda telah diterima.</p>') +
      '<p style="margin-top:10px">Selamat Menyambut Hari Deepavali 🪔</p>' +
      '<button class="btn big" id="again">Daftar orang lain</button></div></div>';
    document.getElementById('again').onclick = form;
    window.scrollTo(0, 0);
  }

  /* ---------------- admin list ---------------- */
  var S = { rows: [], open: true, q: '', who: '' };
  function fmtTime(iso) {
    try { return new Date(iso).toLocaleString('en-GB', { timeZone: C.tz, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }); } catch (e) { return iso; }
  }
  function icShow(ic) { return /^\d{12}$/.test(ic) ? ic.slice(0, 6) + '-' + ic.slice(6, 8) + '-' + ic.slice(8) : ic; }
  function login(msg) {
    app.innerHTML = '<div class="wrap" style="max-width:440px">' + HERO + '<form class="card" id="lf"><div class="f"><label for="code">Kod admin</label><input id="code" type="password" autocomplete="current-password"><div class="hint">Guna kod admin yang sama seperti di /bantuan/.</div></div>' +
      (msg ? '<div class="alert">' + esc(msg) + '</div>' : '') + '<button class="btn pri big">Masuk</button></form></div>';
    document.getElementById('lf').onsubmit = function (e) {
      e.preventDefault();
      api(C.dvbRest, 'login', 'POST', { code: document.getElementById('code').value }).then(function () { load(); })
        .catch(function (x) { login(x.message); });
    };
  }
  function load() {
    api(C.rest, 'senarai').then(function (j) { S.rows = j.rows; S.open = j.open; S.who = j.who; render(); })
      .catch(function (x) { if (x.status === 401) login(S.rows.length ? 'Sesi tamat. Sila masuk semula.' : (C.admin ? '' : 'Halaman ini untuk admin sahaja.')); else alertBox(x.message); });
  }
  function alertBox(m) { var a = document.getElementById('aerr'); if (a) { a.textContent = m; a.classList.remove('hidden'); } }
  function filtered() {
    var q = S.q.toLowerCase().replace(/-/g, '');
    if (!q) return S.rows;
    return S.rows.filter(function (r) { return (r.name + ' ' + r.ic + ' ' + r.phone + ' ' + (r.bantuan || '')).toLowerCase().indexOf(q) >= 0; });
  }
  function qrSvg() {
    if (!window.qrcode) return '';
    var q = window.qrcode(0, 'M'); q.addData(C.formUrl); q.make();
    return q.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
  }
  function render() {
    var rows = filtered();
    var withB = S.rows.filter(function (r) { return r.bantuan; }).length;
    var today = new Date().toLocaleDateString('en-CA', { timeZone: C.tz });
    var nToday = S.rows.filter(function (r) { return new Date(r.created_at).toLocaleDateString('en-CA', { timeZone: C.tz }) === today; }).length;
    var qr = qrSvg();
    var html = '<div class="wrap"><div class="hero"><div class="k">Admin sahaja' + (S.who ? ' · ' + esc(S.who) : '') + '</div><h1>Senarai Pendaftaran</h1><p>Grand Deepavali Parlimen Ampang</p></div>' +
      '<div class="stats"><div class="stat"><b class="mono">' + S.rows.length + '</b><span>Jumlah berdaftar</span></div><div class="stat"><b class="mono">' + nToday + '</b><span>Hari ini</span></div><div class="stat"><b class="mono">' + withB + '</b><span>Mohon bantuan</span></div>' +
      '<div class="stat"><span>Borang</span><div style="margin-top:6px"><span class="pill ' + (S.open ? 'on">Dibuka' : 'off">Ditutup') + '</span> <button class="btn sm" id="tog">' + (S.open ? 'Tutup' : 'Buka') + '</button></div></div></div>' +
      '<div class="card qrbox"><div class="qr">' + qr + '</div><div><b>QR untuk orang ramai</b><div class="mono" style="margin:4px 0 10px"><a href="' + esc(C.formUrl) + '" target="_blank" rel="noopener">' + esc(C.formUrl) + '</a></div><button class="btn pri sm" id="poster-btn">Cetak poster QR (A4)</button></div></div>' +
      '<div class="bar"><div class="grow"><input type="search" id="q" placeholder="Cari nama, No KP, telefon, bantuan" value="' + esc(S.q) + '"></div><button class="btn pri" id="xl">Muat turun Excel</button><button class="btn" id="rf">Muat semula</button></div>' +
      '<div id="aerr" class="alert hidden"></div>' +
      '<div class="card scroll"><table class="tbl"><thead><tr><th>#</th><th>Nama</th><th>No KP</th><th>Telefon</th><th>Bantuan yang diharapkan</th><th>Masa</th><th></th></tr></thead><tbody>' +
      (rows.length ? rows.map(function (r) {
        return '<tr><td class="mono">' + r.id + '</td><td>' + esc(r.name) + '</td><td class="mono">' + esc(icShow(r.ic)) + '</td><td class="mono"><a href="tel:' + esc(r.phone) + '">' + esc(r.phone) + '</a></td><td class="b">' + esc(r.bantuan || '') + '</td><td class="mono">' + esc(fmtTime(r.created_at)) + '</td><td><button class="btn sm danger" data-del="' + r.id + '">Padam</button></td></tr>';
      }).join('') : '<tr><td colspan="7" style="text-align:center;color:var(--text-3);padding:24px">' + (S.rows.length ? 'Tiada padanan.' : 'Belum ada pendaftaran.') + '</td></tr>') +
      '</tbody></table></div></div>';
    var poster = '<h1>GRAND DEEPAVALI</h1><div class="pk">Anjuran Penyelaras Parlimen Ampang<br>&amp; ADUN Lembah Jaya</div><p style="margin-top:8mm"><b>DAFTAR DI SINI</b><br>Imbas kod QR dengan telefon anda<br>Nama · No Kad Pengenalan · No Telefon</p><div class="pq">' + qr + '</div><div class="pu">' + esc(C.formUrl.replace(/^https?:\/\//, '')) + '</div><div class="ps">Maklumat dilindungi di bawah Akta Perlindungan Data Peribadi 2010</div>';
    app.innerHTML = html;
    var pe = document.getElementById('poster');
    if (!pe) { pe = document.createElement('div'); pe.id = 'poster'; document.body.appendChild(pe); }
    pe.innerHTML = poster;
    var q = document.getElementById('q');
    q.oninput = function () { S.q = q.value; var pos = q.selectionStart; render(); var n = document.getElementById('q'); n.focus(); n.setSelectionRange(pos, pos); };
    document.getElementById('xl').onclick = excel;
    document.getElementById('rf').onclick = load;
    document.getElementById('poster-btn').onclick = function () { window.print(); };
    document.getElementById('tog').onclick = function () {
      if (!confirmSafe(S.open ? 'Tutup borang? Orang ramai tidak boleh mendaftar lagi.' : 'Buka semula borang?')) return;
      api(C.rest, 'tetapan', 'POST', { open: !S.open }).then(function (j) { S.rows = j.rows; S.open = j.open; render(); }).catch(function (x) { alertBox(x.message); });
    };
    app.querySelectorAll('[data-del]').forEach(function (b) {
      b.onclick = function () {
        var id = +b.getAttribute('data-del');
        var r = S.rows.filter(function (x) { return x.id === id; })[0];
        if (!confirmSafe('Padam pendaftaran #' + id + (r ? ' (' + r.name + ')' : '') + '?')) return;
        api(C.rest, 'padam', 'POST', { id: id }).then(function (j) { S.rows = j.rows; render(); }).catch(function (x) { alertBox(x.message); });
      };
    });
  }
  function confirmSafe(m) { try { return window.confirm(m); } catch (e) { return true; } }
  function excel() {
    if (!window.XLSX) { alertBox('Excel belum sedia, cuba sekali lagi.'); return; }
    var rows = filtered().slice().reverse();
    var aoa = [['No', 'Nama', 'No Kad Pengenalan', 'No Telefon Bimbit', 'Bantuan yang diharapkan', 'Masa daftar']];
    rows.forEach(function (r) { aoa.push([r.id, r.name, icShow(r.ic), r.phone, r.bantuan || '', fmtTime(r.created_at)]); });
    var ws = window.XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 6 }, { wch: 32 }, { wch: 18 }, { wch: 16 }, { wch: 50 }, { wch: 16 }];
    var wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, 'Pendaftaran');
    window.XLSX.writeFile(wb, 'Pendaftaran_Grand_Deepavali_Ampang_' + new Date().toLocaleDateString('en-CA', { timeZone: C.tz }) + '.xlsx');
  }

  function start() {
    if (C.mode === 'admin') { if (C.admin) load(); else login(''); }
    else form();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
