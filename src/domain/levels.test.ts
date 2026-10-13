import { describe, expect, it } from "vitest";
import { levelFromXp, xpForLevel, xpToNextLevel } from "./levels";

describe("levels", () => {
  it("needs 200 XP for level 0 to 1, then grows exponentially", () => {
    expect(xpToNextLevel(0)).toBe(200);
    expect(xpToNextLevel(1)).toBe(230);
    expect(xpToNextLevel(10)).toBeGreaterThan(xpToNextLevel(9));
    expect(xpToNextLevel(20)).toBeGreaterThan(3 * xpToNextLevel(10));
  });

  it("reports level and progress inside the level", () => {
    expect(levelFromXp(0)).toEqual({
      level: 0,
      xpIntoLevel: 0,
      xpForNext: 200,
      progress: 0,
    });
    expect(levelFromXp(199).level).toBe(0);
    expect(levelFromXp(200)).toMatchObject({
      level: 1,
      xpIntoLevel: 0,
      xpForNext: 230,
    });
    expect(levelFromXp(429)).toMatchObject({ level: 1, xpIntoLevel: 229 });
    expect(levelFromXp(430).level).toBe(2);
    expect(levelFromXp(315).progress).toBeCloseTo(115 / 230);
  });

  it("treats negative and fractional XP safely", () => {
    expect(levelFromXp(-50).level).toBe(0);
    expect(levelFromXp(200.9).level).toBe(1);
  });

  it("agrees with xpForLevel at every threshold", () => {
    for (const level of [1, 2, 5, 10, 20, 30]) {
      const at = xpForLevel(level);
      expect(levelFromXp(at).level).toBe(level);
      expect(levelFromXp(at - 1).level).toBe(level - 1);
    }
  });

  it("never decreases as XP grows and always stays inside the level", () => {
    let prev = 0;
    for (let x = 0; x < 30_000; x += 137) {
      const info = levelFromXp(x);
      expect(info.level).toBeGreaterThanOrEqual(prev);
      expect(info.xpIntoLevel).toBeLessThan(info.xpForNext);
      prev = info.level;
    }
  });
});
