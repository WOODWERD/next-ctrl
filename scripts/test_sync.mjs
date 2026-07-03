import { onRequestPost } from '../functions/api/sync.js';

// in-memory KV mock
const store = new Map();
const env = { TODOS: {
  get: async k => store.get(k) ?? null,
  put: async (k, v) => { store.set(k, v); },
}};

const post = body => onRequestPost({
  request: new Request('http://x/api/sync', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }),
  env,
});

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  FAIL:', m); } };

// 1. bad code rejected
let r = await post({ code: 'no', items: [] });
ok(r.status === 400, 'short code -> 400');

// 2. phone adds A
r = await post({ code: 'ABCD-1234', items: [
  { id: 'a', text: 'buy milk', due: '2026-07-03', done: false, deleted: false, updatedAt: 100 },
]});
let d = await r.json();
ok(r.status === 200 && d.items.length === 1, 'first add stored');

// 3. ipad (only knows nothing) syncs empty -> should receive A back
r = await post({ code: 'ABCD-1234', items: [] });
d = await r.json();
ok(d.items.length === 1 && d.items[0].id === 'a', 'second device pulls existing item');

// 4. concurrent: ipad adds B while phone re-sends A -> both survive
r = await post({ code: 'ABCD-1234', items: [
  { id: 'b', text: 'call vet', due: '2026-07-04', done: false, deleted: false, updatedAt: 200 },
]});
d = await r.json();
ok(d.items.length === 2, 'concurrent add keeps both (no clobber)');

// 5. newest-write-wins: mark A done with higher ts
r = await post({ code: 'ABCD-1234', items: [
  { id: 'a', text: 'buy milk', due: '2026-07-03', done: true, deleted: false, updatedAt: 300 },
]});
d = await r.json();
ok(d.items.find(i => i.id === 'a').done === true, 'newer update wins');

// 6. stale update ignored
r = await post({ code: 'ABCD-1234', items: [
  { id: 'a', text: 'stale', due: '2026-07-03', done: false, deleted: false, updatedAt: 50 },
]});
d = await r.json();
ok(d.items.find(i => i.id === 'a').done === true, 'older update ignored');

// 7. old tombstone garbage-collected
r = await post({ code: 'ABCD-1234', items: [
  { id: 'c', text: 'gone', due: '2026-01-01', done: false, deleted: true, updatedAt: 1 },
]});
d = await r.json();
ok(!d.items.find(i => i.id === 'c'), 'ancient tombstone GC-d');

// 8. two codes are isolated
r = await post({ code: 'ZZZZ-9999', items: [] });
d = await r.json();
ok(d.items.length === 0, 'different code = separate list');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
