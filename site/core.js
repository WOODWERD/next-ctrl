// Next Ctrl record core (build step B2). Pure functions shared by the app and the /today skill.
// The record is items.json in the person's private repo (TD-R05):
//   { version: 1, items: [{ id, text, due, created, done, updatedAt, by }] }
// Every edit is a small change object, applied to whatever record was last read.
// That way a save refused for a stale sha can read again and reapply just its own
// change (TD-R07). Nothing here touches the network; the reader and writer are passed in.

export const RECORD_VERSION = 1;
export const MAX_TEXT = 1000;
export const PRUNE_DAYS = 30;     // finished items kept this long, for Undo and history (TD-R03)
export const ROLLED_SHOWN_FROM = 2; // rolled count shown from the second day rolled (TD-R04)

const DAY_MS = 24 * 60 * 60 * 1000;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

export class RecordError extends Error {
  constructor(message) { super(message); this.name = 'RecordError'; }
}
// A file that isn't a Next Ctrl record. The app stops and says so rather than write over it.
function broken(message) { const e = new RecordError(message); e.broken = true; return e; }
export class ConflictError extends Error {
  constructor(message) { super(message); this.name = 'ConflictError'; }
}

/* ---------- dates (local calendar dates as YYYY-MM-DD) ---------- */

export function ymd(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function addDays(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  return ymd(new Date(y, m - 1, d + n));
}
export function daysBetween(from, to) {
  const [a, b] = [from, to].map((s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); });
  return Math.round((b - a) / DAY_MS);
}

/* ---------- reading and writing the file ---------- */

export function emptyRecord() {
  return { version: RECORD_VERSION, items: [] };
}

// Throws RecordError for anything that isn't a Next Ctrl record, so a broken file
// is never overwritten (TD-E07). Unknown fields are kept as they are.
export function parseRecord(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw broken('items.json is not valid JSON'); }
  if (!data || typeof data !== 'object' || !Array.isArray(data.items)) {
    throw broken('items.json has no items list');
  }
  if (data.version !== RECORD_VERSION) throw broken(`items.json is version ${data.version}, expected ${RECORD_VERSION}`);
  for (const it of data.items) {
    if (!it || typeof it.id !== 'string' || !it.id) throw broken('An item has no id');
    if (typeof it.text !== 'string') throw broken(`Item ${it.id} has no text`);
    if (!YMD.test(it.due)) throw broken(`Item ${it.id} has no due date`);
  }
  return data;
}

export function serialize(record) {
  return JSON.stringify(record, null, 2) + '\n';
}

/* ---------- the two lists (TD-R02, TD-R04) ---------- */

// Today holds unfinished items due today or earlier; Tomorrow holds the rest.
// Order is the order in the file, which is the order they were added (TD-U10).
export function view(record, today) {
  const out = { today: [], tomorrow: [] };
  for (const it of record.items) {
    if (it.done) continue;
    if (it.due <= today) {
      const rolled = daysBetween(it.due, today);
      out.today.push({ ...it, rolled, rolledLabel: rolled >= ROLLED_SHOWN_FROM ? `${rolled} days` : '' });
    } else {
      out.tomorrow.push({ ...it, rolled: 0, rolledLabel: '' });
    }
  }
  return out;
}

export function dayOf(item, today) {
  return item.due <= today ? 'today' : 'tomorrow';
}

/* ---------- making changes ---------- */

let counter = 0;
export function newId(now = Date.now()) {
  counter = (counter + 1) % 1e6;
  const rand = Math.floor(Math.random() * 36 ** 4).toString(36).padStart(4, '0');
  return `td-${now.toString(36)}-${counter.toString(36)}${rand}`;
}

// Two items say the same thing if their words match, ignoring case, spacing and a closing full stop (TD-R19).
export function sameWords(a, b) {
  const n = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim().replace(/[.!]+$/, '');
  return n(a) === n(b);
}
export function findOpen(record, text) {
  return record.items.find((i) => !i.done && sameWords(i.text, text)) || null;
}

export function cleanText(text) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!t) throw new RecordError('An item needs some words');
  return t.slice(0, MAX_TEXT);
}

// One item to add. `day` is 'today' or 'tomorrow'. The id is fixed here, so
// applying the same change twice never adds it twice (TD-R07 retry).
export function addChange(text, day, { today, now = Date.now(), by = 'app', id } = {}) {
  if (day !== 'today' && day !== 'tomorrow') throw new RecordError(`Unknown day: ${day}`);
  return {
    type: 'add',
    item: {
      id: id || newId(now),
      text: cleanText(text),
      due: day === 'tomorrow' ? addDays(today, 1) : today,
      created: today,
      done: false,
      updatedAt: now,
      by,
    },
  };
}
export const finishChange = (id) => ({ type: 'finish', id });
export const unfinishChange = (id) => ({ type: 'unfinish', id });
export const editChange = (id, text) => ({ type: 'edit', id, text: cleanText(text) });
export const setDueChange = (id, due) => ({ type: 'move', id, due });

// Swipe left: the other day from where it shows now (TD-R30). The target date is
// fixed in the change, so a retry moves it to the same place.
export function moveChange(record, id, today) {
  const it = find(record, id);
  return setDueChange(id, dayOf(it, today) === 'today' ? addDays(today, 1) : today);
}

function find(record, id) {
  const it = record.items.find((i) => i.id === id);
  if (!it) throw new RecordError('That item is no longer on the list');
  return it;
}

// Applies one change and returns a new record; the one passed in is left as it was.
export function apply(record, change, { now = Date.now() } = {}) {
  const items = record.items.map((i) => ({ ...i }));
  const next = { ...record, items };
  const touch = (it) => { it.updatedAt = now; };
  switch (change.type) {
    case 'add':
      if (!items.some((i) => i.id === change.item.id)) items.push({ ...change.item });
      break;
    case 'finish': { const it = find(next, change.id); if (!it.done) { it.done = true; touch(it); } break; }
    case 'unfinish': { const it = find(next, change.id); if (it.done) { it.done = false; touch(it); } break; }
    case 'move': { const it = find(next, change.id); if (it.due !== change.due) { it.due = change.due; touch(it); } break; }
    case 'edit': { const it = find(next, change.id); if (it.text !== change.text) { it.text = change.text; touch(it); } break; }
    case 'batch': return change.changes.reduce((r, c) => apply(r, c, { now }), record);
    default: throw new RecordError(`Unknown change: ${change.type}`);
  }
  return next;
}

// The change that puts things back, worked out before the change is applied (TD-U07).
export function inverse(record, change) {
  switch (change.type) {
    case 'finish': return unfinishChange(change.id);
    case 'unfinish': return finishChange(change.id);
    case 'move': return setDueChange(change.id, find(record, change.id).due);
    case 'edit': return { type: 'edit', id: change.id, text: find(record, change.id).text };
    case 'add': return finishChange(change.item.id);
    case 'batch': return { type: 'batch', changes: change.changes.map((c) => inverse(record, c)).reverse() };
    default: throw new RecordError(`No undo for ${change.type}`);
  }
}

// Finished items older than 30 days leave the file; git history keeps them (TD-R03).
export function prune(record, { now = Date.now() } = {}) {
  const cutoff = now - PRUNE_DAYS * DAY_MS;
  const items = record.items.filter((i) => !(i.done && (i.updatedAt || 0) < cutoff));
  return items.length === record.items.length ? record : { ...record, items };
}

// Several lines pasted into an add field become one item each (TD-U12). List marks
// like "- ", "1. " and "[ ] " are dropped; blank lines are skipped.
const MARK = /^\s*(?:[-*•–]\s+|\d+[.)]\s+|\[[ xX]?\]\s*)/;
export function pastedLines(text) {
  return String(text ?? '').split(/\r?\n/).map((l) => l.replace(MARK, '').trim()).filter(Boolean);
}

/* ---------- commit messages (TD-R06) ---------- */

export function commitMessage(change, record, today) {
  const textOf = (id) => record.items.find((i) => i.id === id)?.text ?? id;
  switch (change.type) {
    case 'add': return `Add${change.item.due > today ? ' for tomorrow' : ''}: ${change.item.text}`;
    case 'finish': return `Done: ${textOf(change.id)}`;
    case 'unfinish': return `Undo done: ${textOf(change.id)}`;
    case 'move': return `Move to ${change.due > today ? 'tomorrow' : 'today'}: ${textOf(change.id)}`;
    case 'edit': return `Edit: ${change.text}`;
    case 'batch':
      return change.changes.length === 1
        ? commitMessage(change.changes[0], record, today)
        : `${change.changes.map((c) => commitMessage(c, record, today)).join('; ')}`;
    default: return 'Change';
  }
}

/* ---------- saving with the sha guard (TD-R07, TD-E01, TD-E02) ---------- */

// store.read()  -> { text, sha } or null when items.json doesn't exist yet
// store.write(text, sha, message) -> new sha; throws an error with .conflict = true
//   when the sha is stale (GitHub answers 409).
// A stale save reads again and reapplies this one change, once. A second conflict
// throws ConflictError and nothing is written.
export async function save(store, change, { today, now = Date.now() } = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const got = await store.read();
    const before = got ? parseRecord(got.text) : emptyRecord();
    const after = prune(apply(before, change, { now }), { now });
    const message = commitMessage(change, before, today);
    try {
      const sha = await store.write(serialize(after), got ? got.sha : null, message);
      return { record: after, sha, message };
    } catch (err) {
      if (!err || !err.conflict) throw err;
    }
  }
  throw new ConflictError('Your list changed somewhere else twice while saving. Nothing was saved; try again.');
}
