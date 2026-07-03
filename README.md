# Today

A dead-simple capture list. Type a thing, pick **Today** or **Tomorrow**, done.
Installs to your iPhone/iPad home screen like a real app, works offline, and syncs
the same list across all your devices. Styled with the **WOODWERD** design system.

- **Capture-first** — Enter to add. Two buckets only: Today / Tomorrow, both always visible.
- **Swipe to act** — swipe a task **right to finish**, **left to move** it to the other day.
- **Standalone app** — add to Home Screen; opens full-screen, no browser chrome.
- **Offline** — everything is saved on-device instantly; syncs when you're online.
- **Cross-device sync** — a private *sync code* pairs your phone and iPad to one list.
  No account, no login.
- **Auto rollover** — a task set for Tomorrow simply becomes Today when the day flips.
- **Responsive** — phone shows one dense scrolling list; iPad shows Today and Tomorrow
  as two side-by-side columns, each with its own add line.

It's a single **Cloudflare Worker** that serves the static app *and* the sync API, backed
by **Workers KV** — free at personal scale.

---

## Deploy it (about 10 minutes, free)

You need a free Cloudflare account and a KV namespace. The KV namespace id already lives in
`wrangler.toml` (`[[kv_namespaces]]`), so deploys bind storage automatically — no dashboard
binding step.

### Option A — GitHub + Cloudflare dashboard (auto-deploys on every push to `main`)

1. Create a free account at <https://dash.cloudflare.com>.
2. **Make the KV store:** **Storage & Databases → KV → Create namespace** (any name).
   Open its **Settings** tab, copy the **Namespace ID**, and paste it into `wrangler.toml`
   (replace the `id = "…"` value), then commit.
3. **Create the app:** **Workers & Pages → Create → Workers → Import a repository**, pick this
   repo. Leave **Build command** empty; **Deploy command** is `npx wrangler deploy`.
   Click **Deploy**. The Worker reads `wrangler.toml` for the `public/` assets and the KV binding.
4. Cloudflare gives you a `https://today.<your-subdomain>.workers.dev` URL. Done.

> The build deploys from your repo's **production branch** (default `main`). Make sure the
> app is on that branch, or change it under **Settings → Build → Branch control**.

### Option B — Command line (Wrangler)

```bash
npm install
npx wrangler login
# put your KV namespace id in wrangler.toml, then:
npm run deploy
```

Run it locally first if you like: `npm run dev` then open the printed localhost URL.

### Use your own domain

In the Worker → **Domains → Add** → e.g. `today.woodwerd.com`. If the domain's DNS is already
on Cloudflare, the record is added for you and goes live in a minute.

---

## Add it to your iPhone / iPad

1. Open the site URL in **Safari** (must be Safari for install to work).
2. Tap the **Share** button → **Add to Home Screen** → **Add**.
3. Launch it from the new icon — it runs full-screen as its own app.

## Share one list across devices

1. On the first device, tap **Sync** (top right). Tap **Copy** to copy your sync code.
2. On the second device, open the app, tap **Sync**, paste the code into the box,
   tap **Use this code**. Both devices now share the same list.

The dot next to **Sync** is green when the last sync succeeded, red when you're offline
(your edits are still saved locally and will sync automatically once you're back online).

> The sync code is the only key to your list — anyone with it can read/write your tasks,
> so keep it private. Tap **New code** any time to rotate it.

---

## How it's built

```
public/                 the installable PWA (static assets, served by the Worker)
  index.html            markup (one DOM drives both phone + iPad layouts)
  style.css             WOODWERD tokens + responsive phone/iPad styling
  app.js                local-first state, swipe gestures, per-item sync
  sw.js                 service worker (offline shell + font cache)
  manifest.webmanifest  home-screen install metadata
  fonts/                WOODWERD faces: Gotham, CargoD, Roboto (see licensing)
  icon-*.png            app icons (regenerate with `npm run icons`)
src/index.js            Worker entry: routes /api/sync, serves public/ assets
src/sync.js             sync handler: merges + stores the list in KV
wrangler.toml           Worker config (assets dir + KV binding)
scripts/make_icons.py   dependency-free icon generator
scripts/test_*.mjs      sync unit tests + headless-browser end-to-end test
```

**Design — WOODWERD.** Warm cream canvas (`#F9F7F3`), ink text, amber-gold accent
(`#C4944A`), sharp corners, editorial type. Phone = layout *2a* (dense swipe list,
bottom add bar with a Today/Tmrw chip); iPad = layout *4a* (two columns, per-column
add line). The breakpoint is 700px.

**Sync model:** each device keeps the list in `localStorage` and is always usable offline.
On every change it POSTs its items to `/api/sync`, which merges them into the shared blob
in KV **per item, newest-write-wins**, and returns the merged list. Completing a task and
deletes travel as tombstones (cleaned up after 30 days). Adding on your phone and iPad at
the same time never clobbers — both survive. Days roll over automatically: each task stores
an actual due date, so a Tomorrow task becomes Today at midnight with no server job.

## Fonts & licensing

The WOODWERD faces are bundled in `public/fonts/` so the app renders correctly offline:

- **Roboto** — Apache 2.0, free for web use.
- **Gotham** and **CargoD** — commercial/licensed faces. They're included here because
  they're part of your own WOODWERD design system; **confirm your license covers web
  (`@font-face`) embedding before deploying publicly.** If you'd rather not ship them,
  delete the two Gotham files + `CargoD.otf` and the app falls back to `system-ui`
  (the layout and colors are unaffected).
