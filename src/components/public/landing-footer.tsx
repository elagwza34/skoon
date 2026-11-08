'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/all'

gsap.registerPlugin(ScrollTrigger)

const FOOTER_LINKS = [
  { label: 'القائمة', href: '/order-type' },
  { label: 'الطلب عبر QR', href: '/order-type' },
  { label: 'عن سكون', href: '/' },
  { label: 'اتصل بنا', href: '/' },
]

interface LandingFooterProps {
  bgColor?: string
}

export function LandingFooter({ bgColor = 'bg-cafe-espresso' }: LandingFooterProps) {
  useEffect(() => {
    gsap.from('.footer-content', {
      scrollTrigger: { trigger: '.footer-section', start: 'top 90%' },
      opacity: 0,
      y: 30,
      duration: 0.8,
      ease: 'power2.out',
    })
  }, [])

  return (
    <footer className={`footer-section border-t border-cafe-mocha/30 ${bgColor}`}>
      <div className="footer-content mx-auto max-w-[1140px] px-6 sm:px-8 lg:px-12">
        <div className="flex flex-col lg:flex-row gap-12 items-start lg:items-center justify-between py-12">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cafe-mocha">
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 8l-9-5-9 5 9 5 9-5z" />
                <path d="M3 8v8l9 5 9-5V8" />
                <path d="M12 13v8" />
              </svg>
            </div>
            <span className="font-bold text-xl text-cafe-cream">SKOON</span>
          </div>

          <div className="flex flex-wrap gap-8 text-sm">
            {FOOTER_LINKS.map((link, index) => (
              <Link
                key={index}
                href={link.href}
                className="text-cafe-cream/70 hover:text-cafe-caramel transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-4 text-sm">
            <span className="text-cafe-cream/60">جميع الحقوق محفوظة لـ سكون</span>
            <span className="text-cafe-cream/40">·</span>
            <span className="text-cafe-cream/60">طلب عبر رمز QR</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
