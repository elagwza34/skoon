'use client'

import Link from 'next/link'
import { Icon } from '@/components/ui/icon'
import { useEffect } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/all'

gsap.registerPlugin(ScrollTrigger)

interface Category {
  id: string
  name: string
}

interface CategoriesSectionProps {
  categories: Category[]
  bgColor?: string
}

export function CategoriesSection({ categories, bgColor = 'bg-cafe-espresso' }: CategoriesSectionProps) {
  useEffect(() => {
    gsap.from('.category-card', {
      scrollTrigger: { trigger: '.categories-section', start: 'top 85%' },
      opacity: 0,
      y: 50,
      duration: 0.8,
      ease: 'power2.out',
      stagger: 0.15,
    })
  }, [])

  if (!categories || categories.length === 0) return null

  const categoryIcons: Record<string, string> = {
    coffee: 'coffee',
    drinks: 'cup',
    pastries: 'croissant',
    sandwiches: 'sandwich',
    desserts: 'cake',
    cold: 'snowflake',
    hot: 'flame',
  }

  return (
    <section className={`categories-section py-20 ${bgColor}`}>
      <div className="mx-auto max-w-[1140px]">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-cafe-cream tracking-tight">تصنيفات المنيو</h2>
          <p className="mt-4 text-sm text-cafe-cream/60">استكشف تشكيلة سكون من المشروبات والمأكولات</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {categories.map((category) => (
            <Link
              key={category.id}
              href="/order-type"
              className="category-card group relative rounded-xl border border-cafe-mocha/30 bg-cafe-mocha/40 p-6 transition-all hover:border-cafe-caramel/50 hover:bg-cafe-mocha/60 hover:-translate-y-1"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-cafe-caramel/10 mb-4 group-hover:bg-cafe-caramel/20 transition-colors">
                <Icon name="utensils" size={20} className="text-cafe-caramel group-hover:text-cafe-espresso transition-colors" />
              </div>
              <h3 className="font-semibold text-cafe-cream group-hover:text-cafe-caramel transition-colors">
                {category.name}
              </h3>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
