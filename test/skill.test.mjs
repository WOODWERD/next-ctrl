// B3: the /today helper, against a stand-in for gh. Made-up items only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { githubStore, checkPrivate, run, parseAddArgs, addedLine, listText, readRepo } from '../skill/today.mjs';
import { parseRecord, serialize, RecordError } from '../site/core.js';

const T = '2026-11-07';
const NOW = Date.UTC(2026, 10, 7, 15);

// A stand-in for `gh api` on one repo: contents read/write with sha checks, and repo info.
function fakeGh({ record = null, isPrivate = true } = {}) {
  const state = { text: record ? serialize(record) : null, sha: record ? 's1' : null, n: 1, commits: [], calls: [] };
  const fail = (code, msg = '') => { const e = new Error(`gh: ${msg} (HTTP ${code})`); e.stderr = `gh: ${msg} (HTTP ${code})`; return e; };
  state.run = async (args, input) => {
    state.calls.push(args.join(' '));
    if (args[1] === 'repos/O/R') return JSON.stringify({ private: isPrivate });
    if (args.includes('-X')) {
      const body = JSON.parse(input);
      if ((body.sha || null) !== state.sha) throw fail(409, 'items.json does not match');
      state.text = Buffer.from(body.content, 'base64').toString('utf8');
      state.sha = `s${++state.n}`;
      state.commits.push(body.message);
      return JSON.stringify({ content: { sha: state.sha } });
    }
    if (state.text === null) throw fail(404, 'Not Found');
    return JSON.stringify({ content: Buffer.from(state.text).toString('base64'), sha: state.sha });
  };
  return state;
}

const item = (id, text, due) => ({ id, text, due, created: due, done: false, updatedAt: NOW, by: 'app' });

test('TD-R10/R11 several items from one sentence are one commit', async () => {
  const g = fakeGh();
  const line = await run(['add', '--today', 'email Sam', '--tomorrow', 'order hinge pins'], { store: githubStore('O/R', g.run), today: T, now: NOW });
  assert.equal(line, 'Added to Today: email Sam. Tomorrow: order hinge pins.');
  assert.deepEqual(g.commits, ['Add: email Sam; Add for tomorrow: order hinge pins']);
  const r = parseRecord(g.text);
  assert.deepEqual(r.items.map((i) => [i.text, i.due, i.by]), [['email Sam', T, 'claude'], ['order hinge pins', '2026-11-08', 'claude']]);
});

test('TD-R14 the reply line matches the spec table', () => {
  assert.equal(addedLine([{ text: 'call the plumber', due: T }], T), 'Added to Today: call the plumber.');
  assert.equal(addedLine([{ text: 'order hinge pins', due: '2026-11-08' }], T), 'Added to Tomorrow: order hinge pins.');
});

test('TD-R15 list shows Today then Tomorrow, numbered, with rolled days', async () => {
  const g = fakeGh({ record: { version: 1, items: [item('a', 'call the plumber', T), item('b', 'email Sam', '2026-11-05'), item('c', 'order hinge pins', '2026-11-08')] } });
  const out = await run(['list'], { store: githubStore('O/R', g.run), today: T });
  assert.equal(out, '**Today**\n1. call the plumber\n2. email Sam (2 days)\n**Tomorrow**\n1. order hinge pins');
  const json = JSON.parse(await run(['list', '--json'], { store: githubStore('O/R', g.run), today: T }));
  assert.deepEqual(json.today.map((i) => i.id), ['a', 'b']);
});

test('TD-R15 an empty list says so', () => {
  assert.equal(listText({ version: 1, items: [] }, T), "**Today**\nToday's clear.\n**Tomorrow**\nNothing planned.");
});

test('TD-R16 done and move by id, with their reply lines', async () => {
  const g = fakeGh({ record: { version: 1, items: [item('a', 'order hinge pins', T), item('b', 'call Mom', T)] } });
  const store = githubStore('O/R', g.run);
  assert.equal(await run(['done', 'a'], { store, today: T, now: NOW }), 'Done: order hinge pins.');
  assert.equal(await run(['move', 'b'], { store, today: T, now: NOW }), 'Moved to Tomorrow: call Mom.');
  assert.deepEqual(g.commits, ['Done: order hinge pins', 'Move to tomorrow: call Mom']);
  await assert.rejects(run(['done', 'zzz'], { store, today: T }), RecordError);
});

test('TD-R07 the helper retries once on a stale sha (GitHub 409)', async () => {
  const g = fakeGh({ record: { version: 1, items: [item('a', 'sample', T)] } });
  const store = githubStore('O/R', g.run);
  const realWrite = store.write;
  let first = true;
  store.write = async (text, sha, msg) => {
    if (first) { first = false; g.sha = 'moved-on'; } // someone else saved in between
    return realWrite(text, sha, msg);
  };
  await run(['add', '--today', 'second'], { store, today: T, now: NOW });
  assert.equal(parseRecord(g.text).items.length, 2);
});

test('TD-R07 the first add creates items.json in an empty repo', async () => {
  const g = fakeGh();
  await run(['add', '--today', 'first'], { store: githubStore('O/R', g.run), today: T, now: NOW });
  assert.equal(parseRecord(g.text).items[0].text, 'first');
});

test('TD-R08 a public repo is refused', async () => {
  await assert.rejects(checkPrivate('O/R', fakeGh({ isPrivate: false }).run), /public/);
  await checkPrivate('O/R', fakeGh().run);
});

test('add arguments are checked', () => {
  assert.deepEqual(parseAddArgs(['--tomorrow', 'x']), [{ day: 'tomorrow', text: 'x' }]);
  assert.throws(() => parseAddArgs(['--later', 'x']), RecordError);
  assert.throws(() => parseAddArgs(['--today']), RecordError);
  assert.throws(() => parseAddArgs([]), RecordError);
});

test('TD-R23 the repo name comes from TODAY_REPO or the config file, never a token', () => {
  assert.equal(readRepo({ TODAY_REPO: 'O/R' }, '/nope'), 'O/R');
  assert.equal(readRepo({}, '/nope/config.json'), null);
});

test('install copies a self-contained skill', () => {
  const dest = join(mkdtempSync(join(tmpdir(), 'today-skill-')), 'today');
  execFileSync('node', [new URL('../tools/install-skill.mjs', import.meta.url).pathname, dest]);
  for (const f of ['SKILL.md', 'record-format.md', 'today.mjs', 'core.js']) assert.ok(existsSync(join(dest, f)), f);
  assert.ok(readFileSync(join(dest, 'core.js'), 'utf8').includes('export async function save'));
});

test('TD-R19 an item already open is not added twice; the rest of the sentence is', async () => {
  const g = fakeGh({ record: { version: 1, items: [item('a', 'call the plumber', T)] } });
  const store = githubStore('O/R', g.run);
  const line = await run(['add', '--today', 'Call the  plumber.', '--tomorrow', 'order hinge pins'], { store, today: T, now: NOW });
  assert.equal(line, 'Added to Tomorrow: order hinge pins. Already on Today: call the plumber.');
  assert.equal(parseRecord(g.text).items.length, 2);
  const again = await run(['add', '--today', 'call the plumber'], { store, today: T, now: NOW });
  assert.equal(again, 'Already on Today: call the plumber.');
  assert.equal(g.commits.length, 1, 'nothing written when everything was already there');
});
