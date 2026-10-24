import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getPublicEnv } from '@/lib/env'
import { normalizedRequestId } from '@/lib/request-correlation'
import { isStaffApiPath, unauthenticatedStaffResponse } from '@/lib/api-auth-response'

/**
 * Edge middleware — Supabase Auth session refresh + route protection.
 *
 * Responsibilities (KEEP THIS LEAN — middleware runs on every request):
 *  1. Refresh the Supabase session cookies (standard @supabase/ssr pattern).
 *  2. FAIL-CLOSED route protection: every path is treated as staff-only unless
 *     it is explicitly listed as public. New staff routes are therefore
 *     protected the moment they are added — no allowlist maintenance.
 *  3. Bounce signed-in users away from /login.
 *
 * IMPORTANT: this checks IDENTITY only (cheap, no DB). Authorization (role,
 * branch, permissions) is resolved from the trusted `public.users` row in
 * `src/lib/session.ts` on the server — see PHASE-A doc §security model.
 */

/** Paths (prefixes) that are public — no session required. */
const PUBLIC_PREFIXES = [
  '/', // landing
  '/login', // sign-in
  '/order-type', // guest flow
  '/select-table', // guest flow
  '/menu', // guest flow (QR)
  '/order', // guest flow (order tracking)
  '/api/public', // guest order API
  '/_next', // Next.js internals
  '/favicon.ico',
  '/robots.txt',
  '/logo.png', // static brand asset (public/ — must be reachable without a session)
]

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => (p === '/' ? pathname === '/' : pathname === p || pathname.startsWith(p + '/')))
}

export async function middleware(request: NextRequest) {
  const requestId = normalizedRequestId(request.headers.get('x-request-id')) ?? crypto.randomUUID()
  const diagnostic = (category: string, status: number) => {
    // Deliberately excludes cookies, tokens, user IDs, and query values.
    console.warn(JSON.stringify({ event: 'auth_denial', requestId, route: request.nextUrl.pathname, method: request.method, status, category }))
  }
  // Create a response we can attach refreshed session cookies to.
  let response = NextResponse.next({ request })

  const { pathname, search } = request.nextUrl
  const publicPath = isPublicPath(pathname)

  // FAIL-CLOSED but NEVER THROW. A missing/invalid public env var used to make
  // `getPublicEnv()` throw here, which 500'd EVERY route (including the public
  // landing page). Instead: no session + staff path → bounce to /login with a
  // config reason; public path → just render.
  let supabase: ReturnType<typeof createServerClient> | null = null
  let configBroken = false
  try {
    const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = getPublicEnv()
    supabase = createServerClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    })
  } catch {
    configBroken = true
    // Names/messages only — getPublicEnv() never includes secret values.
    diagnostic('INTERNAL_AUTH_ERROR', 500)
  }

  let user: { id: string } | null = null
  if (supabase) {
    // Refresh the session (validates/rotates JWT and updates cookies).
    try {
      const { data } = await supabase.auth.getUser()
      user = data.user
    } catch {
      diagnostic('SESSION_INVALID', 401)
      user = null
    }
  }

  if (!user && !publicPath) {
    if (isStaffApiPath(pathname)) {
      diagnostic(configBroken ? 'INTERNAL_AUTH_ERROR' : 'AUTH_REQUIRED', 401)
      const apiResponse = unauthenticatedStaffResponse()
      response.cookies.getAll().forEach((cookie) => apiResponse.cookies.set(cookie))
      apiResponse.headers.set('x-request-id', requestId)
      return apiResponse
    }
    // Unauthenticated on a staff path → bounce to login, preserving the target.
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.search = ''
    const next = pathname + search
    if (next !== '/') loginUrl.searchParams.set('next', next)
    // Surface *why* when it is a missing/invalid env configuration, so the
    // login page can explain it instead of silently failing.
    if (configBroken) loginUrl.searchParams.set('reason', 'config')
    diagnostic(configBroken ? 'INTERNAL_AUTH_ERROR' : 'AUTH_REQUIRED', 401)
    const redirectResponse = NextResponse.redirect(loginUrl)
    redirectResponse.headers.set('x-request-id', requestId)
    return redirectResponse
  }

  if (user && pathname === '/login' && !request.nextUrl.searchParams.has('reason')) {
    // Already signed in → straight to the dashboard. (Skipped when bounced
    // with ?reason=unprovisioned — that page must stay reachable.)
    const dashUrl = request.nextUrl.clone()
    dashUrl.pathname = '/dashboard'
    dashUrl.search = ''
    const redirectResponse = NextResponse.redirect(dashUrl)
    redirectResponse.headers.set('x-request-id', requestId)
    return redirectResponse
  }

  // Expose the resolved pathname to server components (e.g. the (app) layout's
  // role-based route guard) which cannot read the URL directly. Safe: this is
  // the same normalized pathname middleware already computed.
  // IMPORTANT: it must go on the REQUEST headers (not just the response) so
  // server components can read it via next/headers — response headers are not
  // visible to server components.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-pathname', pathname)
  // Correlation only; handlers may log it but must never treat it as identity.
  requestHeaders.set('x-request-id', requestId)
  const responseWithPath = NextResponse.next({ request: { headers: requestHeaders } })
  // Preserve any refreshed auth cookies that were set on `response` above.
  response.cookies.getAll().forEach((c) => responseWithPath.cookies.set(c))
  responseWithPath.headers.set('x-request-id', requestId)
  return responseWithPath
}

export const config = {
  // Run on everything except Next static assets. Deliberately broad —
  // protection is decided inside the handler (fail-closed), not by the matcher.
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt).*)'],
}
