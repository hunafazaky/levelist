# Daily Quest (working title)

Offline-first PWA that turns a daily schedule into a game. The user defines recurring tasks, proves each one with a photo, earns XP, keeps streaks, levels up and unlocks achievements. No backend. Data moves between devices via (optionally encrypted) export/import files.

Owner: Zaky (web developer). Keep code clean and conventional; this is also portfolio-quality work.

## Stack

- TypeScript (strict), Vite, React 18
- Dexie (IndexedDB) + dexie-react-hooks
- Vitest + fake-indexeddb for tests; jsdom + Testing Library for screen flows
- vite-plugin-pwa (Workbox) — added in milestone 5
- Web Crypto API (PBKDF2 → AES-GCM) for encrypted export — milestone 4
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
  db/          Dexie schema + repositories (the only code that touches IndexedDB)
  media/       Browser-only image helpers (compressImage: ≤1280px, WebP/JPEG)
  ui/          React components (App = tabs; TodayScreen, TasksScreen, StatsScreen, ProofSheet, ProofImage, useProgress)
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

## Milestones

- [x] **M1 — Tasks and schedule engine**: scaffold, Dexie schema, task CRUD UI, recurrence + occurrence materialize/expire logic with unit tests, catch-up job
- [x] **M2 — Today screen, proof and XP**: today's occurrences, camera-first proof capture (compressed Blob), mark done, ledger entries for +100, total XP shown
- [x] **M3 — Streaks, daily outcome, levels, achievements**: day finalization, streak/perfect-streak math, level curve, achievement unlocks, Stats screen with 12-week consistency calendar, Today forecast
- [ ] **M4 — Export/import + encryption**: zip bundle with proofs, versioned format, AES-GCM with PBKDF2, replace and merge modes
- [ ] **M5 — PWA polish**: manifest, service worker, install prompt, `navigator.storage.persist()`, backup reminders
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

## Gotchas

- Dexie live queries only react to writes made through Dexie. Anything that writes to IndexedDB another way (a raw import, tests seeding via `indexedDB`) needs a reload or must go through Dexie. Milestone 4's import must write through `db`.
- `createImageBitmap` and canvas WebP encoding work in Chromium; the code falls back to JPEG where WebP encoding is unavailable.
- No app icon or manifest yet, so browsers request `/favicon.ico` and get a 404. Milestone 5 fixes this.
