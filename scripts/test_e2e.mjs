import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { handleSync } from '../src/sync.js';
import { handleLogin, handleLogout } from '../src/auth.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PASSWORD = 'test-pass-123';

const kv = new Map();
const env = { APP_PASSWORD: PASSWORD, TODOS: { get: async k => kv.get(k) ?? null, put: async (k, v) => kv.set(k, v) } };
const MIME = { '.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json',
  '.webmanifest':'application/manifest+json','.png':'image/png','.otf':'font/otf','.ttf':'font/ttf' };

async function relay(handler, req, res) {
  const chunks = []; for await (const c of req) chunks.push(c);
  const request = new Request('http://127.0.0.1' + req.url, { method: 'POST',
    headers: { 'content-type': 'application/json', ...(req.headers.cookie ? { cookie: req.headers.cookie } : {}) },
    body: chunks.length ? Buffer.concat(chunks) : undefined });
  const r = await handler(request, env);
  const headers = {}; for (const [k, v] of r.headers) headers[k] = v;
  res.writeHead(r.status, headers); res.end(await r.text());
}

const server = http.createServer(async (req, res) => {
  if (req.url === '/api/sync')   return relay(handleSync, req, res);
  if (req.url === '/api/login')  return relay(handleLogin, req, res);
  if (req.url === '/api/logout') return relay(handleLogout, req, res);
  if (req.url === '/api/transcribe') {   // mock Whisper (real one runs on the live Worker)
    for await (const _ of req) { /* drain */ }
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ text: 'mic test' })); return;
  }
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  try { const buf = await readFile(path.join(ROOT, p));
    res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf); }
  catch { res.writeHead(404); res.end('nope'); }
});
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: EXE,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });

let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? '  ok  ' : '  FAIL ') + m); c ? pass++ : fail++; };
const rowsIn = async (pg, day) => pg.$$eval(`#list-${day} .txt`, els => els.map(e => e.textContent));

async function login(pg, pw = PASSWORD) {
  await pg.waitForFunction(() => !document.getElementById('login').hidden, null, { timeout: 5000 });
  await pg.fill('#pw', pw);
  await pg.click('.login-btn');
}
async function swipe(pg, day, index, dx) {
  const fg = (await pg.$$(`#list-${day} .fg`))[index];
  const b = await fg.boundingBox();
  const y = b.y + b.height / 2, x0 = b.x + b.width / 2;
  await pg.mouse.move(x0, y); await pg.mouse.down();
  for (let i = 1; i <= 8; i++) await pg.mouse.move(x0 + (dx * i) / 8, y);
  await pg.mouse.up();
}

/* ══ PHONE (2a) — login gate + capture/swipe ══ */
const phoneCtx = await browser.newContext({ viewport: { width: 402, height: 844 }, permissions: ['microphone'] });
const phone = await phoneCtx.newPage();
phone.on('console', m => { if (m.type() === 'error') console.log('   [console.error]', m.text()); });
await phone.goto(base);

// login screen appears (sync returns 401 with no session)
await phone.waitForFunction(() => !document.getElementById('login').hidden, null, { timeout: 5000 });
ok(true, 'login screen shows until authenticated');
// wrong password -> error
await phone.fill('#pw', 'nope'); await phone.click('.login-btn');
await phone.waitForFunction(() => document.getElementById('loginErr').textContent.includes('Wrong'), null, { timeout: 3000 });
ok(true, 'wrong password shows an error');
// correct password -> app unlocks
await phone.fill('#pw', PASSWORD); await phone.click('.login-btn');
await phone.waitForFunction(() => document.getElementById('login').hidden, null, { timeout: 5000 });
ok(true, 'correct password unlocks the app');

ok(await phone.isVisible('#addbar'), 'phone shows the bottom add bar');
ok(await phone.isVisible('#addbar .mic'), 'mic button shows when recording is supported');

await phone.fill('#barInput', 'buy milk'); await phone.press('#barInput', 'Enter');
await phone.waitForSelector('#list-today .row');
ok((await rowsIn(phone, 'today')).includes('buy milk'), 'add via bar lands in Today');

await phone.click('#chip');
await phone.fill('#barInput', 'call vet'); await phone.press('#barInput', 'Enter');
await phone.waitForFunction(() => document.querySelectorAll('#list-tomorrow .row').length === 1);
ok((await rowsIn(phone, 'tomorrow')).includes('call vet'), 'chip=TMRW routes add to Tomorrow');

await swipe(phone, 'today', 0, -100);
await phone.waitForFunction(() => document.querySelectorAll('#list-today .row').length === 0);
ok((await rowsIn(phone, 'tomorrow')).includes('buy milk'), 'swipe-left moves task to the other day');

await swipe(phone, 'tomorrow', (await rowsIn(phone, 'tomorrow')).indexOf('call vet'), 100);
await phone.waitForFunction(t => !([...document.querySelectorAll('#list-tomorrow .txt')].some(e => e.textContent === t)),
  'call vet', { timeout: 3000 });
ok(!(await rowsIn(phone, 'tomorrow')).includes('call vet'), 'swipe-right finishes (removes) a task');

await phone.waitForFunction(() => document.querySelector('#syncDot').classList.contains('ok'), null, { timeout: 4000 });
ok(true, 'sync dot turns green');
await phone.reload();
// session cookie persists, so no login prompt on reload
await phone.waitForFunction(() => document.getElementById('login').hidden, null, { timeout: 5000 });
await phone.waitForSelector('#list-tomorrow .row');
ok((await rowsIn(phone, 'tomorrow')).includes('buy milk'), 'session persists across reload (no re-login)');

// mic: record (fake audio) -> transcribe (mocked) -> AUTO-ADDS to the day's list
await phone.click('#addbar .mic');
await phone.waitForTimeout(500);
await phone.click('#addbar .mic');   // fake device is never silent, so stop manually
await phone.waitForFunction(() => [...document.querySelectorAll('#list-today .txt')].some(e => e.textContent === 'mic test'),
  null, { timeout: 6000 });
ok(true, 'mic dictation auto-adds the spoken task');

/* ══ iPad (4a) — separate device logs in, shares the same list ══ */
const ipad = await (await browser.newContext({ viewport: { width: 1080, height: 810 } })).newPage();
await ipad.goto(base);
await login(ipad);
await ipad.waitForFunction(() => document.getElementById('login').hidden, null, { timeout: 5000 });
ok(await ipad.isVisible('.col-add'), 'iPad shows per-column add lines');
const boxes = await ipad.$$eval('.col', els => els.map(e => e.getBoundingClientRect().x));
ok(boxes.length === 2 && boxes[1] > boxes[0] + 200, 'iPad lays Today | Tomorrow side by side');
await ipad.waitForFunction(() => document.querySelectorAll('#list-tomorrow .row').length >= 1, null, { timeout: 5000 });
ok((await rowsIn(ipad, 'tomorrow')).includes('buy milk'), 'second device shares the list after its own login');

await browser.close(); server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
