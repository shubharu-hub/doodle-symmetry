/* Public QR forms. /bantuan/borang/: one person collecting their own. /bantuan/pic/: a PIC lists many recipients in one go.
   Both give a number to show at the bantuan counter. */
(function () {
  'use strict';
  const C = window.DVB_CONFIG || {};
  const PIC = C.mode === 'pic';
  const root = document.getElementById('bt-app');
  const KEY = 'dvb_form_ticket_' + (PIC ? 'pic' : 'self');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } },
    set(v) { try { v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY); } catch (e) { /* private mode */ } },
  };
  const fmtTime = (iso) => { try { return new Date(iso).toLocaleString('ms-MY', { timeZone: C.tz, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } };
  const blank = () => ({ ic: '', name: '' });
  const S = { rows: [blank(), blank(), blank()], self: false, listed: false, agree: false, busy: false, error: '', result: null, pic: { name: '', phone: '', ic: '' }, paste: false };
  const max = Math.max(1, C.max || 100);
  const icDigits = (v) => String(v || '').replace(/\D/g, '');
  const icBad = (v) => v && /^[\d\s-]+$/.test(v) && icDigits(v).length !== 12;

  const RES = {
    ok: ['pill--ok', 'Dijumpai'],
    inform: ['pill--warn', 'Ada dalam borang lain'],
    collected: ['pill--bad', 'Sudah dipungut'],
    notfound: ['pill--bad', 'Tiada dalam senarai'],
  };
  function itemsHtml(items) {
    return '<div class="list">' + items.map((it) => {
      const r = RES[it.result] || RES.notfound;
      return '<div class="item"><div class="item__main"><div class="item__title">' + (it.name ? esc(it.name) : '') + '</div><div class="item__meta mono">No. KP ' + esc(it.ic) + (it.qty > 1 ? ' · ' + it.qty + ' unit' : '') + '</div></div>' +
        '<span class="pill ' + r[0] + '">' + r[1] + '</span></div>';
    }).join('') + '</div>';
  }

  function hero() {
    return '<header class="f-hero"><div class="hud">' + (PIC ? 'Borang PIC · pungutan pukal' : 'Borang individu') + '</div><h1>' + esc(C.title || 'Grand Deepavali Celebration Ampang') + '</h1>' +
      '<p>' + (PIC ? 'Untuk wakil (PIC) yang memungut bagi ramai penerima sekali gus.' : 'Untuk penerima yang memungut bantuan sendiri.') + ' Kemudian tunjukkan nombor anda di kaunter.<br><span style="opacity:.85">' +
      (PIC ? 'For a PIC collecting for many people in one go.' : 'For a recipient collecting their own bantuan.') + ' Then show your number at the counter.</span></p></header>';
  }
  const otherLink = () => '<p class="sm" style="text-align:center;margin-top:14px">' + (PIC
    ? 'Memungut untuk diri sendiri sahaja? <a href="' + esc(C.selfUrl) + '">Borang individu</a>'
    : 'Memungut untuk orang lain? <a href="' + esc(C.picUrl) + '">Borang PIC (ramai nama)</a>') + '</p>';

  function field(name, bm, en, type, val, ac, extra) {
    return '<label class="field"><span>' + bm + ' <span class="muted" style="font-weight:500">· ' + en + '</span></span><input class="input" name="' + name + '" type="' + type + '" autocomplete="' + ac + '" value="' + esc(val) + '" required ' + (extra || '') + '></label>';
  }
  function rowsHtml() {
    return '<div id="rows">' + S.rows.map((r, i) => '<div class="ic-row' + (icBad(r.ic) ? ' ic-row--bad' : '') + '"><span class="ic-n">' + (i + 1) + '</span>' +
      '<input class="input mono" data-ic="' + i + '" inputmode="numeric" autocomplete="off" placeholder="No. KP" value="' + esc(r.ic) + '" aria-label="Recipient ' + (i + 1) + ' IC">' +
      '<input class="input" data-nm="' + i + '" autocomplete="off" placeholder="Nama (pilihan)" value="' + esc(r.name) + '" aria-label="Recipient ' + (i + 1) + ' name">' +
      '<button type="button" class="btn btn--sm" data-rm="' + i + '" aria-label="Buang ' + (i + 1) + '">✕</button></div>').join('') + '</div>';
  }

  function render() {
    if (S.result && S.result.ok) { root.innerHTML = hero() + '<main class="bt-main">' + ticketView(S.result) + '</main>'; bindTicket(); return; }
    if (!C.open) {
      root.innerHTML = hero() + '<main class="bt-main"><div class="card" style="margin-top:16px"><h2 class="bt-h2">Borang ditutup</h2><p>Borang ini ditutup buat masa ini. Sila ke kaunter bantuan.</p><p class="muted">The form is closed for now. Please go to the bantuan counter.</p></div></main>';
      return;
    }
    const filled = S.rows.filter((r) => r.ic.trim()).length;
    root.innerHTML = hero() + '<main class="bt-main"><form class="card" id="f" style="margin-top:16px" novalidate>' +
      '<div class="hud" style="margin-bottom:10px">' + (PIC ? '1 · Maklumat anda (PIC)' : 'Maklumat anda') + '</div>' +
      field('picName', 'Nama penuh', 'Full name', 'text', S.pic.name, 'name') +
      field('picPhone', 'No. telefon', 'Phone number', 'tel', S.pic.phone, 'tel') +
      field('picIc', 'No. kad pengenalan', 'IC number (MyKad)', 'text', S.pic.ic, 'off', 'inputmode="numeric" placeholder="cth. 800101-14-5678"') +
      (PIC
        ? '<label class="row" style="flex-wrap:nowrap;margin:4px 0 8px;gap:10px"><input type="checkbox" class="check" id="self"' + (S.self ? ' checked' : '') + '><span>Saya juga penerima bantuan<span class="en">I am also a recipient</span></span></label>' +
          '<label class="row" style="flex-wrap:nowrap;margin:0 0 16px;gap:10px"><input type="checkbox" class="check" id="listed"' + (S.listed ? ' checked' : '') + '><span>Saya sudah dinamakan sebagai PIC dalam senarai<span class="en">I am already named as PIC on the list (the counter will check your names)</span></span></label>' +
          '<div class="row" style="margin-bottom:6px"><div class="hud">2 · Penerima yang anda wakili</div><div class="spacer"></div><span class="pill pill--info" id="cnt">' + filled + ' / ' + max + '</span></div>' +
          '<p class="sm muted" style="margin:0 0 10px">Satu baris bagi setiap penerima: no. KP (wajib) dan nama. Ada senarai? Tekan <b>Tampal senarai</b>.<span class="en">One row per person: IC (required) and name. Have a list? Use Paste a list.</span></p>' +
          (S.paste
            ? '<div class="card" style="background:var(--surface-2);margin-bottom:10px"><label class="field" style="margin:0"><span>Tampal senarai · Paste a list</span><textarea class="input mono" id="pastebox" rows="8" placeholder="800101145678 Muthu a/l Raman&#10;750505-10-1234, Lakshmi a/p Velu&#10;…"></textarea><small>Satu orang setiap baris: no. KP dan nama. Boleh salin dari WhatsApp atau Excel. One person per line: IC then name; copy from WhatsApp or Excel.</small></label>' +
              '<div class="row" style="margin-top:8px"><button type="button" class="btn btn--primary btn--sm" id="pastego">Masukkan · Add these</button><button type="button" class="btn btn--sm" id="pastex">Batal</button></div></div>'
            : '') +
          rowsHtml() +
          '<div class="row" style="margin-top:4px">' + (S.rows.length < max ? '<button type="button" class="btn btn--sm" id="add">+ Tambah 5 baris</button>' : '') + (S.paste ? '' : '<button type="button" class="btn btn--sm btn--gold" id="paste">Tampal senarai · Paste a list</button>') + '</div>'
        : '<p class="sm muted" style="margin:0 0 4px">No. kad pengenalan anda mesti sama dengan senarai penerima.<span class="en">Your IC must match the recipient list.</span></p>') +
      '<input type="text" name="website" id="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">' +
      '<label class="row" style="flex-wrap:nowrap;margin:18px 0 6px;gap:10px;align-items:flex-start"><input type="checkbox" class="check" id="agree" required' + (S.agree ? ' checked' : '') + '><span class="sm">Saya mengesahkan maklumat ini betul dan bersetuju ia digunakan untuk pengagihan bantuan ini sahaja.<span class="en">I confirm these details are correct and agree they are used only for this bantuan distribution.</span></span></label>' +
      (S.error ? '<div class="note note--bad" role="alert">' + esc(S.error) + '</div>' : '') +
      (S.result && !S.result.ok ? '<div class="note note--bad">' + esc(S.result.message) + '</div>' + itemsHtml(S.result.items) : '') +
      '<button class="btn btn--primary btn--lg btn--block" style="margin-top:14px" ' + (S.busy ? 'disabled' : '') + '>' + (S.busy ? 'Menghantar…' : 'Hantar borang · Submit') + '</button>' +
      '</form>' + otherLink() + '<p class="sm muted" style="text-align:center;margin-top:6px">Grand Deepavali Parlimen Ampang · 14 Nov 2026</p></main>';
    bindForm();
  }
  function collect() {
    const f = document.getElementById('f');
    S.pic = { name: f.picName.value.trim(), phone: f.picPhone.value.trim(), ic: f.picIc.value.trim() };
    S.agree = document.getElementById('agree').checked;
    if (!PIC) return;
    S.rows = [...document.querySelectorAll('[data-ic]')].map((el, i) => ({ ic: el.value.trim(), name: document.querySelector('[data-nm="' + i + '"]').value.trim() }));
    S.self = document.getElementById('self').checked;
    S.listed = document.getElementById('listed').checked;
  }
  /* "800101-14-5678 Muthu", "Muthu, 800101145678", "1. Muthu 800101 14 5678" -> { ic, name } */
  function parseLine(line) {
    const m = line.match(/(\d[\d\s-]{10,16}\d)/);
    if (!m || icDigits(m[1]).length !== 12) {
      const t = line.match(/\b([A-Za-z]{1,2}\d{6,10})\b/); // passport-style ID
      if (!t) return null;
      return { ic: t[1], name: line.replace(t[1], '').replace(/^[\s\d.)-]+|[\s,;:|\t-]+$/g, '').replace(/^[\s,;:|\t-]+/, '').trim() };
    }
    const name = line.replace(m[1], ' ').replace(/^\s*\d{1,3}[.)]\s*/, '').replace(/[,;|\t]+/g, ' ').replace(/\s+/g, ' ').trim();
    return { ic: icDigits(m[1]), name };
  }
  function bindForm() {
    const f = document.getElementById('f');
    const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
    on('add', () => { collect(); for (let i = 0; i < 5 && S.rows.length < max; i++) S.rows.push(blank()); render(); const l = document.querySelectorAll('[data-ic]'); const firstEmpty = [...l].find((x) => !x.value); (firstEmpty || l[l.length - 1]).focus(); });
    on('paste', () => { collect(); S.paste = true; render(); document.getElementById('pastebox').focus(); });
    on('pastex', () => { collect(); S.paste = false; render(); });
    on('pastego', () => {
      const text = document.getElementById('pastebox').value;
      collect();
      const got = [], bad = [];
      text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).forEach((l) => { const p = parseLine(l); p ? got.push(p) : bad.push(l); });
      const have = new Set(S.rows.map((r) => icDigits(r.ic) || r.ic).filter(Boolean));
      const fresh = got.filter((p) => !have.has(p.ic) && (have.add(p.ic), true));
      S.rows = S.rows.filter((r) => r.ic || r.name).concat(fresh).slice(0, max);
      if (!S.rows.length) S.rows = [blank()];
      S.paste = false;
      S.error = bad.length ? 'Tiada no. KP 12 digit pada ' + bad.length + ' baris: ' + bad.slice(0, 3).join(' | ') + (bad.length > 3 ? ' …' : '') + '. No 12-digit IC found on these lines.' : '';
      render();
    });
    f.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => { collect(); S.rows.splice(+b.dataset.rm, 1); if (!S.rows.length) S.rows = [blank()]; render(); }));
    f.querySelectorAll('[data-ic]').forEach((el) => el.addEventListener('input', () => {
      const n = [...f.querySelectorAll('[data-ic]')].filter((x) => x.value.trim()).length;
      const c = document.getElementById('cnt'); if (c) c.textContent = n + ' / ' + max;
      el.parentNode.classList.toggle('ic-row--bad', icBad(el.value.trim()));
    }));
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      collect();
      S.error = '';
      const rows = S.rows.filter((r) => r.ic);
      const badRows = S.rows.map((r, i) => (icBad(r.ic) ? i + 1 : 0)).filter(Boolean);
      const noIc = S.rows.map((r, i) => (!r.ic && r.name ? i + 1 : 0)).filter(Boolean);
      if (!S.pic.name) S.error = 'Sila isi nama anda. Please enter your name.';
      else if (icDigits(S.pic.phone).length < 9) S.error = 'Sila isi no. telefon yang betul. Please enter a valid phone number.';
      else if (S.pic.ic.replace(/[^0-9A-Za-z]/g, '').length < 6) S.error = 'Sila isi no. kad pengenalan anda. Please enter your IC.';
      else if (icBad(S.pic.ic)) S.error = 'No. kad pengenalan anda perlu 12 digit. Your IC must have 12 digits.';
      else if (PIC && badRows.length) S.error = 'No. KP perlu 12 digit, semak baris ' + badRows.join(', ') + '. Each IC needs 12 digits: check row ' + badRows.join(', ') + '.';
      else if (PIC && noIc.length) S.error = 'Baris ' + noIc.join(', ') + ' ada nama tetapi tiada no. KP. Row ' + noIc.join(', ') + ' has a name but no IC.';
      else if (PIC && !rows.length && !S.self && !S.listed) S.error = 'Masukkan sekurang-kurangnya satu no. KP penerima. Enter at least one recipient IC.';
      else if (!S.agree) S.error = 'Sila tandakan pengesahan di atas. Please tick the confirmation box.';
      if (S.error) { S.result = null; render(); window.scrollTo(0, document.body.scrollHeight); return; }
      S.busy = true; render();
      try {
        const res = await fetch(C.rest + 'form', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', 'X-DVB': '1' },
          body: JSON.stringify({ mode: PIC ? 'pic' : 'self', picName: S.pic.name, picPhone: S.pic.phone, picIc: S.pic.ic, ics: PIC ? rows.map((r) => r.ic) : [], names: PIC ? rows.map((r) => r.name) : [], self: !PIC || S.self, listed: PIC && S.listed, website: document.getElementById('website').value }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) { S.error = j.message || 'Tidak dapat dihantar. Could not submit, try again.'; S.result = null; }
        else { S.result = j; if (j.ok) store.set(j); }
      } catch (err) { S.error = 'Tiada sambungan internet. No connection, try again.'; }
      S.busy = false; render(); window.scrollTo(0, 0);
    });
  }
  function ticketView(t) {
    const bad = t.items.filter((i) => i.result !== 'ok' && i.result !== 'inform').length;
    return '<div class="ticket" style="margin-top:16px"><div class="hud">No. borang anda · Your number</div><div class="ticket__ref">' + esc(t.ref) + '</div>' +
      '<p style="margin:4px 0 0;font-weight:700">' + esc(t.picName) + '</p><p class="muted sm" style="margin:2px 0 10px">' + esc(fmtTime(t.at)) + '</p>' +
      '<div class="big-count" style="text-align:left"><span><b style="font-size:15px;color:var(--text)">Bilangan untuk dipungut</b><span class="en">Number to collect</span></span><b>' + esc(t.qty) + (t.listed ? '+' : '') + '</b></div>' +
      (t.listed ? '<p class="sm" style="margin:0">+ nama yang disenaraikan di bawah anda akan disemak di kaunter.<span class="en">+ names listed under you are checked at the counter.</span></p>' : '') +
      (bad ? '<div class="note note--warn" style="text-align:left">' + bad + ' nama tidak boleh dipungut (lihat di bawah). ' + bad + ' cannot be collected, see below.</div>' : '') +
      '<p style="margin:10px 0 0">Tunjukkan nombor ini dan kad pengenalan anda di kaunter bantuan.</p><p class="muted sm" style="margin:2px 0 0">Show this number and your IC at the bantuan counter.</p></div>' +
      '<div class="hud" style="margin:18px 0 8px">Penerima · Recipients (' + t.items.length + ')</div>' + itemsHtml(t.items) +
      '<button class="btn btn--block" style="margin-top:16px" id="again">Isi borang baru · New form</button>';
  }
  function bindTicket() {
    document.getElementById('again').addEventListener('click', () => {
      if (!confirm('Buang nombor ini dari skrin? Remove this number from the screen?')) return;
      store.set(null); S.result = null; S.rows = [blank(), blank(), blank()]; S.pic = { name: '', phone: '', ic: '' }; S.self = false; S.listed = false; render();
    });
  }
  const saved = store.get();
  if (saved && saved.ok && saved.at && Date.now() - new Date(saved.at).getTime() < 3 * 86400000) S.result = saved;
  render();
})();
