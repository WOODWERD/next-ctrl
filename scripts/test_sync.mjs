import { handleSync } from '../src/sync.js';

// in-memory KV mock
const store = new Map();
const env = { TODOS: {
  get: async k => store.get(k) ?? null,
  put: async (k, v) => { store.set(k, v); },
}};

// post as an authenticated user (email injected like Cloudflare Access does),
// or anonymously against a non-local host.
const post = (body, email) => handleSync(new Request('https://today.woodwerd.com/api/sync', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    ...(email ? { 'Cf-Access-Authenticated-User-Email': email } : {}),
  },
  body: JSON.stringify(body),
}), env);

const drew = 'drew@woodwerd.com';
const other = 'someone@example.com';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  FAIL:', m); } };

// 1. unauthenticated (no email, non-local host) -> 401
let r = await post({ items: [] });
ok(r.status === 401, 'no identity -> 401 (fail closed)');

// 2. drew adds A
r = await post({ items: [
  { id: 'a', text: 'buy milk', due: '2026-07-03', done: false, deleted: false, updatedAt: 100 },
]}, drew);
let d = await r.json();
ok(r.status === 200 && d.items.length === 1, 'authenticated add stored');

// 3. drew's second device (same identity, empty local) pulls A back
r = await post({ items: [] }, drew);
d = await r.json();
ok(d.items.length === 1 && d.items[0].id === 'a', 'another device of same user pulls the list');

// 4. concurrent add from second device -> both survive
r = await post({ items: [
  { id: 'b', text: 'call vet', due: '2026-07-04', done: false, deleted: false, updatedAt: 200 },
]}, drew);
d = await r.json();
ok(d.items.length === 2, 'concurrent add keeps both (no clobber)');

// 5. newest-write-wins
r = await post({ items: [
  { id: 'a', text: 'buy milk', due: '2026-07-03', done: true, deleted: false, updatedAt: 300 },
]}, drew);
d = await r.json();
ok(d.items.find(i => i.id === 'a').done === true, 'newer update wins');

// 6. stale update ignored
r = await post({ items: [
  { id: 'a', text: 'stale', due: '2026-07-03', done: false, deleted: false, updatedAt: 50 },
]}, drew);
d = await r.json();
ok(d.items.find(i => i.id === 'a').done === true, 'older update ignored');

// 7. old tombstone garbage-collected
r = await post({ items: [
  { id: 'c', text: 'gone', due: '2026-01-01', done: false, deleted: true, updatedAt: 1 },
]}, drew);
d = await r.json();
ok(!d.items.find(i => i.id === 'c'), 'ancient tombstone GC-d');

// 8. a DIFFERENT identity is fully isolated
r = await post({ items: [] }, other);
d = await r.json();
ok(d.items.length === 0, 'different user sees a separate, empty list');

// 9. localhost is allowed for `wrangler dev`
r = await handleSync(new Request('http://127.0.0.1:8787/api/sync', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: [] }),
}), env);
ok(r.status === 200, 'localhost dev requests are allowed');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
