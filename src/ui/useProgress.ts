import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { db } from '../db/schema'
import type { DayRecord } from '../db/types'
import { computeProgress, type Progress } from '../domain/progress'

export interface ProgressData {
  progress: Progress
  days: DayRecord[]
}

/** XP, level, streaks and achievements, kept live from the finished days and the ledger. */
export function useProgress(): ProgressData | undefined {
  const days = useLiveQuery(() => db.days.orderBy('date').toArray(), [])
  const ledger = useLiveQuery(() => db.ledger.toArray(), [])
  return useMemo(() => (days && ledger ? { progress: computeProgress(days, ledger), days } : undefined), [days, ledger])
}
