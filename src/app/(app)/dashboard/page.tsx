import { redirect } from 'next/navigation'
import { getStaffSession } from '@/lib/session'
import { resolveRoleHome } from '@/lib/route-access'

/**
 * Legacy /dashboard compatibility route.
 *
 * The /dashboard route was removed in favour of canonical role homes
 * (/owner, /manager, /cashier, /kitchen, /waiter). Existing bookmarks or
 * saved links that point to /dashboard are redirected here to the caller's
 * canonical role home based on their trusted database role — never to a
 * hardcoded path, and never back to /login for an authenticated user.
 *
 * This is a server component so the redirect decision is made from the
 * session on every request, preventing stale client-side bookmarks from
 * producing a 404 or a redirect loop.
 */
export default async function DashboardCompatPage() {
  const session = await getStaffSession()
  if (!session) {
    redirect('/login')
  }
  const home = resolveRoleHome(session.role)
  // resolveRoleHome never returns /dashboard, so this compat route can never
  // loop back to itself. If the role is unknown, bounce to login.
  if (!home) {
    redirect('/login')
  }
  redirect(home)
}
