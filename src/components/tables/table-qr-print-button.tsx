'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

/** Navigates to individual table QR print page instead of opening a popup. */
export function TableQrPrintButton({ tableNumber, publicToken }: { tableNumber: string; publicToken: string }) {
  const router = useRouter()
  return (
    <Button
      size="sm"
      variant="outline"
      className="w-full"
      onClick={() => router.push(`/tables/print/${publicToken}`)}
    >
      <Icon name="orders" size={14} /> طباعة QR
    </Button>
  )
}
