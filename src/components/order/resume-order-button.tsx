'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { getGuestOrders, type GuestOrderRef } from '@/lib/guest-orders'

/**
 * Shown on the landing page when this browser has a saved order ref.
 * Links straight back to the most recent tracking page. Reads localStorage
 * after mount (SSR renders nothing) so there is no hydration mismatch.
 */
export function ResumeOrderButton() {
  const [saved, setSaved] = useState<GuestOrderRef | null>(null)

  useEffect(() => {
    const [latest] = getGuestOrders()
    if (latest) setSaved(latest)
  }, [])

  if (!saved) return null

  return (
    <Link
      href={`/order/${encodeURIComponent(saved.id)}?n=${encodeURIComponent(saved.orderNumber)}`}
      className="block"
    >
      <Button
        size="lg"
        variant="outline"
        className="w-full md:w-auto rounded-lg border-white/40 bg-white/10 px-6 py-4 text-base text-white shadow-lg backdrop-blur hover:bg-white/20 hover:text-white md:px-8 md:py-6 md:text-lg"
      >
        <Icon name="clock" size={18} />
        ÙƒÙ…Ù‘Ù„ Ù…ØªØ§Ø¨Ø¹Ø© Ø·Ù„Ø¨Ùƒ ({saved.orderNumber})
      </Button>
    </Link>
  )
}


