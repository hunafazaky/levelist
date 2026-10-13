import { useMemo } from "react";
import type { DateStr } from "../domain/dates";
import { diffDays } from "../domain/dates";
import type { DayOutcome } from "../domain/days";
import { buildCalendar } from "../domain/calendar";
import { formatDate } from "./format";
import { useProgress } from "./useProgress";

const WEEKS = 12;
const NEW_FOR_DAYS = 3;

const OUTCOME_LABEL: Record<DayOutcome, string> = {
  perfect: "Perfect day",
  streak: "Streak day",
  broken: "Missed day",
  rest: "Rest day",
  paused: "No tasks yet",
};

export function StatsScreen({ today }: { today: DateStr }) {
  const data = useProgress();

  const grid = useMemo(
    () =>
      buildCalendar(
        today,
        WEEKS,
        new Map((data?.days ?? []).map((d) => [d.date, d.outcome])),
      ),
    [today, data?.days],
  );

  if (!data) return null;
  const { progress } = data;
  const { level } = progress;

  const counts = { perfect: 0, streak: 0, broken: 0, rest: 0 };
  for (const cell of grid.flat()) {
    if (cell.outcome && cell.outcome !== "paused") counts[cell.outcome]++;
  }

  const unlocked = progress.achievements
    .filter((a) => a.unlockedOn !== undefined)
    .sort((a, b) =>
      a.unlockedOn! < b.unlockedOn!
        ? 1
        : a.unlockedOn! > b.unlockedOn!
          ? -1
          : 0,
    );
  const locked = progress.achievements.filter(
    (a) => a.unlockedOn === undefined,
  );

  return (
    <>
      <header className="top">
        <h1>Stats</h1>
      </header>

      <section className="panel" aria-labelledby="level-h">
        <h2 id="level-h">Level {level.level}</h2>
        <progress
          className="bar"
          max={level.xpForNext}
          value={level.xpIntoLevel}
          aria-labelledby="level-h"
        />
        <p className="muted">
          {level.xpIntoLevel} of {level.xpForNext} XP to level {level.level + 1}
          . Total {progress.totalXp} XP.
        </p>
      </section>

      <section className="panel" aria-labelledby="streak-h">
        <h2 id="streak-h">Streaks</h2>
        <dl className="figures">
          <div>
            <dt>Streak now</dt>
            <dd>{progress.streak}</dd>
          </div>
          <div>
            <dt>Best streak</dt>
            <dd>{progress.bestStreak}</dd>
          </div>
          <div>
            <dt>Perfect now</dt>
            <dd>{progress.perfectRun}</dd>
          </div>
          <div>
            <dt>Best perfect</dt>
            <dd>{progress.bestPerfectRun}</dd>
          </div>
        </dl>
        <p className="muted">Counted in days, up to yesterday.</p>
      </section>

      <section className="panel" aria-labelledby="cal-h">
        <h2 id="cal-h">Last {WEEKS} weeks</h2>
        <p className="muted">
          {counts.perfect} perfect, {counts.streak} streak, {counts.broken}{" "}
          missed, {counts.rest} rest.
        </p>
        <div
          className="cal"
          role="group"
          aria-label="Day by day results, Monday to Sunday"
        >
          <div className="cal__head" aria-hidden="true">
            {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>
          {grid.map((week) => (
            <ol key={week[0].date} className="cal__week">
              {week.map((cell) => {
                const label = cell.isFuture
                  ? `${formatDate(cell.date)}: upcoming`
                  : cell.isToday
                    ? `${formatDate(cell.date)}: today, still in progress`
                    : `${formatDate(cell.date)}: ${cell.outcome ? OUTCOME_LABEL[cell.outcome] : "no result"}`;
                return (
                  <li
                    key={cell.date}
                    className={[
                      "cal__cell",
                      cell.outcome && !cell.isToday ? `is-${cell.outcome}` : "",
                      cell.isToday ? "is-today" : "",
                      cell.isFuture ? "is-future" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    aria-label={label}
                    title={label}
                  >
                    {Number(cell.date.slice(8))}
                  </li>
                );
              })}
            </ol>
          ))}
        </div>
        <ul className="legend">
          <li>
            <span className="cal__cell is-perfect" aria-hidden="true" /> Perfect
          </li>
          <li>
            <span className="cal__cell is-streak" aria-hidden="true" /> Streak
          </li>
          <li>
            <span className="cal__cell is-broken" aria-hidden="true" /> Missed
          </li>
          <li>
            <span className="cal__cell is-rest" aria-hidden="true" /> Rest
          </li>
        </ul>
      </section>

      <section aria-labelledby="ach-h">
        <h2 id="ach-h" className="section-title">
          Achievements
        </h2>
        <p className="muted achievements-count">
          {unlocked.length} of {progress.achievements.length} unlocked
        </p>
        <ul className="tasks">
          {[...unlocked, ...locked].map((a) => {
            const isNew =
              a.unlockedOn !== undefined &&
              diffDays(a.unlockedOn, today) <= NEW_FOR_DAYS;
            return (
              <li
                key={a.id}
                className={a.unlockedOn ? "ach is-unlocked" : "ach"}
              >
                <div className="ach__text">
                  <span className="ach__title">
                    {a.title}
                    {isNew && <span className="tag">New</span>}
                  </span>
                  <span className="ach__desc">{a.description}</span>
                </div>
                <span className="ach__status">
                  {a.unlockedOn ? formatDate(a.unlockedOn) : "Locked"}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
