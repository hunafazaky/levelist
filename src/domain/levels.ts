import { CONFIG, type Rules } from './config'

export interface LevelInfo {
  level: number
  /** XP earned since reaching this level. */
  xpIntoLevel: number
  /** XP needed to go from this level to the next. */
  xpForNext: number
  /** 0 to 1. */
  progress: number
}

const MAX_LEVEL = 10_000

/**
 * XP needed to go from `level` to `level + 1`: round(base · growth^level).
 * Computed by repeated multiplication (not Math.pow) because IEEE multiplication gives
 * identical results on every device, so an imported backup always lands on the same level.
 */
export function xpToNextLevel(level: number, rules: Rules = CONFIG): number {
  let f = rules.levelBaseXp
  for (let i = 0; i < level; i++) f *= rules.levelGrowth
  return Math.round(f)
}

/** Total XP at which `level` is first reached. */
export function xpForLevel(level: number, rules: Rules = CONFIG): number {
  let total = 0
  let f = rules.levelBaseXp
  for (let i = 0; i < level; i++) {
    total += Math.round(f)
    f *= rules.levelGrowth
  }
  return total
}

export function levelFromXp(totalXp: number, rules: Rules = CONFIG): LevelInfo {
  let remaining = Math.max(0, Math.floor(totalXp))
  let level = 0
  let f = rules.levelBaseXp
  for (;;) {
    const need = Math.round(f)
    if (remaining < need || level >= MAX_LEVEL) {
      return { level, xpIntoLevel: remaining, xpForNext: need, progress: remaining / need }
    }
    remaining -= need
    level++
    f *= rules.levelGrowth
  }
}
