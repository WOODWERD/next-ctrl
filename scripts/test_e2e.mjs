import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { handleSync } from '../src/sync.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const kv = new Map();
const env = { TODOS: { get: async k => kv.get(k) ?? null, put: async (k, v) => kv.set(k, v) } };
const MIME = { '.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json',
  '.webmanifest':'application/manifest+json','.png':'image/png','.otf':'font/otf','.ttf':'font/ttf' };

const server = http.createServer(async (req, res) => {
  if (req.url === '/api/sync' && req.method === 'POST') {
    const chunks = []; for await (const c of req) chunks.push(c);
    const r = await handleSync(new Request('http://x/api/sync', { method:'POST',
      headers:{'content-type':'application/json'}, body: Buffer.concat(chunks) }), env);
    res.writeHead(r.status, { 'content-type':'application/json' }); res.end(await r.text()); return;
  }
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  try { const buf = await readFile(path.join(ROOT, p));
    res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf); }
  catch { res.writeHead(404); res.end('nope'); }
});
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: EXE });

let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? '  ok  ' : '  FAIL ') + m); c ? pass++ : fail++; };
const rowsIn = async (pg, day) => pg.$$eval(`#list-${day} .txt`, els => els.map(e => e.textContent));

// swipe a row's foreground by dx px (>0 right = finish, <0 left = move)
async function swipe(pg, day, index, dx) {
  const fg = (await pg.$$(`#list-${day} .fg`))[index];
  const b = await fg.boundingBox();
  const y = b.y + b.height / 2, x0 = b.x + b.width / 2;
  await pg.mouse.move(x0, y); await pg.mouse.down();
  const steps = 8;
  for (let i = 1; i <= steps; i++) await pg.mouse.move(x0 + (dx * i) / steps, y);
  await pg.mouse.up();
}

/* ══ PHONE (2a) ══ */
const phone = await (await browser.newContext({ viewport: { width: 402, height: 844 } })).newPage();
phone.on('console', m => { if (m.type() === 'error') console.log('   [console.error]', m.text()); });
await phone.goto(base);

ok(await phone.isVisible('#addbar'), 'phone shows the bottom add bar');
ok(!(await phone.isVisible('.col-add')), 'phone hides per-column add lines');

// add via bar (default Today)
await phone.fill('#barInput', 'buy milk');
await phone.press('#barInput', 'Enter');
await phone.waitForSelector('#list-today .row');
ok((await rowsIn(phone, 'today')).includes('buy milk'), 'add via bar lands in Today');
ok((await phone.textContent('#count-today')) === '1 task', 'Today count reads "1 task"');

// toggle chip to Tomorrow, add
await phone.click('#chip');
ok((await phone.textContent('#chip')) === 'TMRW', 'chip toggles to TMRW');
await phone.fill('#barInput', 'call vet');
await phone.press('#barInput', 'Enter');
await phone.waitForFunction(() => document.querySelectorAll('#list-tomorrow .row').length === 1);
ok((await rowsIn(phone, 'tomorrow')).includes('call vet'), 'chip=TMRW routes add to Tomorrow');

// swipe LEFT to move "buy milk" from Today -> Tomorrow
await swipe(phone, 'today', 0, -100);
await phone.waitForFunction(() => document.querySelectorAll('#list-today .row').length === 0);
ok((await rowsIn(phone, 'tomorrow')).includes('buy milk'), 'swipe-left moves task to the other day');

// swipe RIGHT to finish "call vet"
const beforeCount = (await rowsIn(phone, 'tomorrow')).length;
await swipe(phone, 'tomorrow', (await rowsIn(phone, 'tomorrow')).indexOf('call vet'), 100);
await phone.waitForFunction(t => !([...document.querySelectorAll('#list-tomorrow .txt')].some(e => e.textContent === t)),
  'call vet', { timeout: 3000 });
ok((await rowsIn(phone, 'tomorrow')).length === beforeCount - 1, 'swipe-right finishes (removes) a task');

// green sync dot + persistence
await phone.waitForFunction(() => document.querySelector('#syncDot').classList.contains('ok'), null, { timeout: 4000 });
ok(true, 'sync dot turns green');
await phone.reload();
await phone.waitForSelector('#list-tomorrow .row');
ok((await rowsIn(phone, 'tomorrow')).includes('buy milk'), 'tasks persist across reload');
const code = await phone.evaluate(() => localStorage.getItem('today.code.v1'));

/* ══ iPad (4a) ══ */
const ipad = await (await browser.newContext({ viewport: { width: 1080, height: 810 } })).newPage();
await ipad.goto(base);
ok(await ipad.isVisible('.col-add'), 'iPad shows per-column add lines');
ok(!(await ipad.isVisible('#addbar')), 'iPad hides the phone add bar');
// two columns side by side: Tomorrow column starts to the right of Today
const boxes = await ipad.$$eval('.col', els => els.map(e => e.getBoundingClientRect().x));
ok(boxes.length === 2 && boxes[1] > boxes[0] + 200, 'iPad lays Today | Tomorrow side by side');

// pair with the phone's list
await ipad.click('#syncBtn');
await ipad.fill('#codeInput', code);
await ipad.click('#applyCode');
await ipad.click('#closeSheet');
await ipad.waitForFunction(() => document.querySelectorAll('#list-tomorrow .row').length >= 1, null, { timeout: 5000 });
ok((await rowsIn(ipad, 'tomorrow')).includes('buy milk'), 'second device pulls the shared list by code');

// add via the Today column add line
await ipad.fill('.col-add[data-day="today"] input', 'water plants');
await ipad.press('.col-add[data-day="today"] input', 'Enter');
await ipad.waitForFunction(() => [...document.querySelectorAll('#list-today .txt')].some(e => e.textContent === 'water plants'));
ok(true, 'per-column add line adds directly to that day');

await browser.close(); server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
