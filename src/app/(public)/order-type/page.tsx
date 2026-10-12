import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PublicBackdrop } from '@/components/public/public-backdrop'

const TYPES = ['dine_in', 'takeaway'] as const
type OrderType = (typeof TYPES)[number]

/**
 * Step 1 — confirm how the customer wants to order.
 * Shares the landing page's full-screen brand backdrop (PublicBackdrop) with
 * the content centred on top of it, so the whole guest flow feels continuous.
 * Text is forced light because it sits over the dark photo overlay.
 */
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
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden">
      <PublicBackdrop />
      <div className="relative z-10 w-full max-w-sm px-4">
        <div className="flex flex-col gap-4 text-center text-white">
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-bold drop-shadow-lg">
              {isDineIn ? 'الطلب داخل الكافيه' : 'طلب تيك أواي'}
            </h1>
            <p className="text-sm text-white/70">
              {isDineIn
                ? 'اختار طاولتك عشان الطلب يوصل للمكان الصح.'
                : 'هنجهز طلبك للاستلام من الكاشير.'}
            </p>
          </div>
          <Link href={isDineIn ? '/select-table' : '/menu'}>
            <Button
              size="lg"
              className="w-full rounded-lg bg-white text-purple-900 shadow-lg hover:bg-orange-400 hover:text-purple-900"
            >
              {isDineIn ? 'اختار الطاولة' : 'افتح المنيو'}
            </Button>
          </Link>
          <Link href="/">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-white/80 hover:bg-white/10 hover:text-white"
            >
              رجوع
            </Button>
          </Link>
          {!isDineIn ? (
            <Card className="border-dashed border-white/30 bg-white/10">
              <CardContent className="p-4 text-sm text-white/70">
                التيك أواي متاح قريباً — حالياً الطلب من داخل الكافيه فقط.
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  )
}
