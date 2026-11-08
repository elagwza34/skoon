'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { useEffect } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/all'

gsap.registerPlugin(ScrollTrigger)

interface MenuCtaProps {
  bgColor?: string
}

export function MenuCta({ bgColor = 'bg-cafe-espresso' }: MenuCtaProps) {
  useEffect(() => {
    gsap.from('.menu-cta-content', {
      scrollTrigger: { trigger: '.menu-cta-section', start: 'top 85%' },
      opacity: 0,
      y: 40,
      duration: 1,
      ease: 'power2.out',
    })
  }, [])

  return (
    <section className={`menu-cta-section py-20 ${bgColor}`}>
      <div className="mx-auto max-w-[1140px]">
        <div className="menu-cta-content rounded-2xl border border-cafe-caramel/30 bg-cafe-mocha/80 p-8 sm:p-12 text-center shadow-2xl shadow-cafe-caramel/10">
          <div className="inline-flex items-center gap-2 rounded-full bg-cafe-caramel/20 px-4 py-1.5 text-[11px] font-bold text-cafe-caramel border border-cafe-caramel/30 mb-8">
            <Icon name="utensils" size={12} />
            طلب عبر رمز QR
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-cafe-cream tracking-tight mb-6">اطلب من طاولتك</h2>
          <p className="text-lg text-cafe-cream/80 leading-relaxed mb-10 max-w-xl mx-auto">
            لا حاجة للانتظار. امسح رمز QR على طاولتك، اختر من المنيو، وأرسل طلبك
            مباشرة إلى المطبخ.
          </p>
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link href="/order-type">
              <Button size="lg" className="w-full sm:w-auto bg-cafe-caramel text-cafe-espresso hover:bg-cafe-caramel/90 shadow-lg shadow-cafe-caramel/30">
                <Icon name="utensils" size={18} className="mr-2" />
                ابدأ الطلب
              </Button>
            </Link>
            <Link href="/">
              <Button size="lg" variant="outline" className="w-full sm:w-auto border-cafe-caramel/50 text-cafe-cream hover:bg-cafe-caramel/10 hover:text-cafe-caramel">
                رجوع للرئيسية
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
