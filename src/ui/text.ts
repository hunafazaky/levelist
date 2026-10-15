import { weekdayOf, type DateStr } from '../domain/dates'
import type { Achievement } from '../domain/achievements'
import type { Recurrence } from '../domain/recurrence'
import { getLang, t } from '../i18n'

const WEEKDAYS = {
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  id: ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'],
} as const

const MONTHS = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  id: ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'],
} as const

/** Short weekday name, 0 = Sunday. */
export const weekdayName = (day: number): string => WEEKDAYS[getLang()][day]
export const monthName = (month0: number): string => MONTHS[getLang()][month0]

export const weekdayOfDate = (d: DateStr): number => weekdayOf(d)

const weeks = (n: number) => (n === 1 ? t('1 week') : t('{n} weeks', { n }))

/** "Every day", "Every Mon and Wed", "Every 3 days", in the current language. */
export function recurrenceText(r: Recurrence): string {
  switch (r.type) {
    case 'daily':
      return t('Every day')
    case 'weekdays': {
      const names = [...r.days].sort((a, b) => a - b).map(weekdayName)
      if (names.length === 1) return t('Every {days}', { days: names[0] })
      const last = names[names.length - 1]
      return t('Every {days}', { days: t('{list} and {last}', { list: names.slice(0, -1).join(', '), last }) })
    }
    case 'interval':
      return r.every === 1 ? t('Every day') : t('Every {n} days', { n: r.every })
  }
}

/** Title and description of an achievement, in the current language. Derived from its id, which never changes. */
export function achievementText(a: Achievement): { title: string; description: string } {
  const tier = /^(streak|perfect)_weeks_(\d+)$/.exec(a.id)
  if (tier) {
    const n = Number(tier[2])
    return tier[1] === 'streak'
      ? {
          title: t('{weeks} streak', { weeks: weeks(n) }),
          description: t('Keep your streak going for {weeks} straight. Perfect days count too.', { weeks: weeks(n) }),
        }
      : {
          title: t('{weeks} perfect', { weeks: weeks(n) }),
          description: t('Have a perfect day, every day, for {weeks} straight.', { weeks: weeks(n) }),
        }
  }
  const level = /^level_(\d+)$/.exec(a.id)
  if (level) return { title: t('Level {n}', { n: level[1] }), description: t('Reach level {n}.', { n: level[1] }) }
  return { title: t(a.title), description: t(a.description) }
}
