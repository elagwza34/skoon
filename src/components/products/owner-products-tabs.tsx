'use client'

import type { ReactNode } from 'react'
import { Segmented } from '@/components/ui/segmented'
import { useState } from 'react'

/** Owner products: variants/attributes are managed inside product add/edit. */
export function OwnerProductsTabs({ products, configuration, modifiers }: { products: ReactNode; configuration?: ReactNode; modifiers: ReactNode }) {
  const [tab, setTab] = useState<'products' | 'modifiers'>('products')
  return <section dir="rtl" className="space-y-4">
    <Segmented value={tab} onChange={setTab} ariaLabel="أقسام المنتجات" options={[
      { value: 'products', label: 'المنتجات والمتغيرات' },
      { value: 'modifiers', label: 'مجموعات الإضافات' },
    ]} />
    {tab === 'products' ? products : modifiers}
    {/* configuration retained for compatibility but variants workflow moved into product form */}
    {configuration ? <div className="hidden">{configuration}</div> : null}
  </section>
}
