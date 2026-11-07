// TODAY app: the screens from the Gate B canvas, TD-S01 to S04 (build steps B4 and B5).
// Lists come from the record core; every edit is a change saved through the store,
// queued on this device first so it works offline (TD-R34).
import * as C from './core.js';
import { loadCache as cacheOf, saveCache as keepCache, loadQueue as queueOf, saveQueue as keepQueue, standinStore, clearDevice } from './store.js';
import { githubStore, loadConn, saveConn, clearConn, GitHubError, REPO_RE, GUIDE, standinAllowed, standinFetch } from './github.js';

// ?standin: a made-up list on this device. ?standin=github: a stand-in for GitHub, to check Connect.
const params = new URLSearchParams(location.search);
const mode = standinAllowed() ? params.get('standin') : null;
const ns = mode === '' ? '.standin' : mode === 'github' ? '.ghstandin' : '';
const ghFetch = mode === 'github' ? standinFetch() : undefined;
const loadCache = () => cacheOf(ns), saveCache = (r) => keepCache(r, ns);
const loadQueue = () => queueOf(ns), saveQueue = (q) => keepQueue(q, ns);
let conn = mode === '' ? null : loadConn(ns);
let store = mode === '' ? standinStore() : conn ? githubStore(conn.repo, conn.token, ghFetch) : null;
let connectErr = '';
let connecting = false;
const $app = document.getElementById('app');
const $leds = document.getElementById('leds');
const $date = document.getElementById('date');
const $undo = document.getElementById('undo');

let today = C.ymd(new Date());
let base = store ? loadCache() : null; // the record as last read from the repo
let queue = store ? loadQueue() : [];  // changes not yet saved
let status = store ? 'reading' : 'none';
let note = '';                         // a one-line status strip
let noteGuide = false;                 // the strip links the Set up GitHub guide
let undo = null;                       // { label, change } for the last finish or move
let addDay = 'today';
let focusAfter = null;                 // a row to focus after the next render
let flushing = false;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- the list as shown: last read, plus anything not yet saved ---------- */

function shown() {
  let r = base || C.emptyRecord();
  for (const c of queue) { try { r = C.apply(r, c); } catch { /* the item went away elsewhere */ } }
  return r;
}

/* ---------- saving ---------- */

function change(c, undoLabel) {
  const before = shown();
  let back = null;
  if (undoLabel) { try { back = C.inverse(before, c); } catch { back = null; } }
  queue.push(c);
  saveQueue(queue);
  undo = undoLabel && back ? { label: undoLabel, change: back } : null;
  render();
  flush();
}

async function flush() {
  if (!store || flushing) return;
  flushing = true;
  while (queue.length) {
    status = 'saving'; renderLeds();
    try {
      const out = await C.save(store, queue[0], { today });
      base = out.record; saveCache(base);
      queue.shift(); saveQueue(queue);
      note = ''; noteGuide = false;
    } catch (err) {
      if (err instanceof C.RecordError && err.broken) { status = 'fault'; note = `Your items.json can't be read (${err.message}). Nothing was written over it; the last good version is in its history on GitHub.`; break; }
      if (err instanceof C.RecordError) { queue.shift(); saveQueue(queue); note = 'One change was skipped: that item is no longer on the list.'; continue; }
      if (err instanceof GitHubError) { status = 'attention'; note = err.message; noteGuide = err.kind !== 'other'; break; }
      if (err instanceof C.ConflictError) { status = 'attention'; note = 'Your list kept changing somewhere else while this was saving. It will try again.'; break; }
      status = 'offline'; break;
    }
  }
  if (!queue.length && status !== 'fault') status = 'saved';
  flushing = false;
  render();
}

async function refresh() {
  if (!store) return;
  today = C.ymd(new Date());
  if (queue.length) { flush(); return; }
  try {
    const got = await store.read();
    base = got ? C.parseRecord(got.text) : C.emptyRecord();
    saveCache(base);
    status = 'saved';
    if (!note.startsWith('One change')) { note = ''; noteGuide = false; }
  } catch (err) {
    if (err instanceof GitHubError) { status = 'attention'; note = err.message; noteGuide = err.kind !== 'other'; render(); return; }
    if (err instanceof C.RecordError && err.broken) { status = 'fault'; note = `Your items.json can't be read (${err.message}). Nothing will be written over it; the last good version is in its history on GitHub.`; }
    else status = base ? 'offline' : 'offline-empty';
  }
  render();
}

/* ---------- actions ---------- */

const textOf = (id) => shown().items.find((i) => i.id === id)?.text ?? '';

function finish(id) { const t = textOf(id); change(C.finishChange(id), `Finished: ${t}`); }
function move(id) {
  const r = shown();
  const c = C.moveChange(r, id, today);
  change(c, `Moved to ${c.due > today ? 'Tomorrow' : 'Today'}: ${textOf(id)}`);
}
function add(text, day) {
  try { change(C.addChange(text, day, { today, by: 'app' })); return true; } catch { return false; }
}
function runUndo() {
  if (!undo) return;
  const c = undo.change; undo = null;
  change(c);
}

/* ---------- rendering ---------- */

function render() {
  renderLeds();
  $date.textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const m = /^#item\/(.+)$/.exec(location.hash);
  if (m) renderItem(decodeURIComponent(m[1])); else renderLists();
  renderUndo();
}

function renderLeds() {
  const n = queue.length;
  const led = {
    saved: '<span class="led on-ok"><i></i>Saved</span>',
    saving: '<span class="led on-busy blink"><i></i>Saving</span>',
    reading: '<span class="led on-busy blink"><i></i>Reading your list</span>',
    offline: `<span class="led hollow"><i></i>${n ? `Not sent yet (${n})` : 'Offline'}</span>`,
    'offline-empty': '<span class="led hollow"><i></i>Offline</span>',
    attention: '<span class="led on-busy"><i></i>Needs you</span>',
    fault: '<span class="led on-fault"><i></i>Can\'t read your list</span>',
    none: '<span class="led on-busy"><i></i>Not connected</span>',
  }[status] || '';
  $leds.innerHTML = led;
}

// A row: the check circle and move button show only with a mouse or trackpad (TD-U13);
// on touch the words are the row, and it swipes (TD-U04, TD-U05).
const CHECK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 8.2l2.6 2.6L12 5.4"/></svg>';
function rowHtml(it, day) {
  const id = esc(it.id), text = esc(it.text), other = day === 'today' ? 'Tomorrow' : 'Today';
  return `<li><div class="under" aria-hidden="true"></div><div class="line" data-id="${id}" data-day="${day}">`
    + `<button type="button" class="check" data-act="check" aria-label="Finish: ${text}" title="Finish"><span class="ring">${CHECK}</span></button>`
    + `<button type="button" class="row" data-id="${id}" data-day="${day}"><span class="t">${text}</span>${it.rolledLabel ? `<span class="rolled mono">${esc(it.rolledLabel)}</span>` : ''}</button>`
    + `<button type="button" class="mv" data-act="mv" aria-label="Move to ${other.toLowerCase()}: ${text}">→ ${other}</button>`
    + '</div></li>';
}


function areaHtml(day, title, items, empty) {
  const primary = day === 'today' ? ' primary' : '';
  return `<section class="area" aria-labelledby="h-${day}">
<h2 id="h-${day}">${title}<span class="count mono">${items.length}</span></h2>
${items.length ? `<ul class="rows">${items.map((it) => rowHtml(it, day)).join('')}</ul>` : `<p class="empty">${empty}</p>`}
<form class="addline" data-day="${day}"><label class="sr" for="add-${day}">Add for ${day}</label><input class="field" id="add-${day}" placeholder="Add for ${day}…" autocomplete="off" enterkeyhint="done"><button class="key${primary}" type="submit">Add</button></form>
</section>`;
}

function renderLists() {
  if (!store) { renderConnect(); return; }
  if (status === 'reading' && !base) { $app.innerHTML = '<p class="small">Reading your list…</p>'; return; }
  if (status === 'offline-empty') { $app.innerHTML = '<div class="strip"><p>Can\'t reach your list, and this device hasn\'t saved a copy yet. Check the connection; it will try again.</p></div>'; return; }
  if (swipe.on && swipe.el) { swipe.redraw = true; return; } // never redraw under a finger
  const v = C.view(shown(), today);
  const keptRow = document.activeElement?.closest?.('.row')?.dataset.id || null;
  const kept = document.activeElement && document.activeElement.classList.contains('field') ? document.activeElement.id : null;
  const keptVal = kept ? document.activeElement.value : '';
  $app.innerHTML = `${note ? `<div class="strip${status === 'fault' ? ' fault' : ''}"><p>${esc(note)}</p>${noteGuide ? `<a class="key" href="${GUIDE}">How to make a token</a><button type="button" class="key primary" data-act="reconnect">Connect again</button>` : ''}</div>` : ''}
<div class="lists">${areaHtml('today', 'Today', v.today, 'All clear for today.')}${areaHtml('tomorrow', 'Tomorrow', v.tomorrow, 'Nothing planned.')}</div>
<p class="keys">Keys: <span class="mono">↑ ↓</span> move between items · <span class="mono">Enter</span> open · <span class="mono">D</span> done · <span class="mono">M</span> move to the other day · <span class="mono">Z</span> undo</p>
<form class="addbar" id="addbar" aria-label="Add an item">
<span class="seg" role="group" aria-label="Day"><button type="button" data-day="today" aria-pressed="${addDay === 'today'}">Today</button><button type="button" data-day="tomorrow" aria-pressed="${addDay === 'tomorrow'}">Tmrw</button></span>
<label class="sr" for="add-bar">New item</label><input class="field" id="add-bar" placeholder="Add for ${addDay}…" autocomplete="off" enterkeyhint="done">
<button class="key primary" type="submit">Add</button>
</form>`;
  if (kept) { const f = document.getElementById(kept); if (f) { f.value = keptVal; f.focus(); } }
  const want = focusAfter || keptRow;
  focusAfter = null;
  if (want) { const r = $app.querySelector(`.row[data-id="${CSS.escape(want)}"]`); if (r) r.focus(); }
}

// Connect (TD-S03, TD-U11): the repo name and a token, kept on this device only.
let lastRepo = '';
function renderConnect() {
  const last = document.getElementById('c-repo')?.value || lastRepo;
  $app.innerHTML = `<section class="connect">
<p>Your list lives in a private GitHub repo that you own. Connect it once on each device.</p>
<form id="connect" class="connect-form">
<label><span class="micro">Record repo</span><input class="field mono" id="c-repo" placeholder="owner/name" value="${esc(last)}" autocomplete="off" autocapitalize="off" spellcheck="false" required></label>
<label><span class="micro">Token</span><input class="field mono" id="c-token" type="password" autocomplete="off" required><span class="small">Use a fine-grained token for this one repo, Contents read and write. It stays on this device.</span></label>
${connectErr ? `<div class="strip fault" role="alert"><p>${esc(connectErr)}</p></div>` : ''}
<button class="key primary" type="submit"${connecting ? ' disabled' : ''}>${connecting ? 'Checking…' : 'Connect'}</button>
</form>
<a class="back" href="${GUIDE}">How to make the repo and token</a>
<div class="strip"><p><b>To add by voice from Claude:</b> connect GitHub in Claude's settings on a computer or claude.ai, give it this repo, and install the TODAY skill. Then say "/today" and the thing, from any chat.</p></div>
</section>`;
}

async function connect(repo, token) {
  repo = repo.trim().replace(/^https:\/\/github\.com\//, '').replace(/\/$/, '');
  if (!REPO_RE.test(repo)) { connectErr = 'Give the repo as owner/name, like yourname/Today-RECORD.'; render(); return; }
  connectErr = ''; connecting = true; render();
  document.getElementById('c-repo').value = repo;
  const s = githubStore(repo, token.trim(), ghFetch);
  try { await s.check(); } catch (err) {
    connecting = false;
    connectErr = err instanceof GitHubError ? err.message : 'GitHub can\'t be reached. Check the connection and try again.';
    render(); return;
  }
  connecting = false;
  saveConn(repo, token.trim(), ns);
  if (repo.toLowerCase() !== lastRepo.toLowerCase()) { clearDevice(ns); base = null; queue = []; } // same repo: keep unsent changes
  conn = { repo }; store = s; status = 'reading'; note = ''; noteGuide = false;
  render();
  refresh();
}

function renderItem(id) {
  const r = shown();
  const it = r.items.find((i) => i.id === id && !i.done);
  if (!it) { $app.innerHTML = '<div class="item"><a class="back" href="#">‹ Today</a><p>That item is no longer on the list.</p></div>'; return; }
  const day = C.dayOf(it, today);
  const rolled = it.due < today ? C.daysBetween(it.due, today) : 0;
  $app.innerHTML = `<div class="item" data-id="${esc(it.id)}">
<a class="back" href="#">‹ ${day === 'today' ? 'Today' : 'Tomorrow'}</a>
<label><span class="micro">Item</span><textarea id="itext" rows="3">${esc(it.text)}</textarea></label>
<dl><dt>Added</dt><dd><span class="mono">${esc(it.created || it.due)}</span> ${it.by === 'claude' ? 'by Claude' : 'in the app'}</dd>${rolled >= 2 ? `<dt>Rolled</dt><dd class="mono">${rolled} days</dd>` : ''}</dl>
<div class="group"><span class="micro">Day</span><span class="seg" role="group" aria-label="Day"><button type="button" data-set-day="today" aria-pressed="${day === 'today'}">Today</button><button type="button" data-set-day="tomorrow" aria-pressed="${day === 'tomorrow'}">Tomorrow</button></span></div>
<div class="pair"><button type="button" class="key" data-act="finish">Finish</button><button type="button" class="key" data-act="move">Move to ${day === 'today' ? 'tomorrow' : 'today'}</button></div>
<p class="small">Same as a swipe: right finishes, left moves. Undo shows on the list after either.</p>
<button type="button" class="key primary" data-act="save">Save words</button>
</div>`;
}

function renderUndo() {
  if (!undo || location.hash.startsWith('#item/')) { $undo.hidden = true; $undo.innerHTML = ''; return; }
  $undo.innerHTML = `<span>${esc(undo.label)}</span><button type="button" class="key" data-act="undo">Undo</button>`;
  $undo.hidden = false;
}

/* ---------- events ---------- */

$app.addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target;
  if (form.id === 'connect') { connect(document.getElementById('c-repo').value, document.getElementById('c-token').value); return; }
  const input = form.querySelector('.field');
  const day = form.id === 'addbar' ? addDay : form.dataset.day;
  if (input.value.trim() && add(input.value, day)) {
    const f = document.getElementById(input.id); if (f) { f.value = ''; f.focus(); }
  }
});

$app.addEventListener('click', (e) => {
  const seg = e.target.closest('#addbar .seg button');
  if (seg) { addDay = seg.dataset.day; render(); document.getElementById('add-bar')?.focus(); return; }
  const quick = e.target.closest('.line [data-act]');
  if (quick) {
    if (swipe.suppressClick) { swipe.suppressClick = false; return; }
    const line = quick.closest('.line');
    const rows = [...$app.querySelectorAll('.row')];
    const i = rows.findIndex((r) => r.dataset.id === line.dataset.id);
    if (quick.dataset.act === 'check') { focusAfter = (rows[i + 1] || rows[i - 1])?.dataset.id || null; finish(line.dataset.id); }
    else move(line.dataset.id);
    return;
  }
  const row = e.target.closest('.row');
  if (row) { if (swipe.suppressClick) { swipe.suppressClick = false; return; } location.hash = `#item/${encodeURIComponent(row.dataset.id)}`; return; }
  const item = e.target.closest('.item');
  if (!item) return;
  const id = item.dataset.id;
  const setDay = e.target.closest('[data-set-day]');
  if (setDay) {
    const due = setDay.dataset.setDay === 'tomorrow' ? C.addDays(today, 1) : today;
    if (shown().items.find((i) => i.id === id)?.due !== due) change(C.setDueChange(id, due));
    return;
  }
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'finish') { finish(id); location.hash = ''; }
  else if (act === 'move') { move(id); location.hash = ''; }
  else if (act === 'save') {
    const t = document.getElementById('itext').value;
    if (t.trim() && t.trim() !== textOf(id)) change(C.editChange(id, t));
    location.hash = '';
  }
});

$undo.addEventListener('click', (e) => { if (e.target.closest('[data-act="undo"]')) runUndo(); });

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-act="reconnect"]')) { lastRepo = conn?.repo || ''; clearConn(ns); store = null; conn = null; status = 'none'; note = ''; connectErr = ''; location.hash = ''; render(); document.getElementById('c-token')?.focus(); return; }
  if (e.target.closest('[data-act="disconnect"]')) { clearConn(ns); clearDevice(ns); location.href = location.pathname + location.search; }
});

// Keys on a computer (TD-U06): arrows between rows, Enter opens, D done, M move, Z undo.
document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const typing = e.target.closest('input, textarea');
  if (typing) return;
  if (e.key === 'z' || e.key === 'Z') { if (undo) { e.preventDefault(); runUndo(); } return; }
  const row = e.target.closest('.row');
  if (!row) return;
  const rows = [...$app.querySelectorAll('.row')];
  const i = rows.indexOf(row);
  const neighbour = () => (rows[i + 1] || rows[i - 1])?.dataset.id || null;
  if (e.key === 'ArrowDown' && rows[i + 1]) { e.preventDefault(); rows[i + 1].focus(); }
  else if (e.key === 'ArrowUp' && rows[i - 1]) { e.preventDefault(); rows[i - 1].focus(); }
  else if (e.key === 'd' || e.key === 'D') { e.preventDefault(); focusAfter = neighbour(); finish(row.dataset.id); }
  else if (e.key === 'm' || e.key === 'M') { e.preventDefault(); focusAfter = row.dataset.id; move(row.dataset.id); }
});

// Swipe (TD-U05): right finishes over an ink layer, left moves over ink-soft.
var swipe = { el: null, x: 0, y: 0, dx: 0, on: false, suppressClick: false, redraw: false };
const CLAMP = 120, THRESHOLD = 64;
$app.addEventListener('pointerdown', (e) => {
  const line = e.target.closest('.line');
  if (!line || e.button !== 0 || e.target.closest('[data-act]')) return;
  Object.assign(swipe, { el: line, x: e.clientX, y: e.clientY, dx: 0, on: false, pid: e.pointerId });
});

$app.addEventListener('paste', (e) => {
  const field = e.target.closest('.field');
  if (!field) return;
  const lines = C.pastedLines(e.clipboardData?.getData('text') || '');
  if (lines.length < 2) return;
  e.preventDefault();
  const form = field.closest('form');
  const day = form.id === 'addbar' ? addDay : form.dataset.day;
  try { change({ type: 'batch', changes: lines.map((l) => C.addChange(l, day, { today, by: 'app' })) }); } catch { /* nothing to add */ }
  const f = document.getElementById(field.id); if (f) { f.value = ''; f.focus(); }
});
$app.addEventListener('pointermove', (e) => {
  const s = swipe;
  if (!s.el || e.pointerId !== s.pid) return;
  const dx = e.clientX - s.x, dy = e.clientY - s.y;
  if (!s.on) {
    if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { s.el = null; return; }
    if (Math.abs(dx) < 10) return;
    s.on = true;
    s.el.classList.add('drag');
    try { s.el.setPointerCapture(e.pointerId); } catch { /* fine */ }
  }
  s.dx = Math.max(-CLAMP, Math.min(CLAMP, dx));
  s.el.style.transform = `translateX(${s.dx}px)`;
  const under = s.el.previousElementSibling;
  if (s.dx >= 0) { under.className = 'under'; under.textContent = 'Done ✓'; }
  else { under.className = 'under move'; under.textContent = s.el.dataset.day === 'today' ? '→ Tomorrow' : '→ Today'; }
});
function endSwipe() {
  const s = swipe;
  if (!s.el) return;
  const el = s.el, id = el.dataset.id;
  s.el = null;
  if (!s.on) return;
  s.suppressClick = true;
  setTimeout(() => { s.suppressClick = false; }, 400);
  el.classList.remove('drag');
  if (s.dx > THRESHOLD) {
    el.classList.add('gone'); el.style.transform = 'translateX(110%)';
    setTimeout(() => finish(id), 220);
  } else if (s.dx < -THRESHOLD) {
    el.classList.add('gone'); el.style.transform = 'translateX(-110%)';
    setTimeout(() => move(id), 220);
  } else {
    el.classList.add('settle'); el.style.transform = 'translateX(0)';
    if (s.redraw) { s.redraw = false; setTimeout(render, 200); }
  }
  s.on = false;
}
$app.addEventListener('pointerup', endSwipe);
$app.addEventListener('pointercancel', endSwipe);

/* ---------- keeping fresh (TD-R33) and the date rolling over ---------- */

window.addEventListener('hashchange', render);
window.addEventListener('online', () => { status = 'saving'; flush(); refresh(); });
window.addEventListener('offline', () => { status = 'offline'; renderLeds(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
window.addEventListener('focus', refresh);
setInterval(() => { if (!document.hidden && navigator.onLine !== false) refresh(); }, 15000);
setInterval(() => { const d = C.ymd(new Date()); if (d !== today) { today = d; render(); } }, 60000);

render();
refresh();
