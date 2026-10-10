import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { EmptyState } from '@/components/ui/empty-state'
import { formatCurrency } from '@/lib/format'
import { getPublicOrder } from '@/lib/public-orders'
import { OrderStatusTracker } from '@/components/order/order-status-tracker'

export const dynamic = 'force-dynamic'

/**
 * Customer order confirmation / tracking — /order/[id]?n=<orderNumber>.
 * The `n` (order number) is a required guard alongside the id so the integer id
 * alone can't be enumerated to view other customers' orders. The status header
 * is a client tracker that live-updates as staff advance the order (Phase F).
 */
export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ n?: string }>
}) {
  const { id } = await params
  const { n } = await searchParams
  if (!n) notFound()

  const order = await getPublicOrder(id, n)
  if (!order) notFound()

  const isCancelled = order.status === 'cancelled'

  return (
    <div className="flex flex-col gap-4">
      <OrderStatusTracker
        id={order.id}
        orderNumber={order.orderNumber}
        initialStatus={order.status}
        branchName={order.branchName}
        tableNumber={order.tableNumber}
      />

      <Card>
        <CardHeader>
          <CardTitle>تفاصيل الطلب</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <ul className="flex flex-col divide-y divide-border/60">
            {order.items.map((item, idx) => (
              <li key={idx} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                <span className="flex flex-col">
                  <span className="font-medium">
                    {item.name} <span className="text-muted-foreground">× {item.qty}</span>
                  </span>
                  {item.note ? (
                    <span className="text-xs text-muted-foreground">ملاحظة: {item.note}</span>
                  ) : null}
                </span>
                <span className="shrink-0 font-medium">{formatCurrency(Number(item.lineTotal))}</span>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between border-t border-border pt-3 text-base font-bold">
            <span>الإجمالي</span>
            <span>{formatCurrency(Number(order.total))}</span>
          </div>
        </CardContent>
        <CardFooter className="flex-col items-stretch gap-2">
          <Link href="/">
            <Button variant="outline" className="w-full">
              <Icon name="utensils" size={16} />
              رجوع للمنيو
            </Button>
          </Link>
          {!isCancelled ? (
            <p className="text-center text-xs text-muted-foreground">
              الدفع بيتم في الكاشير بعد ما تخلص. شكراً ليك!
            </p>
          ) : null}
        </CardFooter>
      </Card>

      {order.items.length === 0 ? (
        <EmptyState icon="orders" title="مفيش أصناف" description="الطلب فاضي حالياً." />
      ) : null}
    </div>
  )
}
