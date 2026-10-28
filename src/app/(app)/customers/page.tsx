import { requirePageAccess } from '@/lib/require-page-access'
import { getStaffCustomers } from '@/lib/staff-customers'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { formatCurrency, formatNumber, formatRelative } from '@/lib/format'

export const dynamic = 'force-dynamic'

/**
 * Customers â€” server component. Derived from real order history
 * (customerName on orders; no registered-customers table in v1).
 */
export default async function CustomersPage() {
  const session = await requirePageAccess('/customers')

  const customers = await getStaffCustomers(session)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ø§Ù„Ø¹Ù…Ù„Ø§Ø¡ ({formatNumber(customers.length)})</CardTitle>
        <CardDescription>Ù…Ø´ØªÙ‚ Ù…Ù† Ø£Ø³Ù…Ø§Ø¡ Ø§Ù„Ø¹Ù…Ù„Ø§Ø¡ ÙÙŠ Ø§Ù„Ø·Ù„Ø¨Ø§Øª Ø§Ù„Ø­Ù‚ÙŠÙ‚ÙŠØ© â€” Ø¨Ø¯ÙˆÙ† ØªØ³Ø¬ÙŠÙ„ Ø¯Ø®ÙˆÙ„</CardDescription>
      </CardHeader>
      <CardContent>
        {customers.length === 0 ? (
          <EmptyState icon="customers" title="Ù„Ø§ ÙŠÙˆØ¬Ø¯ Ø¹Ù…Ù„Ø§Ø¡ Ø¨Ø¹Ø¯" description="ØªØ¸Ù‡Ø± Ø§Ù„Ø£Ø³Ù…Ø§Ø¡ Ù‡Ù†Ø§ Ø¨Ø¹Ø¯ Ø£ÙˆÙ„ Ø·Ù„Ø¨ Ù…Ø³Ø¬Ù„ Ø¨Ø§Ø³Ù… Ø¹Ù…ÙŠÙ„." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="px-2 py-2 text-start font-medium">Ø§Ù„Ø§Ø³Ù…</th>
                  <th className="px-2 py-2 text-start font-medium">Ø§Ù„Ø·Ù„Ø¨Ø§Øª</th>
                  <th className="px-2 py-2 text-start font-medium">Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ø¥Ù†ÙØ§Ù‚</th>
                  <th className="px-2 py-2 text-start font-medium">Ø¢Ø®Ø± Ø·Ù„Ø¨</th>
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

