import { handleSync } from '../src/sync.js';
import { handleLogin, handleLogout } from '../src/auth.js';
import { handleTranscribe } from '../src/transcribe.js';

// in-memory KV mock
const store = new Map();
const PASSWORD = 'correct horse battery staple';
const env = { APP_PASSWORD: PASSWORD, TODOS: {
  get: async k => store.get(k) ?? null,
  put: async (k, v) => { store.set(k, v); },
}};

const req = (path, { body, cookie } = {}) => new Request('https://today.woodwerd.com' + path, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    ...(cookie ? { Cookie: cookie } : {}),
  },
  body: body === undefined ? undefined : JSON.stringify(body),
});
const sync  = (items, cookie) => handleSync(req('/api/sync', { body: { items }, cookie }), env);
const login = pw => handleLogin(req('/api/login', { body: { password: pw } }), env);

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  FAIL:', m); } };

// 1. sync without a session -> 401
let r = await sync([]);
ok(r.status === 401, 'no session -> 401');

// 2. wrong password -> 401, no cookie
r = await login('nope');
ok(r.status === 401 && !r.headers.get('set-cookie'), 'wrong password rejected');

// 3. correct password -> 200 + Set-Cookie
r = await login(PASSWORD);
const setCookie = r.headers.get('set-cookie') || '';
ok(r.status === 200 && /(?:^|\s)sid=/.test(setCookie), 'correct password sets a session cookie');
ok(/HttpOnly/i.test(setCookie) && /Secure/i.test(setCookie) && /SameSite=Lax/i.test(setCookie),
   'cookie is HttpOnly + Secure + SameSite=Lax');
const cookie = 'sid=' + setCookie.match(/sid=([^;]+)/)[1];

// 4. sync WITH the session cookie works
r = await sync([{ id: 'a', text: 'buy milk', due: '2026-07-03', done: false, deleted: false, updatedAt: 100 }], cookie);
let d = await r.json();
ok(r.status === 200 && d.items.length === 1, 'authenticated sync stores an item');

// 5. another device with the same cookie pulls the shared list
r = await sync([], cookie);
d = await r.json();
ok(d.items.length === 1 && d.items[0].id === 'a', 'second device pulls the shared list');

// 6. newest-write-wins + stale ignored
await sync([{ id: 'a', text: 'buy milk', due: '2026-07-03', done: true, deleted: false, updatedAt: 300 }], cookie);
r = await sync([{ id: 'a', text: 'stale', due: '2026-07-03', done: false, deleted: false, updatedAt: 50 }], cookie);
d = await r.json();
ok(d.items.find(i => i.id === 'a').done === true, 'newest-write-wins, stale ignored');

// 7. old tombstone GC
r = await sync([{ id: 'c', text: 'gone', due: '2026-01-01', done: false, deleted: true, updatedAt: 1 }], cookie);
d = await r.json();
ok(!d.items.find(i => i.id === 'c'), 'ancient tombstone GC-d');

// 8. a tampered cookie is rejected
const tampered = cookie.slice(0, -2) + 'xx';
r = await sync([], tampered);
ok(r.status === 401, 'tampered session cookie rejected');

// 9. logout clears the cookie
r = await handleLogout(req('/api/logout'));
ok(r.status === 200 && /sid=;/.test(r.headers.get('set-cookie') || '') , 'logout clears the cookie');

// 10. localhost dev works with no password configured
const devEnv = { TODOS: env.TODOS };
r = await handleSync(new Request('http://127.0.0.1/api/sync', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: [] }),
}), devEnv);
ok(r.status === 200, 'localhost dev allowed when no password is set');

// ---- transcribe (Workers AI mocked) ----
const aiEnv = { AI: { run: async () => ({ text: '  Buy milk  ' }) }, TODOS: env.TODOS };

// 11. localhost dev + mocked AI -> trimmed text
r = await handleTranscribe(new Request('http://127.0.0.1/api/transcribe', { method: 'POST', body: new Uint8Array([1, 2, 3]) }), aiEnv);
d = await r.json();
ok(r.status === 200 && d.text === 'Buy milk', 'transcribe returns trimmed text');

// 12. empty audio -> 400
r = await handleTranscribe(new Request('http://127.0.0.1/api/transcribe', { method: 'POST' }), aiEnv);
ok(r.status === 400, 'transcribe rejects empty audio');

// 13. requires a session when a password is configured
r = await handleTranscribe(new Request('https://today.woodwerd.com/api/transcribe', { method: 'POST', body: new Uint8Array([1]) }),
  { ...aiEnv, APP_PASSWORD: PASSWORD });
ok(r.status === 401, 'transcribe requires a session');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
