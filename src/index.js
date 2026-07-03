/**
 * Today — Cloudflare Worker entry.
 *
 * Static files in /public are served automatically via the [assets] binding.
 * This Worker only handles the sync API; anything else falls through to assets.
 */
import { handleSync } from './sync.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/sync') return handleSync(request, env);
    // Not an API route and not a static asset — let the assets binding answer
    // (covers direct navigation / offline shell), else 404.
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response('Not found', { status: 404 });
  },
};
