/**
 * Employee POS PIN — secure storage & verification helpers.
 *
 * A PIN is LOW ENTROPY (a 4–8 digit code has only ~10^4–10^8 possibilities), so
 * hashing alone is not enough. This module layers:
 *   1. An optional server-side pepper (env `POS_PIN_PEPPER`) applied via HMAC,
 *      which is NOT stored in the database and raises the cost of offline
 *      brute-force even if the hash leaks.
 *   2. bcrypt (cost 12) with a per-PIN random salt, stored in `users.pin_hash`.
 *
 * These helpers are SERVER-ONLY by design: PIN verification must never run in
 * the browser, and PINs must never be logged or returned in API responses.
 *
 * This is NOT authentication — Supabase Auth owns sign-in. The PIN authorizes
 * individual POS actions for an already-authenticated employee.
 */
import { createHmac } from 'node:crypto'
import { compare, hash } from 'bcryptjs'

export const PIN_MIN_LENGTH = 4
export const PIN_MAX_LENGTH = 8
export const BCRYPT_COST = 12

/** Result of a PIN format check (does not touch the database). */
export type PinFormatResult = { ok: true } | { ok: false; error: string }

/** Validate PIN format: digits only, within the allowed length. */
export function validatePinFormat(pin: string): PinFormatResult {
  if (typeof pin !== 'string' || pin.length === 0) {
    return { ok: false, error: 'PIN is required' }
  }
  if (pin.length < PIN_MIN_LENGTH || pin.length > PIN_MAX_LENGTH) {
    return { ok: false, error: `PIN must be ${PIN_MIN_LENGTH}-${PIN_MAX_LENGTH} digits` }
  }
  if (!/^\d+$/.test(pin)) {
    return { ok: false, error: 'PIN must contain digits only' }
  }
  return { ok: true }
}

/**
 * Apply the optional server-side pepper. If `POS_PIN_PEPPER` is unset, the raw
 * PIN is returned unchanged (bcrypt still salts per-PIN). The pepper is a
 * server-only secret and is never persisted with the hash.
 */
function peppered(pin: string): string {
  const pepper = process.env.POS_PIN_PEPPER
  if (!pepper) return pin
  return createHmac('sha256', pepper).update(pin).digest('hex')
}

/**
 * Hash a PIN for storage. Validates format first and throws on invalid input.
 * Returns a bcrypt hash suitable for `users.pin_hash` (VarChar(255)).
 */
export async function hashPin(pin: string): Promise<string> {
  const check = validatePinFormat(pin)
  if (!check.ok) {
    throw new Error(check.error)
  }
  return hash(peppered(pin), BCRYPT_COST)
}

/**
 * Verify a candidate PIN against a stored hash. Constant-time via bcrypt's
 * internal comparison. Returns false (never throws) on mismatch so callers can
 * handle failures uniformly. Empty/null hash means "no PIN set".
 */
export async function verifyPin(pin: string, storedHash: string | null | undefined): Promise<boolean> {
  if (!storedHash) return false
  if (typeof pin !== 'string' || pin.length === 0) return false
  try {
    return await compare(peppered(pin), storedHash)
  } catch {
    // A malformed stored hash must never throw to the caller.
    return false
  }
}
