import { DEFAULT_ITERATIONS } from '../backup/crypto'
import { concat, fromBase64, toBase64, utf8 } from './bytes'

/**
 * Keys for cloud sync. The server never sees any of these in a usable form.
 *
 *   data key      random 256 bits. Encrypts the synced snapshot.
 *   passphrase    the person's sync passphrase. PBKDF2 turns it into a key that wraps (encrypts) the data key.
 *   recovery key  random 160 bits, shown once. HKDF turns it into a second key that also wraps the data key.
 *
 * The "vault" is the two wrapped copies of the data key plus what is needed to unwrap them. It is safe to store on
 * the server: opening either copy needs the passphrase or the recovery key, which never leave the device.
 * Wraps are bound to the user id, and snapshots to the user id and revision, so the server cannot move one
 * person's data into another's account or slip a snapshot in under a different revision.
 */

export type KeyErrorCode = 'weak-passphrase' | 'wrong-passphrase' | 'bad-recovery-key' | 'wrong-recovery-key' | 'bad-snapshot'

export class KeyError extends Error {
  readonly code: KeyErrorCode
  constructor(code: KeyErrorCode, message: string) {
    super(message)
    this.name = 'KeyError'
    this.code = code
  }
}

export const MIN_PASSPHRASE = 8
const KEY_BYTES = 32
const RECOVERY_BYTES = 20
const IV_BYTES = 12
const SALT_BYTES = 16

export interface WrappedKey {
  /** Format version of this record. */
  v: 1
  /** base64 */
  salt: string
  /** PBKDF2 iterations (passphrase wrap only; the recovery wrap has none). */
  iterations?: number
  iv: string
  ct: string
}

export interface Vault {
  passphrase: WrappedKey
  recovery: WrappedKey
}

export interface KeyOptions {
  /** PBKDF2 iterations. Only tests lower this. */
  iterations?: number
}

export interface CreatedVault {
  vault: Vault
  /** For encrypting and decrypting snapshots on this device. Cannot be exported from the browser. */
  dataKey: CryptoKey
  /** Show it to the person once. Do not store it. */
  recoveryKey: string
}

const randomBytes = (n: number) => crypto.getRandomValues(new Uint8Array(n))

async function importDataKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

async function passphraseKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', utf8(passphrase.normalize('NFKC')) as BufferSource, 'PBKDF2', false, [
    'deriveKey',
  ])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

async function recoveryWrapKey(recoveryBytes: Uint8Array, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', recoveryBytes as BufferSource, 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: salt as BufferSource, info: utf8('daily-quest recovery wrap') as BufferSource },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

const wrapAad = (purpose: 'passphrase' | 'recovery', userId: string) => utf8(`dq-wrap|${purpose}|${userId}`)

async function wrap(raw: Uint8Array, key: CryptoKey, salt: Uint8Array, aad: Uint8Array, iterations?: number): Promise<WrappedKey> {
  const iv = randomBytes(IV_BYTES)
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource, additionalData: aad as BufferSource }, key, raw as BufferSource),
  )
  return { v: 1, salt: toBase64(salt), ...(iterations !== undefined ? { iterations } : {}), iv: toBase64(iv), ct: toBase64(ct) }
}

async function unwrap(w: WrappedKey, key: CryptoKey, aad: Uint8Array): Promise<Uint8Array | null> {
  try {
    const raw = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(w.iv) as BufferSource, additionalData: aad as BufferSource },
      key,
      fromBase64(w.ct) as BufferSource,
    )
    return raw.byteLength === KEY_BYTES ? new Uint8Array(raw) : null
  } catch {
    return null
  }
}

// Crockford base32: no I, L, O or U, so a recovery key is hard to misread when copied by hand.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

export function formatRecoveryKey(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const b of bytes) {
    value = (value << 8) | b
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  return out.match(/.{1,4}/g)!.join('-')
}

/** Accepts what a person might type: any case, spaces or dashes, and O/I/L for 0/1/1. Returns null if it cannot be one. */
export function parseRecoveryKey(text: string): Uint8Array | null {
  const cleaned = text.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1')
  if (cleaned.length !== (RECOVERY_BYTES * 8) / 5) return null
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of cleaned) {
    const index = ALPHABET.indexOf(ch)
    if (index < 0) return null
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return new Uint8Array(out)
}

/** Makes a new data key and wraps it under the passphrase and under a fresh recovery key. */
export async function createVault(passphrase: string, userId: string, options: KeyOptions = {}): Promise<CreatedVault> {
  if (passphrase.length < MIN_PASSPHRASE) throw new KeyError('weak-passphrase', `Use at least ${MIN_PASSPHRASE} characters.`)
  const iterations = options.iterations ?? DEFAULT_ITERATIONS
  const raw = randomBytes(KEY_BYTES)
  const recoveryBytes = randomBytes(RECOVERY_BYTES)
  const passSalt = randomBytes(SALT_BYTES)
  const recSalt = randomBytes(SALT_BYTES)
  const vault: Vault = {
    passphrase: await wrap(raw, await passphraseKey(passphrase, passSalt, iterations), passSalt, wrapAad('passphrase', userId), iterations),
    recovery: await wrap(raw, await recoveryWrapKey(recoveryBytes, recSalt), recSalt, wrapAad('recovery', userId)),
  }
  return { vault, dataKey: await importDataKey(raw), recoveryKey: formatRecoveryKey(recoveryBytes) }
}

async function openPassphrase(vault: Vault, passphrase: string, userId: string): Promise<Uint8Array> {
  const w = vault.passphrase
  const raw = await unwrap(w, await passphraseKey(passphrase, fromBase64(w.salt), w.iterations ?? DEFAULT_ITERATIONS), wrapAad('passphrase', userId))
  if (!raw) throw new KeyError('wrong-passphrase', 'That passphrase is not right.')
  return raw
}

async function openRecovery(vault: Vault, recoveryKey: string, userId: string): Promise<Uint8Array> {
  const bytes = parseRecoveryKey(recoveryKey)
  if (!bytes) throw new KeyError('bad-recovery-key', 'That is not a recovery key. Check it and try again.')
  const raw = await unwrap(vault.recovery, await recoveryWrapKey(bytes, fromBase64(vault.recovery.salt)), wrapAad('recovery', userId))
  if (!raw) throw new KeyError('wrong-recovery-key', 'That recovery key does not match this account.')
  return raw
}

export async function unlockWithPassphrase(vault: Vault, passphrase: string, userId: string): Promise<CryptoKey> {
  return importDataKey(await openPassphrase(vault, passphrase, userId))
}

export async function unlockWithRecoveryKey(vault: Vault, recoveryKey: string, userId: string): Promise<CryptoKey> {
  return importDataKey(await openRecovery(vault, recoveryKey, userId))
}

/**
 * Sets a new passphrase. Proof of the old secret (the old passphrase or the recovery key) is needed, because the
 * data key itself is never kept in a form that can be re-wrapped. The recovery key stays valid and unchanged.
 */
export async function changePassphrase(
  vault: Vault,
  proof: { passphrase: string } | { recoveryKey: string },
  newPassphrase: string,
  userId: string,
  options: KeyOptions = {},
): Promise<Vault> {
  if (newPassphrase.length < MIN_PASSPHRASE) throw new KeyError('weak-passphrase', `Use at least ${MIN_PASSPHRASE} characters.`)
  const raw = 'passphrase' in proof ? await openPassphrase(vault, proof.passphrase, userId) : await openRecovery(vault, proof.recoveryKey, userId)
  const iterations = options.iterations ?? DEFAULT_ITERATIONS
  const salt = randomBytes(SALT_BYTES)
  return { ...vault, passphrase: await wrap(raw, await passphraseKey(newPassphrase, salt, iterations), salt, wrapAad('passphrase', userId), iterations) }
}

const snapshotAad = (userId: string, revision: number) => utf8(`dq-snapshot|${userId}|${revision}`)

/** Encrypts a snapshot for upload. Output is base64 of `iv | ciphertext+tag`, bound to this user and revision. */
export async function sealSnapshot(dataKey: CryptoKey, plaintext: Uint8Array, userId: string, revision: number): Promise<string> {
  const iv = randomBytes(IV_BYTES)
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as BufferSource, additionalData: snapshotAad(userId, revision) as BufferSource },
      dataKey,
      plaintext as BufferSource,
    ),
  )
  return toBase64(concat(iv, ct))
}

export async function openSnapshot(dataKey: CryptoKey, sealed: string, userId: string, revision: number): Promise<Uint8Array> {
  try {
    const bytes = fromBase64(sealed)
    if (bytes.length < IV_BYTES + 16) throw new Error('too short')
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bytes.subarray(0, IV_BYTES) as BufferSource, additionalData: snapshotAad(userId, revision) as BufferSource },
      dataKey,
      bytes.subarray(IV_BYTES) as BufferSource,
    )
    return new Uint8Array(pt)
  } catch {
    throw new KeyError('bad-snapshot', 'The synced data could not be opened. It may have been changed, or belongs to another account.')
  }
}
