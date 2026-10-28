import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { PublicBackdrop } from '@/components/public/public-backdrop'

/**
 * Step 1 — lets the guest pick how they want to order.
 * Shows both options: dine-in (open → table picker) and takeaway
 * (visible but disabled for now — wires up once the takeaway backend lands).
 * Shares the landing page's full-screen brand backdrop (PublicBackdrop) with
 * the content centred on top of it. Text is forced light because it sits over
 * the dark photo overlay.
 */
export default function OrderTypePage() {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden">
      <PublicBackdrop />
      <div className="relative z-10 w-full max-w-sm px-4">
        <div className="flex flex-col gap-4 text-center text-white">
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-bold drop-shadow-lg">اختار طريقة الطلب</h1>
            <p className="text-sm text-white/70">قاعد في الكافيه ولا هتاخد طلبك معاك؟</p>
          </div>

          {/* Dine-in — the live flow. */}
          <Link href="/select-table">
            <Button
              size="lg"
              className="w-full rounded-lg bg-white text-purple-900 shadow-lg hover:bg-orange-400 hover:text-purple-900"
            >
              <Icon name="utensils" size={18} />
              داخل الكافيه
            </Button>
          </Link>

          {/* Takeaway — present but unavailable until the backend lands. */}
          <Button
            size="lg"
            disabled
            aria-disabled="true"
            title="متاح قريباً"
            className="w-full rounded-lg border border-white/30 bg-white/10 text-white/50"
          >
            <Icon name="pos" size={18} />
            تيك أواي — قريباً
          </Button>

          <Link href="/">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-white/80 hover:bg-white/10 hover:text-white"
            >
              رجوع
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
