'use client'

import Link from 'next/link'
import Image from 'next/image'
import { formatCurrency } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/utils'
import { useEffect } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/all'

gsap.registerPlugin(ScrollTrigger)

interface FeaturedProduct {
  id: string
  name: string
  description: string | null
  price: string
  imagePath: string | null
}

interface FeaturedProductsProps {
  products: FeaturedProduct[]
  bgColor?: string
}

export function FeaturedProducts({ products, bgColor = 'bg-cafe-cream/50' }: FeaturedProductsProps) {
  useEffect(() => {
    gsap.from('.featured-card', {
      scrollTrigger: { trigger: '.featured-section', start: 'top 85%' },
      opacity: 0,
      y: 60,
      duration: 0.8,
      ease: 'power2.out',
      stagger: 0.15,
    })
  }, [])

  if (!products || products.length === 0) return null

  return (
    <section className={`featured-section py-20 ${bgColor}`}>
      <div className="mx-auto max-w-[1140px]">
        <div className="flex items-center justify-between mb-12">
          <div>
            <h2 className="text-3xl font-bold text-cafe-espresso tracking-tight">الأكثر طلباً</h2>
            <p className="mt-2 text-sm text-cafe-mocha/70">اختيارات ضيوفنا المفضلة</p>
          </div>
          <Link
            href="/order-type"
            className="text-sm font-semibold text-cafe-caramel hover:text-cafe-caramel/90 transition-colors"
          >
            عرض الكل <Icon name="chevronRight" size={16} className="ml-1" />
          </Link>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {products.map((product) => {
            const price = Number(product.price)
            const hasImage = Boolean(product.imagePath)

            return (
              <Link
                key={product.id}
                href="/order-type"
                className={cn(
                  'featured-card group flex flex-col rounded-xl border border-cafe-mocha/20 bg-white/80 p-5 transition-all hover:border-cafe-caramel/50 hover:shadow-lg hover:shadow-cafe-caramel/15',
                  hasImage ? 'pb-1' : 'text-center'
                )}
              >
                <div className="relative h-48 mb-4 rounded-lg overflow-hidden bg-cafe-mocha/20 flex items-center justify-center">
                  {hasImage ? (
                    <Image
                      src={product.imagePath!}
                      alt={product.name}
                      fill
                      sizes="(max-width: 768px) 50vw, 25vw"
                      className="object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Icon name="utensils" size={32} className="text-cafe-caramel/40 group-hover:text-cafe-caramel transition-colors" />
                    </div>
                  )}
                  <span className="absolute top-2 left-2 rounded-md bg-cafe-caramel px-2 py-0.5 text-[10px] font-bold text-cafe-espresso">
                    متاح
                  </span>
                </div>

                <h3 className="font-semibold text-cafe-espresso leading-tight group-hover:text-cafe-caramel transition-colors">
                  {product.name}
                </h3>
                {product.description ? (
                  <p className="mt-1 line-clamp-2 text-sm text-cafe-mocha/60">{product.description}</p>
                ) : null}
                <div className="mt-auto flex items-baseline gap-1">
                  <span className="font-bold text-lg text-cafe-espresso">{formatCurrency(price)}</span>
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </section>
  )
}
