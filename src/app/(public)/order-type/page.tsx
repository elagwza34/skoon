import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { PublicBackdrop } from '@/components/public/public-backdrop'

/**
 * Step 1 â€” lets the guest pick how they want to order.
 * Shows both options: dine-in (open â†’ table picker) and takeaway
 * (visible but disabled for now â€” wires up once the takeaway backend lands).
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
            <h1 className="text-xl font-bold drop-shadow-lg">Ø§Ø®ØªØ§Ø± Ø·Ø±ÙŠÙ‚Ø© Ø§Ù„Ø·Ù„Ø¨</h1>
            <p className="text-sm text-white/70">Ù‚Ø§Ø¹Ø¯ ÙÙŠ Ø§Ù„ÙƒØ§ÙÙŠÙ‡ ÙˆÙ„Ø§ Ù‡ØªØ§Ø®Ø¯ Ø·Ù„Ø¨Ùƒ Ù…Ø¹Ø§ÙƒØŸ</p>
          </div>

          {/* Dine-in â€” the live flow. */}
          <Link href="/select-table">
            <Button
              size="lg"
              className="w-full rounded-lg bg-white text-purple-900 shadow-lg hover:bg-orange-400 hover:text-purple-900"
            >
              <Icon name="utensils" size={18} />
              Ø¯Ø§Ø®Ù„ Ø§Ù„ÙƒØ§ÙÙŠÙ‡
            </Button>
          </Link>

          {/* Takeaway â€” present but unavailable until the backend lands. */}
          <Button
            size="lg"
            disabled
            aria-disabled="true"
            title="Ù…ØªØ§Ø­ Ù‚Ø±ÙŠØ¨Ø§Ù‹"
            className="w-full rounded-lg border border-white/30 bg-white/10 text-white/50"
          >
            <Icon name="pos" size={18} />
            ØªÙŠÙƒ Ø£ÙˆØ§ÙŠ â€” Ù‚Ø±ÙŠØ¨Ø§Ù‹
          </Button>

          <Link href="/">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-white/80 hover:bg-white/10 hover:text-white"
            >
              Ø±Ø¬ÙˆØ¹
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}


