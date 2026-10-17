import { describe, expect, it } from 'vitest'
import {
  KeyError,
  changePassphrase,
  createVault,
  formatRecoveryKey,
  openSnapshot,
  parseRecoveryKey,
  sealSnapshot,
  unlockWithPassphrase,
  unlockWithRecoveryKey,
} from './keys'

const FAST = { iterations: 1000 }
const USER = 'user-1'
const text = (s: string) => new TextEncoder().encode(s)
const asText = (b: Uint8Array) => new TextDecoder().decode(b)

const make = (passphrase = 'correct horse') => createVault(passphrase, USER, FAST)

async function code(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise
  } catch (e) {
    return e instanceof KeyError ? e.code : `other: ${String(e)}`
  }
  return undefined
}

describe('recovery key text', () => {
  it('round-trips bytes and is easy to read: 8 groups of 4, no look-alike letters', () => {
    const bytes = crypto.getRandomValues(new Uint8Array(20))
    const key = formatRecoveryKey(bytes)
    expect(key).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){7}[0-9A-HJKMNP-TV-Z]{4}$/)
    expect(parseRecoveryKey(key)).toEqual(bytes)
  })

  it('accepts what a person types: lowercase, spaces, missing dashes, O for 0, I or L for 1', () => {
    const bytes = new Uint8Array(20).fill(0)
    bytes[0] = 0b00001000 // makes the first character 1
    const key = formatRecoveryKey(bytes) // 1000-0000-...
    expect(parseRecoveryKey(key.toLowerCase().replace(/-/g, ' '))).toEqual(bytes)
    expect(parseRecoveryKey(key.replace(/0/g, 'O').replace(/1/g, 'l'))).toEqual(bytes)
  })

  it('rejects the wrong length or characters', () => {
    expect(parseRecoveryKey('')).toBeNull()
    expect(parseRecoveryKey('ABCD-EFGH')).toBeNull()
    expect(parseRecoveryKey('UUUU-'.repeat(8))).toBeNull()
  })
})

describe('vault', () => {
  it('opens with the passphrase and with the recovery key, and both give the same data key', async () => {
    const { vault, dataKey, recoveryKey } = await make()
    const sealed = await sealSnapshot(dataKey, text('hello'), USER, 1)
    const viaPass = await unlockWithPassphrase(vault, 'correct horse', USER)
    const viaRecovery = await unlockWithRecoveryKey(vault, recoveryKey, USER)
    expect(asText(await openSnapshot(viaPass, sealed, USER, 1))).toBe('hello')
    expect(asText(await openSnapshot(viaRecovery, sealed, USER, 1))).toBe('hello')
  })

  it('survives being stored as JSON on a server', async () => {
    const { vault, recoveryKey } = await make()
    const stored = JSON.parse(JSON.stringify(vault))
    await expect(unlockWithPassphrase(stored, 'correct horse', USER)).resolves.toBeTruthy()
    await expect(unlockWithRecoveryKey(stored, recoveryKey, USER)).resolves.toBeTruthy()
  })

  it('says which secret was wrong', async () => {
    const { vault } = await make()
    expect(await code(unlockWithPassphrase(vault, 'correct horsf', USER))).toBe('wrong-passphrase')
    expect(await code(unlockWithRecoveryKey(vault, 'not a key', USER))).toBe('bad-recovery-key')
    const other = await make()
    expect(await code(unlockWithRecoveryKey(vault, other.recoveryKey, USER))).toBe('wrong-recovery-key')
  })

  it('refuses a short passphrase', async () => {
    expect(await code(createVault('short', USER, FAST))).toBe('weak-passphrase')
  })

  it('does not open for a different account, even with the right passphrase', async () => {
    const { vault, recoveryKey } = await make()
    expect(await code(unlockWithPassphrase(vault, 'correct horse', 'user-2'))).toBe('wrong-passphrase')
    expect(await code(unlockWithRecoveryKey(vault, recoveryKey, 'user-2'))).toBe('wrong-recovery-key')
  })

  it('gives every vault its own salts and recovery key', async () => {
    const a = await make()
    const b = await make()
    expect(a.vault.passphrase.salt).not.toBe(b.vault.passphrase.salt)
    expect(a.recoveryKey).not.toBe(b.recoveryKey)
  })

  it('uses 600,000 PBKDF2 iterations unless told otherwise', async () => {
    const { vault } = await createVault('correct horse', USER)
    expect(vault.passphrase.iterations).toBe(600_000)
  })
})

describe('changing the passphrase', () => {
  it('works with the old passphrase, keeps the same data key, and retires the old passphrase', async () => {
    const { vault, dataKey, recoveryKey } = await make('first passphrase')
    const sealed = await sealSnapshot(dataKey, text('data'), USER, 5)
    const next = await changePassphrase(vault, { passphrase: 'first passphrase' }, 'second passphrase', USER, FAST)

    expect(await code(unlockWithPassphrase(next, 'first passphrase', USER))).toBe('wrong-passphrase')
    const key = await unlockWithPassphrase(next, 'second passphrase', USER)
    expect(asText(await openSnapshot(key, sealed, USER, 5))).toBe('data')
    // The recovery key is untouched.
    await expect(unlockWithRecoveryKey(next, recoveryKey, USER)).resolves.toBeTruthy()
  })

  it('works with the recovery key when the passphrase is forgotten', async () => {
    const { vault, recoveryKey } = await make('forgotten one')
    const next = await changePassphrase(vault, { recoveryKey }, 'brand new one', USER, FAST)
    await expect(unlockWithPassphrase(next, 'brand new one', USER)).resolves.toBeTruthy()
  })

  it('needs proof, and a strong enough new passphrase', async () => {
    const { vault } = await make()
    expect(await code(changePassphrase(vault, { passphrase: 'wrong wrong' }, 'new passphrase', USER, FAST))).toBe('wrong-passphrase')
    expect(await code(changePassphrase(vault, { passphrase: 'correct horse' }, 'short', USER, FAST))).toBe('weak-passphrase')
  })
})

describe('snapshots', () => {
  it('uses a fresh IV each time, so the same data never encrypts the same way twice', async () => {
    const { dataKey } = await make()
    const a = await sealSnapshot(dataKey, text('same'), USER, 1)
    const b = await sealSnapshot(dataKey, text('same'), USER, 1)
    expect(a).not.toBe(b)
  })

  it('handles an empty and a large snapshot', async () => {
    const { dataKey } = await make()
    expect((await openSnapshot(dataKey, await sealSnapshot(dataKey, new Uint8Array(0), USER, 1), USER, 1)).length).toBe(0)
    const big = new Uint8Array(300_000).map((_, i) => (i * 31 + 7) % 256) // getRandomValues is capped at 64 KiB per call
    expect(await openSnapshot(dataKey, await sealSnapshot(dataKey, big, USER, 2), USER, 2)).toEqual(big)
  })

  it('refuses a snapshot for another user or revision, a changed byte, or a cut-off one', async () => {
    const { dataKey } = await make()
    const sealed = await sealSnapshot(dataKey, text('secret'), USER, 3)
    expect(await code(openSnapshot(dataKey, sealed, 'user-2', 3))).toBe('bad-snapshot')
    expect(await code(openSnapshot(dataKey, sealed, USER, 4))).toBe('bad-snapshot')

    const bytes = Uint8Array.from(atob(sealed), (c) => c.charCodeAt(0))
    bytes[bytes.length - 1] ^= 1
    expect(await code(openSnapshot(dataKey, btoa(String.fromCharCode(...bytes)), USER, 3))).toBe('bad-snapshot')
    expect(await code(openSnapshot(dataKey, sealed.slice(0, 20), USER, 3))).toBe('bad-snapshot')
    expect(await code(openSnapshot(dataKey, 'not base64 !!', USER, 3))).toBe('bad-snapshot')
  })

  it('refuses a snapshot made with a different data key', async () => {
    const a = await make()
    const b = await make()
    expect(await code(openSnapshot(b.dataKey, await sealSnapshot(a.dataKey, text('x'), USER, 1), USER, 1))).toBe('bad-snapshot')
  })
})
