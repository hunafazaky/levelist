import { useState } from 'react'
import { createTask } from '../db/repo'
import { db } from '../db/schema'
import { CONFIG } from '../domain/config'
import type { DateStr } from '../domain/dates'
import { t } from '../i18n'
import { LanguagePicker } from './LanguagePicker'

export const ONBOARDED_KEY = 'onboardedAt'

/** Device-local: not part of a backup, so restoring a backup never replays the welcome. */
export async function finishOnboarding(now = Date.now()): Promise<void> {
  await db.meta.put({ key: ONBOARDED_KEY, value: now })
}

const STEPS = 3

/** Shown once, to someone who has no tasks yet. Three short screens: welcome, the rules, a first task. */
export function Onboarding({ today, onDone }: { today: DateStr; onDone: () => void }) {
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)

  async function finish(withSample: boolean) {
    setBusy(true)
    try {
      if (withSample) await createTask(db, { title: t('Read 10 pages'), recurrence: { type: 'daily' } }, today)
      await finishOnboarding()
    } finally {
      setBusy(false)
    }
    onDone()
  }

  return (
    <main className="app welcome">
      <p className="welcome__step" aria-live="polite">
        {t('Step {n} of {total}', { n: step + 1, total: STEPS })}
      </p>

      {step === 0 && (
        <section aria-labelledby="welcome-h">
          <h1 id="welcome-h">{t('Welcome to Daily Quest')}</h1>
          <p>{t('Turn your daily routine into a game. Finish your tasks, earn XP, build streaks and level up.')}</p>
          <p className="muted">{t('Everything stays on this device. There is no account and nothing is uploaded.')}</p>
          <LanguagePicker id="welcome-lang" />
        </section>
      )}

      {step === 1 && (
        <section aria-labelledby="rules-h">
          <h1 id="rules-h">{t('How it works')}</h1>
          <ul className="welcome__rules">
            <li>{t('Add tasks and choose how often they repeat.')}</li>
            <li>
              {t('A task is done only when you add a photo as proof. Each one earns {xp} XP.', { xp: CONFIG.taskXp })}
            </li>
            <li>{t('Each day ends at midnight. A task you did not finish expires and earns nothing.')}</li>
            <li>{t('Finish at least one task for a streak bonus. Finish them all for a bigger perfect-day bonus.')}</li>
            <li>{t('Miss every task in a day and you lose XP.')}</li>
          </ul>
        </section>
      )}

      {step === 2 && (
        <section aria-labelledby="first-h">
          <h1 id="first-h">{t('Add your first task')}</h1>
          <p>{t('You can start with an example and change it later, or begin with an empty list.')}</p>
        </section>
      )}

      <div className="actions">
        {step > 0 ? (
          <button type="button" className="btn" onClick={() => setStep(step - 1)} disabled={busy}>
            {t('Back')}
          </button>
        ) : (
          <button type="button" className="btn" onClick={() => void finish(false)} disabled={busy}>
            {t('Skip')}
          </button>
        )}
        <span className="spacer" />
        {step < STEPS - 1 ? (
          <button type="button" className="btn btn--primary" onClick={() => setStep(step + 1)}>
            {t('Next')}
          </button>
        ) : (
          <>
            <button type="button" className="btn" onClick={() => void finish(false)} disabled={busy}>
              {t('Start empty')}
            </button>
            <button type="button" className="btn btn--primary" onClick={() => void finish(true)} disabled={busy}>
              {t('Add "Read 10 pages"')}
            </button>
          </>
        )}
      </div>
    </main>
  )
}
