#!/usr/bin/env node
// Build step B6: the checks that can run from this computer against the private test repo,
// with this computer's `gh` sign-in. The phone run (TD-A02, TD-A03 in the Claude app) is done by hand.
//   node tools/b6-check.mjs <private test repo>
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { githubStore } from '../site/github.js';
import { save, addChange, finishChange, unfinishChange, view, parseRecord, ymd, addDays } from '../site/core.js';

const repo = process.argv[2];
if (!repo) { console.log('Usage: node tools/b6-check.mjs <private test repo>'); process.exit(2); }
const token = execFileSync('gh', ['auth', 'token']).toString().trim();
const today = ymd(new Date());
const app = githubStore(repo, token);         // what the app uses
const helper = fileURLToPath(new URL('../skill/today.mjs', import.meta.url));
const skill = (...args) => execFileSync('node', [helper, ...args], { env: { ...process.env, TODAY_REPO: repo } }).toString().trim();
const commits = (n) => JSON.parse(execFileSync('gh', ['api', `repos/${repo}/commits?per_page=${n}`])).map((c) => c.commit.message.split('\n')[0]);
let failed = 0;
const check = (ok, id, what, detail = '') => { console.log(`${ok ? 'pass' : 'FAIL'}  ${id}  ${what}${detail ? ` — ${detail}` : ''}`); if (!ok) failed++; };
const read = async () => parseRecord((await app.read()).text);

// TD-A01: Claude Code adds; the app's client reads it at once (the app refreshes every 15 s while open).
const t0 = Date.now();
const reply = skill('add', '--today', 'Sample: B6 call the rep');
const seen = view(await read(), today).today.some((i) => i.text === 'Sample: B6 call the rep');
check(reply === 'Added to Today: Sample: B6 call the rep.' && seen && commits(1)[0] === 'Add: Sample: B6 call the rep',
  'TD-A01', 'Claude Code /today shows in the app, one commit', `${Date.now() - t0} ms`);

// TD-A04: done from Claude, then Undo from the app brings it back.
const id = (await read()).items.find((i) => i.text === 'Sample: B6 call the rep').id;
const doneReply = skill('done', id);
const gone = !view(await read(), today).today.some((i) => i.id === id);
await save(app, unfinishChange(id), { today });
const back = view(await read(), today).today.some((i) => i.id === id);
check(doneReply === 'Done: Sample: B6 call the rep.' && gone && back, 'TD-A04', '"done with…" finishes it; Undo brings it back', commits(2).join(' | '));

// TD-A05: an item left unfinished rolls to Today with a count (dated two days back, as if left over).
const old = addChange('Sample: B6 left over', 'today', { today: addDays(today, -2), by: 'app' });
await save(app, old, { today });
const listed = skill('list');
const row = view(await read(), today).today.find((i) => i.id === old.item.id);
check(row?.rolledLabel === '2 days' && listed.includes('Sample: B6 left over (2 days)'), 'TD-A05', 'unfinished item rolls to Today with "2 days"');

// TD-A06: Claude adds while the app saves from an older copy; both survive (one gets a 409 and retries).
const a = save(app, finishChange(old.item.id), { today });
const b = Promise.resolve().then(() => skill('add', '--tomorrow', 'Sample: B6 from Claude at the same time'));
await Promise.all([a, b]);
const r = await read();
check(r.items.find((i) => i.id === old.item.id)?.done === true && r.items.some((i) => i.text === 'Sample: B6 from Claude at the same time'),
  'TD-A06', 'two saves at once from the app and Claude both survive');

// Tidy: finish the items this run added, so the test list stays short.
for (const it of (await read()).items.filter((i) => !i.done && i.text.startsWith('Sample: B6'))) await save(app, finishChange(it.id), { today });

console.log(failed ? `${failed} failed` : 'All passed');
process.exit(failed ? 1 : 0);
