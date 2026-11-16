'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/utils'

/**
 * Live order status tracker for the customer confirmation screen.
 *
 * Polls the public tracking endpoint (guarded by id + orderNumber) and reflects
 * staff-side transitions in real time: new → preparing → ready → served, or
 * cancelled. Polling stops once the order reaches a terminal state so the screen
 * doesn't run forever. Shows a "live" pulse only while the order is active.
 */

const STEPS = [
  { key: 'new', label: 'تم الاستلام', icon: 'check' as const },
  { key: 'preparing', label: 'جاري التحضير', icon: 'flame' as const },
  { key: 'ready', label: 'جاهز', icon: 'bell' as const },
  { key: 'served', label: 'تم التقديم', icon: 'utensils' as const },
]

const TERMINAL = new Set(['served', 'cancelled', 'completed'])
const POLL_MS = 8000

interface Props {
  id: string
  orderNumber: string
  initialStatus: string
  branchName: string
  tableNumber: string
}

export function OrderStatusTracker({ id, orderNumber, initialStatus, branchName, tableNumber }: Props) {
  const [status, setStatus] = useState(initialStatus)
  const [changed, setChanged] = useState(false)
  const [failed, setFailed] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    if (TERMINAL.has(status)) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    let active = true
    const offline = () => setFailed(true)
    async function poll() {
      try {
        if (!navigator.onLine) throw new Error('offline')
        const res = await fetch(`/api/public/orders/${id}?n=${encodeURIComponent(orderNumber)}`, {
          cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]),
        })
        if (!res.ok) throw new Error('tracking unavailable')
        const data = (await res.json()) as { status?: string }
        if (!data.status) throw new Error('invalid tracking response')
        if (!active) return
        setFailed(false)
        setLastUpdate(new Date().toLocaleTimeString('ar-EG'))
        if (data.status !== status) { setStatus(data.status); setChanged(true) }
      } catch {
        /* transient network blip — keep polling */
        if (active) setFailed(true)
      } finally {
        if (active) timer = setTimeout(poll, POLL_MS)
      }
    }
    void poll()
    window.addEventListener('offline', offline)
    return () => { active = false; controller.abort(); clearTimeout(timer); window.removeEventListener('offline', offline) }
  }, [id, orderNumber, status, retry])

  const cancelled = status === 'cancelled'
  const currentIndex = STEPS.findIndex((s) => s.key === status)

  return (
    <Card className={cn('transition-colors', cancelled ? 'border-destructive/40' : 'border-success/40')}>
      <CardContent aria-live="polite" aria-atomic="false" className="flex flex-col items-center gap-3 p-6 text-center">
        {cancelled ? (
          <>
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <Icon name="close" size={28} />
            </span>
            <h1 className="text-xl font-bold">تم إلغاء الطلب</h1>
            <p className="text-sm text-muted-foreground">لو فيه استفسار، كلّم الكاشير من فضلك.</p>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                {!failed && !TERMINAL.has(status) ? (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                ) : null}
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success" />
              </span>
              <span className="text-xs font-medium text-muted-foreground">
                {failed ? 'تعذر تحديث الطلب — المعروض آخر حالة معروفة' : changed ? 'تم تحديث الحالة' : 'متابعة مباشرة لحالة الطلب'}
              </span>
            </div>
            <h1 className="text-xl font-bold">{STEPS[currentIndex]?.label ?? 'تم استلام طلبك'}</h1>
          </>
        )}

        {failed && <Button variant="outline" onClick={() => setRetry(value => value + 1)}>إعادة الاتصال</Button>}
        {lastUpdate && <p className="text-xs text-muted-foreground" aria-live="off">آخر تحديث: {lastUpdate}</p>}
        <p className="text-sm text-muted-foreground">
          {branchName} · طاولة {tableNumber}
        </p>

        {!cancelled ? (
          <ol className="mt-2 flex w-full items-center justify-between gap-1">
            {STEPS.map((step, idx) => {
              const done = idx <= currentIndex
              return (
                <li key={step.key} className="flex flex-1 flex-col items-center gap-1.5">
                  <div className="flex w-full items-center gap-1">
                    <span
                      className={cn(
                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs',
                        done
                          ? 'border-success bg-success text-success-foreground'
                          : 'border-border bg-muted text-muted-foreground',
                      )}
                    >
                      <Icon name={done ? 'check' : step.icon} size={14} />
                    </span>
                    {idx < STEPS.length - 1 ? (
                      <span className={cn('h-0.5 flex-1 rounded', idx < currentIndex ? 'bg-success' : 'bg-border')} />
                    ) : null}
                  </div>
                  <span className={cn('text-[11px] leading-tight', done ? 'font-medium text-foreground' : 'text-muted-foreground')}>
                    {step.label}
                  </span>
                </li>
              )
            })}
          </ol>
        ) : null}

        <span className="mt-1 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
          رقم الطلب: {orderNumber}
        </span>
      </CardContent>
    </Card>
  )
}
