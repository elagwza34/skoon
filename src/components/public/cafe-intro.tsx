'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { useEffect } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/all'

gsap.registerPlugin(ScrollTrigger)

interface CafeIntroProps {
  bgImage?: string
  bgColor?: string
}

export function CafeIntro({ bgImage, bgColor = 'bg-white/80' }: CafeIntroProps) {
  useEffect(() => {
    gsap.from('.cafe-intro-content', {
      scrollTrigger: { trigger: '.cafe-intro-section', start: 'top 85%' },
      opacity: 0,
      x: -50,
      duration: 1,
      ease: 'power2.out',
    })
    gsap.from('.cafe-intro-image', {
      scrollTrigger: { trigger: '.cafe-intro-section', start: 'top 85%' },
      opacity: 0,
      scale: 0.9,
      duration: 1,
      ease: 'power2.out',
    })
  }, [])

  return (
    <section className={`cafe-intro-section py-20 ${bgColor}`}>
      <div className="mx-auto max-w-[1140px]">
        <div className="grid gap-12 items-center lg:grid-cols-2">
          <div className="cafe-intro-image relative rounded-2xl overflow-hidden border border-cafe-mocha/20 shadow-lg">
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
              <div className="absolute inset-0 bg-cafe-cream" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-cafe-espresso/90 to-transparent" />
            <div className="relative z-10 h-full flex flex-col justify-between p-6 sm:p-8">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full bg-cafe-caramel/20 px-3 py-1 text-[11px] font-bold text-cafe-caramel border border-cafe-caramel/30">
                  <Icon name="sun" size={12} />
                  매일 مفتوح
                </span>
              </div>
              <div className="pt-4">
                <h2 className="text-3xl font-bold text-cafe-cream tracking-tight">أكثر من مجرد قهوة</h2>
                <p className="mt-4 text-lg text-cafe-cream/90 leading-relaxed">
                  في سكون، نؤمن أن القهوة ليست مجرد مشروب، بل لحظة pause من السرعة،
                  مساحة للتفكير، وبداية ليوم أفضل.
                </p>
              </div>
            </div>
          </div>

          <div className="cafe-intro-content flex flex-col gap-6">
            <div className="flex gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cafe-mocha/10">
                <Icon name="utensils" size={20} className="text-cafe-caramel" />
              </div>
              <div>
                <h3 className="font-bold text-cafe-espresso">منها محلياً</h3>
                <p className="text-sm text-cafe-mocha/70">حبوب قهوة مختارة بعناية، محروقة يومياً لتجربة غنية ومتسقة.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cafe-mocha/10">
                <Icon name="clock" size={20} className="text-cafe-caramel" />
              </div>
              <div>
                <h3 className="font-bold text-cafe-espresso">طلب طاولتك</h3>
                <p className="text-sm text-cafe-mocha/70">امسح رمز QR من طاولتك، اختر أصنافك، واستلم طلبك عند الكاونتر.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cafe-mocha/10">
                <Icon name="check" size={20} className="text-cafe-caramel" />
              </div>
              <div>
                <h3 className="font-bold text-cafe-espresso">جودة مضمونة</h3>
                <p className="text-sm text-cafe-mocha/70">كل صنف يُحضّر لحظة الطلب، لضمان الطعم والطازجة في كل مرة.</p>
              </div>
            </div>
            <Link
              href="/order-type"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-cafe-espresso px-8 py-4 text-base font-semibold text-cafe-cream hover:bg-cafe-mocha transition-colors"
            >
              استعرض القائمة <Icon name="chevronRight" size={18} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
