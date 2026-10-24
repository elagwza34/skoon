/**
 * Accept only compact, printable correlation IDs from trusted infrastructure.
 * This diagnostic value never participates in authentication or authorization.
 */
export function normalizedRequestId(value: string | null): string | null {
  if (!value || value.length > 128) return null
  return /^[A-Za-z0-9_-]{8,128}$/.test(value) ? value : null
}
