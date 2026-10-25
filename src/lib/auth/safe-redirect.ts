/**
 * Accept only a single same-origin application path for post-auth redirects.
 * This is deliberately independent from request state so it can be covered by
 * offline tests and reused by server actions without trusting form input.
 */
export function safeInternalRedirect(value: FormDataEntryValue | null): string | null {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return null
  // Backslashes can be interpreted as URL separators by some clients/proxies.
  if (value.includes('\\') || /[\r\n]/.test(value)) return null
  try {
    const parsed = new URL(value, 'https://skoon.invalid')
    return parsed.origin === 'https://skoon.invalid' ? `${parsed.pathname}${parsed.search}${parsed.hash}` : null
  } catch {
    return null
  }
}
