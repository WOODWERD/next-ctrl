# Today

A dead-simple capture list. Type a thing, pick **Today** or **Tomorrow**, done.
Installs to your iPhone/iPad home screen like a real app, works offline, and syncs
the same list across all your devices.

- **Capture-first** — one input, Enter to add. Two buckets: Today / Tomorrow.
- **Standalone app** — add to Home Screen; opens full-screen, no browser chrome.
- **Offline** — everything is saved on-device instantly; syncs when you're online.
- **Cross-device sync** — a private *sync code* pairs your phone and iPad to one list.
  No account, no login.
- **Auto rollover** — a task set for Tomorrow simply becomes Today when the day flips.

It's a static web app plus one tiny serverless function, hosted free on **Cloudflare Pages**.

---

## Deploy it (about 10 minutes, free)

You'll host the app on Cloudflare Pages and give it a small key-value store (Workers KV)
for sync. Everything below is free at personal scale.

### Option A — GitHub + Cloudflare dashboard (easiest, auto-deploys on every push)

1. **Push this repo to GitHub** (already done if you're reading this there).
2. Create a free account at <https://dash.cloudflare.com>.
3. **Make the KV store:** in the dashboard go to **Storage & Databases → KV → Create namespace**,
   name it `TODOS`. (You don't need to copy the id for this option.)
4. **Create the site:** **Workers & Pages → Create → Pages → Connect to Git**, pick this repo.
   - Framework preset: **None**
   - Build command: *(leave empty)*
   - Build output directory: **`public`**
   - Click **Save and Deploy**.
5. **Bind the KV store:** open your new Pages project → **Settings → Bindings → Add → KV namespace**.
   - Variable name: **`TODOS`**  (must be exactly this)
   - KV namespace: select **`TODOS`**
   - Save, then **Deployments → Retry deployment** (or push any commit) so the binding takes effect.
6. Open the URL Cloudflare gives you (e.g. `https://today-xxx.pages.dev`). Done.

### Option B — Command line (Wrangler)

```bash
npm install
npx wrangler login

# create the KV store and copy the id it prints
npx wrangler kv namespace create TODOS
#   -> paste the id into wrangler.toml (replace PASTE_YOUR_KV_NAMESPACE_ID_HERE)

npm run deploy
```

Run it locally first if you like: `npm run dev` then open the printed localhost URL.

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
public/                 the installable PWA (static)
  index.html            markup
  style.css             styling (light + dark, safe-area aware)
  app.js                local-first state + per-item sync
  sw.js                 service worker (offline shell cache)
  manifest.webmanifest  home-screen install metadata
  icon-*.png            app icons (regenerate with `npm run icons`)
functions/api/sync.js   Cloudflare Pages Function: merges + stores the list in KV
wrangler.toml           project + KV binding config
scripts/make_icons.py   dependency-free icon generator
```

**Sync model:** each device keeps the list in `localStorage` and is always usable offline.
On every change it POSTs its items to `/api/sync`, which merges them into the shared blob
in KV **per item, newest-write-wins**, and returns the merged list. Deletes travel as
tombstones and are cleaned up after 30 days. Adding on your phone and iPad at the same time
never clobbers — both survive.
