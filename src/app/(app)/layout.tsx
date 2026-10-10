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
  return <AppShell user={{ name: session.name, role: session.role }}>{children}</AppShell>
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
