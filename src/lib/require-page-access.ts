import { redirect } from 'next/navigation'
import { getStaffSession, type StaffSession } from '@/lib/session'
import { canSeeRoute, homeForRole } from '@/lib/route-access'

/**
 * Server-side page guard — the authoritative gate used by every (app) page.
 *
 * Kept in its OWN module (not in `route-access.ts`) so that `route-access.ts`
 * stays a PURE module importable from client components (AppShell imports
 * `canSeeRoute` to filter the sidebar). `requirePageAccess` needs the trusted
 * session, which reads cookies via `next/headers` — importing that from a
 * client component breaks the build ("next/headers only works in a Server
 * Component"). Isolating it here keeps the two concerns apart:
 *
 *   - `route-access.ts`      → pure permission logic (client + server safe)
 *   - `require-page-access.ts` → session + redirect (server-only)
 *
 * It resolves the trusted session, then either returns it (page allowed) or
 * redirects: no session → /login; page outside the role → the role's home.
 * The (app) layout applies the same rule via `canSeeRoute`, so a page is
 * protected even if a developer forgets to call this; calling it here is what
 * makes each page independently safe and gives it a typed `session` to render
 * with. Owner bypasses every check.
 */
export async function requirePageAccess(pathname: string): Promise<StaffSession> {
  const session = await getStaffSession()
  if (!session) redirect('/login')
  const home = homeForRole(session.role)
  // Never redirect a user to their own canonical home — that would be a
  // redirect-to-self loop. canonicalHome is always allowed by canSeeRoute, so
  // this is defense-in-depth only.
  if (!canSeeRoute(session.role, session.permissions, pathname) && pathname !== home) {
    redirect(home)
  }
  return session
}
