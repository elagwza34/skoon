import Link from 'next/link'
import { requirePageAccess } from '@/lib/require-page-access'
import { getLogoutEligibility } from '@/lib/logout-eligibility'
import { homeForRole } from '@/lib/route-access'

export const dynamic = 'force-dynamic'

/** Server-rendered safe fallback for any voluntary logout entry point. */
export default async function LogoutBlockedPage() {
  const session = await requirePageAccess('/logout-blocked')
  const eligibility = await getLogoutEligibility(session)

  // A race may resolve the outstanding work between the attempted logout and
  // this request. Do not show a stale blocker screen.
  if (eligibility.allowed) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-lg items-center px-5" dir="rtl">
        <section className="w-full rounded-xl border border-border bg-card p-6 text-center shadow-sm">
          <h1 className="text-lg font-bold">يمكنك تسجيل الخروج الآن</h1>
          <p className="mt-2 text-sm text-muted-foreground">تمت تسوية المسؤوليات التشغيلية المسجلة عليك.</p>
          <Link href={homeForRole(session.role)} className="mt-5 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">العودة للعمل</Link>
        </section>
      </main>
    )
  }

  const showShiftAction = eligibility.activeShift || eligibility.cashReconciliationRequired
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg items-center px-5" dir="rtl">
      <section className="w-full rounded-xl border border-warning/40 bg-card p-6 shadow-sm">
        <h1 className="text-lg font-bold">لا يمكن تسجيل الخروج حاليًا</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">لديك وردية مفتوحة أو مسؤوليات تشغيلية لم يتم إغلاقها أو تسليمها.</p>
        <ul className="mt-4 space-y-2 rounded-lg border border-border p-3 text-sm">
          {eligibility.blockers.map((blocker) => (
            <li key={blocker.kind} className="flex items-center justify-between gap-3">
              <span>{blocker.label}</span>
              {blocker.count ? <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs text-warning">{blocker.count}</span> : null}
            </li>
          ))}
        </ul>
        <div className="mt-5 flex flex-wrap gap-2">
          {showShiftAction ? <Link href="/shifts" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">إغلاق الوردية</Link> : null}
          <Link href={homeForRole(session.role)} className="rounded-md border border-border px-4 py-2 text-sm font-medium">العودة للعمل</Link>
        </div>
      </section>
    </main>
  )
}
