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

| Event                                              | XP                                      |
| -------------------------------------------------- | --------------------------------------- |
| Complete a task                                    | +100 (awarded at completion)            |
| Task expired                                       | 0                                       |
| Day outcome `rest`                                 | 0                                       |
| Day outcome `broken`                               | −100                                    |
| Day outcome `streak`                               | +50                                     |
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

## Milestones

- [x] **M1 — Tasks and schedule engine**: scaffold, Dexie schema, task CRUD UI, recurrence + occurrence materialize/expire logic with unit tests, catch-up job
- [x] **M2 — Today screen, proof and XP**: today's occurrences, camera-first proof capture (compressed Blob), mark done, ledger entries for +100, total XP shown
- [x] **M3 — Streaks, daily outcome, levels, achievements**: day finalization, streak/perfect-streak math, level curve, achievement unlocks, Stats screen with 12-week consistency calendar, Today forecast
- [x] **M4 — Export/import + encryption**: versioned `.dqbackup` file with optional photos, optional password (PBKDF2 → chunked AES-GCM), replace and merge modes, Backup tab
- [x] **M5 — PWA polish**: manifest, service worker, install prompt, `navigator.storage.persist()`, backup reminders (see PWA section)
- [ ] **Later**: reward shop (spend XP), notifications (best effort), monthly recurrence, `dayStartHour` for night owls

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
