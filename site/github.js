// The person's own private repo (TD-R08, TD-R32). Talks only to api.github.com, only for that repo,
// only for items.json. The token goes in a header, never in an address, a file or a log.
// Same read/write shape as the stand-in and the skill's helper, so core.save() works on all three.

const API = 'https://api.github.com';
export const GUIDE = 'https://woodwerd.github.io/github.html';
const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (s) => { const bytes = enc.encode(s); let out = ''; for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(out); };
const unb64 = (s) => { const bin = atob(String(s).replace(/\s/g, '')); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return dec.decode(out); };
export const REPO_RE = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;

// What went wrong, in plain words, and what to do (TD-E06).
export function explain(status, repo) {
  if (status === 401) return { kind: 'auth', text: `GitHub turned the token down. It may have expired. Make a new one for ${repo} with Contents read and write, and connect again.` };
  if (status === 403) return { kind: 'rights', text: `The token can't change ${repo}. Give it Contents read and write for this repo.` };
  if (status === 404) return { kind: 'missing', text: `There's no repo ${repo} that this token can see. Check the name, and that the token covers this repo.` };
  if (status === 'public') return { kind: 'public', text: `${repo} is public, so anyone could read your list. TODAY only uses a private repo. On GitHub, open the repo's Settings, then General, and under Danger Zone make it private.` };
  if (status === 'readonly') return { kind: 'rights', text: `The token can read ${repo} but not change it. Give it Contents read and write.` };
  return { kind: 'other', text: `GitHub answered ${status}. Nothing was lost; it will try again.` };
}

export class GitHubError extends Error {
  constructor(status, repo) { const e = explain(status, repo); super(e.text); this.name = 'GitHubError'; this.status = status; this.kind = e.kind; }
}

export function githubStore(repo, token, fetchFn = (...a) => fetch(...a)) {
  const call = async (path, opts = {}) => {
    // A network failure throws a TypeError, which the app reads as offline.
    const res = await fetchFn(`${API}/repos/${repo}${path}`, { ...opts, cache: 'no-store',
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) } });
    let json = null; try { json = await res.json(); } catch { /* empty body */ }
    return { status: res.status, json };
  };
  const path = '/contents/items.json';

  async function check() {
    const r = await call('');
    if (r.status !== 200) throw new GitHubError(r.status, repo);
    if (!r.json.private) throw new GitHubError('public', repo);
    if (r.json.permissions && !r.json.permissions.push) throw new GitHubError('readonly', repo);
    return { name: r.json.full_name || repo };
  }

  return {
    name: repo,
    check,
    async read() {
      const r = await call(path);
      if (r.status === 404) {
        // No items.json yet is fine; no repo at all is not.
        await check();
        return null;
      }
      if (r.status !== 200) throw new GitHubError(r.status, repo);
      return { text: unb64(r.json.content), sha: r.json.sha };
    },
    async write(text, sha, message) {
      await check(); // never write to a repo that has been made public (TD-R08)
      const body = { message, content: b64(text) };
      if (sha) body.sha = sha;
      const r = await call(path, { method: 'PUT', body: JSON.stringify(body) });
      if (r.status === 200 || r.status === 201) return r.json.content.sha;
      if (r.status === 409 || (r.status === 422 && /sha/i.test(r.json?.message || ''))) { const e = new Error('stale'); e.conflict = true; throw e; }
      throw new GitHubError(r.status, repo);
    },
  };
}

// The connection kept on this device only (TD-R32): the repo name and the token.
const KEY = 'today.conn';
export function loadConn(ns = '') {
  try { const c = JSON.parse(localStorage.getItem(KEY + ns)); return c && REPO_RE.test(c.repo) && c.token ? c : null; } catch { return null; }
}
export function saveConn(repo, token, ns = '') { try { localStorage.setItem(KEY + ns, JSON.stringify({ repo, token })); } catch { /* storage unavailable */ } }
export function clearConn(ns = '') { try { localStorage.removeItem(KEY + ns); } catch { /* fine */ } }

// A stand-in for api.github.com, for checking the Connect screens on this computer only
// (?standin=github). Repos: me/today-list (private, empty), me/open-list (public),
// me/read-only (private, no write). Any token starting "bad" is turned down.
export const standinAllowed = () => ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
export function standinFetch() {
  const repos = { 'me/today-list': { private: true, push: true }, 'me/open-list': { private: false, push: true }, 'me/read-only': { private: true, push: false } };
  const files = JSON.parse(sessionStorage.getItem('today.ghstandin') || '{}');
  const keep = () => sessionStorage.setItem('today.ghstandin', JSON.stringify(files));
  const reply = (status, json) => new Response(json === undefined ? null : JSON.stringify(json), { status, headers: { 'Content-Type': 'application/json' } });
  return async (url, opts = {}) => {
    await new Promise((r) => setTimeout(r, 150));
    const token = (opts.headers?.Authorization || '').replace('Bearer ', '');
    if (token.startsWith('bad')) return reply(401, { message: 'Bad credentials' });
    const m = /\/repos\/([^/]+\/[^/]+)(\/contents\/items\.json)?$/.exec(new URL(url).pathname);
    const repo = m && repos[m[1]];
    if (!repo) return reply(404, { message: 'Not Found' });
    if (!m[2]) return reply(200, { full_name: m[1], private: repo.private, permissions: { push: repo.push } });
    const f = files[m[1]];
    if (!opts.method || opts.method === 'GET') return f ? reply(200, { content: f.content, sha: f.sha }) : reply(404, { message: 'Not Found' });
    const body = JSON.parse(opts.body);
    if ((body.sha || null) !== (f ? f.sha : null)) return reply(409, { message: 'items.json does not match' });
    const sha = `sha${Date.now().toString(36)}`;
    files[m[1]] = { content: body.content, sha }; keep();
    return reply(f ? 200 : 201, { content: { sha } });
  };
}
