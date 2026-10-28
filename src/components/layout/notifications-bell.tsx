'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Popover } from '@/components/ui/popover'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/utils'

/**
 * NotificationsBell â€” a live, per-user bell that polls GET /api/staff/notifications.
 *
 * WHY A SELF-FETCHING COMPONENT: operational roles (waiter/kitchen/cashier) run
 * on full-screen boards WITHOUT the admin AppShell/Topbar, so a bell passed down
 * as a prop from the layout would never reach them. Fetching by session identity
 * here means ONE component can be dropped anywhere (topbar or an ops board) and
 * always shows the right user's branch-scoped alerts. Marking read on open keeps
 * the badge honest.
 */

interface NotifItem {
  id: string
  type: string
  title: string
  body: string | null
  isRead: boolean
  createdAt: string
  orderId: string | null
}

/** Map a notification type to an icon + tone (shared visual language). */
const TONE: Record<string, string> = {
  'order.created': 'bg-primary text-primary-foreground',
  'order.sent_to_kitchen': 'bg-primary text-primary-foreground',
  'order.preparing': 'bg-warning text-warning-foreground',
  'order.ready': 'bg-success text-success-foreground',
  'order.served': 'bg-info text-accent-foreground',
  'order.awaiting_payment': 'bg-info text-accent-foreground',
  'order.paid': 'bg-success text-success-foreground',
  'order.cancelled': 'bg-destructive text-destructive-foreground',
}
const ICON: Record<string, string> = {
  'order.created': 'bell',
  'order.sent_to_kitchen': 'flame',
  'order.preparing': 'flame',
  'order.ready': 'check',
  'order.served': 'utensils',
  'order.awaiting_payment': 'pos',
  'order.paid': 'check',
  'order.cancelled': 'close',
}

function timeAgo(iso: string): string {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return `Ù‚Ø¨Ù„ ${s} Ø«`
  const m = Math.round(s / 60)
  if (m < 60) return `Ù‚Ø¨Ù„ ${m} Ø¯`
  const h = Math.round(m / 60)
  if (h < 24) return `Ù‚Ø¨Ù„ ${h} Ø³`
  return `Ù‚Ø¨Ù„ ${Math.round(h / 24)} ÙŠ`
}

export function NotificationsBell({ className }: { className?: string }) {
  const [items, setItems] = useState<NotifItem[]>([])
  const [unread, setUnread] = useState(0)
  const mounted = useRef(true)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/staff/notifications', { cache: 'no-store' })
      if (!res.ok) return
      const data = (await res.json()) as { items: NotifItem[]; unread: number }
      if (!mounted.current) return
      setItems(data.items)
      setUnread(data.unread)
    } catch {
      // Network blip â€” keep the last known state, retry on the next tick.
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    refresh()
    // Poll every 20s: a live bell without a push transport. Cheap (one indexed
    // count + capped list) and invisible if nothing changed.
    const t = setInterval(refresh, 20000)
    return () => {
      mounted.current = false
      clearInterval(t)
    }
  }, [refresh])

  async function markRead() {
    // Fire-and-forget; the badge clears optimistically, refresh confirms.
    setUnread(0)
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })))
    try {
      await fetch('/api/staff/notifications/read', { method: 'POST' })
    } catch {
      /* ignore */
    }
  }

  return (
    <Popover
      ariaLabel="Ø§Ù„Ø¥Ø´Ø¹Ø§Ø±Ø§Øª"
      panelClassName="w-80"
      onOpen={markRead}
      trigger={(p) => (
        <button
          {...p}
          aria-label="Ø§Ù„Ø¥Ø´Ø¹Ø§Ø±Ø§Øª"
          className={cn(
            'relative inline-flex h-10 w-10 items-center justify-center rounded-md text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            className,
          )}
        >
          <Icon name="bell" size={20} />
          {unread > 0 ? (
            <span className="absolute -top-0.5 -end-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-bold text-destructive-foreground">
              {unread > 9 ? '9+' : unread}
            </span>
          ) : null}
        </button>
      )}
    >
      {() => (
        <div className="w-80">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5 text-sm font-semibold text-foreground">
            <span>Ø§Ù„Ø¥Ø´Ø¹Ø§Ø±Ø§Øª</span>
            {unread > 0 ? (
              <span className="text-xs font-normal text-muted-foreground">{unread} Ø¬Ø¯ÙŠØ¯</span>
            ) : null}
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">Ù„Ø§ ØªÙˆØ¬Ø¯ Ø¥Ø´Ø¹Ø§Ø±Ø§Øª Ø¬Ø¯ÙŠØ¯Ø©.</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {items.map((n) => (
                <li
                  key={n.id}
                  className={cn(
                    'flex items-start gap-3 border-b border-border/50 px-4 py-3 last:border-0',
                    !n.isRead && 'bg-primary/5',
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                      TONE[n.type] ?? 'bg-muted text-muted-foreground',
                    )}
                  >
                    <Icon name={(ICON[n.type] ?? 'bell') as never} size={15} />
                  </span>
                  <div className="flex min-w-0 flex-col">
                    <span className="text-sm text-foreground">{n.title}</span>
                    <span className="text-xs text-muted-foreground">{timeAgo(n.createdAt)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Popover>
  )
}


