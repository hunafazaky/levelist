import { describe, expect, it } from "vitest";
import { classifyDay } from "./days";

describe("classifyDay", () => {
  it("is paused when no task exists at all, rest when tasks exist but none is scheduled", () => {
    expect(classifyDay({ scheduled: 0, done: 0, hasActiveTask: false })).toBe(
      "paused",
    );
    expect(classifyDay({ scheduled: 0, done: 0, hasActiveTask: true })).toBe(
      "rest",
    );
  });

  it("is perfect only when every scheduled task is done", () => {
    expect(classifyDay({ scheduled: 3, done: 3, hasActiveTask: true })).toBe(
      "perfect",
    );
    expect(classifyDay({ scheduled: 1, done: 1, hasActiveTask: true })).toBe(
      "perfect",
    );
  });

  it("is a streak day with some done, broken with none done", () => {
    expect(classifyDay({ scheduled: 3, done: 1, hasActiveTask: true })).toBe(
      "streak",
    );
    expect(classifyDay({ scheduled: 3, done: 0, hasActiveTask: true })).toBe(
      "broken",
    );
  });

  it("still counts a day with done tasks when the task was archived that day", () => {
    // hasActiveTask is irrelevant once occurrences exist
    expect(classifyDay({ scheduled: 1, done: 1, hasActiveTask: false })).toBe(
      "perfect",
    );
  });
});
