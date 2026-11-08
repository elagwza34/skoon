'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Icon } from '@/components/ui/icon'
import { Button } from '@/components/ui/button'

const NAV_LINKS = [
  { href: '/', label: 'الرئيسية' },
  { href: '/order-type', label: 'القائمة' },
  { href: '/', label: 'عن سكون' },
  { href: '/', label: 'اتصل بنا' },
]

export function LandingNav() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const bg = scrolled
    ? 'bg-cafe-espresso/95 backdrop-blur-md border-b border-cafe-mocha/30'
    : 'bg-transparent'

  return (
    <nav className={`fixed top-0 z-40 w-full ${bg} transition-colors duration-300`} aria-label="الرئيسية">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2">
          <ImageLogo />
          <span className="font-bold text-xl tracking-tight text-cafe-cream">SKOON</span>
        </div>

        <div className="hidden md:flex items-center gap-6 text-sm font-medium">
          {NAV_LINKS.map((link, index) => (
            <Link
              key={index}
              href={link.href}
              className="text-cafe-cream/80 hover:text-cafe-caramel transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Link href="/order-type">
            <Button size="sm" className="bg-cafe-caramel text-cafe-espresso hover:bg-cafe-caramel/90">
              ابدأ طلبك
            </Button>
          </Link>
          <Button
            size="sm"
            variant="ghost"
            className="text-cafe-cream md:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="فتح القائمة"
          >
            <Icon name="menu" size={20} />
          </Button>
        </div>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 bg-cafe-espresso/98 backdrop-blur-lg" aria-hidden="true">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="absolute top-0 right-0 w-full sm:w-96 bg-cafe-espresso p-6 shadow-2xl transform transition-transform duration-300 translate-x-full sm:translate-x-0">
            <div className="flex items-center justify-between mb-8">
              <span className="font-bold text-xl text-cafe-cream">SKOON</span>
              <Button size="sm" variant="ghost" onClick={() => setMobileOpen(false)} className="text-cafe-cream">
                <Icon name="close" size={20} />
              </Button>
            </div>
            <div className="flex flex-col gap-4">
              {NAV_LINKS.map((link, index) => (
                <Link
                  key={index}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="block py-3 text-sm font-medium text-cafe-cream/80 hover:text-cafe-caramel transition-colors"
                >
                  {link.label}
                </Link>
              ))}
              <Link
                href="/order-type"
                onClick={() => setMobileOpen(false)}
                className="mt-6 block py-4 text-center font-semibold text-cafe-espresso bg-cafe-caramel rounded-xl hover:bg-cafe-caramel/90 transition-colors"
              >
                ابدأ طلبك
              </Link>
            </div>
          </div>
        </div>
      )}
    </nav>
  )
}

function ImageLogo() {
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cafe-mocha">
      <Icon name="utensils" size={18} className="text-cafe-caramel" />
    </div>
  )
}
