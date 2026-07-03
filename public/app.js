'use strict';

/* ---------- storage keys ---------- */
const K_ITEMS = 'today.items.v1';
const K_CODE  = 'today.code.v1';

/* ---------- tiny helpers ---------- */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const now = () => Date.now();

function ymd(d) {
  // local YYYY-MM-DD
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function todayStr() { return ymd(new Date()); }
function tomorrowStr() { const d = new Date(); d.setDate(d.getDate() + 1); return ymd(d); }

function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'x' + now().toString(36) + Math.floor(Math.random() * 1e9).toString(36);
}
function randomCode() {
  // human-friendly, hard to guess: 4 groups of 4 (no ambiguous chars)
  const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const buf = crypto.getRandomValues(new Uint8Array(16));
  let out = '';
  for (let i = 0; i < 16; i++) {
    out += abc[buf[i] % abc.length];
    if (i % 4 === 3 && i < 15) out += '-';
  }
  return out;
}

/* ---------- state ---------- */
let items = load(K_ITEMS, []);
let code  = localStorage.getItem(K_CODE);
if (!code) { code = randomCode(); localStorage.setItem(K_CODE, code); }
let pickedWhen = 'today';

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function saveItems() { localStorage.setItem(K_ITEMS, JSON.stringify(items)); }

/* ---------- item ops (local-first) ---------- */
function addItem(text, when) {
  const t = text.trim();
  if (!t) return;
  items.push({
    id: uid(),
    text: t,
    due: when === 'tomorrow' ? tomorrowStr() : todayStr(),
    done: false,
    deleted: false,
    updatedAt: now(),
  });
  saveItems(); render(); queueSync();
}
function patch(id, fields) {
  const it = items.find(i => i.id === id);
  if (!it) return;
  Object.assign(it, fields, { updatedAt: now() });
  saveItems(); render(); queueSync();
}
const toggleDone = id => { const it = items.find(i => i.id === id); if (it) patch(id, { done: !it.done }); };
const removeItem = id => patch(id, { deleted: true });
function clearDone() {
  const stamp = now();
  items.forEach(i => { if (i.done && !i.deleted) { i.deleted = true; i.updatedAt = stamp; } });
  saveItems(); render(); queueSync();
}

/* ---------- rendering ---------- */
function bucketOf(it) {
  // overdue or scheduled for today -> Today; anything later -> Tomorrow
  return it.due <= todayStr() ? 'today' : 'tomorrow';
}

function render() {
  const buckets = { today: [], tomorrow: [] };
  for (const it of items) {
    if (it.deleted) continue;
    buckets[bucketOf(it)].push(it);
  }
  let anyDone = false;

  for (const name of ['today', 'tomorrow']) {
    const list = buckets[name];
    // active first, completed sink to the bottom; stable-ish by updatedAt
    list.sort((a, b) => (a.done - b.done) || (a.updatedAt - b.updatedAt));
    const ul = $('#list-' + name);
    ul.innerHTML = '';
    for (const it of list) {
      if (it.done) anyDone = true;
      ul.appendChild(renderItem(it));
    }
    $(`[data-empty="${name}"]`).style.display = list.length ? 'none' : '';
  }
  $('#clearDone').hidden = !anyDone;
}

function renderItem(it) {
  const li = document.createElement('li');
  li.className = 'item' + (it.done ? ' done' : '');

  const check = document.createElement('button');
  check.className = 'check';
  check.setAttribute('aria-label', it.done ? 'Mark not done' : 'Mark done');
  check.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l5 5L20 6"/></svg>';
  check.onclick = () => toggleDone(it.id);

  const txt = document.createElement('span');
  txt.className = 'txt';
  txt.textContent = it.text;

  const del = document.createElement('button');
  del.className = 'del';
  del.setAttribute('aria-label', 'Delete');
  del.textContent = '×';
  del.onclick = () => removeItem(it.id);

  li.append(check, txt, del);
  return li;
}

/* ---------- sync (per-item merge, last-write-wins) ---------- */
let syncTimer = null;
let syncing = false;

function setDot(state) {
  const d = $('#syncDot');
  d.className = 'dot' + (state === 'ok' ? ' on' : state === 'err' ? ' err' : '');
}
function queueSync() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(sync, 600);
}

function mergeInto(incoming) {
  // merge server items into local by id, newest updatedAt wins
  const byId = new Map(items.map(i => [i.id, i]));
  for (const s of incoming) {
    const cur = byId.get(s.id);
    if (!cur || (s.updatedAt || 0) > (cur.updatedAt || 0)) byId.set(s.id, s);
  }
  items = [...byId.values()];
  saveItems();
}

async function sync() {
  if (syncing || !navigator.onLine) return;
  syncing = true;
  try {
    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, items }),
    });
    if (!res.ok) throw new Error('sync ' + res.status);
    const data = await res.json();
    if (Array.isArray(data.items)) { mergeInto(data.items); render(); }
    setDot('ok');
    $('#syncStatus').textContent = 'Synced just now.';
  } catch (e) {
    setDot('err');
    $('#syncStatus').textContent = 'Offline — saved on this device, will sync later.';
  } finally {
    syncing = false;
  }
}

/* ---------- capture UI ---------- */
$('#capture').addEventListener('submit', e => {
  e.preventDefault();
  const input = $('#input');
  addItem(input.value, pickedWhen);
  input.value = '';
  input.focus();
});
$$('.seg').forEach(seg => seg.addEventListener('click', () => {
  $$('.seg').forEach(s => s.classList.remove('is-on'));
  seg.classList.add('is-on');
  pickedWhen = seg.dataset.when;
}));
$('#clearDone').addEventListener('click', clearDone);

/* ---------- sync sheet ---------- */
const sheet = $('#sheet');
function openSheet() {
  $('#codeInput').value = code;
  $('#syncStatus').textContent = '';
  sheet.hidden = false;
}
function closeSheet() { sheet.hidden = true; }

$('#syncBtn').addEventListener('click', openSheet);
$('#closeSheet').addEventListener('click', closeSheet);
sheet.addEventListener('click', e => { if (e.target === sheet) closeSheet(); });

$('#copyCode').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(code); $('#syncStatus').textContent = 'Code copied.'; }
  catch { $('#codeInput').select(); }
});
$('#applyCode').addEventListener('click', () => {
  const v = $('#codeInput').value.trim().toUpperCase();
  if (!v) return;
  code = v; localStorage.setItem(K_CODE, code);
  $('#syncStatus').textContent = 'Pulling that list…';
  sync();
});
$('#newCode').addEventListener('click', () => {
  code = randomCode(); localStorage.setItem(K_CODE, code);
  $('#codeInput').value = code;
  $('#syncStatus').textContent = 'New code created. Items on this device stay; paste this on your other devices.';
  sync();
});

/* ---------- lifecycle ---------- */
document.addEventListener('visibilitychange', () => { if (!document.hidden) { render(); sync(); } });
window.addEventListener('online', sync);
window.addEventListener('focus', render);

/* service worker */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

/* first paint + initial sync */
render();
sync();
