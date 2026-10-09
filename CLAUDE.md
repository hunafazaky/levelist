# Daily Quest (working title)

Offline-first PWA that turns a daily schedule into a game. The user defines recurring tasks, proves each one with a photo, earns XP, keeps streaks, levels up and unlocks achievements. No backend. Data moves between devices via (optionally encrypted) export/import files.

Owner: Zaky (web developer). Keep code clean and conventional; this is also portfolio-quality work.

## Stack

- TypeScript (strict), Vite, React 18
- Dexie (IndexedDB) + dexie-react-hooks
- Vitest + fake-indexeddb for tests
- vite-plugin-pwa (Workbox) — added in milestone 5
- Web Crypto API (PBKDF2 → AES-GCM) for encrypted export — milestone 4
- Plain CSS, system font stack (the app must work fully offline, so no remote fonts)

## Commands

- `npm run dev` — dev server
- `npm test` — Vitest (run once), `npm run test:watch`
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
    (later) scoring.ts, streaks.ts, levels.ts, achievements.ts
  db/          Dexie schema + repositories (the only code that touches IndexedDB)
  ui/          React components
```

Rules:
- All game logic lives in `domain/` as pure functions that take `today` as a parameter. This makes it testable and lets us re-derive everything from the ledger.
- Dates are `DateStr` (`"2026-10-04"`), never UTC timestamps, for anything about "which day". Weekday/day-diff math uses `Date.UTC` on the parsed parts so device timezone and DST cannot shift results.
- Points are **derived**: the ledger is append-only; totals, levels and streaks are computed from it and from occurrences. Changing a tuning constant is therefore retroactive and free.
- Nothing runs in the background. A **catch-up job** runs on app open (and on visibility change / midnight rollover) to create missing occurrences and expire overdue ones. It must be idempotent.

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
Proof       { id, blob, mime, createdAt }                      (milestone 2)
LedgerEntry { id, date: DateStr, kind, delta, refId?, createdAt } (milestone 2/3)
Meta        { key, value }  e.g. lastCatchUpDate
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

### Day outcome (for each finalized day)
- **paused** — no active task exists at all (every task archived or none created yet). Does not extend or break anything, earns nothing.
- **perfect** — no task scheduled that day (rest day), or every scheduled occurrence is done.
- **streak** — at least one done, but not all.
- **broken** — tasks were scheduled and none was done (all expired).

Both `streak` and `perfect` extend the **streak**. Only `perfect` extends the **perfect streak**. `streak` or `broken` resets the perfect streak. Paused days are skipped (neither extend nor reset).

### XP
| Event | XP |
| --- | --- |
| Complete a task | +100 (awarded at completion) |
| Task expired | 0 |
| Day outcome `broken` | −100 |
| Day outcome `streak` | +50 |
| Day outcome `perfect`, nth consecutive perfect day | +100 + 15·(n−1) → 100, 115, 130, 145, … |

Day-level XP is awarded when the day is finalized by the catch-up job (the UI shows a projection for today). Total XP never goes below 0 (running floor).

### Levels
Exponential curve. XP needed to go from level L to L+1: `round(200 · 1.15^L)` (200 for level 0 → 1). Level is derived from total XP.

### Achievements
- First streak day
- First perfect day
- Streak for n weeks straight (perfect days count): n × 7 consecutive non-paused days of `streak` or `perfect`
- Perfect streak only for n weeks straight: n × 7 consecutive `perfect` days
- First streak break (first `broken` day after having had a streak)
- Reach a level that is a multiple of ten
- Week tiers for n: 1, 2, 4, 8, 12, 26, 52

## Milestones

- [x] **M1 — Tasks and schedule engine**: scaffold, Dexie schema, task CRUD UI, recurrence + occurrence materialize/expire logic with unit tests, catch-up job
- [ ] **M2 — Today screen, proof and XP**: today's occurrences, camera-first proof capture (compressed Blob), mark done, ledger entries for +100
- [ ] **M3 — Streaks, daily outcome, levels, achievements**: day finalization, streak/perfect-streak math, level curve, achievement unlocks, stats/heatmap
- [ ] **M4 — Export/import + encryption**: zip bundle with proofs, versioned format, AES-GCM with PBKDF2, replace and merge modes
- [ ] **M5 — PWA polish**: manifest, service worker, install prompt, `navigator.storage.persist()`, backup reminders
- [ ] **Later**: reward shop (spend XP), notifications (best effort), monthly recurrence, `dayStartHour` for night owls

## Assumptions to confirm with the owner

1. **Perfect-streak formula.** The brief's example (100, 130, 145) skips 115; assumed typo → 100 + 15·(n−1).
2. **Rest days earn XP.** The brief says a day with no tasks is "perfect by default". Taken literally it earns the perfect-streak XP, so a single weekly task gives six free perfect days. Config flag planned: `restDayAwardsXp`. Recommendation: keep rest days alive for the streak but award no XP.
3. **Level growth factor** is not specified (only the 200 base). 1.15 assumed; because levels are derived, it can be tuned anytime.
4. **Streak and perfect are exclusive** per day (a perfect day gets the perfect bonus, not +50 on top).
5. **Same XP for every task** (100). Per-task weights are possible later.
6. **"n weeks straight"** means n × 7 consecutive days, not calendar weeks.
7. **Pending items can be removed today** (by deleting/editing the task), which avoids expiry. Accepted for now since it is self-policed.
