import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'

/**
 * Visitor landing page for https://skoon.awexen.com
 *
 * Design:
 *  - Purple background image covers the entire screen
 *  - Orange overlay on top of the background
 *  - Content centred on the page
 *  - External image links from Pexels (www.pexels.com) for A/B testing
 *  - Cairo font (loaded via next/font in app/layout.tsx)
 *  - 8px rounded corners on cards and buttons
 */

/*
 * All imagery is served from the Pexels CDN (images.pexels.com), which is
 * allow-listed under `images.remotePatterns` in next.config.ts. Without that
 * allow-list next/image refuses to optimise the URL and the browser renders a
 * broken image — so any new host must be added there too.
 *
 * `w=` caps the source width so Next only ever optimises what it needs.
 */
const pexels = (id: string, w = 600) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${w}`

const photoPage = (id: string) => `https://www.pexels.com/photo/${id}/`

/** Background — a coffee/latte shot wide enough to cover a full desktop viewport. */
const BACKGROUND = pexels('302899', 1920)

/** Pexels external image links (A/B testing picker). */
const PIXEL_IMAGES = [
  { id: '312418', alt: 'قهوة مُحضّرة يدويًا' },
  { id: '851555', alt: 'لاتيه بالفن' },
  { id: '374890', alt: 'حبوب قهوة طازجة' },
  { id: '324028', alt: 'كوب قهوة دافئ' },
  { id: '3738679', alt: 'ركن القهوة' },
  { id: '2061820', alt: 'تحضير الإسبريسو' },
].map((img) => ({ ...img, src: pexels(img.id), href: photoPage(img.id) }))

export default function LandingPage() {
  return (
    <div className="relative h-dvh overflow-hidden bg-purple-900">
      {/* Background image with orange overlay — covers the entire screen.
          `fill` + object-cover stretches the photo across the whole viewport at
          any aspect ratio; `fixed` keeps it put while the page scrolls. */}
      <div className="fixed inset-0 z-0 bg-purple-950">
        <Image
          src={BACKGROUND}
          alt="Purple coffee background"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-orange-500/60 mix-blend-multiply" />
        <div className="absolute inset-0 bg-black/90" />
      </div>

      {/* Centred content — locked to the viewport height so the landing screen
          never scrolls (h-dvh + overflow-hidden on the root). Spacing is kept
          tight so the logo, grid and CTA fit even on short phones. */}
      <div className="relative z-10 flex h-full items-center justify-center px-4">
        <div className="max-w-4xl mx-auto text-white text-center">
          {/* Logo + title */}
          <Image
            src="/logo.png"
            alt="شعار سكون"
            width={160}
            height={160}
            priority
            className="mx-auto mb-2 h-16 w-16 object-contain drop-shadow-lg md:mb-4 md:h-32 md:w-32"
          />
          <h1 className="text-3xl md:text-5xl font-bold mb-1 md:mb-2 drop-shadow-lg">SOKOON</h1>
          <p className="text-sm md:text-lg text-orange-300 mb-4 md:mb-8 drop-shadow">  المكان اللي تحبة</p>

          {/* External Pexels image links for A/B testing */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-4 mb-4 md:mb-12">
            {PIXEL_IMAGES.map((img) => (
              <div key={img.id} className="group">
                <Link
                  href={img.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block"
                >
                  <div className="relative rounded-lg overflow-hidden border border-white/30 bg-white/10 shadow-md transition-transform group-hover:scale-105">
                    <Image
                      src={img.src}
                      alt={img.alt}
                      width={300}
                      height={200}
                      className="w-full h-20 md:h-32 object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                    <div className="absolute bottom-0 inset-x-0 p-2 text-xs text-white/90">
                      {img.alt}
                    </div>
                  </div>
                </Link>
              </div>
            ))}
          </div>

          {/* CTA */}
          <Link href="/order-type" className="block">
            <Button size="lg" className="w-full md:w-auto rounded-lg px-6 py-4 text-base md:px-8 md:py-6 md:text-lg bg-white text-purple-900 hover:bg-orange-400 hover:text-purple-900 shadow-lg">
              ابدأ طلبك الآن
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}