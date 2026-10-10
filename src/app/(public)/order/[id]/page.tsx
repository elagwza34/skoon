import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/format'
import { getPublicOrder } from '@/lib/public-orders'

export const dynamic = 'force-dynamic'

const STATUS_LABEL: Record<string, string> = {
  new: 'تم استلام طلبك',
  preparing: 'جاري التحضير',
  ready: 'طلبك جاهز',
  served: 'تم التقديم',
  completed: 'مكتمل',
  cancelled: 'تم إلغاء الطلب',
}

/**
 * Customer order confirmation / tracking — /order/[id]?n=<orderNumber>.
 * The `n` (order number) is a required guard alongside the id so the integer id
 * alone can't be enumerated to view other customers' orders.
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
  const statusLabel = STATUS_LABEL[order.status] ?? 'تم استلام طلبك'

  return (
    <div className="flex flex-col gap-4">
      <Card className={cn(isCancelled ? 'border-destructive/40' : 'border-success/40')}>
        <CardContent className="flex flex-col items-center gap-2 p-6 text-center">
          <span
            className={cn(
              'flex h-14 w-14 items-center justify-center rounded-full',
              isCancelled ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success',
            )}
          >
            <Icon name={isCancelled ? 'close' : 'check'} size={28} />
          </span>
          <h1 className="text-xl font-bold">{statusLabel}</h1>
          <p className="text-sm text-muted-foreground">
            {order.branchName} · طاولة {order.tableNumber}
          </p>
          <span className="mt-1 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            رقم الطلب: {order.orderNumber}
          </span>
        </CardContent>
      </Card>

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
