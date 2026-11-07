#!/usr/bin/env node
// Checks the app's GitHub client against real GitHub, using this computer's `gh` sign-in,
// so no token is ever typed into the page (CLAUDE.md). Uses only the private test repo
// and one public repo, which it never writes to.
//   node tools/live-check.mjs <private test repo> <any public repo>
import { execFileSync } from 'node:child_process';
import { githubStore, GitHubError } from '../site/github.js';
import { save, addChange, finishChange, parseRecord, ymd } from '../site/core.js';

const [testRepo, publicRepo] = process.argv.slice(2);
if (!testRepo || !publicRepo) { console.log('Usage: node tools/live-check.mjs <private test repo> <public repo>'); process.exit(2); }
const token = execFileSync('gh', ['auth', 'token']).toString().trim();
const today = ymd(new Date());
const line = (ok, what) => console.log(`${ok ? 'pass' : 'FAIL'}  ${what}`);
let failed = 0;
const check = (ok, what) => { line(ok, what); if (!ok) failed++; };

const store = githubStore(testRepo, token);
check((await store.check()).name.toLowerCase() === testRepo.toLowerCase(), `Connect accepts ${testRepo} (private, can write)`);

const before = await store.read();
check(!!before && parseRecord(before.text).items.length > 0, 'reads items.json');

const add = addChange('Sample: live check from the app client', 'today', { today, by: 'app' });
const out = await save(store, add, { today });
check(out.record.items.some((i) => i.id === add.item.id), 'adds an item (one commit)');

let stale = false;
try { await store.write(before.text, before.sha, 'Stale write that must be refused'); } catch (e) { stale = e.conflict === true; }
check(stale, 'a write with an old sha is refused by GitHub (409)');

const done = await save(store, finishChange(add.item.id), { today });
check(done.record.items.find((i) => i.id === add.item.id).done === true, 'finishes it again (one commit)');

let refused = null;
try { await githubStore(publicRepo, token).check(); } catch (e) { refused = e; }
check(refused instanceof GitHubError && refused.kind === 'public', `Connect refuses ${publicRepo} because it's public`);

let bad = null;
try { await githubStore(testRepo, 'bad-token-for-the-check').read(); } catch (e) { bad = e; }
check(bad instanceof GitHubError && bad.kind === 'auth', 'a bad token gets the "turned the token down" message');

console.log(failed ? `${failed} failed` : 'All passed');
process.exit(failed ? 1 : 0);
