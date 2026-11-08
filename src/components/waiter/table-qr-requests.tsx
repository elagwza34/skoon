'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

type Row = { id: string; number: string; tableId: string; tableNumber: string; total: string }
export function TableQrRequests({ tableId }: { tableId?: string }) {
  const router = useRouter()
  const [rows, setRows] = useState<Row[]>([])
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  useEffect(() => {
    const controller = new AbortController()
    void fetch('/api/staff/qr/orders', { signal: controller.signal, cache: 'no-store' }).then(async (response) => {
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'تعذر تحميل طلبات QR')
      if (!controller.signal.aborted) setRows(result.orders)
    }).catch((e: unknown) => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'تعذر التحميل') })
    return () => controller.abort()
  }, [version])
  async function decide(row: Row, approve: boolean) {
    if (pending.current) return
    const reason = approve ? undefined : window.prompt('سبب رفض طلب QR')?.trim()
    if (!approve && (!reason || reason.length < 3)) return
    pending.current = true; setBusy(true); setError('')
    try {
      const post = async (payload: unknown) => {
        const response = await fetch(`/api/staff/orders/${row.id}/waiter`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
        const result = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(result.error || 'تعذر اعتماد طلب QR')
      }
      await post({ action: 'claim_qr' })
      await post(approve ? { action: 'approve_qr', idempotencyKey: `qr-approve-${row.id}` } : { action: 'reject_qr', reason })
      setVersion((v) => v + 1); router.refresh()
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذر إتمام العملية') }
    finally { pending.current = false; setBusy(false) }
  }
  return <section className="rounded border p-3 space-y-2" aria-label="طلبات QR المعلقة">
    <h2 className="font-bold">طلبات QR بانتظار اعتماد النادل</h2>
    <Button variant="outline" disabled={busy} onClick={() => { setError(''); setVersion((v) => v + 1) }}>تحديث</Button>
    {error && <p role="alert">{error}</p>}
    {rows.filter((r) => !tableId || r.tableId === tableId).map((row) => <div key={row.id} className="flex flex-wrap items-center gap-3"><span>{row.number} · طاولة {row.tableNumber} · {row.total}</span><Button disabled={busy} onClick={() => void decide(row, true)}>استلام واعتماد</Button><Button variant="outline" disabled={busy} onClick={() => void decide(row, false)}>رفض بسبب موثق</Button></div>)}
  </section>
}
