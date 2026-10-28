import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { AppShell } from '@/components/layout/app-shell'
import { getAuthUser, getStaffSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { canSeeRoute, isOperationalRole, shouldRedirectOperationalUserToHome, homeForRole } from '@/lib/route-access'

/** Read the resolved pathname (set by middleware). Falls back to ''. */
async function currentPath(): Promise<{ pathname: string }> {
  const h = await headers()
  return { pathname: h.get('x-pathname') ?? '' }
}

/**
 * Authenticated staff route group. Defense-in-depth: the layout itself verifies
 * the session server-side and bounces users to /login. Middleware also guards
 * these paths, but the layout check is authoritative and cannot be bypassed by a
 * mis-set cookie. The sidebar hides items by role, but the server (this guard +
 * per-route checks + RLS) is the real gate.
 *
 * Bounce logic:
 *  - No Supabase session            â†’ /login (middleware does this too).
 *  - Signed in but no `public.users` row â†’ /login?reason=unprovisioned so the
 *    page can explain (and so middleware's "signed-in â†’ /login" bounce does not
 *    loop back to /dashboard).
 *
 * A thrown error (e.g. DATABASE_URL missing, Prisma engine unreachable on the
 * host) is caught and rendered as an explanatory panel instead of a bare 500
 * digest â€” otherwise the failure is invisible without host logs.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  let session
  try {
    session = await getStaffSession()
  } catch (err) {
    // Next.js throws a special "dynamic server usage" error to bail out of
    // static prerendering when a route reads `cookies()`. That signal MUST
    // propagate â€” swallowing it would break static/dynamic detection. Only
    // genuine failures are rendered as a panel.
    if (isDynamicBailout(err)) throw err
    console.error('[skoon] getStaffSession failed:', (err as Error).message ?? err)
    return <ConfigErrorPanel />
  }

  if (!session) {
    const authUser = await getAuthUser()
    // Authenticated-but-unprovisioned is an authorization state, not an
    // anonymous session. Rendering a terminal explanation avoids sending an
    // authenticated browser through /login, which may route it straight back
    // to its role home and create a redirect loop.
    if (authUser) return <AccountConfigurationPanel />
    redirect('/login')
  }

  // --- Server-side route guard (defense in depth) -------------------------
  // This is the REAL gate. Hiding a sidebar link is only a UX nicety; typing
  // the URL directly is blocked here from the trusted DB role/permissions.
  const pathname = (await currentPath()).pathname
  const home = homeForRole(session.role)
  // Never redirect a user to their own canonical home â€” that would be a
  // redirect-to-self loop. canonicalHome is always allowed by canSeeRoute, so
  // this is defense-in-depth only.
  if (!canSeeRoute(session.role, session.permissions, pathname) && pathname !== home) {
    redirect(home)
  }

  // Operational roles (waiter/kitchen/cashier) live on a full-screen board
  // without the admin sidebar. Send them straight to their board when they
  // land on an admin page they happen to be allowed to open.
  // An operational role on a non-board page is bounced home â€” EXCEPT the
  // narrow ops-shell exceptions (e.g. /shifts for the cashier, whose whole
  // station is blocked while no till is open).
  if (shouldRedirectOperationalUserToHome(session.role, pathname)) {
    redirect(home)
  }

  let branchName: string | null = null
  if (session.branchId) {
    try {
      const branch = await prisma.cafeBranch.findUnique({
        where: { id: BigInt(session.branchId) },
        select: { name: true },
      })
      branchName = branch?.name ?? null
    } catch {
      branchName = null
    }
  }

  // Operational roles (cashier / kitchen / waiter) never get the admin sidebar
  // on any page â€” only owner and manager see it. Those roles work full-screen
  // on their dedicated boards.
  if (isOperationalRole(session.role)) {
    return <>{children}</>
  }

  return (
    <AppShell
      user={{ name: session.name, role: session.role, permissions: session.permissions }}
      branchName={branchName}
    >
      {children}
    </AppShell>
  )
}

function AccountConfigurationPanel() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6" dir="rtl">
      <div className="w-full max-w-lg rounded-2xl border border-warning/40 bg-card p-6 text-center shadow-sm">
        <h1 className="mb-2 text-lg font-bold">Ø§Ù„Ø­Ø³Ø§Ø¨ ØºÙŠØ± Ù…Ù‡ÙŠØ£ Ù„Ù„ÙˆØµÙˆÙ„</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          ØªÙ… Ø§Ù„ØªØ­Ù‚Ù‚ Ù…Ù† ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø¯Ø®ÙˆÙ„ØŒ Ù„ÙƒÙ† Ù„Ø§ ØªÙˆØ¬Ø¯ ØµÙ„Ø§Ø­ÙŠØ© ØªØ·Ø¨ÙŠÙ‚ Ù†Ø´Ø·Ø© Ù…Ø±ØªØ¨Ø·Ø© Ø¨Ù‡Ø°Ø§ Ø§Ù„Ø­Ø³Ø§Ø¨.
        </p>
      </div>
    </div>
  )
}

/** True for Next.js' internal static-opt-out signal (must not be swallowed). */
function isDynamicBailout(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { message?: string; digest?: string }
  return (
    typeof e.message === 'string' && e.message.includes('Dynamic server usage')
  ) || e.digest === 'DYNAMIC_SERVER_USAGE'
}

/** Rendered when session resolution itself failed (usually env/DB config). */
function ConfigErrorPanel() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6" dir="rtl">
      <div className="w-full max-w-lg rounded-2xl border border-destructive/30 bg-card p-6 text-center shadow-sm">
        <div className="mb-3 text-3xl" aria-hidden>âš ï¸</div>
        <h1 className="mb-2 text-lg font-bold">ØªØ¹Ø°Ù‘Ø± Ø§Ù„Ø§ØªØµØ§Ù„ Ø¨Ù‚Ø§Ø¹Ø¯Ø© Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª</h1>
        <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
          ØªÙ… ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø¯Ø®ÙˆÙ„ØŒ Ù„ÙƒÙ† Ù‚Ø±Ø§Ø¡Ø© ØµÙ„Ø§Ø­ÙŠØ§Øª Ø§Ù„Ù…ÙˆØ¸Ù ÙØ´Ù„Øª. ÙŠØ±Ø¬Ù‰ Ù…Ø±Ø§Ø¬Ø¹Ø© Ù…Ø¯ÙŠØ± Ø§Ù„Ù†Ø¸Ø§Ù… Ø£Ùˆ Ø§Ù„Ù…Ø­Ø§ÙˆÙ„Ø© Ù…Ø±Ø© Ø£Ø®Ø±Ù‰ Ù„Ø§Ø­Ù‚Ø§Ù‹.
        </p>
        <a
          href="/login"
          className="inline-block rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
        >
          Ø§Ù„Ø°Ù‡Ø§Ø¨ Ù„ØµÙØ­Ø© Ø§Ù„Ø¯Ø®ÙˆÙ„
        </a>
      </div>
    </div>
  )
}


