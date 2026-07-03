'use strict';

/* ---------- storage keys ---------- */
const K_ITEMS = 'today.items.v1';
const K_CODE  = 'today.code.v1';

/* ---------- helpers ---------- */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const now = () => Date.now();

function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
const todayStr = () => ymd(new Date());
function tomorrowStr() { const d = new Date(); d.setDate(d.getDate() + 1); return ymd(d); }

function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'x' + now().toString(36) + Math.floor(Math.random() * 1e9).toString(36);
}
function randomCode() {
  const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const buf = crypto.getRandomValues(new Uint8Array(16));
  let out = '';
  for (let i = 0; i < 16; i++) { out += abc[buf[i] % abc.length]; if (i % 4 === 3 && i < 15) out += '-'; }
  return out;
}

/* ---------- state ---------- */
let items = load(K_ITEMS, []);
let code  = localStorage.getItem(K_CODE);
if (!code) { code = randomCode(); localStorage.setItem(K_CODE, code); }
let chipDay = 'today';           // phone add-bar target
const fresh = new Set();          // ids to animate in on next render

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function saveItems() { localStorage.setItem(K_ITEMS, JSON.stringify(items)); }

/* ---------- model ops (local-first) ----------
   Internal item: { id, text, due 'YYYY-MM-DD', done, deleted, updatedAt }
   Bucket is derived from `due` vs today, which gives free midnight rollover:
   a Tomorrow task (due = tomorrow) simply becomes Today when the date flips. */
function bucketOf(it) { return it.due <= todayStr() ? 'today' : 'tomorrow'; }

function addItem(text, day) {
  const t = text.trim();
  if (!t) return;
  const id = uid();
  items.push({ id, text: t, due: day === 'tomorrow' ? tomorrowStr() : todayStr(),
               done: false, deleted: false, updatedAt: now() });
  fresh.add(id);
  saveItems(); render(); queueSync();
}
function completeItem(id) {           // swipe right: finish (not kept)
  const it = items.find(i => i.id === id);
  if (!it) return;
  it.done = true; it.deleted = true; it.updatedAt = now();
  saveItems(); queueSync();           // render handled by the slide-out animation
}
function moveItem(id) {                // swipe left: flip to the other day
  const it = items.find(i => i.id === id);
  if (!it) return;
  it.due = bucketOf(it) === 'today' ? tomorrowStr() : todayStr();
  it.updatedAt = now();
  saveItems(); render(); queueSync();
}

/* ---------- rendering ---------- */
function render() {
  const buckets = { today: [], tomorrow: [] };
  for (const it of items) { if (!it.deleted) buckets[bucketOf(it)].push(it); }

  for (const day of ['today', 'tomorrow']) {
    const list = buckets[day];
    list.sort((a, b) => a.updatedAt - b.updatedAt);
    const ul = $('#list-' + day);
    ul.innerHTML = '';
    for (const it of list) ul.appendChild(renderRow(it, day));
    const n = list.length;
    $('#count-' + day).textContent = n === 1 ? '1 task' : n + ' tasks';
    $('#empty-' + day).style.display = n ? 'none' : '';
  }
  fresh.clear();
}

function renderRow(it, day) {
  const li = document.createElement('li');
  li.className = 'row' + (fresh.has(it.id) ? ' entering' : '');

  const under = document.createElement('div');
  under.className = 'under';
  const done = document.createElement('span');
  done.className = 'under-done'; done.textContent = 'DONE ✓';
  const move = document.createElement('span');
  move.className = 'under-move';
  move.textContent = day === 'today' ? '→ TOMORROW' : '→ TODAY';
  under.append(done, move);

  const fg = document.createElement('div');
  fg.className = 'fg';
  const dot = document.createElement('span'); dot.className = 'dot';
  const txt = document.createElement('span'); txt.className = 'txt'; txt.textContent = it.text;
  fg.append(dot, txt);

  li.append(under, fg);
  attachSwipe(fg, under, li, it.id);
  return li;
}

/* ---------- swipe (pointer events) ---------- */
const CLAMP = 110, THRESHOLD = 64;
const DONE_BG = '#C4944A', MOVE_BG = '#46433D';   // amber = finish, dark = move
function attachSwipe(fg, under, li, id) {
  let startX = 0, dx = 0, dragging = false;

  fg.addEventListener('pointerdown', e => {
    dragging = true; startX = e.clientX; dx = 0;
    fg.classList.add('dragging');
    try { fg.setPointerCapture(e.pointerId); } catch {}
  });
  fg.addEventListener('pointermove', e => {
    if (!dragging) return;
    dx = Math.max(-CLAMP, Math.min(CLAMP, e.clientX - startX));
    fg.style.transform = `translateX(${dx}px)`;
    under.style.backgroundColor = dx >= 0 ? DONE_BG : MOVE_BG;
  });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    fg.classList.remove('dragging');
    if (dx > THRESHOLD) {                       // finish → slide off, then remove
      fg.style.transform = 'translateX(440px)';
      fg.style.opacity = '0';
      completeItem(id);
      setTimeout(() => { li.remove(); render(); }, 380);
    } else if (dx < -THRESHOLD) {               // move to other day
      moveItem(id);                             // re-render places it in the other bucket
    } else {                                    // spring back
      fg.style.transform = 'translateX(0)';
    }
  };
  fg.addEventListener('pointerup', end);
  fg.addEventListener('pointercancel', end);
}

/* ---------- sync (per-item merge, newest-write-wins) ---------- */
let syncTimer = null, syncing = false;
function setDot(state) { $('#syncDot').className = 'dot-sync' + (state ? ' ' + state : ''); }
function queueSync() { clearTimeout(syncTimer); syncTimer = setTimeout(sync, 600); }

function mergeInto(incoming) {
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
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, items }),
    });
    if (!res.ok) throw new Error('sync ' + res.status);
    const data = await res.json();
    if (Array.isArray(data.items)) { mergeInto(data.items); render(); }
    setDot('ok'); $('#syncStatus').textContent = 'Synced just now.';
  } catch {
    setDot('err'); $('#syncStatus').textContent = 'Offline — saved on this device, will sync later.';
  } finally { syncing = false; }
}

/* ---------- date label ---------- */
function setDate() {
  const d = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  $('#dateLabel').textContent = d;
}

/* ---------- capture wiring ---------- */
// per-column add lines (iPad)
$$('.col-add').forEach(form => form.addEventListener('submit', e => {
  e.preventDefault();
  const input = $('input', form);
  addItem(input.value, form.dataset.day);
  input.value = ''; input.focus();
}));
// phone add bar
$('#addbar').addEventListener('submit', e => {
  e.preventDefault();
  const input = $('#barInput');
  addItem(input.value, chipDay);
  input.value = ''; input.focus();
});
$('#chip').addEventListener('click', () => {
  chipDay = chipDay === 'today' ? 'tomorrow' : 'today';
  const chip = $('#chip');
  chip.dataset.day = chipDay;
  chip.textContent = chipDay === 'today' ? 'TODAY' : 'TMRW';
  $('#barInput').placeholder = chipDay === 'today' ? 'Add for today…' : 'Add for tomorrow…';
});

/* ---------- sync sheet ---------- */
const sheet = $('#sheet');
$('#syncBtn').addEventListener('click', () => {
  $('#codeInput').value = code; $('#syncStatus').textContent = ''; sheet.hidden = false;
});
$('#closeSheet').addEventListener('click', () => sheet.hidden = true);
sheet.addEventListener('click', e => { if (e.target === sheet) sheet.hidden = true; });
$('#copyCode').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(code); $('#syncStatus').textContent = 'Code copied.'; }
  catch { $('#codeInput').select(); }
});
$('#applyCode').addEventListener('click', () => {
  const v = $('#codeInput').value.trim().toUpperCase();
  if (!v) return;
  code = v; localStorage.setItem(K_CODE, code);
  $('#syncStatus').textContent = 'Pulling that list…'; sync();
});
$('#newCode').addEventListener('click', () => {
  code = randomCode(); localStorage.setItem(K_CODE, code);
  $('#codeInput').value = code;
  $('#syncStatus').textContent = 'New code created. Paste it on your other devices to pair.'; sync();
});

/* ---------- lifecycle ---------- */
document.addEventListener('visibilitychange', () => { if (!document.hidden) { setDate(); render(); sync(); } });
window.addEventListener('online', sync);
window.addEventListener('focus', () => { setDate(); render(); });

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

/* first paint */
setDate();
render();
sync();
