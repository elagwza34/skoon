import { redirect } from 'next/navigation'
import { getStaffSession } from '@/lib/session'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'

export const dynamic = 'force-dynamic'

/**
 * Shifts — honest scope notice. There is no Shift model in the Prisma
 * schema (v1), so no shift open/close/reconciliation can be persisted.
 * This screen states the blocker instead of rendering fabricated shifts.
 */
export default async function ShiftsPage() {
  const session = await getStaffSession()
  if (!session) redirect('/login')

  return (
    <Card>
      <CardHeader>
        <CardTitle>الورديات</CardTitle>
        <CardDescription>رصيد الافتتاح والجرد والمتوقع والفرق والتسوية</CardDescription>
      </CardHeader>
      <CardContent>
        <EmptyState
          icon="shifts"
          title="الورديات خارج نطاق v1"
          description="لا يوجد نموذج Shift في قاعدة البيانات الحالية، فلا يمكن فتح وردية أو تسويتها بأمان. المطلوب: إضافة جدول shifts + سياسات RLS + شاشة فتح/إغلاق — موثق كعائق في docs/completion-audit.md."
        />
      </CardContent>
    </Card>
  )
}