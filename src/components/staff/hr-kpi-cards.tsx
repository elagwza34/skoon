'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'

type Overview = { employees: number; activeEmployees: number; presentToday: number; pendingApprovals: number; totalPayroll: string; paidPayroll: string; outstandingPayroll: string }
const labels = ['إجمالي الموظفين', 'الحاضرون اليوم', 'طلبات معلقة', 'إجمالي رواتب الفترة', 'الرواتب المدفوعة', 'الرواتب المتبقية']

/** A failed Phase D readiness check is shown as unavailable, never as a
 * permanent loading skeleton or fabricated zero. */
export function HrKpiCards() {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => { void (async () => { try { const response = await fetch('/api/staff/hr/overview'); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error ?? 'تعذر تحميل مؤشرات الموارد البشرية'); setOverview(body) } catch (reason) { setError(reason instanceof Error ? reason.message : 'تعذر تحميل مؤشرات الموارد البشرية') } finally { setLoading(false) } })() }, [])
  const values = overview ? [`${overview.activeEmployees}/${overview.employees}`, String(overview.presentToday), String(overview.pendingApprovals), `${overview.totalPayroll} ج.م`, `${overview.paidPayroll} ج.م`, `${overview.outstandingPayroll} ج.م`] : labels.map(() => loading ? 'جارٍ التحميل…' : 'غير متاح')
  return <>{error ? <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}<div className="grid grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-6">{labels.map((label, index) => <Card key={label} className="min-w-0"><CardContent className="p-3"><p className="truncate text-xs text-muted-foreground">{label}</p><p className="mt-1 truncate text-base font-bold text-foreground">{values[index]}</p></CardContent></Card>)}</div></>
}
