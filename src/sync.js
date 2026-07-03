/**
 * Cross-device sync handler — gated by the built-in session (see auth.js).
 *
 * POST /api/sync
 *   Body:  { items: Item[] }
 *   Reply: { items: Item[] }   (the merged list, including tombstones)
 *
 * Single user, so the list lives under one key; every logged-in device shares
 * it. Requests without a valid session are rejected (401).
 *
 * Storage: KV namespace bound as `TODOS`.
 * Merge:   per-item, newest `updatedAt` wins. Deletes travel as `deleted:true`
 *          tombstones and are garbage-collected after 30 days.
 */

import { verifySession } from './auth.js';

const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_ITEMS = 2000;
const LIST_KEY = 'list:owner';

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

function sanitizeItem(x) {
  if (!x || typeof x !== 'object') return null;
  if (typeof x.id !== 'string' || x.id.length > 64) return null;
  return {
    id: x.id,
    text: String(x.text ?? '').slice(0, 1000),
    due: /^\d{4}-\d{2}-\d{2}$/.test(x.due) ? x.due : '1970-01-01',
    done: !!x.done,
    deleted: !!x.deleted,
    updatedAt: Number.isFinite(x.updatedAt) ? x.updatedAt : 0,
  };
}

function mergeById(a, b) {
  const map = new Map();
  for (const it of [...a, ...b]) {
    const s = sanitizeItem(it);
    if (!s) continue;
    const cur = map.get(s.id);
    if (!cur || s.updatedAt > cur.updatedAt) map.set(s.id, s);
  }
  return [...map.values()];
}

export async function handleSync(request, env) {
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  if (!env || !env.TODOS) {
    return json({ error: 'KV namespace TODOS is not bound. See README.' }, 500);
  }

  if (!(await verifySession(request, env))) return json({ error: 'unauthenticated' }, 401);

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'invalid json' }, 400); }

  const incoming = Array.isArray(body.items) ? body.items : [];
  const key = LIST_KEY;

  const storedRaw = await env.TODOS.get(key);
  const stored = storedRaw ? (JSON.parse(storedRaw).items || []) : [];

  let merged = mergeById(stored, incoming);

  const cutoff = Date.now() - TOMBSTONE_TTL_MS;
  merged = merged.filter(i => !(i.deleted && i.updatedAt < cutoff));
  if (merged.length > MAX_ITEMS) {
    merged.sort((a, b) => b.updatedAt - a.updatedAt);
    merged = merged.slice(0, MAX_ITEMS);
  }

  await env.TODOS.put(key, JSON.stringify({ items: merged, updatedAt: Date.now() }));

  return json({ items: merged });
}
