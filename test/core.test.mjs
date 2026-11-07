// B2: the record core, by TD rule. Made-up items only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyRecord, parseRecord, serialize, view, addDays, daysBetween,
  addChange, finishChange, editChange, moveChange, apply, inverse, prune,
  commitMessage, save, RecordError, ConflictError, PRUNE_DAYS,
} from '../site/core.js';

const T = '2026-11-07';          // "today" in these tests
const NOW = Date.UTC(2026, 10, 7, 15);
const DAY = 24 * 60 * 60 * 1000;

function rec(...items) { return { version: 1, items }; }
function item(id, text, due, extra = {}) {
  return { id, text, due, created: due, done: false, updatedAt: NOW - DAY, by: 'app', ...extra };
}

/* dates */
test('dates: addDays crosses months and years', () => {
  assert.equal(addDays('2026-11-30', 1), '2026-12-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(daysBetween('2026-11-05', T), 2);
});

/* TD-R01, TD-R05 */
test('TD-R01/R05 an added item is text and a day, in the record shape', () => {
  const c = addChange('  call   the plumber ', 'today', { today: T, now: NOW, by: 'claude' });
  const r = apply(emptyRecord(), c, { now: NOW });
  assert.deepEqual(Object.keys(r.items[0]).sort(), ['by', 'created', 'done', 'due', 'id', 'text', 'updatedAt']);
  assert.equal(r.items[0].text, 'call the plumber');
  assert.equal(r.items[0].due, T);
  assert.equal(r.items[0].by, 'claude');
  assert.equal(apply(emptyRecord(), addChange('x', 'tomorrow', { today: T }), {}).items[0].due, '2026-11-08');
});

test('TD-R01 an item needs words', () => {
  assert.throws(() => addChange('   ', 'today', { today: T }), RecordError);
});

/* TD-R02 */
test('TD-R02 Today holds due today or earlier; Tomorrow the rest; done items hidden', () => {
  const r = rec(
    item('a', 'old one', '2026-11-04'),
    item('b', 'today one', T),
    item('c', 'tomorrow one', '2026-11-08'),
    item('d', 'finished', T, { done: true }),
  );
  const v = view(r, T);
  assert.deepEqual(v.today.map((i) => i.id), ['a', 'b']);
  assert.deepEqual(v.tomorrow.map((i) => i.id), ['c']);
});

test('TD-R02 rollover needs nothing at midnight: tomorrow becomes today by date alone', () => {
  const r = rec(item('c', 'tomorrow one', '2026-11-08'));
  assert.deepEqual(view(r, '2026-11-08').today.map((i) => i.id), ['c']);
});

test('TD-U10 order is the order added', () => {
  const r = rec(item('z', 'first', T), item('a', 'second', T));
  assert.deepEqual(view(r, T).today.map((i) => i.id), ['z', 'a']);
});

/* TD-R04 */
test('TD-R04 rolled count shows from the second day', () => {
  const r = rec(item('a', 'one day', '2026-11-06'), item('b', 'two days', '2026-11-05'), item('c', 'today', T));
  const v = view(r, T);
  assert.deepEqual(v.today.map((i) => i.rolledLabel), ['', '2 days', '']);
});

/* TD-R30 finish, move, edit and Undo */
test('TD-R30 finish takes it off the list; Undo brings it back', () => {
  const r = rec(item('a', 'sample', T));
  const c = finishChange('a');
  const undo = inverse(r, c);
  const done = apply(r, c, { now: NOW });
  assert.equal(view(done, T).today.length, 0);
  assert.equal(view(apply(done, undo, { now: NOW }), T).today.length, 1);
  assert.equal(r.items[0].done, false, 'the record passed in is left as it was');
});

test('TD-R30 move flips to the other day, and Undo moves it back', () => {
  const r = rec(item('a', 'sample', '2026-11-05'));
  const c = moveChange(r, 'a', T);
  assert.equal(c.due, '2026-11-08');
  const moved = apply(r, c, { now: NOW });
  assert.deepEqual(view(moved, T).tomorrow.map((i) => i.id), ['a']);
  const back = apply(moved, moveChange(moved, 'a', T), { now: NOW });
  assert.equal(back.items[0].due, T);
  assert.equal(apply(moved, inverse(r, c), { now: NOW }).items[0].due, '2026-11-05');
});

test('TD-R30 edit changes the words; Undo restores them', () => {
  const r = rec(item('a', 'sampel', T));
  const c = editChange('a', 'sample');
  const e = apply(r, c, { now: NOW });
  assert.equal(e.items[0].text, 'sample');
  assert.equal(apply(e, inverse(r, c), { now: NOW }).items[0].text, 'sampel');
});

test('a change to an item that is gone says so', () => {
  assert.throws(() => apply(rec(), finishChange('nope')), RecordError);
});

/* TD-R03 */
test('TD-R03 finished items leave the file after 30 days; open ones never do', () => {
  const old = NOW - (PRUNE_DAYS + 1) * DAY;
  const r = rec(
    item('a', 'old done', '2026-09-01', { done: true, updatedAt: old }),
    item('b', 'recent done', T, { done: true, updatedAt: NOW - DAY }),
    item('c', 'old open', '2026-09-01', { updatedAt: old }),
  );
  assert.deepEqual(prune(r, { now: NOW }).items.map((i) => i.id), ['b', 'c']);
});

/* TD-R06 */
test('TD-R06 each change has a plain commit message', () => {
  const r = rec(item('a', 'sample', T));
  assert.equal(commitMessage(addChange('call the rep', 'today', { today: T }), r, T), 'Add: call the rep');
  assert.equal(commitMessage(addChange('order pins', 'tomorrow', { today: T }), r, T), 'Add for tomorrow: order pins');
  assert.equal(commitMessage(finishChange('a'), r, T), 'Done: sample');
  assert.equal(commitMessage(moveChange(r, 'a', T), r, T), 'Move to tomorrow: sample');
  assert.equal(commitMessage(editChange('a', 'new words'), r, T), 'Edit: new words');
});

/* TD-E07 */
test('TD-E07 a broken items.json is refused, never treated as empty', () => {
  assert.throws(() => parseRecord('{ not json'), RecordError);
  assert.throws(() => parseRecord('{"version":1}'), RecordError);
  assert.throws(() => parseRecord('{"version":2,"items":[]}'), RecordError);
  assert.throws(() => parseRecord('{"version":1,"items":[{"id":"a","text":"x","due":"soon"}]}'), RecordError);
});

test('the file round-trips and keeps unknown fields', () => {
  const r = rec(item('a', 'sample', T, { note: 'kept' }));
  assert.deepEqual(parseRecord(serialize(r)), r);
  assert.ok(serialize(r).endsWith('\n'));
});

/* TD-R07 and the edge cases, with a stand-in for GitHub */
function fakeRepo(record) {
  let text = record ? serialize(record) : null;
  let sha = record ? 1 : null;
  const writes = [];
  return {
    writes,
    get text() { return text; },
    // what another device does between our read and our write
    otherDevice(change) { const r = apply(parseRecord(text), change, { now: NOW }); text = serialize(r); sha += 1; },
    beforeWrite: null,
    async read() { return text === null ? null : { text, sha }; },
    async write(newText, readSha, message) {
      if (this.beforeWrite) { const f = this.beforeWrite; this.beforeWrite = null; f(); }
      if (readSha !== sha) { const e = new Error('409'); e.conflict = true; throw e; }
      text = newText; sha = (sha || 0) + 1; writes.push(message); return sha;
    },
  };
}

test('TD-R07 a save with a fresh sha writes once', async () => {
  const repo = fakeRepo(rec(item('a', 'sample', T)));
  const out = await save(repo, finishChange('a'), { today: T, now: NOW });
  assert.deepEqual(repo.writes, ['Done: sample']);
  assert.equal(out.record.items[0].done, true);
});

test('TD-R07 the first add creates items.json when the repo has none', async () => {
  const repo = fakeRepo(null);
  await save(repo, addChange('first item', 'today', { today: T, now: NOW }), { today: T, now: NOW });
  assert.equal(parseRecord(repo.text).items[0].text, 'first item');
});

test('TD-E01 Claude adds while the phone holds an older copy; both survive', async () => {
  const repo = fakeRepo(rec(item('a', 'phone item', T)));
  // The phone finishes "a", but Claude's add lands between its read and its write.
  repo.beforeWrite = () => repo.otherDevice(addChange('from claude', 'today', { today: T, now: NOW, by: 'claude', id: 'c1' }));
  await save(repo, finishChange('a'), { today: T, now: NOW });
  const r = parseRecord(repo.text);
  assert.equal(r.items.find((i) => i.id === 'a').done, true);
  assert.equal(r.items.find((i) => i.id === 'c1').text, 'from claude');
  assert.equal(repo.writes.length, 1);
});

test('TD-E02 two devices finish different items at once; both stay finished', async () => {
  const repo = fakeRepo(rec(item('a', 'one', T), item('b', 'two', T)));
  repo.beforeWrite = () => repo.otherDevice(finishChange('b'));
  await save(repo, finishChange('a'), { today: T, now: NOW });
  const r = parseRecord(repo.text);
  assert.deepEqual(r.items.map((i) => i.done), [true, true]);
});

test('TD-R07 a retried add is never added twice', async () => {
  const repo = fakeRepo(rec());
  const c = addChange('only once', 'today', { today: T, now: NOW });
  repo.beforeWrite = () => repo.otherDevice(c); // the same add already landed
  await save(repo, c, { today: T, now: NOW });
  assert.equal(parseRecord(repo.text).items.length, 1);
});

test('TD-R07 two conflicts in a row stop with nothing written', async () => {
  const repo = fakeRepo(rec(item('a', 'sample', T), item('b', 'other', T)));
  let n = 0;
  const realWrite = repo.write.bind(repo);
  repo.write = async (...args) => { if (n++ < 2) repo.otherDevice(finishChange('b')); return realWrite(...args); };
  await assert.rejects(save(repo, finishChange('a'), { today: T, now: NOW }), ConflictError);
  assert.equal(parseRecord(repo.text).items[0].done, false);
});

test('TD-E07 a save refuses to write over a broken file', async () => {
  const repo = fakeRepo(null);
  repo.read = async () => ({ text: 'garbage', sha: 9 });
  await assert.rejects(save(repo, addChange('x', 'today', { today: T }), { today: T }), RecordError);
});

test('TD-E07 a broken file is marked broken; a missing item is not', () => {
  try { parseRecord('nope'); } catch (e) { assert.equal(e.broken, true); }
  try { apply({ version: 1, items: [] }, finishChange('x')); } catch (e) { assert.equal(e.broken, undefined); }
});

test('TD-U12 pasted lines become items, list marks dropped', async () => {
  const { pastedLines } = await import('../site/core.js');
  assert.deepEqual(pastedLines('- call the rep\n\n* order pins\n1. email Sam\n[ ] sweep the shop\n• water plants\r\n  2) book truck  '),
    ['call the rep', 'order pins', 'email Sam', 'sweep the shop', 'water plants', 'book truck']);
  assert.deepEqual(pastedLines('one line only'), ['one line only']);
  assert.deepEqual(pastedLines('- 3 mm hinge'), ['3 mm hinge']);
});

test('TD-R19 same words ignores case, spacing and a closing full stop; finished items do not count', async () => {
  const { sameWords, findOpen } = await import('../site/core.js');
  assert.ok(sameWords('Call the  plumber.', 'call the plumber'));
  assert.ok(!sameWords('call the rep', 'call the plumber'));
  const r = rec(item('a', 'sweep', T, { done: true }), item('b', 'order pins', T));
  assert.equal(findOpen(r, 'sweep'), null);
  assert.equal(findOpen(r, 'Order pins').id, 'b');
});
