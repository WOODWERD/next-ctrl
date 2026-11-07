// Where the app gets its list, and what it keeps on this device (TD-R32, TD-R34).
// The record itself lives only in the person's repo. This device keeps:
//   today.cache  the last record read, so the list opens straight away and works offline
//   today.queue  changes made offline, sent in order when back online
// The connection itself (repo and token) is kept by github.js.
import { serialize, parseRecord } from './core.js';

const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k, v) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* storage unavailable */ } };

export function loadCache(ns = '') {
  const t = get(`today.cache${ns}`);
  try { return t ? parseRecord(t) : null; } catch { return null; }
}
export function saveCache(record, ns = '') { set(`today.cache${ns}`, serialize(record)); }

export function loadQueue(ns = '') {
  try { return JSON.parse(get(`today.queue${ns}`) || '[]'); } catch { return []; }
}
export function saveQueue(q, ns = '') { set(`today.queue${ns}`, q.length ? JSON.stringify(q) : null); }

// Each mode keeps its own copy, so the made-up lists never mix with a real one.
export function clearDevice(ns = '') { [`today.cache${ns}`, `today.queue${ns}`].forEach((k) => set(k, null)); if (ns === '.standin') set('today.standin', null); }

// A stand-in for GitHub, for checking the screens with made-up items (?standin).
// Same read/write shape as the GitHub store, including the stale-sha refusal.
export function standinStore() {
  const KEY = 'today.standin';
  const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); const p = (x) => String(x).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
  if (!get(KEY)) {
    const now = Date.now();
    const mk = (id, text, due, by = 'app') => ({ id, text, due, created: due, done: false, updatedAt: now, by });
    const record = { version: 1, items: [
      mk('s1', 'call the plumber', day(0), 'claude'),
      mk('s2', 'email Sam the drawings', day(-2), 'claude'),
      mk('s3', 'pick up sanding discs', day(0)),
      mk('s4', 'water the shop plants', day(0)),
      mk('s5', 'order hinge pins', day(1), 'claude'),
      mk('s6', 'book the truck inspection', day(1)),
    ] };
    set(KEY, JSON.stringify({ text: serialize(record), sha: 1 }));
  }
  const state = () => JSON.parse(get(KEY));
  return {
    name: 'Stand-in',
    async read() { await pause(); return { ...state(), sha: state().sha }; },
    async write(text, sha, message) {
      await pause();
      if (navigator.onLine === false) throw new TypeError('offline');
      const s = state();
      if (sha !== s.sha) { const e = new Error('409'); e.conflict = true; throw e; }
      set(KEY, JSON.stringify({ text, sha: s.sha + 1, last: message }));
      return s.sha + 1;
    },
  };
}
const pause = () => new Promise((r) => setTimeout(r, 120));
