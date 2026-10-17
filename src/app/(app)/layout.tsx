import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { AppShell } from '@/components/layout/app-shell'
import { getAuthUser, getStaffSession } from '@/lib/session'
import { describeDbEnv, prisma } from '@/lib/prisma'
import { canSeeRoute, isOperationalRole, isOpsPath, canRenderInOpsShell, homeForRole } from '@/lib/route-access'

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
 *  - No Supabase session            → /login (middleware does this too).
 *  - Signed in but no `public.users` row → /login?reason=unprovisioned so the
 *    page can explain (and so middleware's "signed-in → /login" bounce does not
 *    loop back to /dashboard).
 *
 * A thrown error (e.g. DATABASE_URL missing, Prisma engine unreachable on the
 * host) is caught and rendered as an explanatory panel instead of a bare 500
 * digest — otherwise the failure is invisible without host logs.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  let session
  try {
    session = await getStaffSession()
  } catch (err) {
    // Next.js throws a special "dynamic server usage" error to bail out of
    // static prerendering when a route reads `cookies()`. That signal MUST
    // propagate — swallowing it would break static/dynamic detection. Only
    // genuine failures are rendered as a panel.
    if (isDynamicBailout(err)) throw err
    const detail = (err as Error).message || 'Unknown error'
    console.error('[skoon] getStaffSession failed:', detail)
    return <ConfigErrorPanel detail={detail} />
  }

  if (!session) {
    const authUser = await getAuthUser()
    redirect(authUser ? '/login?reason=unprovisioned' : '/login')
  }

  // --- Server-side route guard (defense in depth) -------------------------
  // This is the REAL gate. Hiding a sidebar link is only a UX nicety; typing
  // the URL directly is blocked here from the trusted DB role/permissions.
  const pathname = (await currentPath()).pathname
  if (!canSeeRoute(session.role, session.permissions, pathname)) {
    redirect(homeForRole(session.role))
  }

  // Operational roles (waiter/kitchen/cashier) live on a full-screen board
  // without the admin sidebar. Send them straight to their board when they
  // land on an admin page they happen to be allowed to open.
  const home = homeForRole(session.role)
  // An operational role on a non-board page is bounced home — EXCEPT the
  // narrow ops-shell exceptions (e.g. /shifts for the cashier, whose whole
  // station is blocked while no till is open).
  if (
    isOperationalRole(session.role) &&
    !isOpsPath(pathname) &&
    !canRenderInOpsShell(session.role, pathname) &&
    pathname !== home
  ) {
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

  // Operational roles on their board (POS / kitchen / waiter) get a FULL-SCREEN
  // view with no admin sidebar — those are work stations, not an admin console.
  // Everything else is wrapped in the shared AppShell (sidebar + topbar).
  if (isOperationalRole(session.role) && isOpsPath(pathname)) {
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

/** True for Next.js' internal static-opt-out signal (must not be swallowed). */
function isDynamicBailout(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { message?: string; digest?: string }
  return (
    typeof e.message === 'string' && e.message.includes('Dynamic server usage')
  ) || e.digest === 'DYNAMIC_SERVER_USAGE'
}

/** Rendered when session resolution itself failed (usually env/DB config). */
function ConfigErrorPanel({ detail }: { detail: string }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6" dir="rtl">
      <div className="w-full max-w-lg rounded-2xl border border-destructive/30 bg-card p-6 text-center shadow-sm">
        <div className="mb-3 text-3xl" aria-hidden>⚠️</div>
        <h1 className="mb-2 text-lg font-bold">تعذّر الاتصال بقاعدة البيانات</h1>
        <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
          تم تسجيل الدخول، لكن قراءة صلاحيات الموظف فشلت. غالباً سبب ذلك متغيرات
          بيئة ناقصة أو غير صحيحة على السيرفر.
        </p>
        <div className="mb-4 rounded-lg border border-warning/40 bg-warning/10 p-3 text-start text-xs text-warning" dir="ltr">
          {describeDbEnv()}
        </div>
        <div className="mb-5 rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-start" dir="ltr">
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs text-destructive">{detail}</pre>
        </div>
        <p className="mb-5 text-xs leading-relaxed text-muted-foreground" dir="rtl">
          السبب الأرجح: متغيّر <code className="rounded bg-muted px-1 py-0.5" dir="ltr">DATABASE_URL</code>{' '}
          غير مضبوط على السيرفر (لازم يبدأ بـ <code className="rounded bg-muted px-1 py-0.5" dir="ltr">postgresql://</code>).
          ملاحظة: ملف <code className="rounded bg-muted px-1 py-0.5" dir="ltr">.env</code> المحلي لا يُرفع مع الكود —
          لازم تحط المتغيّرات في إعدادات البيئة على الاستضافة.
        </p>
        <a
          href="/login"
          className="inline-block rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
        >
          الذهاب لصفحة الدخول
        </a>
      </div>
    </div>
  )
}
