# Daily Quest (working title)

Offline-first PWA that turns a daily schedule into a game. The user defines recurring tasks, proves each one with a photo, earns XP, keeps streaks, levels up and unlocks achievements. No backend. Data moves between devices via (optionally encrypted) export/import files.

Owner: Zaky (web developer). Keep code clean and conventional; this is also portfolio-quality work.

## Stack

- TypeScript (strict), Vite, React 19
- Dexie (IndexedDB) + dexie-react-hooks
- Vitest + fake-indexeddb for tests; jsdom + Testing Library for screen flows
- vite-plugin-pwa (Workbox) — added in milestone 5
- Web Crypto API (PBKDF2 → AES-GCM) for encrypted backups. No zip or crypto library: the file format is a small custom container
- Plain CSS, system font stack (the app must work fully offline, so no remote fonts)

## Commands

- `npm run dev` — dev server
- `npm test` — Vitest (run once; domain, repository and component tests), `npm run test:watch`
- `npm run typecheck` — `tsc --noEmit`
- `npm run build` — typecheck + production build

## Architecture

```
src/
  domain/      Pure TypeScript. No DOM, no Dexie, no Date.now() inside logic.
    config.ts      Tunable constants (XP values, level curve, tiers)
    dates.ts       DateStr helpers ("YYYY-MM-DD", local calendar dates)
    recurrence.ts  Does a task apply on a date? Next N dates.
    schedule.ts    Which occurrences must exist / expire for a date range
    xp.ts          Ledger ordering, running XP timeline (floor at 0)
    days.ts        classifyDay: paused / rest / perfect / streak / broken
    streaks.ts     replayDays (streaks, perfect bonus, day XP), previewDay/forecastDay for today
    levels.ts      Exponential level curve (iterative multiplication, identical on every device)
    achievements.ts  All achievements with unlock dates, derived from replayed days + XP timeline
    progress.ts    computeProgress: everything the UI shows, derived in one call
    calendar.ts    Monday-to-Sunday grid for the consistency calendar
  db/          Dexie schema + repositories (the only code that touches IndexedDB); backup.ts = export/import
  backup/      Backup file format: container, chunked encryption, validation (no IndexedDB, no React)
  media/       Browser-only image helpers (compressImage: ≤1280px, WebP/JPEG)
  i18n/        t(), language state, Indonesian dictionary
  diagnostics/ On-device error log and report text
  reminders/   Notification settings and the in-app timer (rule itself is domain/nudge.ts)
  ui/          React components (App = tabs; TodayScreen, TasksScreen, StatsScreen, BackupScreen, ProofSheet, ProofImage, useProgress)
```

Rules:
- All game logic lives in `domain/` as pure functions that take `today` as a parameter. This makes it testable and lets us re-derive everything from the ledger.
- Dates are `DateStr` (`"2026-10-04"`), never UTC timestamps, for anything about "which day". Weekday/day-diff math uses `Date.UTC` on the parsed parts so device timezone and DST cannot shift results.
- Progress is **derived**: the ledger is append-only (a statement of what was awarded) and day records are written once; totals, levels, streaks and achievements are computed from them. A level-curve change applies retroactively. Changing XP amounts only affects days scored afterwards, because past ledger entries keep what they awarded.
- Nothing runs in the background. A **catch-up job** runs on app open (and on visibility change / midnight rollover) to create missing occurrences, expire overdue ones and score finished days. It must be idempotent.

## Domain model

```ts
type DateStr = string                        // "YYYY-MM-DD"
type Recurrence =
  | { type: 'daily' }
  | { type: 'weekdays'; days: number[] }     // 0=Sun … 6=Sat, e.g. [0, 2] = every Sunday and Tuesday
  | { type: 'interval'; every: number; anchor: DateStr } // every N days counted from anchor

Task        { id, title, recurrence, createdOn: DateStr, archivedOn?: DateStr, createdAt, updatedAt }
Occurrence  { id, taskId, date: DateStr, title (snapshot), status: 'pending'|'done'|'expired', proofId?, completedAt? }
            unique on [taskId+date]
Proof       { id, blob, mime, createdAt }
LedgerEntry { id, date: DateStr, kind, delta, refId?, createdAt }  kind: task_complete | day_perfect | day_streak | day_broken | day_rest.
            id is deterministic (`task_complete_<occurrenceId>`, `day_<date>`), so an event can never be awarded twice
DayRecord   { date (key), outcome, scheduled, done }  written once per finished day; paused days are not stored
Meta        { key, value }  lastCatchUpDate, lastFinalizedDate
```

Task applies on date `D` when: `createdOn <= D`, `archivedOn` is unset or `D < archivedOn`, and the recurrence matches `D`.
"Delete" in the UI = archive (`archivedOn = today`), so history and XP stay intact.

## Game rules

### Occurrence lifetime (refresh system)
An occurrence belongs to exactly one calendar day: it appears at the start of its date and expires at local midnight at the end of that date ("expires one day after it appeared"). A weekly task therefore shows up only on its scheduled days and no longer lingers for a week. This makes daily bonus and streaks per-day and simple.

### Editing and deleting
- Done and expired occurrences are never modified.
- Today's still-pending occurrence is re-synced when a task is edited or archived: it is created if the new recurrence applies today, removed if it no longer does.
- Title edits update the title of pending occurrences only.

### Completing a task
- Only today's pending occurrence can be completed, and only with a proof photo (`completeOccurrence`). The photo is stored and the +100 XP ledger entry is written in one transaction.
- Past days cannot be completed, even if the catch-up job has not yet expired them. Done tasks cannot be completed again.
- Proof capture uses the camera (`<input capture>`) on phones; desktop browsers fall back to a file picker. Photos are downscaled to ≤1280px and re-encoded (WebP, JPEG fallback). Proof is honor-based: offline, nothing can verify it.

### Day finalization
The catch-up job scores every finished day (from the day after the last scored one, up to yesterday; never today). It classifies the day from its **occurrences first**, so a task completed and then deleted the same day still counts. It stores a `DayRecord` and appends the day's XP to the ledger. Existing records and ledger entries are never overwritten, so it is safe to repeat and it recovers if its bookkeeping is lost. After a long gap, every missed day is scored (−100 each). History that predates the feature is scored on first run.

The Today screen shows a forecast ("Streak kept: +50 XP at midnight…") computed by `forecastDay`, and counts today's streak as soon as one task is done. The perfect streak only counts today once everything is done.

### Day outcome (for each finalized day)
- **paused** — no active task exists at all (every task archived or none created yet). Does not extend or break anything, earns nothing.
- **rest** — tasks exist but none is scheduled that day. Keeps both streaks alive and counts toward streak length and week achievements, but earns **0 XP** and does not advance the perfect-bonus counter.
- **perfect** — at least one task scheduled and every scheduled occurrence is done.
- **streak** — at least one done, but not all.
- **broken** — tasks were scheduled and none was done (all expired).

`streak`, `perfect` and `rest` days extend the **streak**. `perfect` and `rest` extend the **perfect streak**. `streak` or `broken` resets the perfect streak. Paused days are skipped (neither extend nor reset). The perfect-bonus counter `n` counts only real `perfect` days in the current run; `rest` days keep the run alive without increasing `n`.

### XP
| Event | XP |
| --- | --- |
| Complete a task | +100 (awarded at completion) |
| Task expired | 0 |
| Day outcome `rest` | 0 |
| Day outcome `broken` | −100 |
| Day outcome `streak` | +50 |
| Day outcome `perfect`, nth consecutive perfect day | +100 + 15·(n−1) → 100, 115, 130, 145, … |

Day-level XP is awarded when the day is finalized by the catch-up job (the UI shows a projection for today). Total XP never goes below 0 (running floor).

### Levels
Exponential curve. XP needed to go from level L to L+1: `round(200 · 1.15^L)` (200 for level 0 → 1). Level is derived from total XP.

### Achievements
- First streak day (a day with at least one task done; rest days alone do not unlock it)
- First perfect day (a real perfect day, not a rest day)
- Streak for n weeks straight (perfect days count): n × 7 consecutive non-paused days of `streak` or `perfect`
- Perfect streak only for n weeks straight: n × 7 consecutive `perfect` days
- First streak break (first `broken` day after having had a streak)
- Reach a level that is a multiple of ten (10 to 50). Unlocked the first time XP crosses the line, so a later XP drop does not take it away
- Week tiers for n: 1, 2, 4, 8, 12, 26, 52
- Achievements are derived, not stored. The Stats screen marks ones unlocked in the last 3 days as New.

## Backup and import

A backup is one `.dqbackup` file holding tasks, occurrences, finished days, the ledger, two bookmarks (`lastCatchUpDate`, `lastFinalizedDate`) and, optionally, the photos. Code: `src/backup/` (format) and `src/db/backup.ts` (export/import against the database).

### File format (integers big-endian)
```
plain:      "DQBK" | version u8 | flags u8 | container
encrypted:  "DQBK" | version u8 | flags u8 (bit 0) | iterations u32 | salt 16 | chunkSize u32 | chunks…
container:  manifestLength u32 | manifest JSON (UTF-8) | photo bytes back to back, in manifest order
```
The manifest has `app: "daily-quest"`, a data `schema` number (currently 1, separate from the file format version), `exportedAt`, the record lists, `meta` and a `proofs` list of `{ id, mime, createdAt, size }`. A newer `schema` or format version is refused with a message to update the app.

### Encryption
- Key: PBKDF2-HMAC-SHA256, 600,000 iterations, random 16-byte salt per file, over the NFKC-normalized password. AES-256-GCM.
- The container is split into 1 MiB plaintext chunks, each sealed separately and read/written through Blobs, so a large photo backup never sits in memory as one buffer.
- IV is a chunk counter, which is safe because every file has a fresh salt and so a fresh key. Each chunk authenticates the whole header, its index and an "is last" flag, so editing the header, reordering chunks or truncating the file all fail to decrypt.
- Header limits (iterations ≤ 10 million, chunk ≤ 64 MiB) stop a hostile file from making the app hang.
- PBKDF2 was chosen over Argon2 because it is built into Web Crypto (no WASM dependency). The iteration count is stored in the header so it can be raised later. A strong passphrase matters.
- A forgotten password cannot be recovered. Unencrypted files hold everything in the clear, and the export screen says so. The password must be at least 8 characters and is typed twice.

### Validation
Everything in a file is checked before it touches IndexedDB: types, dates, recurrence rules, title length, unique ids, referenced photos exist, photo MIME must be `image/*`, only the two whitelisted meta keys are read, and the photo bytes must account for the rest of the file exactly. Failures raise `BackupError` with a code the UI turns into plain language (`describeBackupError`).

### Import modes (always one all-or-nothing transaction, then catch-up runs for today)
- **Replace**: clears tasks, occurrences, photos, ledger and days, then loads the file including its bookmarks. Anything done on this device after the backup was made is lost, and days since the backup are scored as missed by the catch-up job. The UI makes this a two-step confirm.
- **Merge** (the default):
  - Tasks: the copy with the newer `updatedAt` wins, which includes deletes.
  - Occurrences, per id: a finished task always beats an unfinished one; between two finished copies the one with a photo wins; `expired` beats `pending`.
  - Photos are only brought over when a merged occurrence needs one this device lacks.
  - `task_complete` XP entries are unioned, and a missing one is created for any finished occurrence.
  - Day records, day-level ledger entries and `lastFinalizedDate` are **thrown away and recomputed** from the combined occurrences, because each device scored its days from its own view.
  - `lastCatchUpDate` becomes the earlier of the two, so tasks that arrived from the file get occurrences for the gap.
  - Merging the same file twice, or a device with itself, changes nothing.
- `lastExportAt` (shown on the Backup screen) is device-local: never exported, never overwritten.

### Photos
"Include photos" is on by default. Without photos the references are dropped from the occurrences, so a finished task stays finished but shows "No photo" on Today. A later merge with a file that has the photo fills it in.

## PWA (M5)

- `vite-plugin-pwa` (Workbox generateSW, `registerType: 'prompt'`): the app precaches everything and works offline. A new version waits behind an "Update ready" banner and applies only when the person taps it, so nothing reloads mid-task. The app checks for updates hourly.
- Manifest: standalone, portrait, "Daily Quest", icons 192/512 plus a maskable 512 (`public/icons`, `public/apple-touch-icon.png`, `public/icon.svg`).
- Install: `src/pwa/install.ts` captures `beforeinstallprompt`; iOS Safari gets manual "Add to Home Screen" instructions. Shown on the Backup screen (`AppCard`).
- Storage: `navigator.storage.persist()` is requested after the first completed task and can be requested from the Backup screen; the screen says honestly when the browser refuses or can't say.
- Backup reminder (`domain/reminder.ts`, `REMINDER_AFTER_DAYS = 7`): shown on Today if there has been activity and no export in 7 days. "Later" hides it for the rest of the day.
- Deploying under a sub-path: build with `BASE_PATH=/repo/ npm run build`.
- Verified in real Chromium: service worker controls the page, offline reload works, manifest has no installability errors.

### M4 fixes made during M5

- Merge drops unfinished occurrences on or after an archived task's `archivedOn` (otherwise a task deleted on one device came back as missed days).
- The validator rejects occurrences whose task is missing or whose id isn't `<taskId>_<date>`.

## Languages, onboarding, accessibility (M6)

- `src/i18n`: `t('English text', {params})`. The English text is the key; `id.ts` holds Indonesian. A missing key shows English. Language = saved choice (localStorage `dq-lang`), else browser language, else English. `App` remounts on change (`key={lang}`), so only the root calls `useLang()`.
- Every `t('…')` literal and `plural(n, 'word')` word must exist in `id.ts`, with the same `{placeholders}`: `src/i18n/i18n.test.ts` enforces it. Add the Indonesian text when adding any UI text.
- Domain code stays English. The UI translates its output: `ui/text.ts` (`recurrenceText`, `achievementText` from the achievement id, localized weekday/month names). Errors thrown from db/media code are English literals shown through `t(err.message)`.
- Onboarding (`ui/Onboarding.tsx`): shown only when the device has never been welcomed (`meta.onboardedAt` unset, device-local, never exported) and has no tasks. Three screens: welcome + language, rules, first task (example "Read 10 pages" or start empty).
- `AboutCard` (Backup tab): language, privacy facts, version (`__APP_VERSION__` from package.json via Vite `define`).
- Accessibility: `ui/Accessibility.test.tsx` runs axe on every screen in both languages (jsdom, so no color-contrast rule). Contrast was checked with axe in real Chromium, light and dark. Real-browser audits found and fixed: no `<main>` on the welcome screen, a `<dl>` holding non-term content, low-contrast future calendar cells.

## Readiness (M7)

- **Database upgrades**: `src/db/migrations.test.ts` keeps every past schema literally (`HISTORY`) and checks each upgrades with data intact, then that catch-up still works on it. Adding a schema version means: add `this.version(n)` in `schema.ts` (never edit an old one), and add the previous version to `HISTORY` plus a test. Dexie 4 opens a database from a *newer* app version as-is (no VersionError), so a stale tab keeps working; this is tested too.
- **Storage failure**: `main.tsx` opens the database before rendering. If it fails (private mode, blocked storage, full disk) `StorageProblem` explains what to try and the error goes to the log. Data is never touched.
- **Error log** (`src/diagnostics/errorLog.ts`): uncaught errors and unhandled rejections, last 30, in localStorage (not the database, which may be the thing that is broken), memory fallback. `ReportCard` (Backup tab) shows the count, copies a plain-text report (version, language, installed?, browser, errors; no tasks or photos) and clears it. Nothing is ever sent anywhere.
- **Reminders**: opt-in, one a day, at a chosen time (default 20:00), only if tasks are left. Pure rule in `domain/nudge.ts`; settings in `meta` (`reminderTime`, `reminderLastDate`, device-local, not exported); `useReminder` checks every 30 s and on visibility change while the app is open; shown through the service worker (Android needs that). **Limit, stated in the UI**: nothing can fire while the app is fully closed. That needs Web Push and a server, so it belongs to M8.
- **Settings live on the Backup tab for now** (reminder, this app, about/language, problem report). If it keeps growing, rename the tab to Settings and move Backup into it.
- **CI**: `.github/workflows/ci.yml` runs typecheck, tests and build on push to main and on pull requests.
- **Hosting** (free tiers, static site): `vercel.json` and `render.yaml` carry the same headers (a test enforces it): long cache for `/assets/*`, `no-cache` for `/sw.js`, `/index.html` and the manifest (so updates are noticed), `nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy: camera=(self)`, and a CSP with no inline script/style and nothing from other origins (`script-src 'self'`, `img-src 'self' blob: data:`). Verified in real Chromium with these headers: onboarding, adding a task, completing it with a photo, reminders, error capture, offline reload, axe clean, no CSP violations. If you ever add inline styles, remote fonts or analytics, the CSP must change with it.
  - Vercel: import the repo, preset Vite, build `npm run build`, output `dist`. Do not set `BASE_PATH`.
  - Render: New > Blueprint pointing at the repo (reads `render.yaml`), or a Static Site with build `npm ci && npm run build` and publish dir `dist`. Free static sites have no sleep delay.
  - Not verified here: the real deployment itself (no network to either host from this environment). After the first deploy, check `/sw.js` has `Cache-Control: no-cache` and the CSP header is present (browser devtools > Network).

## Milestones

- [x] **M1 — Tasks and schedule engine**: scaffold, Dexie schema, task CRUD UI, recurrence + occurrence materialize/expire logic with unit tests, catch-up job
- [x] **M2 — Today screen, proof and XP**: today's occurrences, camera-first proof capture (compressed Blob), mark done, ledger entries for +100, total XP shown
- [x] **M3 — Streaks, daily outcome, levels, achievements**: day finalization, streak/perfect-streak math, level curve, achievement unlocks, Stats screen with 12-week consistency calendar, Today forecast
- [x] **M4 — Export/import + encryption**: versioned `.dqbackup` file with optional photos, optional password (PBKDF2 → chunked AES-GCM), replace and merge modes, Backup tab
- [x] **M5 — PWA polish**: manifest, service worker, install prompt, `navigator.storage.persist()`, backup reminders (see PWA section)
- [ ] **Later**: reward shop (spend XP), notifications (best effort), monthly recurrence, `dayStartHour` for night owls
- [x] **M6 — Ready for strangers (part 1)**: first-run onboarding, English + Indonesian text with a language switch, About/Privacy card, accessibility pass (see i18n and onboarding section)
- [x] **M7 — Ready for strangers (part 2)**: reminders (while the app is open), on-device error log and problem report, tested database upgrades, storage-failure screen, CI, Vercel/Render config with a strict CSP (see Readiness section)
- [ ] **M8 — Optional accounts and sync** (design decided, see section below)
  - [x] M8a: key layer (`src/sync/keys.ts`, `bytes.ts`) — see notes below
  - [ ] M8b: sync engine — `SyncTransport` interface, in-memory fake server, pull→merge→push with compare-and-swap, multi-device convergence tests
  - [ ] M8c: Supabase — SQL schema + row-level security, transport, `VITE_SUPABASE_*` config, CSP `connect-src`, lazy-loaded client
  - [ ] M8d: UI — email-code sign-in, passphrase, recovery key screen, new-device flow, sync status, delete cloud data
  - [ ] M8e: verification — tests against the fake server, plus a checklist the owner runs against a real Supabase project (cannot be run from the build environment)
- [ ] **M9 — Social (only if users ask)**: friends/groups, peer review of proof photos, leaderboards; needs moderation and reporting

### Defaults assumed for M6+ (owner has not answered yet; change if wrong)
- Open public signup, free to use, no ads or tracking.
- Local-first stays the default. Accounts are optional and come after the app is usable without them.
- Cross-device sync is the main reason for accounts; social is later.

## Sync design (M8) — decisions confirmed by the owner: Supabase, encrypted on device with a recovery key, data only (no photos)

- **Local-first stays.** The app is fully usable without an account. Sync is opt-in. If `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are unset, the sync UI is hidden entirely (also the self-host story). The Supabase client is loaded with a dynamic `import()` only when someone turns sync on, so the offline app does not get heavier.
- **What syncs**: one encrypted snapshot per user: tasks, occurrences, task_complete ledger entries, bookmarks. Same content as a photo-less backup. **No photos**; a task finished on another device shows "Photo is on another device" instead of "No photo". Day records and day-level XP are never synced; every device recomputes them (already how merge works).
- **Why snapshot, not an operation log**: merge is already commutative and idempotent (newer `updatedAt` wins for tasks; done > expired > pending for occurrences; XP entries unioned). So any order of pulls and pushes converges, and there are no tombstones to keep. A snapshot stays small (a year of 5 daily tasks is roughly 100 KB encrypted). If it ever outgrows that, move to per-record rows without changing the merge rules.
- **Protocol**: server table `snapshots(user_id pk, revision, payload, updated_at)`. A device pulls, merges with `mergeInto`, then pushes with compare-and-swap (`put_snapshot(expected_revision, payload)`); on a revision mismatch it pulls, merges and retries (max 3). Triggers: app open, return to foreground, back online, a few seconds after a local change, and a manual button. A hash of the last synced state (device-local meta) avoids pushing when nothing changed.
- **Keys** (the server never sees plaintext or any key):
  - Login: email one-time code (no login password to forget or reuse). Supabase only proves who you are.
  - A random 256-bit **data key** encrypts the snapshot (AES-256-GCM, random 96-bit IV per upload, user id and revision in the authenticated data).
  - The data key is stored on the server **wrapped twice**: by a key derived from a **sync passphrase** (PBKDF2-SHA256, 600k iterations, same as backups), and by a **recovery key** (random, shown once at setup as grouped characters, to be saved by the person).
  - New device: sign in with the email code, enter the passphrase (or the recovery key), unwrap the data key, pull. Forgetting both the passphrase and the recovery key means the cloud copy is unreadable; local data and `.dqbackup` files are unaffected.
  - The login password is deliberately not used for encryption: the server receives it at login.
- **Key layer as built (M8a)**: `createVault(passphrase, userId)` returns `{ vault, dataKey, recoveryKey }`; `unlockWithPassphrase` / `unlockWithRecoveryKey` return a non-extractable `CryptoKey`; `changePassphrase` needs the old passphrase or the recovery key and keeps the recovery key valid; `sealSnapshot` / `openSnapshot(dataKey, …, userId, revision)`. The recovery key is 160 random bits as Crockford base32 in 8 groups of 4 (typed input tolerates case, spaces, O/0, I/L/1) and wraps through HKDF (it is already high-entropy, so no slow derivation). The passphrase wraps through PBKDF2 (600k, from `backup/crypto.ts`). Wraps are AES-GCM with the purpose and user id as authenticated data, so a vault cannot be replayed into another account. Errors are `KeyError` with codes `weak-passphrase | wrong-passphrase | bad-recovery-key | wrong-recovery-key | bad-snapshot`; the UI must map them to plain language and the Indonesian dictionary.
- **To decide in M8d**: keeping this device unlocked by storing the non-extractable `CryptoKey` in IndexedDB (`meta` row `syncKey`, device-local, never exported) so the passphrase is not asked on every open; signing out deletes it. The `meta` table already allows this with no schema change, but it needs a test that the key survives a reload in real Chromium.
- **Known limits to tell users**: a malicious or broken server could replay an older snapshot (merge only ever moves done/newer forward, so this delays but cannot undo finished tasks); metadata such as snapshot size and update times is visible to the server; no push reminders while the app is closed, because the server cannot see which tasks are pending (a generic daily push is possible later).
- **Operations notes**: Supabase free projects pause after about a week without activity, and storage/row limits change, so check current limits before launch. Add the Supabase project URL to `connect-src` in both `vercel.json` and `render.yaml` (the hosting test keeps them in sync). Account deletion needs an edge function (service role); until then offer "delete my cloud data".

## Decisions (confirmed by the owner)

1. **Perfect-streak XP** is 100 + 15·(n−1): 100, 115, 130, 145, …
2. **Rest days keep streaks alive but earn no XP** (`CONFIG.restDayAwardsXp = false`).
3. **Level growth** is ×1.15 per level on the 200 XP base. Levels are derived, so this stays tunable.

## Assumptions still open

1. **Streak and perfect are exclusive** per day (a perfect day gets the perfect bonus, not +50 on top).
2. **Same XP for every task** (100). Per-task weights are possible later.
3. **"n weeks straight"** means n × 7 consecutive days, not calendar weeks.
4. **Pending items can be removed today** (by deleting/editing the task), which avoids expiry. Accepted for now since it is self-policed.
5. **Total XP floors at 0**, so a −100 day at 0 XP costs nothing.
6. **Rest days count toward week achievements**, as "no task = perfect by default" implies. A task scheduled only every 10 days would therefore earn week-long streaks. If that feels wrong, require real task days in a run.
7. **Level growth ×1.15** reaches level 10 at about 4,060 XP and level 20 at about 20,500 XP.
8. **Merge re-scores every finished day under the current rules**, so historical day bonuses and penalties on a merged device reflect today's XP values, not the ones in force when the day ended.
9. **No sync.** Use one device as the main one and export/import to move or back up. Importing an old backup with Replace counts the days since as missed.

## Gotchas

- Dexie live queries only react to writes made through Dexie. Import writes through `db`, so screens update on their own. Anything that writes to IndexedDB another way (tests seeding via raw `indexedDB`) needs a reload.
- UI component tests (jsdom) do not store photos. Photo handling is covered by the node-environment tests in `src/db/backup.test.ts` and by a real-Chromium run with two separate profiles (export encrypted, wrong password, right password, merge, replace, photo-less file).
- Never `pkill -f` a pattern that also appears in your own command line; it kills the shell. Stop a preview server by port (`fuser -k 4173/tcp`).
- `createImageBitmap` and canvas WebP encoding work in Chromium; the code falls back to JPEG where WebP encoding is unavailable.
- `virtual:pwa-register` is imported only in `src/pwa/register.ts` (which only `main.tsx` imports), so tests never need it.
- jsdom lacks `crypto.subtle`, `matchMedia`, `serviceWorker` and `navigator.storage`; tests stub what they need.
- `tsconfig.node.json` covers `vite.config.ts` (needs `@types/node`).
