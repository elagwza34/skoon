'use client'

import { useState, type ReactNode } from 'react'
import { Segmented } from '@/components/ui/segmented'

/** Owner-only presentation grouping; product data and writers remain unchanged. */
export function OwnerProductsTabs({ products, configuration }: { products: ReactNode; configuration: ReactNode }) {
  const [tab, setTab] = useState<'products' | 'configuration'>('products')
  return <section dir="rtl" className="space-y-4">
    <Segmented value={tab} onChange={setTab} ariaLabel="أقسام المنتجات والقائمة" options={[
      { value: 'products', label: 'المنتجات' },
      { value: 'configuration', label: 'خصائص المنتجات والمتغيرات' },
    ]} />
    {tab === 'products' ? products : configuration}
  </section>
}
