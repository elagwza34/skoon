'use client'

import { useState } from 'react'
import { toDataURL } from 'qrcode'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

/** Prints one existing table token without exposing QR administration UI. */
export function TableQrPrintButton({ tableNumber, publicToken }: { tableNumber: string; publicToken: string }) {
  const [busy, setBusy] = useState(false)
  async function print() {
    if (busy) return
    setBusy(true)
    try {
      const url = `${window.location.origin}/menu/${encodeURIComponent(publicToken)}`
      const qr = await toDataURL(url, { width: 400, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#1a1a1a', light: '#ffffff' } })
      const popup = window.open('', '_blank', 'noopener,noreferrer,width=480,height=640')
      if (!popup) throw new Error('تعذر فتح نافذة الطباعة')
      popup.document.write(`<!doctype html><html dir="rtl"><head><title>QR طاولة ${tableNumber}</title><style>body{font-family:Arial,sans-serif;text-align:center;padding:20px}img{width:280px;height:280px}p{word-break:break-all;font-size:11px}@media print{body{padding:0}}</style></head><body><h1>طاولة ${tableNumber}</h1><img src="${qr}" alt="QR طاولة ${tableNumber}"/><p>${url}</p><script>window.onload=()=>{window.print();window.close()}</script></body></html>`)
      popup.document.close()
    } finally { setBusy(false) }
  }
  return <Button size="sm" variant="outline" className="w-full" disabled={busy} onClick={() => void print()}><Icon name="orders" size={14} />{busy ? 'جارٍ إنشاء الرمز…' : 'طباعة QR'}</Button>
}
