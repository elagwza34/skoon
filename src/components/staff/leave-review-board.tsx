'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { formatDateShort, formatRelative } from '@/lib/format'

export interface LeaveReviewRow {
  id: string
  employeeName: string
  type: string
  status: string
  startsOn: string
  endsOn: string
  days: string
  reason: string
  reviewerName: string | null
  decisionNote: string | null
  decidedAt: string | null
  createdAt: string
}

const statusTone: Record<string, BadgeTone> = { pending: 'warning', approved: 'success', rejected: 'destructive' }
const statusLabel: Record<string, string> = { pending: 'قيد المراجعة', approved: 'موافق عليه', rejected: 'مرفوض' }

/** Owner/manager review surface; decisions remain authorized and audited by the API. */
export function LeaveReviewBoard({ rows, canDecide }: { rows: LeaveReviewRow[]; canDecide: boolean }) {
  const router = useRouter()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  async function decide(id: string, approve: boolean) {
    const note = window.prompt(approve ? 'ملاحظة القرار (اختيارية)' : 'سبب الرفض (اختياري)')
    if (note === null) return
    setPendingId(id)
    setError(null)
    try {
      const response = await fetch(`/api/staff/hr/leave/${id}/decision`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ approve, note }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error ?? 'تعذر حفظ قرار الإجازة')
      startTransition(() => router.refresh())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر حفظ قرار الإجازة')
    } finally {
      setPendingId(null)
    }
  }

  return <div className="flex flex-col gap-4">
    <div>
      <h1 className="text-2xl font-bold">طلبات الإجازات</h1>
      <p className="text-sm text-muted-foreground">المراجعة تغير حالة الطلب فقط؛ لا تنشئ أي خصم أو احتساب رواتب تلقائيًا.</p>
    </div>
    {error ? <Card className="border-destructive/40"><CardContent className="pt-5 text-sm text-destructive">{error}</CardContent></Card> : null}
    <Card>
      <CardHeader><CardTitle>سجل الطلبات</CardTitle><CardDescription>الطلبات مرئية بحسب نطاق صلاحية الحساب.</CardDescription></CardHeader>
      <CardContent>
        {rows.length === 0 ? <EmptyState icon="staff" title="لا توجد طلبات إجازة" description="ستظهر الطلبات الجديدة هنا للمراجعة." /> :
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-border text-start text-xs text-muted-foreground"><th className="px-2 py-2 font-medium">الموظف</th><th className="px-2 py-2 font-medium">الفترة</th><th className="px-2 py-2 font-medium">النوع</th><th className="px-2 py-2 font-medium">الحالة</th><th className="px-2 py-2 font-medium">السبب</th><th className="px-2 py-2 font-medium">الإجراء</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-b border-border/50 align-top last:border-0"><td className="px-2 py-3 font-medium">{row.employeeName}<p className="mt-1 text-xs font-normal text-muted-foreground">{formatRelative(new Date(row.createdAt))}</p></td><td className="px-2 py-3 whitespace-nowrap">{formatDateShort(new Date(row.startsOn))}<br />{formatDateShort(new Date(row.endsOn))}<p className="mt-1 text-xs text-muted-foreground">{row.days} يوم</p></td><td className="px-2 py-3">{row.type}</td><td className="px-2 py-3"><Badge tone={statusTone[row.status] ?? 'muted'}>{statusLabel[row.status] ?? row.status}</Badge>{row.reviewerName ? <p className="mt-1 text-xs text-muted-foreground">{row.reviewerName}</p> : null}</td><td className="max-w-xs px-2 py-3 text-muted-foreground">{row.reason}{row.decisionNote ? <p className="mt-1 text-xs">{row.decisionNote}</p> : null}</td><td className="px-2 py-3">{canDecide && row.status === 'pending' ? <div className="flex gap-2"><Button size="sm" disabled={pendingId === row.id} onClick={() => decide(row.id, true)}>موافقة</Button><Button size="sm" variant="destructive" disabled={pendingId === row.id} onClick={() => decide(row.id, false)}>رفض</Button></div> : <span className="text-xs text-muted-foreground">—</span>}</td></tr>)}</tbody></table></div>}
      </CardContent>
    </Card>
  </div>
}
