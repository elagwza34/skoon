'use client'

import { useState, type ReactNode } from 'react'
import { Segmented } from '@/components/ui/segmented'

/** Owner-only presentation grouping; product data and writers remain unchanged. */
export function OwnerProductsTabs({ products, configuration, modifiers }: { products: ReactNode; configuration: ReactNode; modifiers: ReactNode }) {
  const [tab, setTab] = useState<'products' | 'configuration' | 'modifiers'>('products')
  return <section dir="rtl" className="space-y-4">
    <Segmented value={tab} onChange={setTab} ariaLabel="أقسام المنتجات والقائمة" options={[
      { value: 'products', label: 'المنتجات' },
      { value: 'configuration', label: 'خصائص المنتجات والمتغيرات' },
      { value: 'modifiers', label: 'مجموعات الإضافات' },
    ]} />
    {tab === 'products' ? products : tab === 'configuration' ? configuration : modifiers}
  </section>
}
