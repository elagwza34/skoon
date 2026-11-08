import { prisma } from '@/lib/prisma'
import { formatCurrency } from '@/lib/format'
import { ResumeOrderButton } from '@/components/order/resume-order-button'
import { LandingHero } from '@/components/public/landing-hero'
import { FeaturedProducts } from '@/components/public/featured-products'
import { CategoriesSection } from '@/components/public/categories-section'
import { CafeIntro } from '@/components/public/cafe-intro'
import { MenuCta } from '@/components/public/menu-cta'
import { LandingFooter } from '@/components/public/landing-footer'

interface PublicProduct {
  id: string
  name: string
  description: string | null
  price: string
  imagePath: string | null
}

interface PublicCategory {
  id: string
  name: string
}

/**
 * Premium café landing page — Arabic-first, RTL.
 *
 * Public-facing only. Fetches real catalog data (products + categories) from
 * the database for the featured-products section. All ordering flows remain
 * on the existing verified routes: /order-type → /select-table → /menu/[token].
 *
 * No staff routes, APIs, middleware, or Prisma schema are touched.
 */
export default async function LandingPage() {
  // Fetch real, active, available products for the featured section.
  // Limit to 8 for the hero carousel-like grid.
  const [products, categories] = await Promise.all([
    prisma.product
      .findMany({
        where: { isActive: true, deletedAt: null, isAvailable: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        take: 8,
        select: {
          id: true,
          name: true,
          description: true,
          price: true,
          imagePath: true,
        },
      })
      .then((rows) =>
        rows.map((p) => ({
          id: p.id.toString(),
          name: p.name,
          description: p.description,
          price: p.price.toString(),
          imagePath: p.imagePath,
        })) as PublicProduct[],
      )
      .catch(() => [] as PublicProduct[]),
    prisma.category
      .findMany({
        where: { isActive: true, deletedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true },
      })
      .then((rows) => rows.map((c) => ({ id: c.id.toString(), name: c.name })) as PublicCategory[])
      .catch(() => [] as PublicCategory[]),
  ])

  // خلفية البطل — صورة من Pexels (مسموح بها في next.config.ts images.remotePatterns).
  // لتغييرها، عدل الرابط أسفل أو أضف NEXT_PUBLIC_HERO_BG_IMAGE في .env.local.
  const heroBgImage =
    process.env.NEXT_PUBLIC_HERO_BG_IMAGE ??
    'https://images.pexels.com/photos/302899/pexels-photo-302899.jpeg?auto=compress&cs=tinysrgb&w=1920';
  const cafeBgImage = process.env.NEXT_PUBLIC_CAFE_BG_IMAGE;

  return (
    <div className="relative min-h-dvh bg-white text-foreground" dir="rtl" lang="ar">
      <main>
        <LandingHero bgImage={heroBgImage} />
        <FeaturedProducts products={products} />
        <CategoriesSection categories={categories} />
        <CafeIntro bgImage={cafeBgImage} />
        <MenuCta />
      </main>

      <LandingFooter />

      <div className="mt-8 flex justify-center">
        <ResumeOrderButton />
      </div>
    </div>
  )
}
