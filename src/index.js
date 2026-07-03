/**
 * Today — Cloudflare Worker entry.
 *
 * Static files in /public are served automatically via the [assets] binding.
 * This Worker handles the tiny API: login/logout + the gated sync endpoint.
 */
import { handleSync } from './sync.js';
import { handleLogin, handleLogout } from './auth.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/sync')   return handleSync(request, env);
    if (url.pathname === '/api/login'  && request.method === 'POST') return handleLogin(request, env);
    if (url.pathname === '/api/logout' && request.method === 'POST') return handleLogout(request);
    // Not an API route — let the assets binding answer (static shell), else 404.
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response('Not found', { status: 404 });
  },
};
