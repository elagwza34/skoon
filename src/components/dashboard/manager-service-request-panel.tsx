import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ServiceRequestBoard } from '@/components/service-requests/service-request-board'
import type { ManagerOperations } from '@/lib/manager-operations'

export function ManagerServiceRequestPanel({ metrics }: { metrics: ManagerOperations['serviceRequests'] }) {
  if (!metrics) return <Card dir="rtl"><CardHeader><CardTitle>Ø·Ù„Ø¨Ø§Øª Ø§Ù„Ø®Ø¯Ù…Ø©</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">ØªÙÙØ¹Ù‘Ù„ Ù‡Ø°Ù‡ Ø§Ù„Ù…ØªØ§Ø¨Ø¹Ø© Ø¨Ø¹Ø¯ Ø§Ø¹ØªÙ…Ø§Ø¯ Ù‡Ø¬Ø±Ø© Ø·Ù„Ø¨Ø§Øª Ø§Ù„Ø®Ø¯Ù…Ø©.</CardContent></Card>
  return <section dir="rtl" className="space-y-3"><div className="grid gap-3 sm:grid-cols-4">{[['Ø¨Ø§Ù†ØªØ¸Ø§Ø± Ø§Ù„Ø§Ø³ØªÙ„Ø§Ù…', metrics.pending], ['Ø´ÙƒØ§ÙˆÙ‰ Ù†Ø´Ø·Ø©', metrics.complaints], ['Ø·Ù„Ø¨Ø§Øª Ù…ØµØ¹Ù‘Ø¯Ø©', metrics.escalated], ['Ù…ØªØ£Ø®Ø±Ø©', metrics.overdue]].map(([label, value]) => <Card key={String(label)}><CardContent className="pt-4"><p className="text-sm text-muted-foreground">{label}</p><p className="text-2xl font-bold">{value}</p></CardContent></Card>)}</div><ServiceRequestBoard manager /></section>
}


