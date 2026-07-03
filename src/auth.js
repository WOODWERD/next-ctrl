/**
 * Built-in single-user auth (first-party session cookie).
 *
 * Works in every browser on every device — no cross-site redirect like
 * Cloudflare Access, so Chrome (desktop and iPad) behaves the same as Safari.
 *
 * The password is a Worker secret `APP_PASSWORD` (set it with
 * `wrangler secret put APP_PASSWORD`, or in the dashboard under the Worker's
 * Variables and Secrets). A successful login sets a signed `sid` cookie; the
 * signature key is derived from the password, so changing it logs everyone out.
 *
 * If `APP_PASSWORD` is unset, only localhost is allowed (for `wrangler dev`).
 */

const COOKIE = 'sid';
const TTL_MS = 90 * 24 * 60 * 60 * 1000;   // 90-day sessions
const enc = new TextEncoder();
const dec = new TextDecoder();

const json = (obj, status = 200, extraHeaders = {}) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extraHeaders },
  });

function b64url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64url(str) {
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function timingEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
async function sign(secret, data) {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return b64url(new Uint8Array(sig));
}
function readCookie(request, name) {
  const raw = request.headers.get('Cookie') || '';
  const m = raw.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? m[1] : null;
}
function cookieHeader(token, maxAgeSec, secure) {
  const bits = [`${COOKIE}=${token}`, 'HttpOnly', 'SameSite=Lax', 'Path=/', `Max-Age=${maxAgeSec}`];
  if (secure) bits.push('Secure');
  return bits.join('; ');
}

/** True if the request carries a valid session (or is local dev with no password set). */
export async function verifySession(request, env) {
  if (!env || !env.APP_PASSWORD) {
    const host = new URL(request.url).hostname;
    return host === 'localhost' || host === '127.0.0.1';
  }
  const token = readCookie(request, COOKIE);
  if (!token) return false;
  const dot = token.lastIndexOf('.');
  if (dot < 1) return false;
  const body = token.slice(0, dot), sig = token.slice(dot + 1);
  if (!timingEqual(sig, await sign(env.APP_PASSWORD, body))) return false;
  try {
    const payload = JSON.parse(dec.decode(unb64url(body)));
    return typeof payload.exp === 'number' && payload.exp > Date.now();
  } catch { return false; }
}

/** POST /api/login { password } -> sets the session cookie on success. */
export async function handleLogin(request, env) {
  if (!env || !env.APP_PASSWORD) return json({ error: 'server not configured' }, 500);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad request' }, 400); }
  const pw = String((body && body.password) ?? '');
  if (!timingEqual(pw, env.APP_PASSWORD)) return json({ error: 'wrong password' }, 401);

  const payload = b64url(enc.encode(JSON.stringify({ exp: Date.now() + TTL_MS })));
  const token = payload + '.' + await sign(env.APP_PASSWORD, payload);
  const secure = new URL(request.url).protocol === 'https:';
  return json({ ok: true }, 200, { 'set-cookie': cookieHeader(token, Math.floor(TTL_MS / 1000), secure) });
}

/** POST /api/logout -> clears the session cookie. */
export function handleLogout(request) {
  const secure = new URL(request.url).protocol === 'https:';
  return json({ ok: true }, 200, { 'set-cookie': cookieHeader('', 0, secure) });
}
