import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { PublicBackdrop } from '@/components/public/public-backdrop'
import { ResumeOrderButton } from '@/components/order/resume-order-button'

/**
 * Visitor landing page for https://skoon.awexen.com
 *
 * Design:
 *  - Full-screen brand backdrop (photo + orange/dark overlay) via PublicBackdrop
 *  - Content centred on the page, locked to the viewport (no scroll)
 *  - Cairo font (loaded via next/font in app/layout.tsx)
 *  - The 6 Pexels image links in the middle have been removed
 *  - Main CTA button is disabled (not clickable)
 */

export default function LandingPage() {
  return (
    <div
      className="relative h-dvh overflow-hidden bg-purple-900 select-none"
      style={{ touchAction: 'none' }}
    >
      {/* Full-screen brand backdrop (photo + orange/dark overlay) */}
      <PublicBackdrop />

      {/* Centred content â€” locked to the viewport height so the landing screen
          never scrolls on any screen size. */}
      <div className="relative z-10 flex h-full items-center justify-center px-4">
        <div className="max-w-4xl mx-auto text-white text-center">
          {/* Logo + title */}
          <Image
            src="/logo.png"
            alt="Ø´Ø¹Ø§Ø± Ø³ÙƒÙˆÙ†"
            width={160}
            height={160}
            priority
            className="mx-auto mb-2 h-16 w-16 object-contain drop-shadow-lg md:mb-4 md:h-32 md:w-32"
          />
          <h1 className="text-3xl md:text-5xl font-bold mb-1 md:mb-2 drop-shadow-lg">SOKOON</h1>

          {/* Note: QR coming soon */}
          <p className="text-sm md:text-base text-orange-400 mb-6 md:mb-8 drop-shadow italic px-4 md:px-0 leading-relaxed">
            Ø§Ù„Ø·Ù„Ø¨ Ù…Ù† Ø®Ù„Ø§Ù„ Ø§Ù„ QR Ø³ÙŠÙƒÙˆÙ† Ù…ØªØ§Ø­ Ù‚Ø±ÙŠØ¨Ø§Ù‹
          </p>

          {/* CTA â€” disabled (not clickable) */}
          <Button
            size="lg"
            disabled
            className="w-full md:w-auto rounded-lg px-6 py-4 text-base md:px-8 md:py-6 md:text-lg bg-white/30 text-white/50 cursor-not-allowed"
          >
            Ø§Ø¨Ø¯Ø£ Ø·Ù„Ø¨Ùƒ Ø§Ù„Ø¢Ù†
          </Button>

          {/* Shown only when this browser has a saved order ref. */}
          <div className="mt-3">
            <ResumeOrderButton />
          </div>
        </div>
      </div>
    </div>
  )
}

