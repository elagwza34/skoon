import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const TYPES = ['dine_in', 'takeaway'] as const
type OrderType = (typeof TYPES)[number]

/** Step 1 — confirm how the customer wants to order. */
export default async function OrderTypePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>
}) {
  const { type } = await searchParams
  if (type && !TYPES.includes(type as OrderType)) notFound()
  if (!type) redirect('/order-type?type=dine_in')

  const isDineIn = type === 'dine_in'
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold">{isDineIn ? 'الطلب داخل الكافيه' : 'طلب تيك أواي'}</h1>
        <p className="text-sm text-muted-foreground">
          {isDineIn
            ? 'اختار طاولتك عشان الطلب يوصل للمكان الصح.'
            : 'هنجهز طلبك للاستلام من الكاشير.'}
        </p>
      </div>
      <Link href={isDineIn ? '/tables' : '/menu'}>
        <Button size="lg" className="w-full">
          {isDineIn ? 'اختار الطاولة' : 'افتح المنيو'}
        </Button>
      </Link>
      <Link href="/">
        <Button variant="ghost" size="sm" className="w-full">
          رجوع
        </Button>
      </Link>
      {!isDineIn ? (
        <Card className="border-dashed">
          <CardContent className="p-4 text-sm text-muted-foreground">
            التيك أواي متاح قريباً — حالياً الطلب من داخل الكافيه فقط.
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
