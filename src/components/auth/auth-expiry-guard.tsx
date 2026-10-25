'use client'

import { useEffect } from 'react'

/** Pure request classifier, kept testable without a browser runtime. */
export function isSameOriginStaffApiRequest(input: string, origin: string): boolean {
  try {
    const url = new URL(input, origin)
    return url.origin === origin && (url.pathname === '/api/staff' || url.pathname.startsWith('/api/staff/'))
  } catch {
    return false
  }
}

/**
 * A deleted/expired cookie is authoritatively rejected by middleware. This
 * guard only reconciles an already-rendered client UI with that 401 response;
 * it never supplies credentials, polls, or attempts to restore a session.
 */
export function AuthExpiryGuard() {
  useEffect(() => {
    const originalFetch = window.fetch.bind(window)
    window.fetch = async (input, init) => {
      const response = await originalFetch(input, init)
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (response.status === 401 && isSameOriginStaffApiRequest(url, window.location.origin) && window.location.pathname !== '/login') {
        // A full navigation clears client component state and prevents stale UI
        // from being reused after the server has rejected its credentials.
        window.location.replace('/login')
      }
      return response
    }
    return () => { window.fetch = originalFetch }
  }, [])

  return null
}
