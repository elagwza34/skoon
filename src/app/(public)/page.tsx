import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

/**
 * Visitor landing page for https://skoon.awexen.com
 *
 * Design:
 *  - Purple background image fills the entire screen
 *  - Orange overlay on top of the background
 *  - Content centred on the page
 *  - External image links from Pixeles (بيكسيلز) for A/B testing
 *  - Cairo font (loaded via next/font in app/layout.tsx)
 *  - 8px rounded corners on cards and buttons
 */

// External icon images from Pixeles CDN (بيكسيلز)
const LOGO = 'https://skoon.awexen.com/images/logo.png'
const COFFEE_ICON = 'https://skoon.awexen.com/images/icons/coffee.png'
const DINING_ICON = 'https://skoon.awexen.com/images/icons/dining.png'
const TAKEAWAY_ICON = 'https://skoon.awexen.com/images/icons/takeaway.png'
const BACKGROUND = 'https://skoon.awexen.com/images/background.jpg'

// Pixeles (بيكسيلز) external image links for A/B testing
const PIXEL_IMAGES = [
  { id: 'pixel-1', src: 'https://picxes.com/images/original/coffee-1.jpg', alt: 'قهوة 1' },
  { id: 'pixel-2', src: 'https://picxes.com/images/original/coffee-2.jpg', alt: 'قهوة 2' },
  { id: 'pixel-3', src: 'https://picxes.com/images/original/coffee-3.jpg', alt: 'قهوة 3' },
  { id: 'pixel-4', src: 'https://picxes.com/images/original/coffee-4.jpg', alt: 'قهوة 4' },
  { id: 'pixel-5', src: 'https://picxes.com/images/original/coffee-5.jpg', alt: 'قهوة 5' },
  { id: 'pixel-6', src: 'https://picxes.com/images/original/coffee-6.jpg', alt: 'قهوة 6' },
]

export default function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-purple-900">
      {/* Background image with orange overlay — fills the entire screen */}
      <div className="fixed inset-0 z-0">
        <Image
          src={BACKGROUND}
          alt="Purple coffee background"
          fill
          priority
          className="object-fill"
        />
        <div className="absolute inset-0 bg-orange-500/35 mix-blend-multiply" />
      </div>

      {/* Centred content */}
      <div className="relative min-h-screen flex items-center justify-center px-4 py-12 z-10">
        <div className="max-w-4xl mx-auto text-white text-center">
          {/* Logo */}
          <Link href="/" className="flex justify-center mb-8">
            <Image
              src={LOGO}
              alt="سكون"
              width={120}
              height={120}
              className="rounded-8xl"
            />
          </Link>

          {/* Title */}
          <h1 className="text-3xl font-bold mb-2">سكون</h1>
          <p className="text-lg text-orange-300 mb-8">القهوة، نكهة الحماس</p>

          {/* Image links from Pixeles (بيكسيلز) for A/B testing */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-12">
            {PIXEL_IMAGES.map((img) => (
              <div key={img.id} className="group cursor-pointer">
                <Link href={img.src} target="_blank" rel="noopener noreferrer">
                  <div className="relative rounded-8xl overflow-hidden border border-white/30 bg-white/10 hover:bg-white/20 transition-colors">
                    <Image
                      src={img.src}
                      alt={img.alt}
                      width={300}
                      height={200}
                      className="w-full h-32 object-cover group-hover:scale-105 transition-transform"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-2 text-xs text-white/90">
                      صورة من Pixeles (بيكسيلز)
                    </div>
                  </div>
                </Link>
              </div>
            ))}
          </div>

          {/* Feature cards (8px rounded corners) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            <Card className="p-6 text-center bg-white/10 backdrop-blur border-white/20">
              <Image
                src={COFFEE_ICON}
                alt="قهوة طازجة"
                width={64}
                height={64}
                className="mx-auto mb-4 rounded-8xl"
              />
              <h3 className="text-lg font-semibold mb-2">قهوة طازجة</h3>
              <p className="text-sm text-gray-300">أفضل قهوة في المدينة. مُحضّرة بشكل يدري.</p>
            </Card>

            <Card className="p-6 text-center bg-white/10 backdrop-blur border-white/20">
              <Image
                src={DINING_ICON}
                alt="أوضاع طعام"
                width={64}
                height={64}
                className="mx-auto mb-4 rounded-8xl"
              />
              <h3 className="text-lg font-semibold mb-2">أوضاع طعام</h3>
              <p className="text-sm text-gray-300">قريبة منك بكل سهولة. الطلب في دقيقة.</p>
            </Card>

            <Card className="p-6 text-center bg-white/10 backdrop-blur border-white/20">
              <Image
                src={TAKEAWAY_ICON}
                alt="Takeaway"
                width={64}
                height={64}
                className="mx-auto mb-4 rounded-8xl"
              />
              <h3 className="text-lg font-semibold mb-2">Takeaway</h3>
              <p className="text-sm text-gray-300">خذ طبقك المُحضّر معك وأسرّه.</p>
            </Card>
          </div>

          {/* CTA */}
          <Link href="/order-type">
            <Button size="lg" className="rounded-8xl px-8 py-6 text-lg bg-white text-purple-900 hover:bg-orange-400 hover:text-purple-900">
              ابدأ طلبك الآن
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}