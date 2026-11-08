'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { cashHandoverRequest } from '@/lib/cash-handover-request'
import { formatCurrency } from '@/lib/format'

type Handover = { id: string; fromShiftId: string; fromCashierId: string; fromCashierName: string | null; toCashierId: string | null; amount: number; status: string; countedAmount: string | null; difference: string | null; disputeReason: string | null }

export function CashHandoverPanel({ actorId, role, branchId }: { actorId: string; role: string; branchId: string | null }) {
  const [rows, setRows] = useState<Handover[]>([])
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  const enabled = ['cashier', 'manager', 'owner'].includes(role) && !!branchId
  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    setRows([])
    setError('')
    const statuses = role === 'cashier' ? ['PENDING', 'DISPUTED'] : ['DISPUTED']
    void Promise.all(statuses.map(async (status) => {
      // GET is a branch-scoped queue; POST below uses the actual source shift.
      const response = await fetch(`/api/staff/shifts/0/handover?branchId=${encodeURIComponent(branchId!)}&status=${status}`, { signal: controller.signal, cache: 'no-store' })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'تعذر تحميل التسليمات')
      return body.handovers as Handover[]
    })).then((lists) => { if (!controller.signal.aborted) setRows(lists.flat()) }).catch((e: unknown) => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'تعذر تحميل التسليمات') })
    return () => controller.abort()
  }, [enabled, branchId, role, version])
  if (!enabled) return null
  return <section aria-label="تأكيد تسليم النقد" className="rounded-xl border p-4 space-y-3">
    <h2 className="font-bold">تأكيد تسليم النقد</h2>
    <button type="button" onClick={() => setVersion((v) => v + 1)}>تحديث التسليمات</button>
    {error && <p role="alert">{error}</p>}
    {rows.map((row) => <HandoverConfirmation key={`${branchId}:${row.id}:${row.status}:${row.countedAmount}`} row={row} actorId={actorId} role={role} branchId={branchId!} onSaved={() => setVersion((v) => v + 1)} />)}
  </section>
}

function HandoverConfirmation({ row, actorId, role, branchId, onSaved }: { row: Handover; actorId: string; role: string; branchId: string; onSaved: () => void }) {
  const router = useRouter()
  const resolving = role === 'manager' || role === 'owner'
  const independent = actorId !== row.fromCashierId && actorId !== row.toCashierId
  const canAct = resolving ? independent && row.countedAmount !== null : actorId === row.toCashierId && (row.status === 'PENDING' || row.countedAmount === null)
  const [count, setCount] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  async function submit(action: 'accept' | 'dispute' | 'resolve') {
    if (pending.current || !canAct) return
    setMessage('')
    try {
      const body = cashHandoverRequest(action, row.id, branchId, resolving ? row.countedAmount ?? '' : count, confirmed, reason)
      pending.current = true
      setBusy(true)
      const response = await fetch(`/api/staff/shifts/${row.fromShiftId}/handover`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'تعذر حفظ التأكيد')
      setConfirmed(false)
      setMessage(result.status === 'DISPUTED' ? 'تم تسجيل النزاع دون ترحيل نقد' : 'تم تأكيد التسليم')
      onSaved()
      router.refresh()
    } catch (e) { setMessage(e instanceof Error ? e.message : 'تعذر حفظ التأكيد؛ حدّث التسليمات قبل إعادة المحاولة') }
    finally { pending.current = false; setBusy(false) }
  }
  return <article className="rounded border p-3 space-y-2">
    <p>تسليم #{row.id} من {row.fromCashierName} — المعلن: {formatCurrency(row.amount)}</p>
    {row.countedAmount !== null && <p>عدّ المستلم: {row.countedAmount} — الفرق: {row.difference} — السبب: {row.disputeReason}</p>}
    {canAct ? <>
      {resolving ? <p>مبلغ التسوية المعتمد: {row.countedAmount}</p> : <label className="block">المبلغ الذي عددته فعليًا <input type="number" min="0" max="9999999" step="0.01" value={count} disabled={busy} onChange={(e) => { setCount(e.target.value); setConfirmed(false) }} className="border rounded p-2" /></label>}
      <label className="block">سبب النزاع / التسوية <textarea value={reason} maxLength={resolving ? 500 : 1000} disabled={busy} onChange={(e) => { setReason(e.target.value); setConfirmed(false) }} className="border rounded p-2" /></label>
      <label className="block"><input type="checkbox" checked={confirmed} disabled={busy || (!resolving && count.trim() === '')} onChange={(e) => setConfirmed(e.target.checked)} /> {resolving ? `أؤكد تسوية مبلغ عدّ المستلم ${row.countedAmount} والسبب المدخل` : `أؤكد أنني عددت المبلغ ${count} فعليًا`}</label>
      <div className="flex gap-3">
        {resolving ? <button type="button" disabled={busy || !confirmed || reason.trim().length < 3} onClick={() => void submit('resolve')}>اعتماد التسوية</button> : <>
          {row.status === 'PENDING' && <button type="button" disabled={busy || !confirmed} onClick={() => void submit('accept')}>تأكيد العدّ (الفرق يسجل نزاعًا)</button>}
          <button type="button" disabled={busy || !confirmed || reason.trim().length < 3} onClick={() => void submit('dispute')}>تسجيل نزاع / رفض دون ترحيل</button>
        </>}
      </div>
    </> : <p>{resolving ? 'يلزم مسؤول مستقل وعدّ محفوظ من المستلم قبل التسوية.' : 'العدّ والفرق محفوظان؛ التسوية لمسؤول مستقل.'}</p>}
    {message && <p role="status">{message}</p>}
  </article>
}
