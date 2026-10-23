import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ServiceRequestBoard } from '@/components/service-requests/service-request-board'
import type { ManagerOperations } from '@/lib/manager-operations'

export function ManagerServiceRequestPanel({ metrics }: { metrics: ManagerOperations['serviceRequests'] }) {
  if (!metrics) return <Card dir="rtl"><CardHeader><CardTitle>طلبات الخدمة</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">تُفعّل هذه المتابعة بعد اعتماد هجرة طلبات الخدمة.</CardContent></Card>
  return <section dir="rtl" className="space-y-3"><div className="grid gap-3 sm:grid-cols-4">{[['بانتظار الاستلام', metrics.pending], ['شكاوى نشطة', metrics.complaints], ['طلبات مصعّدة', metrics.escalated], ['متأخرة', metrics.overdue]].map(([label, value]) => <Card key={String(label)}><CardContent className="pt-4"><p className="text-sm text-muted-foreground">{label}</p><p className="text-2xl font-bold">{value}</p></CardContent></Card>)}</div><ServiceRequestBoard manager /></section>
}
