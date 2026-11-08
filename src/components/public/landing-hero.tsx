'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { useEffect } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/all'

gsap.registerPlugin(ScrollTrigger)

interface LandingHeroProps {
  bgImage?: string
}

export function LandingHero({ bgImage }: LandingHeroProps) {
  useEffect(() => {
    const tl = gsap.timeline({ scrollTrigger: { trigger: '.hero-section', start: 'top 80%' } })
    tl.from('.hero-bg', { opacity: 0, duration: 1.5, ease: 'power2.out' })
      .from('.hero-accent', { opacity: 0, y: 40, duration: 1, ease: 'power2.out' }, '-=1')
      .from('.hero-badge', { opacity: 0, y: 30, duration: 0.8, ease: 'back.out(1.7)' }, '-=0.8')
      .from('.hero-title', { opacity: 0, y: 50, duration: 1, ease: 'power3.out' }, '-=0.6')
      .from('.hero-subtitle', { opacity: 0, y: 30, duration: 0.8, ease: 'power2.out' }, '-=0.5')
      .from('.hero-cta', { opacity: 0, y: 30, duration: 0.8, ease: 'power2.out', stagger: 0.2 }, '-=0.4')
  }, [])

  return (
    <section className="hero-section relative w-full min-h-[70dvh] flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 z-0">
        {bgImage ? (
          <Image
            src={bgImage}
            alt=""
            fill
            sizes="100vw"
            className="object-cover"
            priority
            loading="eager"
          />
        ) : (
          <div className="inset-0 bg-gradient-to-br from-cafe-espresso via-cafe-mocha/80 to-cafe-espresso" />
        )}
      </div>

      <div className="absolute inset-0 z-10 bg-[radial-gradient(circle_at_50%_30%,_rgba(201,155,104,0.15)_0%,_transparent_60%)]" />
      <div className="absolute inset-0 z-10 bg-[linear-gradient(135deg,_rgba(0,0,0,0.35)_0%,_rgba(0,0,0,0.1)_60%,_rgba(0,0,0,0.35)_100%)]" />

      <div className="hero-accent absolute -top-24 -right-24 w-72 h-72 rounded-full bg-cafe-caramel/20 blur-3xl z-10" />
      <div className="hero-accent absolute -bottom-24 -left-24 w-96 h-96 rounded-full bg-cafe-caramel/10 blur-4xl z-10" />

      <div className="relative z-20 mx-auto flex max-w-[1140px] flex-col items-center text-center px-6 sm:px-8 lg:px-12 w-full">
        <div className="hero-badge inline-flex items-center gap-2 rounded-full bg-cafe-caramel/10 px-4 py-1.5 text-xs font-semibold text-cafe-caramel border border-cafe-caramel/30 mb-8">
          <span className="relative flex h-2 w-2">
            <span className="absolute inset-0 rounded-full bg-cafe-caramel animate-pulse" />
          </span>
          متاح الطلب عبر رمز QR
        </div>

        <h1 className="hero-title max-w-2xl text-4xl md:text-6xl font-extrabold text-cafe-cream tracking-tight leading-tight sm:leading-none">
          قهوتك، لحظة الصفاء<span className="text-cafe-caramel">.</span>
        </h1>

        <p className="hero-subtitle mt-6 max-w-xl text-lg text-cafe-cream/90 leading-relaxed">
          café سكون — تجربة قهوة مميزة في جو هادئ. اطلب من طاولتك عبر رمز QR
          واستلم طلبك مباشرة عند باب المطبخ.
        </p>

        <div className="hero-cta mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Link href="/order-type">
            <Button size="lg" className="w-full sm:w-auto bg-cafe-caramel text-cafe-espresso hover:bg-cafe-caramel/90 shadow-lg shadow-cafe-caramel/25">
              <Icon name="utensils" size={18} className="mr-2" />
              ابدأ طلبك الآن
            </Button>
          </Link>
          <Link href="/menu">
            <Button size="lg" variant="outline" className="w-full sm:w-auto border-cafe-caramel/50 text-cafe-cream hover:bg-cafe-caramel/10 hover:text-cafe-caramel">
              استعرض القائمة
            </Button>
          </Link>
        </div>
      </div>
    </section>
  )
}
