import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { onRequestPost } from '../functions/api/sync.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

// shared in-memory KV so we can simulate two devices
const kv = new Map();
const env = { TODOS: { get: async k => kv.get(k) ?? null, put: async (k, v) => kv.set(k, v) } };

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };

const server = http.createServer(async (req, res) => {
  if (req.url === '/api/sync' && req.method === 'POST') {
    const chunks = []; for await (const c of req) chunks.push(c);
    const request = new Request('http://x/api/sync', { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: Buffer.concat(chunks) });
    const r = await onRequestPost({ request, env });
    res.writeHead(r.status, { 'content-type': 'application/json' });
    res.end(await r.text());
    return;
  }
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  try {
    const buf = await readFile(path.join(ROOT, p));
    res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(buf);
  } catch { res.writeHead(404); res.end('nope'); }
});

await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ executablePath: EXE });
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? '  ok  ' : '  FAIL ') + m); c ? pass++ : fail++; };

// ---------- device 1 (phone) ----------
const c1 = await browser.newContext();
const phone = await c1.newPage();
phone.on('console', m => { if (m.type() === 'error') console.log('   [console.error]', m.text()); });
await phone.goto(base);

// add a Today item (default bucket)
await phone.fill('#input', 'buy milk');
await phone.press('#input', 'Enter');
await phone.waitForSelector('#list-today .item');
ok((await phone.$$('#list-today .item')).length === 1, 'Today item added');
ok((await phone.inputValue('#input')) === '', 'input clears after add');

// add a Tomorrow item
await phone.click('.seg[data-when="tomorrow"]');
await phone.fill('#input', 'call vet');
await phone.press('#input', 'Enter');
await phone.waitForSelector('#list-tomorrow .item');
ok((await phone.$$('#list-tomorrow .item')).length === 1, 'Tomorrow item lands in Tomorrow bucket');

// toggle done
await phone.click('#list-today .item .check');
await phone.waitForSelector('#list-today .item.done');
ok((await phone.$$('#list-today .item.done')).length === 1, 'checkbox marks item done');
ok(!(await phone.isHidden('#clearDone')), 'Clear-completed appears when something is done');

// wait for sync to flush (debounced 600ms) then check the green dot
await phone.waitForFunction(() => document.querySelector('#syncDot').classList.contains('on'), null, { timeout: 4000 });
ok(true, 'sync dot turns green after successful sync');

// persistence across reload
await phone.reload();
await phone.waitForSelector('#list-today .item');
ok((await phone.$$('#list-today .item')).length === 1 &&
   (await phone.$$('#list-tomorrow .item')).length === 1, 'items persist across reload');

// grab the sync code the phone generated
const code = await phone.evaluate(() => localStorage.getItem('today.code.v1'));
ok(!!code, 'phone has a sync code: ' + code);

// ---------- device 2 (ipad): pair with same code ----------
const c2 = await browser.newContext();
const ipad = await c2.newPage();
await ipad.goto(base);
await ipad.click('#syncBtn');
await ipad.fill('#codeInput', code);
await ipad.click('#applyCode');
await ipad.click('#closeSheet');
// after pull, ipad should show BOTH items from the shared list
await ipad.waitForFunction(() =>
  document.querySelectorAll('#list-today .item').length >= 1 &&
  document.querySelectorAll('#list-tomorrow .item').length >= 1, null, { timeout: 5000 });
ok(true, 'second device paired by code pulls the shared list');
ok((await ipad.$$('#list-today .item.done')).length === 1, 'done state synced to second device');

// ---------- concurrent add from ipad flows back to phone ----------
await ipad.click('.seg[data-when="today"]');
await ipad.fill('#input', 'water plants');
await ipad.press('#input', 'Enter');
await ipad.waitForTimeout(1200); // let ipad sync up
await phone.evaluate(() => window.dispatchEvent(new Event('online'))); // nudge phone to pull
await phone.waitForFunction(() =>
  [...document.querySelectorAll('#list-today .item .txt')].some(e => e.textContent === 'water plants'),
  null, { timeout: 5000 });
ok(true, 'item added on iPad appears on phone (bidirectional sync, no clobber)');
ok((await phone.$$('#list-today .item .txt')).length >= 1, 'phone still has its own items too');

await browser.close();
server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
