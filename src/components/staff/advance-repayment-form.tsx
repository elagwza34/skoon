'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function AdvanceRepaymentForm({ advanceId, outstanding, onSaved, onCancel }: { advanceId: string; outstanding: string; onSaved: () => Promise<void>; onCancel: () => void }) {
  const [amount, setAmount] = useState('')
  const [receiptReference, setReceiptReference] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const identity = useRef({ fingerprint: '', key: '' })
  async function repay() {
    const fingerprint = JSON.stringify({ advanceId, amount, receiptReference })
    if (identity.current.fingerprint !== fingerprint) identity.current = { fingerprint, key: crypto.randomUUID() }
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/staff/hr/financials', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'repay_advance', advanceId, amount, receiptReference, idempotencyKey: identity.current.key }) })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error ?? 'تعذر تسجيل السداد')
      await onSaved(); onCancel()
    } catch (error) { setError(error instanceof Error ? error.message : 'تعذر تسجيل السداد') }
    finally { setBusy(false) }
  }
  return <fieldset className="space-y-3 rounded-lg border p-3" disabled={busy}>
    <legend className="px-1 text-sm font-medium">سداد سلفة — المتبقي {outstanding} ج.م</legend>
    <p className="text-xs text-muted-foreground">سجّل مبلغاً تم استرداده فعلياً مع مرجع الإيصال. لا ينشئ هذا الإجراء حركة في درج الكاشير.</p>
    <label className="block text-sm">المبلغ المسترد<Input value={amount} onChange={event => setAmount(event.target.value)} inputMode="decimal" /></label>
    <label className="block text-sm">مرجع إيصال السداد<Input value={receiptReference} onChange={event => setReceiptReference(event.target.value)} /></label>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    <div className="flex gap-2"><Button onClick={repay} disabled={busy || Number(amount) <= 0 || !Number.isFinite(Number(amount)) || Number(amount) > Number(outstanding) || receiptReference.trim().length < 3}>تسجيل سداد موثق</Button><Button variant="outline" onClick={onCancel}>إلغاء</Button></div>
  </fieldset>
}
