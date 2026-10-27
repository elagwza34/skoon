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
    if (parsed.origin !== 'https://skoon.invalid') return null
    // These routes make navigation decisions themselves. Never send a newly
    // authenticated user back through them, otherwise an old `next` value can
    // bounce between the login page and a role home.
    if (parsed.pathname === '/login' || parsed.pathname === '/dashboard') return null
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return null
  }
}
