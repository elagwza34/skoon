'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

/**
 * Copies the self-contained tracking URL (`/order/[id]?n=<orderNumber>`) to the
 * clipboard. Lets the customer bookmark the order or open it on another device
 * after leaving the site. Shows "copied" feedback; falls back gracefully when
 * the Clipboard API is unavailable (e.g. insecure context).
 */
export function CopyOrderLinkButton({ id, orderNumber }: { id: string; orderNumber: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    const url = `${window.location.origin}/order/${encodeURIComponent(id)}?n=${encodeURIComponent(orderNumber)}`
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      // Clipboard API unavailable â€” open a prompt so the user can copy manually.
      window.prompt('Ø§Ù†Ø³Ø® Ø±Ø§Ø¨Ø· Ø·Ù„Ø¨Ùƒ:', url)
      return
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={copy}
      className="w-full border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
    >
      <Icon name={copied ? 'check' : 'copy'} size={16} />
      {copied ? 'Ø§ØªÙ†Ø³Ø®!' : 'Ø§Ù†Ø³Ø® Ø±Ø§Ø¨Ø· Ø§Ù„Ø·Ù„Ø¨'}
    </Button>
  )
}


