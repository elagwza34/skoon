import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

/** Public landing — doubles as the QR fallback for hand-typed visits. */
export default function LandingPage() {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-4xl text-primary-foreground">
            ☕
          </span>
          <h1 className="text-2xl font-bold">أهلاً بيك في سكون</h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            اطلب من طاولتك مباشرة — اختار نوع الطلب وبعدين الطاولة، والمنيو هيتفتح لك على طول.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Link href="/order-type?type=dine_in">
          <Card className="transition-colors hover:border-primary/50">
            <CardContent className="flex flex-col items-center gap-2 p-5 text-center">
              <span className="text-3xl">🪑</span>
              <span className="font-semibold">داخل الكافيه</span>
              <span className="text-xs text-muted-foreground">اختار طاولتك واطلب</span>
            </CardContent>
          </Card>
        </Link>
        <Link href="/order-type?type=takeaway">
          <Card className="transition-colors hover:border-primary/50">
            <CardContent className="flex flex-col items-center gap-2 p-5 text-center">
              <span className="text-3xl">🥡</span>
              <span className="font-semibold">تيك أواي</span>
              <span className="text-xs text-muted-foreground">اطلب واستلم طلبك</span>
            </CardContent>
          </Card>
        </Link>
      </div>

      <Card className="border-dashed">
        <CardContent className="flex flex-col gap-2 p-4 text-sm">
          <span className="font-semibold">قاعد على طاولة؟</span>
          <span className="text-muted-foreground">
            امسح رمز الـ QR الموجود على الطاولة بكاميرا الموبايل — هيفتح لك المنيو مربوط بطاولتك تلقائياً.
          </span>
          <Link href="/select-table">
            <Button variant="outline" size="sm" className="mt-1 w-full">
              أو اختار طاولتك يدوياً
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
