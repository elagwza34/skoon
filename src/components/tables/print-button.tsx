'use client'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

/**
 * Client-only print trigger (window.print is a browser API). Hidden on print
 * so the button never appears on the physical sheet.
 */
export function PrintButton() {
  return (
    <Button size="sm" variant="outline" onClick={() => window.print()} className="print:hidden">
      <Icon name="orders" size={16} />
      طباعة
    </Button>
  )
}
