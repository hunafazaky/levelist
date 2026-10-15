/**
 * A short log of unexpected errors, kept on this device only. Nothing is sent anywhere: the person can look at it
 * and choose to copy it into a bug report. It lives in localStorage rather than the database, because the problem
 * being reported may be that the database cannot be opened.
 */
const KEY = 'dq-error-log'
const MAX_ENTRIES = 30
const MAX_TEXT = 500
const MAX_STACK = 1500

export interface ErrorEntry {
  at: number
  /** Where it came from, such as "error", "promise" or "startup". */
  source: string
  message: string
  stack?: string
}

// Read from storage once, then memory is the source of truth for this page (storage may be blocked or full).
let memory: ErrorEntry[] = []
let loaded = false
const listeners = new Set<() => void>()

function load(): ErrorEntry[] {
  if (!loaded) {
    loaded = true
    try {
      const raw = localStorage.getItem(KEY)
      const parsed: unknown = raw ? JSON.parse(raw) : []
      if (Array.isArray(parsed)) memory = parsed as ErrorEntry[]
    } catch {
      /* storage blocked or damaged: start empty */
    }
  }
  return memory
}

function save(entries: ErrorEntry[]) {
  memory = entries
  try {
    localStorage.setItem(KEY, JSON.stringify(entries))
  } catch {
    /* ignore */
  }
  for (const l of listeners) l()
}

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max)}…` : s)

/** Records one error. Never throws, and keeps only the most recent entries. */
export function logError(source: string, error: unknown, now = Date.now()): void {
  try {
    const isError = error instanceof Error
    const entry: ErrorEntry = {
      at: now,
      source,
      message: clip(isError ? `${error.name}: ${error.message}` : String(error), MAX_TEXT),
      ...(isError && error.stack ? { stack: clip(error.stack, MAX_STACK) } : {}),
    }
    save([...load(), entry].slice(-MAX_ENTRIES))
  } catch {
    /* logging must never cause a second problem */
  }
}

export const readErrorLog = (): ErrorEntry[] => load()

export function clearErrorLog(): void {
  save([])
}

export function subscribeErrorLog(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Starts recording uncaught errors and unhandled promise rejections. Call once, from main.tsx. */
export function installErrorLog(target: Window = window): void {
  target.addEventListener('error', (e) => logError('error', e.error ?? e.message))
  target.addEventListener('unhandledrejection', (e) => logError('promise', e.reason))
}

/** The text a person can paste into a bug report. Contains no task titles or photos. */
export function buildReport(info: { version: string; language: string; userAgent: string; standalone: boolean }): string {
  const lines = [
    `Daily Quest ${info.version}`,
    `Language: ${info.language}`,
    `Installed as app: ${info.standalone ? 'yes' : 'no'}`,
    `Browser: ${info.userAgent}`,
    '',
  ]
  const entries = readErrorLog()
  if (entries.length === 0) lines.push('No errors recorded.')
  for (const e of entries) {
    lines.push(`${new Date(e.at).toISOString()} [${e.source}] ${e.message}`)
    if (e.stack) lines.push(e.stack)
  }
  return lines.join('\n')
}
