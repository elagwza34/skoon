import { redirect } from 'next/navigation'
import { getStaffSession } from '@/lib/session'
import { getStaffCustomers } from '@/lib/staff-customers'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { formatCurrency, formatNumber, formatRelative } from '@/lib/format'

export const dynamic = 'force-dynamic'

/**
 * Customers — server component. Derived from real order history
 * (customerName on orders; no registered-customers table in v1).
 */
export default async function CustomersPage() {
  const session = await getStaffSession()
  if (!session) redirect('/login')

  const customers = await getStaffCustomers(session)

  return (
    <Card>
      <CardHeader>
        <CardTitle>العملاء ({formatNumber(customers.length)})</CardTitle>
        <CardDescription>مشتق من أسماء العملاء في الطلبات الحقيقية — بدون تسجيل دخول</CardDescription>
      </CardHeader>
      <CardContent>
        {customers.length === 0 ? (
          <EmptyState icon="customers" title="لا يوجد عملاء بعد" description="تظهر الأسماء هنا بعد أول طلب مسجل باسم عميل." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="px-2 py-2 text-start font-medium">الاسم</th>
                  <th className="px-2 py-2 text-start font-medium">الطلبات</th>
                  <th className="px-2 py-2 text-start font-medium">إجمالي الإنفاق</th>
                  <th className="px-2 py-2 text-start font-medium">آخر طلب</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.name} className="border-b border-border/50 last:border-0 hover:bg-accent/40">
                    <td className="px-2 py-2.5 font-medium text-foreground">{c.name}</td>
                    <td className="px-2 py-2.5 text-muted-foreground">{formatNumber(c.ordersCount)}</td>
                    <td className="px-2 py-2.5 font-medium text-foreground">{formatCurrency(c.totalSpent)}</td>
                    <td className="px-2 py-2.5 text-muted-foreground">{formatRelative(new Date(c.lastOrderAt))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}