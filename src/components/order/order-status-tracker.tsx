'use client'

import { useEffect, useRef, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
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
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (TERMINAL.has(status)) return
    let alive = true

    async function poll() {
      try {
        const res = await fetch(`/api/public/orders/${id}?n=${encodeURIComponent(orderNumber)}`, {
          cache: 'no-store',
        })
        if (!res.ok || !alive) return
        const data = (await res.json()) as { status?: string }
        if (alive && data.status && data.status !== status) {
          setStatus(data.status)
          setChanged(true)
        }
      } catch {
        /* transient network blip — keep polling */
      }
    }

    timer.current = setInterval(poll, POLL_MS)
    return () => {
      alive = false
      if (timer.current) clearInterval(timer.current)
    }
  }, [id, orderNumber, status])

  const cancelled = status === 'cancelled'
  const currentIndex = STEPS.findIndex((s) => s.key === status)

  return (
    <Card className={cn('transition-colors', cancelled ? 'border-destructive/40' : 'border-success/40')}>
      <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
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
                {!TERMINAL.has(status) ? (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                ) : null}
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success" />
              </span>
              <span className="text-xs font-medium text-muted-foreground">
                {changed ? 'تم تحديث الحالة' : 'متابعة مباشرة لحالة الطلب'}
              </span>
            </div>
            <h1 className="text-xl font-bold">{STEPS[currentIndex]?.label ?? 'تم استلام طلبك'}</h1>
          </>
        )}

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
