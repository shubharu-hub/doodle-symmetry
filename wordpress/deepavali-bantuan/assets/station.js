/* Bantuan station app: recipients list, PICs, QR forms, collection with a two-copy receipt. */
(function () {
  'use strict';
  const C = window.DVB_CONFIG || {};
  const root = document.getElementById('bt-app');
  const printEl = document.getElementById('bt-print');

  /* ---------- utils ---------- */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => [...(el || document).querySelectorAll(sel)];
  const fmtIc = (ic) => (/^\d{12}$/.test(ic || '') ? ic.slice(0, 6) + '-' + ic.slice(6, 8) + '-' + ic.slice(8) : (ic || ''));
  const maskIc = (ic) => (ic ? (ic.length > 4 ? '•'.repeat(Math.min(8, ic.length - 4)) + ic.slice(-4) : ic) : '');
  const normIc = (v) => { let s = String(v == null ? '' : v).replace(/[^0-9A-Za-z]/g, '').toUpperCase(); if (/^\d{11}$/.test(s)) s = '0' + s; return s; };
  const fmtDT = (iso) => { if (!iso) return ''; try { return new Date(iso).toLocaleString('en-MY', { timeZone: C.tz, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); } catch (e) { return iso; } };
  const fmtDTlong = (iso) => { try { return new Date(iso).toLocaleString('ms-MY', { timeZone: C.tz, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }); } catch (e) { return iso; } };
  const num = (n) => Number(n || 0).toLocaleString('en-MY');
  const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  function toast(msg, bad) {
    const t = document.createElement('div');
    t.className = 'toast' + (bad ? ' toast--bad' : '');
    t.setAttribute('role', 'status');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), bad ? 6000 : 3200);
  }

  async function api(path, body, method) {
    const opt = { method: method || (body ? 'POST' : 'GET'), credentials: 'same-origin', headers: { 'X-DVB': '1' } };
    if (C.nonce) opt.headers['X-WP-Nonce'] = C.nonce;
    if (body) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    let res;
    try { res = await fetch(C.rest + path, opt); } catch (e) { throw new Error('No connection. Check the internet and try again.'); }
    const j = await res.json().catch(() => ({}));
    if (res.status === 401 && path !== 'login') { C.authed = false; S.data = null; render(); }
    if (!res.ok) throw new Error(j.message || 'Something went wrong (' + res.status + ').');
    return j;
  }

  /* ---------- state ---------- */
  const S = {
    data: null, tab: 'home', q: '', filter: 'pending', formFilter: 'new', sel: new Set(), shown: 100,
    sheet: null, busy: false, lastReceipt: null,
  };
  const idx = { byId: new Map(), rcById: new Map(), claimById: new Map() };
  function reindex() {
    idx.byId = new Map(S.data.recipients.map((r) => [r.id, r]));
    idx.rcById = new Map(S.data.receipts.map((r) => [r.id, r]));
    idx.claimById = new Map(S.data.claims.map((c) => [c.id, c]));
    for (const id of [...S.sel]) if (!idx.byId.has(id)) S.sel.delete(id);
  }
  async function load(force) {
    const j = await api('state' + (S.data && !force ? '?since=' + S.data.rev : ''));
    if (j.unchanged) return false;
    S.data = j; reindex();
    return true;
  }
  let pollT = null;
  function startPoll() {
    clearInterval(pollT);
    pollT = setInterval(async () => {
      if (document.hidden || S.busy || !C.authed) return;
      try { if (await load()) renderMain(true); } catch (e) { /* offline: keep showing what we have */ }
    }, 7000);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && C.authed && S.data) load().then((ch) => ch && renderMain(true)).catch(() => {}); });

  function stats() {
    const r = S.data.recipients;
    let qty = 0, qtyDone = 0, done = 0, withPic = 0;
    for (const x of r) { qty += x.qty; if (x.status === 'collected') { done++; qtyDone += x.qty; } if (x.picName) withPic++; }
    const newForms = S.data.claims.filter((c) => c.status === 'new' && claimLive(c, true).some((x) => x.state === 'ok')).length;
    const live = S.data.receipts.filter((x) => !x.voidedAt).length;
    return { total: r.length, done, pending: r.length - done, qty, qtyDone, withPic, newForms, receipts: live };
  }

  /* ---------- shell ---------- */
  const TABS = [
    ['home', 'Station', '⌂'], ['forms', 'QR forms', '▤'], ['list', 'Recipients', '☰'], ['pic', 'PICs', '◉'], ['receipts', 'Receipts', '🧾'], ['setup', 'Setup', '⚙'],
  ];
  function render() {
    if (!C.authed) { root.innerHTML = loginView(); bindLogin(); return; }
    if (!S.data) { root.innerHTML = '<div class="login"><p class="muted">Loading…</p></div>'; return; }
    const st = stats();
    const tabBtn = (t) => '<button class="bt-tab" data-tab="' + t[0] + '"' + (S.tab === t[0] ? ' aria-current="page"' : '') + '><i aria-hidden="true">' + t[2] + '</i> ' + t[1] +
      (t[0] === 'forms' && st.newForms ? '<span class="bt-badge">' + st.newForms + '</span>' : '') + '</button>';
    root.innerHTML = '<header class="bt-top"><div class="bt-top__in"><div class="bt-brand"><div class="bt-logo" aria-hidden="true">B</div><div><b>' + esc(S.data.settings.title) + '</b><span>Bantuan station · ' + esc(C.user || '') + '</span></div></div>' +
      '<nav class="bt-tabs" aria-label="Sections">' + TABS.map(tabBtn).join('') + '</nav></div></header>' +
      '<main class="bt-main" id="main"></main><nav class="bt-nav" aria-label="Sections">' + TABS.map(tabBtn).join('') + '</nav>';
    $$('[data-tab]').forEach((b) => b.addEventListener('click', () => { S.tab = b.dataset.tab; S.q = ''; S.shown = 100; render(); window.scrollTo(0, 0); }));
    renderMain();
  }
  function renderMain(fromPoll) {
    const m = $('#main');
    if (!m) return render();
    if (fromPoll) { // refresh badges without losing the search box focus
      const st = stats();
      $$('[data-tab="forms"]').forEach((b) => { const bd = b.querySelector('.bt-badge'); if (st.newForms) { if (bd) bd.textContent = st.newForms; else b.insertAdjacentHTML('beforeend', '<span class="bt-badge">' + st.newForms + '</span>'); } else if (bd) bd.remove(); });
    }
    const active = document.activeElement;
    const keep = active && active.id && m.contains(active) ? { id: active.id, s: active.selectionStart, e: active.selectionEnd } : null;
    const view = { home: homeView, forms: formsView, list: listView, pic: picView, receipts: receiptsView, setup: setupView }[S.tab] || homeView;
    m.innerHTML = view();
    bindMain(m);
    if (keep) { const el = document.getElementById(keep.id); if (el) { el.focus(); try { el.setSelectionRange(keep.s, keep.e); } catch (e) { /* not a text field */ } } }
    if (S.sheet && fromPoll && S.sheet.live) openSheet(S.sheet.kind, S.sheet.arg, true);
  }

  /* ---------- login ---------- */
  function loginView() {
    return '<div class="login"><form class="card" id="login"><div class="bt-logo" style="margin-bottom:12px">B</div><h1 class="bt-h1">Bantuan station</h1>' +
      '<p class="bt-sub">Grand Deepavali Celebration Ampang. Enter your station code.</p>' +
      '<label class="field"><span>Station code</span><input class="input" name="code" type="password" autocomplete="current-password" required autofocus></label>' +
      '<div id="lerr"></div><button class="btn btn--primary btn--block btn--lg">Sign in</button>' +
      '<p class="sm muted" style="margin:14px 0 0">WordPress admin? <a href="' + esc(C.loginUrl) + '">Log in to WordPress</a> instead.</p></form></div>';
  }
  function bindLogin() {
    $('#login').addEventListener('submit', async (e) => {
      e.preventDefault();
      const b = e.target.querySelector('button'); b.disabled = true;
      try {
        const j = await api('login', { code: e.target.code.value });
        C.authed = true; C.user = j.name;
        await load(true);
        C.admin = !!S.data.users; // the state carries users only for an admin
        render(); startPoll();
      } catch (err) { $('#lerr').innerHTML = '<div class="note note--bad">' + esc(err.message) + '</div>'; b.disabled = false; }
    });
  }

  /* ---------- views ---------- */
  function recipientRow(r, opts) {
    opts = opts || {};
    const sel = S.sel.has(r.id);
    const rc = r.receiptId ? idx.rcById.get(r.receiptId) : null;
    const pill = r.status === 'collected'
      ? '<span class="pill pill--ok">Collected' + (rc ? ' · ' + esc(rc.no) : '') + '</span>'
      : '<span class="pill pill--warn">Pending</span>';
    return '<div class="item item--click' + (sel ? ' item--sel' : '') + '" data-open="' + r.id + '">' +
      (opts.check !== false ? '<input type="checkbox" class="check" data-sel="' + r.id + '" aria-label="Select ' + esc(r.name) + '"' + (sel ? ' checked' : '') + (r.status !== 'pending' ? ' disabled' : '') + '>' : '') +
      '<div class="item__main"><div class="item__title">' + esc(r.name) + (r.qty > 1 ? ' <span class="pill pill--info">×' + r.qty + '</span>' : '') + '</div>' +
      '<div class="item__meta mono">' + esc(fmtIc(r.ic) || 'No IC') + (r.phone ? ' · ' + esc(r.phone) : '') + '</div>' +
      (r.picName ? '<div class="item__meta">PIC: <b>' + esc(r.picName) + '</b>' + (r.picPhone ? ' · ' + esc(r.picPhone) : '') + '</div>' : '') +
      (r.status === 'collected' ? '<div class="item__meta">Collected by <b>' + esc(rc ? rc.picName : '') + '</b> · ' + esc(fmtDT(r.collectedAt)) + (r.collectedBy ? ' · station: ' + esc(r.collectedBy) : '') + '</div>' : '') +
      '</div><div class="item__trail">' + pill +
      (r.status === 'pending' && opts.quick ? '<button class="btn btn--sm btn--gold" data-collect="' + r.id + '">Collect</button>' : '') +
      '</div></div>';
  }
  function matchRecipient(r, q) {
    if (!q) return true;
    const qi = normIc(q);
    if (qi.length >= 3 && (r.ic.includes(qi) || r.picIc.includes(qi))) return true;
    const qd = q.replace(/\D/g, '');
    if (qd.length >= 4 && (r.phone.replace(/\D/g, '').includes(qd) || r.picPhone.replace(/\D/g, '').includes(qd))) return true;
    const words = fold(q).split(/\s+/).filter(Boolean);
    const hay = fold(r.name + ' ' + r.picName + ' ' + r.email);
    return words.every((w) => hay.includes(w));
  }
  function claimLive(c, withAssigned) { // re-check each line against the list as it is now
    const out = c.items.map((it) => {
      const r = it.rid ? idx.byId.get(it.rid) : null;
      let state = 'notfound';
      if (r) state = r.status === 'collected' ? (r.receiptId && r.receiptId === c.receiptId ? 'mine' : 'collected') : 'ok';
      return Object.assign({}, it, { r, state });
    });
    if (withAssigned && c.status === 'new' && c.picIc) { // names the list already gives to this PIC: offered, not ticked
      const have = new Set(out.map((x) => x.r && x.r.id));
      for (const r of S.data.recipients) if (r.status === 'pending' && r.picIc === c.picIc && !have.has(r.id)) out.push({ ic: r.ic, rid: r.id, r, state: 'ok', how: 'assigned', untick: true });
    }
    return out;
  }
  // a recipient is vouched for when the list already names this PIC for them, or the PIC is the recipient
  const vouched = (r, c) => r && ((r.picIc && r.picIc === c.picIc) || r.ic === c.picIc);
  function claimRow(c) {
    const live = claimLive(c, true);
    const ok = live.filter((x) => x.state === 'ok');
    const qty = ok.reduce((a, x) => a + x.r.qty, 0);
    const pill = c.status === 'new' ? '<span class="pill pill--new">Waiting</span>' : c.status === 'done' ? '<span class="pill pill--ok">Printed · ' + esc((idx.rcById.get(c.receiptId) || {}).no || '') + '</span>' : '<span class="pill pill--bad">Rejected</span>';
    return '<div class="item item--click" data-claim="' + c.id + '"><div class="ref">' + esc(c.ref) + '</div><div class="item__main"><div class="item__title">' + esc(c.picName) + '</div>' +
      '<div class="item__meta mono">' + esc(c.picPhone) + ' · IC ' + esc(fmtIc(c.picIc)) + '</div><div class="item__meta">' + esc(fmtDT(c.createdAt)) + ' · ' + live.length + ' listed' + (c.status === 'new' ? ', ' + ok.length + ' ready (' + qty + ' to collect)' : '') + '</div></div>' +
      '<div class="item__trail">' + pill + (c.status === 'new' && ok.length ? '<button class="btn btn--sm btn--gold" data-claim="' + c.id + '">Open</button>' : '') + '</div></div>';
  }

  function homeView() {
    const st = stats();
    const pct = st.qty ? Math.round((st.qtyDone / st.qty) * 100) : 0;
    const q = S.q.trim();
    let results = '';
    if (q) {
      const refHit = /^\d{4,5}$/.test(q) ? S.data.claims.filter((c) => c.ref === q) : [];
      const hits = S.data.recipients.filter((r) => matchRecipient(r, q));
      const rcHit = /^b?\d{1,6}$/i.test(q) ? S.data.receipts.filter((x) => x.no.toLowerCase() === ('b' + q.replace(/^b/i, '').padStart(4, '0')).toLowerCase()) : [];
      results = (refHit.length ? '<div class="hud" style="margin:14px 0 6px">QR form</div><div class="list">' + refHit.map(claimRow).join('') + '</div>' : '') +
        (rcHit.length ? '<div class="hud" style="margin:14px 0 6px">Receipt</div><div class="list">' + rcHit.map(receiptRow).join('') + '</div>' : '') +
        '<div class="hud" style="margin:14px 0 6px">Recipients · ' + hits.length + ' found</div>' +
        (hits.length ? '<div class="list">' + hits.slice(0, 40).map((r) => recipientRow(r, { quick: true })).join('') + '</div>' + (hits.length > 40 ? '<p class="sm muted">Showing 40. Type more to narrow it down.</p>' : '')
          : '<div class="list"><div class="empty">Nobody on the list matches “' + esc(q) + '”.<br><button class="btn btn--sm" style="margin-top:10px" data-act="new-recipient">Add a new recipient</button></div></div>');
    }
    const waiting = S.data.claims.filter((c) => c.status === 'new').slice(0, 6);
    return '<div class="grid grid-2" style="align-items:start"><div>' +
      '<div class="hero"><div class="hud">Bantuan collected</div><div class="hero__big">' + num(st.qtyDone) + ' <span style="font-size:20px;opacity:.8">of ' + num(st.qty) + '</span></div>' +
      '<div>' + num(st.done) + ' of ' + num(st.total) + ' recipients · ' + num(st.receipts) + ' receipts printed</div><div class="hero__bar"><i style="width:' + pct + '%"></i></div></div>' +
      '<div class="grid grid-4" style="margin-top:14px"><div class="kpi"><b>' + num(st.pending) + '</b><span>Still to collect</span></div><div class="kpi"><b>' + num(st.newForms) + '</b><span>QR forms waiting</span></div>' +
      '<div class="kpi"><b>' + num(st.withPic) + '</b><span>Have a PIC</span></div><div class="kpi"><b>' + pct + '%</b><span>Done</span></div></div>' +
      '</div><div class="card"><h2 class="bt-h2">Find a person or form</h2><input class="input input--search" id="q" type="search" placeholder="Form number, name, IC or phone" value="' + esc(S.q) + '" autocomplete="off" aria-label="Search">' +
      '<p class="sm muted" style="margin:8px 0 0">Type the 4-digit QR form number, or search the list for a walk-in.</p>' +
      (st.total ? '' : '<div class="note note--info">The list is empty. Go to <b>Setup</b> to upload the Excel list.</div>') + '</div></div>' +
      '<div id="results">' + results + '</div>' +
      (!q ? '<div class="bt-head" style="margin-top:20px"><h2 class="bt-h2" style="margin:0">QR forms waiting</h2><button class="btn btn--sm" data-tab-go="forms">All forms</button></div>' +
        (waiting.length ? '<div class="list">' + waiting.map(claimRow).join('') + '</div>' : '<div class="list"><div class="empty">No forms waiting. New QR forms show up here by themselves.</div></div>') : '');
  }

  function formsView() {
    const f = S.formFilter, q = S.q.trim();
    const all = S.data.claims;
    const list = all.filter((c) => (f === 'all' || c.status === f) && (!q || c.ref.includes(q) || fold(c.picName).includes(fold(q)) || c.picPhone.replace(/\D/g, '').includes(q.replace(/\D/g, '') || '§') || c.picIc.includes(normIc(q) || '§')));
    const n = (s) => all.filter((c) => s === 'all' || c.status === s).length;
    return '<div class="bt-head"><div><h1 class="bt-h1">QR forms</h1><p class="bt-sub" style="margin:0">Forms PICs filled in on their phone. Open one, check the PIC’s IC, then confirm and print.</p></div><button class="btn btn--sm" data-act="qr">Show QR code</button></div>' +
      '<div class="row" style="margin-bottom:12px"><div class="chips">' + [['new', 'Waiting'], ['done', 'Printed'], ['rejected', 'Rejected'], ['all', 'All']].map((x) => '<button class="chip" data-ff="' + x[0] + '" aria-pressed="' + (f === x[0]) + '">' + x[1] + ' · ' + n(x[0]) + '</button>').join('') + '</div><div class="spacer"></div>' +
      '<input class="input" id="q" type="search" style="max-width:280px" placeholder="Number, name, phone" value="' + esc(S.q) + '" aria-label="Search forms"></div>' +
      '<div id="results">' + (list.length ? '<div class="list">' + list.slice(0, 300).map(claimRow).join('') + '</div>' : '<div class="list"><div class="empty">No forms here.</div></div>') + '</div>';
  }

  function listView() {
    const q = S.q.trim(), f = S.filter;
    const list = S.data.recipients.filter((r) => (f === 'all' || (f === 'pending' && r.status === 'pending') || (f === 'collected' && r.status === 'collected') || (f === 'nopic' && !r.picName && r.status === 'pending')) && matchRecipient(r, q));
    const c = (k) => S.data.recipients.filter((r) => k === 'all' || (k === 'nopic' ? !r.picName && r.status === 'pending' : r.status === k)).length;
    const selPending = [...S.sel].filter((id) => (idx.byId.get(id) || {}).status === 'pending');
    const shownIds = list.slice(0, S.shown).filter((r) => r.status === 'pending').map((r) => r.id);
    const allSel = shownIds.length && shownIds.every((id) => S.sel.has(id));
    return '<div class="bt-head"><div><h1 class="bt-h1">Recipients</h1><p class="bt-sub" style="margin:0">' + num(S.data.recipients.length) + ' on the list. Tick names to give them a PIC or collect them together.</p></div>' +
      '<div class="row"><button class="btn btn--sm" data-act="new-recipient">+ Add</button><button class="btn btn--sm" data-tab-go="setup">Upload Excel</button></div></div>' +
      '<div class="row" style="margin-bottom:12px"><div class="chips">' + [['pending', 'Pending'], ['collected', 'Collected'], ['nopic', 'No PIC yet'], ['all', 'All']].map((x) => '<button class="chip" data-lf="' + x[0] + '" aria-pressed="' + (f === x[0]) + '">' + x[1] + ' · ' + num(c(x[0])) + '</button>').join('') + '</div><div class="spacer"></div>' +
      '<input class="input" id="q" type="search" style="max-width:300px" placeholder="Name, IC, phone or PIC" value="' + esc(S.q) + '" aria-label="Search recipients"></div>' +
      '<div id="results">' + (list.length ? '<div class="row sm" style="margin:0 0 8px 14px"><label class="row"><input type="checkbox" class="check" data-act="sel-all"' + (allSel ? ' checked' : '') + '> Select all shown</label><span class="muted">' + num(list.length) + ' match</span></div>' +
        '<div class="list">' + list.slice(0, S.shown).map((r) => recipientRow(r)).join('') + '</div>' +
        (list.length > S.shown ? '<div style="text-align:center;margin-top:12px"><button class="btn" data-act="more">Show more (' + num(list.length - S.shown) + ' left)</button></div>' : '')
        : '<div class="list"><div class="empty">' + (S.data.recipients.length ? 'No one matches.' : 'The list is empty. Upload the Excel list in Setup.') + '</div></div>') + '</div>' +
      (selPending.length ? '<div class="bulk"><b>' + selPending.length + ' selected</b><div class="spacer"></div><button class="btn btn--sm" data-act="clear-sel" style="color:var(--text)">Clear</button>' +
        '<button class="btn btn--sm" data-act="assign-pic" style="color:var(--text)">Set PIC</button>' + (C.admin ? '<button class="btn btn--sm btn--danger" data-act="del-sel">Delete</button>' : '') +
        '<button class="btn btn--sm btn--gold" data-act="collect-sel">Collect & print</button></div>' : '');
  }

  function picGroups() {
    const g = new Map();
    for (const r of S.data.recipients) {
      if (!r.picName) continue;
      const key = r.picIc || fold(r.picName) + '|' + r.picPhone.replace(/\D/g, '');
      if (!g.has(key)) g.set(key, { key, name: r.picName, phone: r.picPhone, ic: r.picIc, rows: [] });
      g.get(key).rows.push(r);
    }
    return [...g.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
  function picView() {
    const q = S.q.trim();
    const groups = picGroups().filter((g) => !q || fold(g.name).includes(fold(q)) || g.phone.includes(q) || g.ic.includes(normIc(q) || '§'));
    return '<div class="bt-head"><div><h1 class="bt-h1">PICs</h1><p class="bt-sub" style="margin:0">People who collect on behalf of others. One tap collects everything still pending for that PIC on one receipt.</p></div>' +
      '<input class="input" id="q" type="search" style="max-width:280px" placeholder="PIC name, phone or IC" value="' + esc(S.q) + '" aria-label="Search PICs"></div>' +
      '<div id="results">' + (groups.length ? '<div class="list">' + groups.map((g) => {
        const pend = g.rows.filter((r) => r.status === 'pending');
        const qty = pend.reduce((a, r) => a + r.qty, 0);
        return '<div class="item item--click" data-pic="' + esc(g.key) + '"><div class="item__main"><div class="item__title">' + esc(g.name) + '</div><div class="item__meta mono">' + esc(g.phone) + (g.ic ? ' · IC ' + esc(fmtIc(g.ic)) : '') + '</div>' +
          '<div class="item__meta">' + g.rows.length + ' names · ' + pend.length + ' pending</div></div><div class="item__trail">' +
          (pend.length ? '<span class="pill pill--warn">' + qty + ' to collect</span><button class="btn btn--sm btn--gold" data-pic-collect="' + esc(g.key) + '">Collect all</button>' : '<span class="pill pill--ok">All collected</span>') + '</div></div>';
      }).join('') + '</div>' : '<div class="list"><div class="empty">No PICs yet. Set a PIC from the Recipients list, put a PIC column in the Excel file, or let PICs use the QR form.</div></div>') + '</div>';
  }

  function receiptRow(x) {
    return '<div class="item item--click" data-rc="' + x.id + '"><div class="ref" style="font-size:18px">' + esc(x.no) + '</div><div class="item__main"><div class="item__title">' + esc(x.picName) + '</div>' +
      '<div class="item__meta">' + esc(fmtDT(x.createdAt)) + ' · by ' + esc(x.issuedBy) + (x.claimId ? ' · QR form ' + esc((idx.claimById.get(x.claimId) || {}).ref || '') : '') + '</div></div>' +
      '<div class="item__trail"><span class="pill ' + (x.voidedAt ? 'pill--bad">Cancelled' : 'pill--ok">' + x.qty + ' collected') + '</span><button class="btn btn--sm" data-reprint="' + x.id + '">Print</button></div></div>';
  }
  function receiptsView() {
    const q = S.q.trim();
    const list = S.data.receipts.filter((x) => !q || x.no.toLowerCase().includes(q.toLowerCase()) || fold(x.picName).includes(fold(q)) || x.items.some((it) => fold(it.name).includes(fold(q)) || it.ic.includes(normIc(q) || '§')));
    return '<div class="bt-head"><div><h1 class="bt-h1">Receipts</h1><p class="bt-sub" style="margin:0">Every collection, newest first. Reprint a receipt, or cancel one handed out by mistake.</p></div>' +
      '<input class="input" id="q" type="search" style="max-width:280px" placeholder="Receipt no., PIC or recipient" value="' + esc(S.q) + '" aria-label="Search receipts"></div>' +
      '<div id="results">' + (list.length ? '<div class="list">' + list.slice(0, 400).map(receiptRow).join('') + '</div>' : '<div class="list"><div class="empty">No receipts yet.</div></div>') + '</div>';
  }

  function setupView() {
    const s = S.data.settings;
    return '<h1 class="bt-h1">Setup</h1><p class="bt-sub">Upload the list, print the QR poster, export the records.</p><div class="grid grid-2" style="align-items:start"><div>' +
      '<div class="card"><h2 class="bt-h2">Upload the Excel list</h2><p class="sm muted" style="margin-top:0">Columns it understands: Nama / Name, No KP / IC, Telefon / Phone, Emel / Email, and optionally Kuantiti, Nama PIC, Telefon PIC, No KP PIC, Catatan. The header row can be anywhere in the first 15 rows. People already on the list (same IC) are updated, not added twice.</p>' +
      '<div class="row"><label class="btn btn--primary">Choose Excel file<input type="file" id="xl" accept=".xlsx,.xls,.csv" class="hidden"></label><button class="btn" data-act="template">Download template</button></div></div>' +
      '<div class="card"><h2 class="bt-h2">QR codes for the forms</h2><p class="sm muted" style="margin-top:0">Two forms: <b>Individu</b> for someone collecting their own, and <b>PIC</b> for one person listing many names in one go. Both give a 4-digit number to show at the counter. The forms are <b>' + (s.formOpen ? 'open' : 'closed') + '</b>.</p>' +
      '<div class="row"><button class="btn btn--gold" data-act="qr">Show and print QR posters</button><a class="btn" href="' + esc(C.selfUrl) + '" target="_blank" rel="noopener">Individu form</a><a class="btn" href="' + esc(C.picUrl) + '" target="_blank" rel="noopener">PIC form</a></div></div>' +
      '<div class="card"><h2 class="bt-h2">Export</h2><p class="sm muted" style="margin-top:0">One Excel file with the full list and status, every receipt and every QR form.</p><button class="btn" data-act="export">Download Excel</button></div>' +
      '</div><div>' +
      (C.admin ? '<div class="card"><h2 class="bt-h2">Receipt and form</h2><form id="settings">' +
        '<label class="field"><span>Receipt title</span><input class="input" name="title" value="' + esc(s.title) + '" maxlength="80"></label>' +
        '<label class="field"><span>Receipt subtitle</span><input class="input" name="subtitle" value="' + esc(s.subtitle) + '" maxlength="120"></label>' +
        '<label class="field"><span>Receipt footer</span><input class="input" name="footer" value="' + esc(s.footer) + '" maxlength="200"></label>' +
        '<label class="field"><span>Printer</span><select class="input" name="paper"><option value="roll"' + (s.paper !== 'a4' ? ' selected' : '') + '>Bluetooth / receipt roll printer: two copies one after the other</option><option value="a4"' + (s.paper === 'a4' ? ' selected' : '') + '>A4 printer: both copies on one sheet, cut in half</option></select></label>' +
        '<label class="field"><span>Roll print width (mm)</span><input class="input" name="width" type="number" min="30" max="80" value="' + esc(s.width || 40) + '"><small>58 mm paper prints about 48 mm wide, 80 mm paper about 72 mm. Use “Print a test receipt” to check.</small></label>' +
        '<label class="field"><span>Most names on one PIC form</span><input class="input" name="maxPerForm" type="number" min="1" max="200" value="' + esc(s.maxPerForm) + '"></label>' +
        '<label class="row" style="margin-bottom:14px"><input type="checkbox" class="check" name="formOpen"' + (s.formOpen ? ' checked' : '') + '> QR form is open to the public</label>' +
        '<div class="row"><button class="btn btn--primary">Save</button><button class="btn" type="button" data-act="test-print">Print a test receipt</button></div></form></div>' +
        '<div class="card"><h2 class="bt-h2">Station codes</h2><p class="sm muted" style="margin-top:0">Each station helper gets their own code, so every receipt shows who handed it out. Admins can also change these settings and replace the whole list.</p>' +
        '<div class="list" style="margin-bottom:12px">' + ((S.data.users || []).map((u) => '<div class="item"><div class="item__main"><div class="item__title">' + esc(u.name) + '</div></div>' + (u.admin ? '<span class="pill pill--new">Admin</span>' : '<span class="pill">Station</span>') + '<button class="btn btn--sm btn--danger" data-rmuser="' + esc(u.id) + '">Remove</button></div>').join('') || '<div class="empty">No codes yet.</div>') + '</div>' +
        '<form id="adduser" class="grid" style="gap:8px"><input class="input" name="name" placeholder="Helper name" required maxlength="60"><input class="input" name="code" placeholder="Their code (6+ characters)" required minlength="6" maxlength="64" autocomplete="off">' +
        '<label class="row sm"><input type="checkbox" class="check" name="admin"> Admin</label><button class="btn">Add or change code</button></form></div>'
        : '<div class="card"><h2 class="bt-h2">Signed in</h2><p>You are signed in as <b>' + esc(C.user) + '</b>. Ask the event manager to change receipt settings or station codes.</p></div>') +
      '<div class="card"><button class="btn btn--sm" data-act="logout">Sign out</button></div></div></div>';
  }

  /* ---------- events ---------- */
  function bindMain(m) {
    const q = $('#q', m);
    if (q) q.addEventListener('input', () => {
      S.q = q.value; S.shown = 100; renderMain();
      const v = S.q.trim(); // a form number we have not seen yet: fetch now instead of waiting for the next poll
      if (/^\d{4,5}$/.test(v) && !S.data.claims.some((c) => c.ref === v)) load().then((ch) => ch && renderMain()).catch(() => {});
    });
    if (q) q.addEventListener('keydown', (e) => { // Enter opens the only match
      if (e.key !== 'Enter') return;
      const forms = $$('#results [data-claim].item', m);
      const rows = forms.length ? forms : $$('#results [data-open].item, #results [data-pic].item, #results [data-rc].item', m);
      if (rows.length === 1) { e.preventDefault(); rows[0].click(); }
    });
    $$('[data-tab-go]', m).forEach((b) => b.addEventListener('click', () => { S.tab = b.dataset.tabGo; S.q = ''; render(); }));
    $$('[data-ff]', m).forEach((b) => b.addEventListener('click', () => { S.formFilter = b.dataset.ff; renderMain(); }));
    $$('[data-lf]', m).forEach((b) => b.addEventListener('click', () => { S.filter = b.dataset.lf; S.shown = 100; renderMain(); }));
    m.addEventListener('click', onMainClick);
    const xl = $('#xl', m);
    if (xl) xl.addEventListener('change', () => { if (xl.files[0]) readExcel(xl.files[0]); xl.value = ''; });
    const sf = $('#settings', m);
    if (sf) sf.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      try {
        await api('settings', { settings: { title: f.title.value, subtitle: f.subtitle.value, footer: f.footer.value, paper: f.paper.value, width: f.width.value, maxPerForm: f.maxPerForm.value, formOpen: f.formOpen.checked } });
        await load(true); renderMain(); toast('Saved');
      } catch (err) { toast(err.message, true); }
    });
    const uf = $('#adduser', m);
    if (uf) uf.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      try { await api('users', { name: f.name.value, code: f.code.value, admin: f.admin.checked }); await load(true); renderMain(); toast('Code saved for ' + f.name.value); } catch (err) { toast(err.message, true); }
    });
  }
  async function onMainClick(e) {
    const t = e.target.closest('button, input[type=checkbox], [data-open], [data-claim], [data-pic], [data-rc]');
    if (!t) return;
    const d = t.dataset;
    if (d.sel) { e.stopPropagation(); const id = +d.sel; t.checked ? S.sel.add(id) : S.sel.delete(id); renderMain(); return; }
    if (d.act === 'sel-all') {
      const list = S.data.recipients.filter((r) => (S.filter === 'all' || (S.filter === 'pending' && r.status === 'pending') || (S.filter === 'collected' && r.status === 'collected') || (S.filter === 'nopic' && !r.picName && r.status === 'pending')) && matchRecipient(r, S.q.trim())).slice(0, S.shown).filter((r) => r.status === 'pending');
      list.forEach((r) => (t.checked ? S.sel.add(r.id) : S.sel.delete(r.id)));
      renderMain(); return;
    }
    if (d.collect) { e.stopPropagation(); openSheet('collect', { ids: [+d.collect] }); return; }
    if (d.picCollect) { e.stopPropagation(); const g = picGroups().find((x) => x.key === d.picCollect); openSheet('collect', { ids: g.rows.filter((r) => r.status === 'pending').map((r) => r.id), pic: { name: g.name, phone: g.phone, ic: g.ic } }); return; }
    if (d.reprint) { e.stopPropagation(); printReceipt(idx.rcById.get(+d.reprint)); return; }
    if (d.rmuser) { try { await api('users', { remove: d.rmuser }); await load(true); renderMain(); toast('Code removed'); } catch (err) { toast(err.message, true); } return; }
    if (d.open) { openSheet('recipient', { id: +d.open }); return; }
    if (d.claim) { openSheet('claim', { id: +d.claim }); return; }
    if (d.pic) { const g = picGroups().find((x) => x.key === d.pic); openSheet('picgroup', { key: g.key }); return; }
    if (d.rc) { openSheet('receipt', { id: +d.rc }); return; }
    switch (d.act) {
      case 'more': S.shown += 200; renderMain(); break;
      case 'clear-sel': S.sel.clear(); renderMain(); break;
      case 'collect-sel': openSheet('collect', { ids: [...S.sel].filter((id) => idx.byId.get(id).status === 'pending') }); break;
      case 'assign-pic': openSheet('assign', { ids: [...S.sel] }); break;
      case 'del-sel': openSheet('delete', { ids: [...S.sel] }); break;
      case 'new-recipient': openSheet('recipient', { id: 0, ic: normIc(S.q) && /\d{6,}/.test(S.q) ? normIc(S.q) : '', name: /\d/.test(S.q) ? '' : S.q.trim() }); break;
      case 'qr': openSheet('qr', {}); break;
      case 'template': downloadTemplate(); break;
      case 'export': exportExcel(); break;
      case 'test-print': printReceipt({ id: 0, no: 'B0000', picName: 'Contoh PIC', picPhone: '012-3456789', picIc: '800101145678', qty: 3, items: [{ name: 'Penerima Satu', ic: '700101101234', qty: 1 }, { name: 'Penerima Dua', ic: '650505055678', qty: 2 }], issuedBy: C.user || 'Station', createdAt: new Date().toISOString() }); break;
      case 'logout': try { await api('logout', {}); } catch (err) { /* ignore */ } C.authed = false; S.data = null; clearInterval(pollT); render(); break;
    }
  }

  /* ---------- sheets ---------- */
  function closeSheet() { const el = $('.sheet-bg'); if (el) el.remove(); S.sheet = null; }
  function sheetShell(title, body, foot, wide) {
    return '<div class="sheet-bg" role="dialog" aria-modal="true" aria-label="' + esc(title) + '"><div class="sheet' + (wide ? ' sheet--wide' : '') + '"><div class="sheet__head"><h2>' + title + '</h2><button class="x" data-x aria-label="Close">×</button></div>' + body + (foot ? '<div class="sheet__foot">' + foot + '</div>' : '') + '</div></div>';
  }
  function openSheet(kind, arg, refresh) {
    const prev = $('.sheet-bg');
    const scroll = prev ? prev.querySelector('.sheet').scrollTop : 0;
    if (refresh && prev && prev.querySelector('input:focus, textarea:focus, select:focus')) return; // do not disturb typing
    if (prev) prev.remove();
    S.sheet = { kind, arg, live: kind === 'picgroup' };
    const html = SHEETS[kind](arg);
    if (!html) { S.sheet = null; return; }
    document.body.insertAdjacentHTML('beforeend', html);
    const bg = $('.sheet-bg');
    bg.querySelector('.sheet').scrollTop = scroll;
    bg.addEventListener('click', (e) => { if (e.target === bg || e.target.closest('[data-x]')) closeSheet(); });
    const first = bg.querySelector('[autofocus]');
    if (first && !refresh) first.focus();
    (BIND[kind] || (() => {}))(bg, arg);
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.sheet) closeSheet(); });

  function picFields(p, prefix) {
    p = p || {};
    return '<div class="grid grid-2" style="gap:0 12px"><label class="field"><span>PIC name (who collects)</span><input class="input" name="picName" value="' + esc(p.name) + '" required maxlength="120" ' + (prefix || '') + '></label>' +
      '<label class="field"><span>PIC phone</span><input class="input" name="picPhone" value="' + esc(p.phone) + '" inputmode="tel" maxlength="40"></label></div>' +
      '<label class="field"><span>PIC IC number</span><input class="input mono" name="picIc" value="' + esc(fmtIc(p.ic)) + '" inputmode="numeric" maxlength="24"></label>';
  }
  const SHEETS = {
    collect(a) {
      const rows = a.ids.map((id) => idx.byId.get(id)).filter(Boolean);
      if (!rows.length) { toast('Nothing to collect', true); return ''; }
      const done = rows.filter((r) => r.status !== 'pending');
      let pic = a.pic;
      if (!pic) {
        const keys = new Set(rows.map((r) => r.picName ? r.picName + '|' + r.picPhone + '|' + r.picIc : ''));
        if (keys.size === 1 && rows[0].picName) pic = { name: rows[0].picName, phone: rows[0].picPhone, ic: rows[0].picIc };
        else if (rows.length === 1) pic = { name: rows[0].name, phone: rows[0].phone, ic: rows[0].ic, self: true };
        else pic = {};
      }
      const qty = rows.reduce((s, r) => s + r.qty, 0);
      return sheetShell('Collect bantuan', '<form id="cf">' +
        (done.length ? '<div class="note note--bad"><b>Already collected:</b> ' + done.map((r) => esc(r.name)).join(', ') + '. Remove them first.</div>' : '') +
        '<div class="list" style="max-height:240px;overflow:auto">' + rows.map((r) => '<div class="item"><div class="item__main"><div class="item__title">' + esc(r.name) + '</div><div class="item__meta mono">' + esc(fmtIc(r.ic)) + '</div></div>' + (r.qty > 1 ? '<span class="pill pill--info">×' + r.qty + '</span>' : '') + '</div>').join('') + '</div>' +
        '<div class="big-count"><span><b style="font-size:15px;color:var(--text)">Bilangan untuk dipungut</b><br><span class="sm muted">Number to collect</span></span><b>' + qty + '</b></div>' +
        (pic.self ? '<div class="note note--info">Filled in with the recipient’s own details. Change it if someone else is collecting.</div>' : '') +
        picFields(pic, 'autofocus') +
        '<p class="sm muted" style="margin:0">Check the PIC’s IC card before you hand over the bantuan.</p></form>',
        '<button class="btn" data-x>Cancel</button><button class="btn btn--primary btn--lg" id="cgo"' + (done.length ? ' disabled' : '') + '>Mark collected & print 2 copies</button>');
    },
    claim(a) {
      const c = idx.claimById.get(a.id);
      if (!c) return '';
      const live = claimLive(c, true);
      const ok = live.filter((x) => x.state === 'ok' && !x.untick);
      const label = { ok: ['pill--ok', 'Ready'], collected: ['pill--bad', 'Already collected'], mine: ['pill--ok', 'Collected on this form'], notfound: ['pill--bad', 'Not on the list'] };
      return sheetShell('QR form <span class="ref" style="font-size:22px;margin-left:6px">' + esc(c.ref) + '</span>',
        '<div class="card" style="margin-bottom:12px"><div class="hud">PIC · check their IC card</div><div style="font-size:19px;font-weight:800;margin-top:4px">' + esc(c.picName) + '</div><div class="mono" style="font-size:17px">IC ' + esc(fmtIc(c.picIc)) + '</div><div class="mono">' + esc(c.picPhone) + '</div><div class="sm muted">Sent ' + esc(fmtDT(c.createdAt)) + '</div></div>' +
        (c.status === 'done' ? '<div class="note note--ok">Done. Receipt ' + esc((idx.rcById.get(c.receiptId) || {}).no || '') + ' was printed for this form.</div>' : '') +
        (c.status === 'rejected' ? '<div class="note note--bad">Rejected' + (c.note ? ': ' + esc(c.note) : '') + '</div>' : '') +
        '<div class="list">' + live.map((x, i) => {
          const r = x.r, l = label[x.state];
          const other = x.state === 'ok' && x.other ? '<div class="item__meta" style="color:var(--warn)">Also on form ' + esc(x.other) + '</div>' : '';
          return '<label class="item"' + (x.state === 'ok' && c.status === 'new' ? '' : ' style="opacity:.8"') + '>' +
            (c.status === 'new' ? '<input type="checkbox" class="check" data-ci="' + i + '"' + (x.state === 'ok' ? (x.untick ? '' : ' checked') : ' disabled') + '>' : '') +
            '<div class="item__main"><div class="item__title">' + (r ? esc(r.name) : (x.typed ? esc(x.typed) + ' <span class="muted" style="font-weight:500">(as typed)</span>' : 'IC ' + esc(fmtIc(x.ic)))) + (r && r.qty > 1 ? ' <span class="pill pill--info">×' + r.qty + '</span>' : '') + '</div>' +
            (r && x.typed && fold(x.typed) !== fold(r.name) && !fold(r.name).includes(fold(x.typed)) ? '<div class="item__meta">PIC typed: ' + esc(x.typed) + '</div>' : '') +
            (x.state === 'ok' && c.status === 'new' && !vouched(r, c) ? '<div class="item__meta" style="color:var(--bad);font-weight:600">Not this PIC on the list: ask for this person’s IC card or a copy</div>' : '') +
            '<div class="item__meta mono">' + esc(fmtIc(x.ic)) + (x.how === 'assigned' ? ' · <b>on the list under this PIC</b>, not on their form' : '') + (r && r.picName && fold(r.picName) !== fold(c.picName) ? ' · list PIC: ' + esc(r.picName) : '') + '</div>' + other + '</div>' +
            '<span class="pill ' + l[0] + '">' + l[1] + '</span>' +
            (x.state === 'notfound' && c.status === 'new' ? '<button type="button" class="btn btn--sm" data-addic="' + esc(x.ic) + '" data-addnm="' + esc(x.typed || '') + '">Add to list</button>' : '') + '</label>';
        }).join('') + '</div>' +
        (c.status === 'new' && live.some((x) => x.untick) ? '<button type="button" class="btn btn--sm" id="tickall" style="margin-top:8px">Tick all ' + live.filter((x) => x.untick).length + ' names listed under this PIC</button>' : '') +
        (c.note === 'listed' ? '<div class="note note--info">The PIC says they are named as PIC on the list. Check their IC card, then tick their names.</div>' : '') +
        (c.status === 'new' ? '<div class="big-count"><span><b style="font-size:15px;color:var(--text)">Bilangan untuk dipungut</b><br><span class="sm muted">Number to collect</span></span><b id="cqty">' + ok.reduce((s, x) => s + x.r.qty, 0) + '</b></div>' : ''),
        c.status === 'new'
          ? '<button class="btn btn--danger" id="crej">Reject</button><div class="spacer"></div><button class="btn" data-x>Close</button><button class="btn btn--primary btn--lg" id="cgo"' + (ok.length ? '' : ' disabled') + '>Confirm & print 2 copies</button>'
          : (c.status === 'rejected' ? '<button class="btn" id="creopen">Reopen</button>' : '') + '<div class="spacer"></div>' + (c.receiptId ? '<button class="btn" data-reprint="' + c.receiptId + '">Print receipt again</button>' : '') + '<button class="btn" data-x>Close</button>', true);
    },
    recipient(a) {
      const r = a.id ? idx.byId.get(a.id) : { id: 0, name: a.name || '', ic: a.ic || '', phone: '', email: '', qty: 1, picName: '', picPhone: '', picIc: '', notes: '', status: 'pending' };
      if (!r) return '';
      const locked = r.status !== 'pending';
      const rc = r.receiptId ? idx.rcById.get(r.receiptId) : null;
      return sheetShell(a.id ? esc(r.name) : 'Add a recipient', '<form id="rf">' +
        (locked ? '<div class="note note--ok">Collected ' + esc(fmtDT(r.collectedAt)) + ' by ' + esc(r.picName) + (rc ? ' on receipt ' + esc(rc.no) : '') + '. Name, IC, PIC and quantity are locked; an admin can cancel the receipt to change them.</div>' : '') +
        '<label class="field"><span>Name</span><input class="input" name="name" value="' + esc(r.name) + '" required maxlength="160" autofocus' + (locked ? ' disabled' : '') + '></label>' +
        '<div class="grid grid-2" style="gap:0 12px"><label class="field"><span>IC number</span><input class="input mono" name="ic" value="' + esc(fmtIc(r.ic)) + '" maxlength="24" inputmode="numeric"' + (locked ? ' disabled' : '') + '></label>' +
        '<label class="field"><span>Phone</span><input class="input" name="phone" value="' + esc(r.phone) + '" maxlength="40" inputmode="tel"></label>' +
        '<label class="field"><span>Email</span><input class="input" name="email" type="email" value="' + esc(r.email) + '" maxlength="160"></label>' +
        '<label class="field"><span>Quantity (packs)</span><input class="input" name="qty" type="number" min="1" max="99" value="' + esc(r.qty) + '"' + (locked ? ' disabled' : '') + '></label></div>' +
        '<fieldset style="border:0;padding:0;margin:0"' + (locked ? ' disabled' : '') + '>' + picFields({ name: r.picName, phone: r.picPhone, ic: r.picIc }) + '</fieldset>' +
        '<label class="field"><span>Notes</span><input class="input" name="notes" value="' + esc(r.notes) + '" maxlength="500"></label></form>',
        (rc ? '<button class="btn" data-reprint="' + rc.id + '">Print receipt</button>' : '') + '<div class="spacer"></div><button class="btn" data-x>Cancel</button>' +
        (r.status === 'pending' ? '<button class="btn btn--gold" id="rcollect">' + (a.id ? 'Collect' : 'Save & collect') + '</button>' : '') + '<button class="btn btn--primary" id="rsave">Save</button>');
    },
    assign(a) {
      const rows = a.ids.map((id) => idx.byId.get(id)).filter((r) => r && r.status === 'pending');
      return sheetShell('Set PIC for ' + rows.length + ' name' + (rows.length === 1 ? '' : 's'), '<form id="af"><p class="sm muted" style="margin-top:0">' + rows.slice(0, 12).map((r) => esc(r.name)).join(', ') + (rows.length > 12 ? ' and ' + (rows.length - 12) + ' more' : '') + '</p>' + picFields({}, 'autofocus') + '<p class="sm muted">Leave the name empty to clear the PIC.</p></form>',
        '<button class="btn" data-x>Cancel</button><button class="btn btn--primary" id="ago">Save PIC</button>');
    },
    delete(a) {
      const rows = a.ids.map((id) => idx.byId.get(id)).filter((r) => r && r.status === 'pending');
      return sheetShell('Delete ' + rows.length + ' name' + (rows.length === 1 ? '' : 's') + '?', '<p>' + rows.slice(0, 20).map((r) => esc(r.name)).join(', ') + (rows.length > 20 ? ' and ' + (rows.length - 20) + ' more' : '') + ' will be taken off the list. Collected names are never deleted.</p>',
        '<button class="btn" data-x>Cancel</button><button class="btn btn--danger" id="dgo">Delete</button>');
    },
    picgroup(a) {
      const g = picGroups().find((x) => x.key === a.key);
      if (!g) return '';
      const pend = g.rows.filter((r) => r.status === 'pending');
      return sheetShell(esc(g.name), '<p class="mono" style="margin-top:0">' + esc(g.phone) + (g.ic ? ' · IC ' + esc(fmtIc(g.ic)) : '') + '</p><div class="list">' + g.rows.map((r) => recipientRow(r, { check: false })).join('') + '</div>',
        '<button class="btn" data-x>Close</button>' + (pend.length ? '<button class="btn btn--gold btn--lg" data-pic-collect="' + esc(g.key) + '">Collect ' + pend.length + ' pending</button>' : ''), true);
    },
    receipt(a) {
      const x = idx.rcById.get(a.id);
      if (!x) return '';
      return sheetShell('Receipt ' + esc(x.no), '<div class="card" style="margin-bottom:12px"><div style="font-weight:800;font-size:18px">' + esc(x.picName) + '</div><div class="mono">' + esc(x.picPhone) + (x.picIc ? ' · IC ' + esc(fmtIc(x.picIc)) : '') + '</div><div class="sm muted">' + esc(fmtDT(x.createdAt)) + ' · by ' + esc(x.issuedBy) + '</div></div>' +
        (x.voidedAt ? '<div class="note note--bad">Cancelled ' + esc(fmtDT(x.voidedAt)) + ' by ' + esc(x.voidedBy) + ': ' + esc(x.voidReason) + '</div>' : '') +
        '<div class="big-count"><span><b style="font-size:15px;color:var(--text)">Bilangan dipungut</b></span><b>' + x.qty + '</b></div>' +
        '<div class="list">' + x.items.map((it) => '<div class="item"><div class="item__main"><div class="item__title">' + esc(it.name) + '</div><div class="item__meta mono">' + esc(fmtIc(it.ic)) + '</div></div>' + (it.qty > 1 ? '<span class="pill pill--info">×' + it.qty + '</span>' : '') + '</div>').join('') + '</div>' +
        (!x.voidedAt && C.admin ? '<details style="margin-top:14px"><summary class="sm" style="cursor:pointer">Cancel this receipt (handed out by mistake)</summary><form id="vf" style="margin-top:10px"><label class="field"><span>Why is it cancelled?</span><input class="input" name="reason" required maxlength="300"></label><p class="sm muted">The names go back to pending so they can collect again.</p><button class="btn btn--danger">Cancel receipt</button></form></details>' : ''),
        '<button class="btn" data-x>Close</button><button class="btn btn--primary" data-reprint="' + x.id + '">Print again</button>', true);
    },
    qr() {
      const one = (key, url, title, text) => '<div class="card" style="flex:1;min-width:250px;margin:0"><div class="hud">' + title + '</div><div class="qr" style="margin:10px 0">' + qrSvg(url) + '</div>' +
        '<p class="sm" style="margin-top:0">' + text + '</p><p class="mono sm" style="overflow-wrap:anywhere"><a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(url) + '</a></p>' +
        '<div class="row"><button class="btn btn--gold btn--sm" data-poster="' + key + '">Print A4 poster</button><button class="btn btn--sm" data-copy="' + esc(url) + '">Copy link</button></div></div>';
      return sheetShell('QR codes for the forms', '<div class="row" style="align-items:stretch;gap:14px">' +
        one('self', C.selfUrl, 'Individu · own collection', 'For a recipient collecting their own bantuan: name, phone and IC only.') +
        one('pic', C.picUrl, 'PIC · many names', 'For a PIC collecting for many people: one row per person, or paste a whole list from WhatsApp or Excel, then submit once.') + '</div>' +
        (S.data.settings.formOpen ? '' : '<div class="note note--warn">The forms are closed right now. Open them in Setup.</div>'),
        '<button class="btn" data-x>Close</button>', true);
    },
    import(a) {
      const p = a.parsed;
      const fields = [['name', 'Name *'], ['ic', 'IC number'], ['phone', 'Phone'], ['email', 'Email'], ['qty', 'Quantity'], ['picName', 'PIC name'], ['picPhone', 'PIC phone'], ['picIc', 'PIC IC'], ['notes', 'Notes']];
      const opts = (sel) => '<option value="-1">(not in file)</option>' + p.headers.map((h, i) => '<option value="' + i + '"' + (sel === i ? ' selected' : '') + '>' + esc(h || 'Column ' + (i + 1)) + '</option>').join('');
      const rows = mapRows(p, a.map);
      const withIc = rows.filter((r) => normIc(r.ic)).length;
      const dupe = rows.length - new Set(rows.map((r) => normIc(r.ic) || Math.random())).size;
      const noName = rows.filter((r) => !String(r.name || '').trim()).length;
      const collected = S.data.recipients.some((r) => r.status !== 'pending');
      return sheetShell('Upload ' + esc(a.fileName), '<p class="sm muted" style="margin-top:0">Sheet “' + esc(p.sheet) + '”, header on row ' + (p.headerRow + 1) + '. Check which column is which.</p>' +
        '<div class="grid grid-4" style="gap:8px 12px">' + fields.map((f) => '<label class="field" style="margin:0"><span>' + f[1] + '</span><select class="input" data-map="' + f[0] + '">' + opts(a.map[f[0]]) + '</select></label>').join('') + '</div>' +
        '<div class="grid grid-4" style="margin:14px 0"><div class="kpi"><b>' + num(rows.length) + '</b><span>Rows</span></div><div class="kpi"><b>' + num(withIc) + '</b><span>With IC</span></div><div class="kpi"><b>' + num(dupe) + '</b><span>Same IC twice (later row skipped)</span></div><div class="kpi"><b>' + num(noName) + '</b><span>No name (skipped)</span></div></div>' +
        '<div class="table-wrap"><table class="tbl"><thead><tr><th>#</th>' + fields.filter((f) => a.map[f[0]] >= 0).map((f) => '<th>' + f[1].replace(' *', '') + '</th>').join('') + '</tr></thead><tbody>' +
        rows.slice(0, 8).map((r) => '<tr><td>' + r.line + '</td>' + fields.filter((f) => a.map[f[0]] >= 0).map((f) => '<td>' + esc(f[0] === 'ic' || f[0] === 'picIc' ? fmtIc(normIc(r[f[0]])) : r[f[0]]) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>' +
        (rows.length > 8 ? '<p class="sm muted">First 8 of ' + num(rows.length) + ' rows.</p>' : '') +
        '<fieldset style="border:0;padding:0;margin:12px 0 0"><label class="row" style="margin-bottom:6px"><input type="radio" name="mode" value="add" checked> <span><b>Add or update</b> <span class="sm muted">New people are added; people already on the list (same IC) get the new details. Collected people are never touched.</span></span></label>' +
        (C.admin ? '<label class="row"><input type="radio" name="mode" value="replace"' + (collected ? ' disabled' : '') + '> <span><b>Replace the whole list</b> <span class="sm muted">' + (collected ? 'Not possible: collection has started.' : 'Deletes everyone now on the list first.') + '</span></span></label>' : '') + '</fieldset>' +
        '<div id="iprog"></div>',
        '<button class="btn" data-x>Cancel</button><button class="btn btn--primary btn--lg" id="igo"' + (a.map.name < 0 ? ' disabled' : '') + '>Import ' + num(rows.length - noName) + ' rows</button>', true);
    },
  };

  const BIND = {
    collect(bg, a) {
      const go = $('#cgo', bg);
      go && go.addEventListener('click', async () => {
        const f = $('#cf', bg);
        const pic = { name: f.picName.value.trim(), phone: f.picPhone.value.trim(), ic: f.picIc.value.trim() };
        if (!pic.name) { f.picName.focus(); toast('Enter who is collecting (PIC name)', true); return; }
        await doCollect(a.ids, pic, 0, go);
      });
    },
    claim(bg, a) {
      const c = idx.claimById.get(a.id);
      const live = claimLive(c, true);
      const upd = () => { const q = $$('[data-ci]', bg).filter((x) => x.checked).reduce((s, x) => s + live[+x.dataset.ci].r.qty, 0); const el = $('#cqty', bg); if (el) el.textContent = q; const g = $('#cgo', bg); if (g) g.disabled = !q; };
      $$('[data-ci]', bg).forEach((x) => x.addEventListener('change', upd));
      const ta = $('#tickall', bg);
      ta && ta.addEventListener('click', () => { $$('[data-ci]', bg).forEach((x) => { if (live[+x.dataset.ci].untick) x.checked = true; }); upd(); });
      const go = $('#cgo', bg);
      go && go.addEventListener('click', async () => {
        const ids = $$('[data-ci]', bg).filter((x) => x.checked).map((x) => live[+x.dataset.ci].r.id);
        await doCollect(ids, { name: c.picName, phone: c.picPhone, ic: c.picIc }, c.id, go);
      });
      const rej = $('#crej', bg);
      rej && rej.addEventListener('click', async () => {
        try { await api('claim', { id: c.id, status: 'rejected', note: 'Rejected at the station by ' + (C.user || 'station') }); await load(true); closeSheet(); renderMain(); toast('Form ' + c.ref + ' rejected'); } catch (err) { toast(err.message, true); }
      });
      const ro = $('#creopen', bg);
      ro && ro.addEventListener('click', async () => { try { await api('claim', { id: c.id, status: 'new' }); await load(true); openSheet('claim', a); renderMain(); } catch (err) { toast(err.message, true); } });
      $$('[data-addic]', bg).forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); openSheet('recipient', { id: 0, ic: b.dataset.addic, name: b.dataset.addnm || '', back: a.id }); }));
      $$('[data-reprint]', bg).forEach((b) => b.addEventListener('click', () => printReceipt(idx.rcById.get(+b.dataset.reprint))));
    },
    recipient(bg, a) {
      const save = async (thenCollect) => {
        const f = $('#rf', bg);
        if (!f.name.value.trim()) { f.name.focus(); toast('A recipient needs a name', true); return; }
        try {
          const r = await api('recipient', { item: { id: a.id || 0, name: f.name.value, ic: f.ic.value, phone: f.phone.value, email: f.email.value, qty: f.qty.value, picName: f.picName.value, picPhone: f.picPhone.value, picIc: f.picIc.value, notes: f.notes.value } });
          await load(true); renderMain();
          if (thenCollect) openSheet('collect', { ids: [r.id] });
          else if (a.back) openSheet('claim', { id: a.back });
          else { closeSheet(); toast('Saved'); }
        } catch (err) { toast(err.message, true); }
      };
      $('#rsave', bg).addEventListener('click', () => save(false));
      const rc = $('#rcollect', bg);
      rc && rc.addEventListener('click', () => save(true));
      $$('[data-reprint]', bg).forEach((b) => b.addEventListener('click', () => printReceipt(idx.rcById.get(+b.dataset.reprint))));
    },
    assign(bg, a) {
      $('#ago', bg).addEventListener('click', async () => {
        const f = $('#af', bg);
        try { const j = await api('pic', { ids: a.ids, picName: f.picName.value, picPhone: f.picPhone.value, picIc: f.picIc.value }); await load(true); S.sel.clear(); closeSheet(); renderMain(); toast('PIC set for ' + j.updated + ' names'); } catch (err) { toast(err.message, true); }
      });
    },
    delete(bg, a) {
      $('#dgo', bg).addEventListener('click', async () => {
        try { const j = await api('recipient/delete', { ids: a.ids }); await load(true); S.sel.clear(); closeSheet(); renderMain(); toast(j.deleted + ' deleted'); } catch (err) { toast(err.message, true); }
      });
    },
    picgroup(bg) {
      $$('[data-pic-collect]', bg).forEach((b) => b.addEventListener('click', () => { const g = picGroups().find((x) => x.key === b.dataset.picCollect); openSheet('collect', { ids: g.rows.filter((r) => r.status === 'pending').map((r) => r.id), pic: { name: g.name, phone: g.phone, ic: g.ic } }); }));
      $$('[data-open]', bg).forEach((b) => b.addEventListener('click', () => openSheet('recipient', { id: +b.dataset.open })));
    },
    receipt(bg, a) {
      $$('[data-reprint]', bg).forEach((b) => b.addEventListener('click', () => printReceipt(idx.rcById.get(+b.dataset.reprint))));
      const vf = $('#vf', bg);
      vf && vf.addEventListener('submit', async (e) => {
        e.preventDefault();
        try { await api('void', { id: a.id, reason: vf.reason.value }); await load(true); renderMain(); openSheet('receipt', a); toast('Receipt cancelled. The names are pending again.'); } catch (err) { toast(err.message, true); }
      });
    },
    qr(bg) {
      $$('[data-copy]', bg).forEach((b) => b.addEventListener('click', () => { const u = b.dataset.copy; (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(() => toast('Link copied'), () => toast(u)); }));
      $$('[data-poster]', bg).forEach((b) => b.addEventListener('click', () => {
        const pic = b.dataset.poster === 'pic', url = pic ? C.picUrl : C.selfUrl;
        doPrint('<div class="poster"><h1>' + esc(S.data.settings.title) + '</h1><h2>' + (pic ? 'Borang PIC · Pungutan Pukal' : 'Borang Individu · Pungutan Sendiri') + '</h2><div class="qr">' + qrSvg(url) + '</div>' +
          (pic ? '<p><b>Wakil (PIC) yang memungut bagi ramai penerima:</b> imbas kod QR ini dan isi semua nama sekali gus.</p><p style="font-size:15px">PIC collecting for many people: scan and list everyone in one form.</p>'
            : '<p><b>Memungut bantuan sendiri?</b> Imbas kod QR ini dan isi nama, telefon dan no. KP anda.</p><p style="font-size:15px">Collecting your own bantuan? Scan and fill in your name, phone and IC.</p>') +
          '<p style="font-size:15px;margin-top:6mm">Selepas hantar, tunjukkan <b>nombor borang</b> dan <b>kad pengenalan</b> anda di kaunter.</p><p style="font-size:13px;margin-top:8mm">' + esc(url) + '</p></div>', 'a4');
      }));
    },
    import(bg, a) {
      $$('[data-map]', bg).forEach((s) => s.addEventListener('change', () => { a.map[s.dataset.map] = +s.value; openSheet('import', a); }));
      $('#igo', bg).addEventListener('click', async (e) => {
        const btn = e.target;
        const replace = (bg.querySelector('input[name=mode]:checked') || {}).value === 'replace';
        if (replace && !$('#iprog', bg).dataset.ok) { $('#iprog', bg).dataset.ok = '1'; $('#iprog', bg).innerHTML = '<div class="note note--warn">This deletes everyone on the list now. Press Import again to go ahead.</div>'; return; }
        const seenIc = new Set(), dupes = [];
        const rows = mapRows(a.parsed, a.map).filter((r) => {
          if (!String(r.name || '').trim()) return false;
          const ic = normIc(r.ic);
          if (ic && seenIc.has(ic)) { dupes.push(r.line); return false; }
          if (ic) seenIc.add(ic);
          return true;
        });
        btn.disabled = true; S.busy = true;
        const tot = { added: 0, updated: 0, skipped: 0, locked: 0, problems: [] };
        const batch = a.fileName.slice(0, 40) + ' ' + new Date().toISOString().slice(0, 10);
        try {
          for (let i = 0; i < rows.length; i += 400) {
            $('#iprog', bg).innerHTML = '<div class="note note--info">Importing ' + num(Math.min(i + 400, rows.length)) + ' of ' + num(rows.length) + '…</div>';
            const j = await api('import', { rows: rows.slice(i, i + 400), batch, replace: replace && i === 0 });
            ['added', 'updated', 'skipped', 'locked'].forEach((k) => (tot[k] += j[k]));
            tot.problems.push(...j.problems);
          }
          await load(true); S.busy = false; closeSheet(); S.tab = 'list'; S.filter = 'all'; render();
          toast('Done: ' + tot.added + ' added, ' + tot.updated + ' updated' + (tot.locked ? ', ' + tot.locked + ' already collected (left as is)' : '') + (tot.skipped ? ', ' + tot.skipped + ' skipped' : '') + (dupes.length ? '. Same IC twice, not imported: row ' + dupes.slice(0, 10).join(', ') + (dupes.length > 10 ? '…' : '') : ''), dupes.length > 0);
        } catch (err) { S.busy = false; btn.disabled = false; $('#iprog', bg).innerHTML = '<div class="note note--bad">' + esc(err.message) + ' Rows sent before this point are saved; importing again is safe.</div>'; }
      });
    },
  };

  async function doCollect(ids, pic, claimId, btn) {
    if (btn) btn.disabled = true;
    S.busy = true;
    try {
      const rc = await api('collect', { ids, pic, claimId });
      await load(true);
      S.busy = false;
      S.sel.clear();
      renderMain();
      S.q = ''; renderMain();
      openSheet('receipt', { id: rc.id });
      printReceipt(rc, true);
    } catch (err) {
      S.busy = false;
      if (btn) btn.disabled = false;
      toast(err.message, true);
      try { await load(true); renderMain(); } catch (e) { /* offline */ }
    }
  }

  /* ---------- printing ---------- */
  function receiptCopy(x, copy, again) {
    const s = S.data.settings;
    const many = x.items.length > 24;
    return '<div class="rc' + (x.voidedAt ? ' rc--void' : '') + '"><div class="rc__top"><div><div class="rc__title">' + esc(s.title) + '</div><div class="rc__sub">' + esc(s.subtitle) + '</div></div><div class="rc__copy">' + copy + (again ? '<br>CETAK SEMULA ' + esc(fmtDTlong(new Date().toISOString())) : '') + '</div></div>' +
      '<div class="rc__grid"><div><span>No. resit</span><b>' + esc(x.no) + '</b></div><div><span>Tarikh / masa</span><b>' + esc(fmtDTlong(x.createdAt)) + '</b></div>' +
      '<div><span>Nama PIC</span><b>' + esc(x.picName) + '</b></div><div><span>No. KP PIC · Telefon</span><b>' + esc(x.picIc ? maskIc(x.picIc) : '-') + (x.picPhone ? ' · ' + esc(x.picPhone) : '') + '</b></div></div>' +
      '<div class="rc__count"><span>Bilangan untuk dipungut</span><b>' + x.qty + '</b></div>' +
      '<ol class="rc__list' + (many ? ' rc__list--small' : '') + '">' + x.items.map((it) => '<li>' + esc(it.name) + ' <span>(' + esc(maskIc(it.ic)) + ')</span>' + (it.qty > 1 ? ' ×' + it.qty : '') + '</li>').join('') + '</ol>' +
      '<div class="rc__sign"><div>Tandatangan PIC</div><div>Pegawai stesen: ' + esc(x.issuedBy) + '</div></div><div class="rc__foot">' + esc(s.footer) + '</div></div>';
  }
  const printedOnce = new Set();
  function printReceipt(x, first) {
    if (!x) return;
    const paper = S.data.settings.paper;
    const again = !first && x.id > 0 && (printedOnce.has(x.id) || Date.now() - new Date(x.createdAt).getTime() > 120000);
    if (x.id) printedOnce.add(x.id);
    if (paper !== 'a4') { doPrint(rollCopy(x, 'Salinan PIC', again) + rollCopy(x, 'Salinan stesen', again), 'roll'); return; }
    doPrint('<div>' + receiptCopy(x, 'Salinan PIC', again) + '<div class="rc-cut"></div>' + receiptCopy(x, 'Salinan stesen', again) + '</div>', paper);
  }
  // narrow roll (Bluetooth / receipt printer): plain black text, one column, both copies one after the other
  function rollCopy(x, copy, again) {
    const s = S.data.settings;
    return '<div class="roll"><div class="roll__c"><b class="roll__t">' + esc(s.title) + '</b><div>' + esc(s.subtitle) + '</div></div>' +
      '<div class="roll__copy">' + copy + '</div>' + (again ? '<div class="roll__c"><b>** CETAK SEMULA **</b><br>' + esc(fmtDTlong(new Date().toISOString())) + '</div>' : '') +
      '<div class="roll__hr"></div><div>No. resit: <b>' + esc(x.no) + '</b></div><div>Tarikh: ' + esc(fmtDTlong(x.createdAt)) + '</div>' +
      '<div class="roll__hr"></div><div>Nama PIC:</div><div class="roll__big2">' + esc(x.picName) + '</div>' +
      (x.picIc ? '<div>No. KP: ' + esc(maskIc(x.picIc)) + '</div>' : '') + (x.picPhone ? '<div>Tel: ' + esc(x.picPhone) + '</div>' : '') +
      '<div class="roll__hr"></div><div class="roll__c">BILANGAN UNTUK DIPUNGUT</div><div class="roll__c roll__big">' + x.qty + '</div><div class="roll__hr"></div>' +
      '<ol class="roll__list">' + x.items.map((it) => '<li>' + esc(it.name) + ' (' + esc(maskIc(it.ic)) + ')' + (it.qty > 1 ? ' x' + it.qty : '') + '</li>').join('') + '</ol>' +
      '<div class="roll__sign">Tandatangan PIC</div><div class="roll__sign">Pegawai stesen: ' + esc(x.issuedBy) + '</div>' +
      '<div class="roll__c roll__foot">' + esc(s.footer) + '</div><div class="roll__cut">- - - - - potong - - - - -</div></div>';
  }
  function doPrint(html, paper) {
    const w = Math.max(30, Math.min(80, +S.data.settings.width || 40));
    printEl.innerHTML = '<style>' + (paper === 'roll' ? '@page { margin: 0; } #bt-print .roll { width: ' + w + 'mm; }' : '@page { size: A4; margin: 8mm; }') + '</style>' + html;
    document.body.classList.add('printing');
    const done = () => { document.body.classList.remove('printing'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => { window.print(); setTimeout(done, 500); }, 60);
  }
  function qrSvg(text) {
    if (typeof window.qrcode !== 'function') return '<p class="sm">QR library did not load. Link: ' + esc(text) + '</p>';
    const q = window.qrcode(0, 'M');
    q.addData(text);
    q.make();
    return q.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
  }

  /* ---------- Excel ---------- */
  const GUESS = {
    picName: /^(nama\s*)?(pic|wakil|pemungut|person\s*in\s*charge)(\s*nam[ae])?$|nama\s*(pic|wakil)|pic\s*name/i,
    picPhone: /(pic|wakil).*(tel|phone|hp|mobile)|(tel|phone|hp).*(pic|wakil)/i,
    picIc: /(pic|wakil).*(ic|kp|mykad|nric|kad)|(ic|kp|nric).*(pic|wakil)/i,
    name: /^(nama|name|full\s*name|nama\s*penuh|nama\s*penerima|penerima|recipient)$|nama|name/i,
    ic: /(^|\W)(ic|i\/c|nric|mykad|kp|k\/p|no\.?\s*kp|kad\s*pengenalan|identity|ic\s*no)($|\W)/i,
    phone: /tel|phone|hp|h\/p|mobile|bimbit|contact/i,
    email: /mail|emel/i,
    qty: /kuantiti|quantity|qty|bilangan|jumlah|unit|pek/i,
    notes: /catatan|notes?|remark|ulasan/i,
  };
  function guessMap(headers) {
    const map = {};
    const used = new Set();
    for (const k of ['picName', 'picPhone', 'picIc', 'email', 'qty', 'notes', 'ic', 'phone', 'name']) {
      const i = headers.findIndex((h, j) => !used.has(j) && GUESS[k].test(String(h || '').trim()));
      map[k] = i;
      if (i >= 0) used.add(i);
    }
    return map;
  }
  function readExcel(file) {
    if (!window.XLSX) { toast('The Excel reader has not loaded yet. Try again in a moment.', true); return; }
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const wb = window.XLSX.read(new Uint8Array(fr.result), { type: 'array' });
        let best = null;
        for (const name of wb.SheetNames) {
          const aoa = window.XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '' });
          for (let r = 0; r < Math.min(15, aoa.length); r++) {
            const map = guessMap(aoa[r].map(String));
            const score = Object.values(map).filter((i) => i >= 0).length + (map.name >= 0 ? 2 : 0);
            if (!best || score > best.score) best = { score, sheet: name, headerRow: r, headers: aoa[r].map((h) => String(h).trim()), aoa, map };
          }
        }
        if (!best || best.map.name < 0) {
          if (best) best.map.name = -1;
          if (!best) { toast('That file has no rows.', true); return; }
        }
        const parsed = { sheet: best.sheet, headerRow: best.headerRow, headers: best.headers, body: best.aoa.slice(best.headerRow + 1) };
        openSheet('import', { parsed, map: best.map, fileName: file.name });
      } catch (err) { toast('Could not read that file: ' + err.message, true); }
    };
    fr.readAsArrayBuffer(file);
  }
  function cell(v) {
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v);
    return String(v == null ? '' : v).trim();
  }
  function mapRows(p, map) {
    const out = [];
    p.body.forEach((row, i) => {
      if (!row.some((v) => String(v).trim() !== '')) return;
      const r = { line: p.headerRow + i + 2 };
      for (const k of Object.keys(map)) r[k] = map[k] >= 0 ? cell(row[map[k]]) : '';
      out.push(r);
    });
    return out;
  }
  function downloadTemplate() {
    const ws = window.XLSX.utils.aoa_to_sheet([
      ['Nama', 'No KP', 'Telefon', 'Emel', 'Kuantiti', 'Nama PIC', 'Telefon PIC', 'No KP PIC', 'Catatan'],
      ['Contoh: Muthu a/l Raman', '650101-10-1234', '012-3456789', 'muthu@contoh.my', 1, 'Lakshmi a/p Muthu', '013-9876543', '900202-14-5678', ''],
    ]);
    ws['!cols'] = [{ wch: 28 }, { wch: 16 }, { wch: 14 }, { wch: 22 }, { wch: 9 }, { wch: 24 }, { wch: 14 }, { wch: 16 }, { wch: 20 }];
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, 'Penerima');
    window.XLSX.writeFile(wb, 'Template_senarai_bantuan.xlsx');
  }
  function exportExcel() {
    const X = window.XLSX;
    const wb = X.utils.book_new();
    const rc = (id) => (idx.rcById.get(id) || {}).no || '';
    X.utils.book_append_sheet(wb, X.utils.json_to_sheet(S.data.recipients.map((r) => ({
      Nama: r.name, 'No KP': fmtIc(r.ic), Telefon: r.phone, Emel: r.email, Kuantiti: r.qty, Status: r.status === 'collected' ? 'Sudah dipungut' : 'Belum',
      'Nama PIC': r.picName, 'Telefon PIC': r.picPhone, 'No KP PIC': fmtIc(r.picIc), 'No resit': rc(r.receiptId), 'Masa pungut': r.collectedAt ? fmtDTlong(r.collectedAt) : '', 'Pegawai stesen': r.collectedBy, Catatan: r.notes,
    }))), 'Penerima');
    X.utils.book_append_sheet(wb, X.utils.json_to_sheet(S.data.receipts.map((x) => ({
      'No resit': x.no, Masa: fmtDTlong(x.createdAt), 'Nama PIC': x.picName, 'Telefon PIC': x.picPhone, 'No KP PIC': fmtIc(x.picIc), Bilangan: x.qty, Penerima: x.items.map((it) => it.name).join('; '),
      'Borang QR': x.claimId ? (idx.claimById.get(x.claimId) || {}).ref || '' : '', 'Pegawai stesen': x.issuedBy, Status: x.voidedAt ? 'Batal: ' + x.voidReason : 'Sah',
    }))), 'Resit');
    X.utils.book_append_sheet(wb, X.utils.json_to_sheet(S.data.claims.map((c) => ({
      'No borang': c.ref, Masa: fmtDTlong(c.createdAt), 'Nama PIC': c.picName, 'Telefon PIC': c.picPhone, 'No KP PIC': fmtIc(c.picIc), 'IC disenaraikan': c.items.map((it) => fmtIc(it.ic)).join('; '),
      Status: { new: 'Menunggu', done: 'Dicetak', rejected: 'Ditolak' }[c.status] || c.status, 'No resit': rc(c.receiptId),
    }))), 'Borang QR');
    X.writeFile(wb, 'Bantuan_Deepavali_Ampang_' + new Date().toISOString().slice(0, 10) + '.xlsx');
  }

  /* ---------- start ---------- */
  (async function start() {
    render();
    if (!C.authed) return;
    try { await load(true); render(); startPoll(); } catch (err) { root.innerHTML = '<div class="login"><div class="card"><p>' + esc(err.message) + '</p><button class="btn" onclick="location.reload()">Try again</button></div></div>'; }
  })();
})();
