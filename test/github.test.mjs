// B5: the app's GitHub client, against a fake api.github.com. Made-up items only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { githubStore, GitHubError, explain } from '../site/github.js';
import { save, addChange, parseRecord } from '../site/core.js';

const T = '2026-11-07';

function fakeApi({ isPrivate = true, push = true, status = 200, file = null } = {}) {
  const s = { file, calls: [] };
  s.fetch = async (url, opts = {}) => {
    s.calls.push(`${opts.method || 'GET'} ${new URL(url).pathname}`);
    assert.match(opts.headers.Authorization, /^Bearer /, 'the token goes in a header');
    assert.ok(!url.includes('tok'), 'never in the address');
    const r = (st, j) => new Response(j ? JSON.stringify(j) : null, { status: st });
    if (status !== 200) return r(status, { message: 'nope' });
    if (url.endsWith('/repos/O/R')) return r(200, { full_name: 'O/R', private: isPrivate, permissions: { push } });
    if (!opts.method) return s.file ? r(200, { content: s.file.content, sha: s.file.sha }) : r(404, { message: 'Not Found' });
    const body = JSON.parse(opts.body);
    if ((body.sha || null) !== (s.file?.sha || null)) return r(409, { message: 'does not match' });
    s.file = { content: body.content, sha: `x${s.calls.length}` };
    return r(201, { content: { sha: s.file.sha } });
  };
  return s;
}

test('TD-R07 the app saves through GitHub with the sha guard, and reads its own write', async () => {
  const api = fakeApi();
  const store = githubStore('O/R', 'tok', api.fetch);
  await save(store, addChange('Sample: café, 3 mm', 'today', { today: T }), { today: T });
  const got = await store.read();
  assert.equal(parseRecord(got.text).items[0].text, 'Sample: café, 3 mm', 'non-ASCII survives the base64 round trip');
  assert.ok(api.calls.some((c) => c.startsWith('PUT')));
});

test('TD-R08 a public repo is refused before any write', async () => {
  const api = fakeApi({ isPrivate: false });
  const store = githubStore('O/R', 'tok', api.fetch);
  await assert.rejects(store.check(), (e) => e instanceof GitHubError && e.kind === 'public');
  await assert.rejects(save(store, addChange('x', 'today', { today: T }), { today: T }), (e) => e.kind === 'public');
  assert.ok(!api.calls.some((c) => c.startsWith('PUT')), 'nothing was written');
});

test('a read-only token is refused at Connect', async () => {
  await assert.rejects(githubStore('O/R', 'tok', fakeApi({ push: false }).fetch).check(), (e) => e.kind === 'rights');
});

test('TD-E06 an expired token says what to do', async () => {
  const store = githubStore('O/R', 'tok', fakeApi({ status: 401 }).fetch);
  await assert.rejects(store.read(), (e) => e.kind === 'auth' && /expired/.test(e.message));
});

test('a stale sha from GitHub is a conflict the core retries', async () => {
  const api = fakeApi();
  const store = githubStore('O/R', 'tok', api.fetch);
  await assert.rejects(store.write('{}', 'old', 'm'), (e) => e.conflict === true);
});

test('plain words for each GitHub answer', () => {
  assert.equal(explain(404, 'O/R').kind, 'missing');
  assert.equal(explain(403, 'O/R').kind, 'rights');
  assert.equal(explain(500, 'O/R').kind, 'other');
});
