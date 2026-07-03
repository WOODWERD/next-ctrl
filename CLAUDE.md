# CLAUDE.md — project guide for Today

A deliberately minimal personal task app: capture a task, choose **Today** or **Tomorrow**,
done. Installable PWA, works offline, syncs one list across the owner's devices.

**Live:** https://today.woodwerd.com — private (Cloudflare Access, owner email only).

## Architecture (one Cloudflare Worker)

- Deployed as a **Cloudflare Worker** named `today` that serves the static app *and* the API.
- **Static assets:** everything in `public/`, served automatically via the `[assets]` binding.
- **API:** `POST /api/sync` handled by the Worker (`src/index.js` → `src/sync.js`).
- **Storage:** Workers **KV** namespace bound as `TODOS` (id in `wrangler.toml`).
- **Auth/privacy:** **built-in login** (`src/auth.js`). Single-user password stored as the
  Worker secret `APP_PASSWORD` (`wrangler secret put APP_PASSWORD`, or the dashboard). A
  successful `POST /api/login` sets a signed first-party `sid` cookie (HMAC key derived from
  the password; 90-day TTL); `POST /api/logout` clears it. `/api/sync` requires a valid
  session (else 401) and stores everything under one key (`list:owner`), so all logged-in
  devices share one list. The app shell is public; the login screen (`#login`) shows until a
  session exists. No `APP_PASSWORD` set → only `localhost` is allowed (for `wrangler dev`).
  Chosen over Cloudflare Access because a first-party cookie works in every browser incl.
  iPad Chrome (Access's cross-site redirect breaks under iOS WebKit).

## Key files

```
public/index.html          one DOM drives both layouts (phone + iPad)
public/style.css           WOODWERD design tokens + responsive styling
public/app.js              local-first state, swipe gestures, sync (POST { items })
public/sw.js               service worker (offline shell + fonts); bump CACHE on shell changes
public/pwa/                install assets (manifest + icons); public via one Access Bypass rule (today.woodwerd.com path pwa/*)
public/fonts/              WOODWERD fonts
src/index.js               Worker entry: routes /api/sync, else serves assets
src/sync.js                sync handler: identity key + per-item merge in KV
wrangler.toml              Worker config: main, [assets] dir, KV binding (TODOS)
scripts/make_icons.py      dependency-free PNG icon generator (npm run icons)
scripts/test_sync.mjs      unit tests for the sync/merge handler
scripts/test_e2e.mjs       headless-browser end-to-end test (uses playwright-core)
```

## Data model & sync

- Item: `{ id, text, due: 'YYYY-MM-DD', done, deleted, updatedAt }`.
- **Buckets are derived from `due`** vs today → free midnight rollover (a Tomorrow task
  becomes Today at the date flip; sync-safe, no server job).
- Swipe **right = finish** (soft-delete + tombstone), swipe **left = move** to the other day.
- Sync = per-item **newest-`updatedAt`-wins** merge; deletes are tombstones GC'd after 30 days.
- `localStorage` is the on-device source of truth, so the app always works offline.

## Design system — WOODWERD

Warm cream canvas `#F9F7F3`, ink text `#0C0B09`, amber accent `#C4944A`, sharp corners,
editorial type. Fonts in `public/fonts/`: Roboto (Apache-2.0), **Gotham + CargoD (commercial —
confirm license before wider web use)**. Phone = layout 2a (dense list + bottom add bar with
Today/Tmrw chip); iPad = layout 4a (two columns, per-column add line). Breakpoint 700px.

## Develop / test / deploy

```bash
npm install
npm run dev     # wrangler dev (localhost is treated as authenticated for local testing)
npm test        # sync unit tests + e2e (needs playwright-core; chromium at /opt/pw-browsers)
npm run deploy  # npx wrangler deploy   (or just push to main)
```

**Deploy flow:** the Cloudflare **Workers Build** is connected to this repo and auto-deploys
on push to **`main`** (`npx wrangler deploy`). Normal change loop: branch → PR → merge to
`main` → auto-deploy. `wrangler.toml` carries the `public/` assets dir and the `TODOS` KV id,
so deploys wire up storage automatically (no dashboard binding needed).

## Gotchas

- Bump `CACHE` in `public/sw.js` whenever you change shell files, or installed apps serve stale assets.
- Setting `element.style.background = 'var(--x)'` is silently ignored by the CSSOM — use
  `backgroundColor` with a literal value (see the swipe underlay in `app.js`).
- iOS Safari: `.app` uses `height:100dvh` (after a `100vh` fallback) and the viewport meta sets
  `interactive-widget=resizes-content` so the keyboard shrinks the layout instead of scrolling
  the header off. Keep both.
