'use client'

import type { ReactNode } from 'react'

/** Owner products: variants, modifiers, and attributes are managed inside product add/edit. */
export function OwnerProductsTabs({ products }: { products: ReactNode }) {
  return <section dir="rtl" className="space-y-4">{products}</section>
}

