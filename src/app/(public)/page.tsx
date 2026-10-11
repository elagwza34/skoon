import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

/**
 * Visitor landing page for https://skoon.awexen.com
 *
 * Design:
 *  - Purple background image with orange overlay
 *  - Content centred on the page
 *  - External icon images (rotated for design A/B)
 *  - Cairo font (loaded via next/font in app/layout.tsx)
 *  - 8px rounded corners on cards and buttons
 */

// External icon images (coming from the CDN — rotate for A/B testing)
const LOGO = 'https://skoon.awexen.com/images/logo.png'
const COFFEE_ICON = 'https://skoon.awexen.com/images/icons/coffee.png'
const DINING_ICON = 'https://skoon.awexen.com/images/icons/dining.png'
const TAKEAWAY_ICON = 'https://skoon.awexen.com/images/icons/takeaway.png'
const BACKGROUND = 'https://skoon.awexen.com/images/background.jpg'

export default function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-purple-900">
      {/* Background image with orange overlay */}
      <div className="absolute inset-0">
        <Image
          src={BACKGROUND}
          alt="Purple coffee background"
          fill
          priority
          className="object-cover"
        />
        <div className="absolute inset-0 bg-orange-500/35 mix-blend-multiply" />
      </div>

      {/* Centred content */}
      <div className="relative min-h-screen flex items-center justify-center px-4 py-12">
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