import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/app-shell'
import { getAuthUser, getStaffSession } from '@/lib/session'

/**
 * Authenticated staff route group. Defense-in-depth: the layout itself verifies
 * the session server-side and bounces users to /login. Middleware also guards
 * these paths, but the layout check is authoritative and cannot be bypassed by a
 * mis-set cookie. The sidebar hides items by role, but the server (this guard +
 * per-route checks + RLS) is the real gate.
 *
 * Bounce logic:
 *  - No Supabase session            → /login (middleware does this too).
 *  - Signed in but no `public.users` row → /login?reason=unprovisioned so the
 *    page can explain (and so middleware's "signed-in → /login" bounce does not
 *    loop back to /dashboard).
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getStaffSession()
  if (!session) {
    const authUser = await getAuthUser()
    redirect(authUser ? '/login?reason=unprovisioned' : '/login')
  }
  return <AppShell user={{ name: session.name, role: session.role }}>{children}</AppShell>
}
