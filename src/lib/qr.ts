import { randomBytes } from 'node:crypto'
import { z } from 'zod'

/**
 * Table public token (QR capability secret).
 * 16 lowercase hex chars = 64 bits (~1.8e19 possibilities), not guessable.
 * Never expose the internal numeric table id in URLs — use the token.
 * Regenerate on conflict (UNIQUE index on cafe_tables.public_token).
 */
export const TABLE_TOKEN_RE = /^[0-9a-f]{16}$/

export function generateTableToken(): string {
  return randomBytes(8).toString('hex')
}

export const tableTokenSchema = z
  .string()
  .regex(TABLE_TOKEN_RE, 'Invalid table code')

/** Build the customer menu URL for a table token. */
export function tableMenuUrl(token: string, baseUrl?: string): string {
  const base = (baseUrl ?? process.env.APP_URL ?? '').replace(/\/$/, '')
  return `${base}/menu/${token}`
}
