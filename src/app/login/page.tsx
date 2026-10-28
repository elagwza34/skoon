import { LoginForm } from '@/components/auth/login-form'
import { redirect } from 'next/navigation'
import { getStaffSession } from '@/lib/session'
import { resolveRoleHome } from '@/lib/route-access'

/**
 * Staff sign-in page (public). Renders the client form which submits to the
 * server action in `src/app/login/actions.ts`.
 * `next` â€” where to go after sign-in (validated server-side).
 * `reason` â€” context from a bounce (e.g. `unprovisioned`).
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reason?: string }>
}) {
  const { next, reason } = await searchParams
  // An authenticated identity visiting the unified login page is routed using
  // the trusted public.users role, never a client claim. Keep the
  // unprovisioned screen reachable so it can explain the safe denial.
  if (!reason) {
    const session = await getStaffSession()
    const home = session ? resolveRoleHome(session.role) : null
    if (home) redirect(home)
  }
  return <LoginForm next={next} reason={reason} />
}


