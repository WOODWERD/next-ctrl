/**
 * Cloudflare Pages Function: POST /api/sync
 *
 * Body:  { code: string, items: Item[] }
 * Reply: { items: Item[] }   (the merged list, including tombstones)
 *
 * Storage: one JSON blob per sync code in the KV namespace bound as `TODOS`.
 * Merge:   per-item, newest `updatedAt` wins. Deletes travel as `deleted:true`
 *          tombstones and are garbage-collected after 30 days.
 */

const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_ITEMS = 2000;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
      'cache-control': 'no-store',
    },
  });

export function onRequestOptions() {
  return json({}, 204);
}

function cleanCode(raw) {
  if (typeof raw !== 'string') return null;
  const c = raw.trim().toUpperCase().slice(0, 64);
  return /^[A-Z0-9-]{6,64}$/.test(c) ? c : null;
}

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

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.TODOS) {
    return json({ error: 'KV namespace TODOS is not bound. See README.' }, 500);
  }

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'invalid json' }, 400); }

  const code = cleanCode(body && body.code);
  if (!code) return json({ error: 'invalid sync code' }, 400);

  const incoming = Array.isArray(body.items) ? body.items : [];
  const key = 'list:' + code;

  const storedRaw = await env.TODOS.get(key);
  const stored = storedRaw ? (JSON.parse(storedRaw).items || []) : [];

  let merged = mergeById(stored, incoming);

  // garbage-collect old tombstones, then cap size
  const cutoff = Date.now() - TOMBSTONE_TTL_MS;
  merged = merged.filter(i => !(i.deleted && i.updatedAt < cutoff));
  if (merged.length > MAX_ITEMS) {
    merged.sort((a, b) => b.updatedAt - a.updatedAt);
    merged = merged.slice(0, MAX_ITEMS);
  }

  await env.TODOS.put(key, JSON.stringify({ items: merged, updatedAt: Date.now() }));

  return json({ items: merged });
}
