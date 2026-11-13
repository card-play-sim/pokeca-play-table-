# CODEX-CONTROL-003: installed PWA update

Baseline main: 13b43222. Its 22 checked public URLs matched main, including manual
opening code. However, the pre-fix and repaired releases all retained the v246
label, mobile build declaration and `?build=246` asset URLs. A matching v246 label
did not establish which release the installed Android PWA was executing.

## Reproduced failure and correction
A persistent Chromium profile installs the genuine pre-manual-opening v246 from
87b5b668, starts/saves a real reference match and keeps IndexedDB, localStorage and
Cache Storage. Serving 13b43222 while one old build=246 script stays stale causes
the candidate worker's byte verification to reject installation (redundant). The
old client still reports matching v246 labels as ready and retains auto setup.
This reproduces an update failure mechanism; the user's physical device itself
has not been inspected.

Some legacy cold launches retained v246 even after the new cache was created.
A network-only `update.html` entry therefore avoids depending on the old cached
client. It registers/checks the existing worker, activates a waiting verified
release, confirms its version and returns to the existing app without accessing
match storage.

The corrected release is v247, consistently in HTML, runtime declaration, visible
label, all versioned asset URLs and generated worker. The stable manifest
start_url/scope and worker registration URL are retained for the existing PWA.
The updater exposes `最新版を確認・更新`, reports failed installs and network errors,
retries a bounded number of times, and saves successfully before reload. Ready
state requires the manual-opening capability as well as coherent build numbers.
Offline launches use the controlling worker without creating unhandled network
registration failures. Neither registration removal nor site-data clearing is
used. Worker cleanup remains limited to this app's obsolete shell caches.

## Verification
- Real persistent profile: old v246 offline cold start, rejected same-URL mixed
  update, then the network recovery entry upgrades to v247 while
  old build=246 URLs remain stale. No registration/update/storage-reset injection
  is used by the test; the real recovery page performs the native update.
- Existing match ID and Game State preserved, unrelated localStorage and cache
  sentinel preserved, every worker-cached response matches its manifest SHA-256.
- Visible v247 confirmed; both fixed decks display seven cards for manual
  Active/optional Bench selection and changes before committing. Cold offline
  restart restores the new match, and the original saved match is still readable.
- PR CI runs this installed-profile test. Published CI repeats it with actual
  Pages asset bytes, then tests the actual public origin's worker and direct
  network bytes, manual opening, effects, full AI matches and offline resume.
- Published-file verification now covers every cache entry plus sw.js and the
  reference plans, including versioned mobile/updater scripts, plus the network recovery entry/loader, rather than only
  the former four-file subset.

Formal 1945 DB, fixed 120 cards, image registry, approved engine/AI modules and
saved-game schema are unchanged. This is Chromium Pixel 5 emulation with real
worker/cache/storage lifecycle, not a physical Android/WebAPK installation test.

## Android update route
Open `https://card-play-sim.github.io/pokeca-play-table-/update.html?build=247`
while online. It confirms the active verified worker and returns to the existing
app. The visible target is `手動対戦準備対応 v247`. The menu also offers
`最新版を確認・更新`. Existing matches resume as saved; use `固定デッキ対戦` to open a
new seven-card preparation. Updating does not require clearing site data or
reinstalling the app.
