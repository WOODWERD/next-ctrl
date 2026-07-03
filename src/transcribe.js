/**
 * Voice capture: POST /api/transcribe
 *   Body:  raw audio bytes (whatever the browser's MediaRecorder produced)
 *   Reply: { text }
 *
 * Runs Whisper on Cloudflare Workers AI (bound as `AI`). Session-gated like sync.
 */

import { verifySession } from './auth.js';

const MAX_BYTES = 8 * 1024 * 1024;   // ~8 MB cap (short clips only)

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

export async function handleTranscribe(request, env) {
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  if (!(await verifySession(request, env))) return json({ error: 'unauthenticated' }, 401);
  if (!env || !env.AI) return json({ error: 'AI is not bound. See README.' }, 500);

  const buf = await request.arrayBuffer();
  if (!buf || buf.byteLength === 0) return json({ error: 'no audio' }, 400);
  if (buf.byteLength > MAX_BYTES) return json({ error: 'audio too large' }, 413);

  try {
    const result = await env.AI.run('@cf/openai/whisper', { audio: [...new Uint8Array(buf)] });
    const text = (result && typeof result.text === 'string') ? result.text.trim() : '';
    return json({ text });
  } catch {
    return json({ error: 'transcription failed' }, 502);
  }
}
