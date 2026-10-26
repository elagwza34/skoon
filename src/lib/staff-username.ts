/**
 * Employee usernames are represented as verified, non-routable Supabase email
 * identities.  Supabase password authentication is email-based, while the
 * application deliberately accepts either a legacy email address or a staff
 * username.  No user-controlled metadata participates in this conversion.
 */
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{1,30}[a-z0-9]$/
const USERNAME_DOMAIN = 'accounts.skoon.invalid'

export function normalizeStaffUsername(value: string): string | null {
  const username = value.trim().toLowerCase()
  return USERNAME_PATTERN.test(username) ? username : null
}

export function staffUsernameEmail(username: string): string {
  return `${username}@${USERNAME_DOMAIN}`
}

export function usernameFromStaffEmail(email: string | null | undefined): string | null {
  if (!email) return null
  const suffix = `@${USERNAME_DOMAIN}`
  if (!email.toLowerCase().endsWith(suffix)) return null
  const username = normalizeStaffUsername(email.slice(0, -suffix.length))
  return username && staffUsernameEmail(username) === email.toLowerCase() ? username : null
}

/** Maps a login identifier to Supabase's email-password provider input. */
export function staffLoginEmail(identifier: string): string | null {
  const value = identifier.trim()
  if (!value) return null
  if (value.includes('@')) return value.toLowerCase()
  const username = normalizeStaffUsername(value)
  return username ? staffUsernameEmail(username) : null
}
