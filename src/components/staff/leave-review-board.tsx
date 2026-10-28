'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { formatDateShort, formatRelative } from '@/lib/format'

export interface LeaveReviewRow {
  id: string
  employeeName: string
  type: string
  status: string
  startsOn: string
  endsOn: string
  days: string
  reason: string
  reviewerName: string | null
  decisionNote: string | null
  decidedAt: string | null
  createdAt: string
}

const statusTone: Record<string, BadgeTone> = { pending: 'warning', approved: 'success', rejected: 'destructive' }
const statusLabel: Record<string, string> = { pending: 'Ù‚ÙŠØ¯ Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø©', approved: 'Ù…ÙˆØ§ÙÙ‚ Ø¹Ù„ÙŠÙ‡', rejected: 'Ù…Ø±ÙÙˆØ¶' }

/** Owner/manager review surface; decisions remain authorized and audited by the API. */
export function LeaveReviewBoard({ rows, canDecide }: { rows: LeaveReviewRow[]; canDecide: boolean }) {
  const router = useRouter()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  async function decide(id: string, approve: boolean) {
    const note = window.prompt(approve ? 'Ù…Ù„Ø§Ø­Ø¸Ø© Ø§Ù„Ù‚Ø±Ø§Ø± (Ø§Ø®ØªÙŠØ§Ø±ÙŠØ©)' : 'Ø³Ø¨Ø¨ Ø§Ù„Ø±ÙØ¶ (Ø§Ø®ØªÙŠØ§Ø±ÙŠ)')
    if (note === null) return
    setPendingId(id)
    setError(null)
    try {
      const response = await fetch(`/api/staff/hr/leave/${id}/decision`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ approve, note }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error ?? 'ØªØ¹Ø°Ø± Ø­ÙØ¸ Ù‚Ø±Ø§Ø± Ø§Ù„Ø¥Ø¬Ø§Ø²Ø©')
      startTransition(() => router.refresh())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ØªØ¹Ø°Ø± Ø­ÙØ¸ Ù‚Ø±Ø§Ø± Ø§Ù„Ø¥Ø¬Ø§Ø²Ø©')
    } finally {
      setPendingId(null)
    }
  }

  return <div className="flex flex-col gap-4">
    <div>
      <h1 className="text-2xl font-bold">Ø·Ù„Ø¨Ø§Øª Ø§Ù„Ø¥Ø¬Ø§Ø²Ø§Øª</h1>
      <p className="text-sm text-muted-foreground">Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø© ØªØºÙŠØ± Ø­Ø§Ù„Ø© Ø§Ù„Ø·Ù„Ø¨ ÙÙ‚Ø·Ø› Ù„Ø§ ØªÙ†Ø´Ø¦ Ø£ÙŠ Ø®ØµÙ… Ø£Ùˆ Ø§Ø­ØªØ³Ø§Ø¨ Ø±ÙˆØ§ØªØ¨ ØªÙ„Ù‚Ø§Ø¦ÙŠÙ‹Ø§.</p>
    </div>
    {error ? <Card className="border-destructive/40"><CardContent className="pt-5 text-sm text-destructive">{error}</CardContent></Card> : null}
    <Card>
      <CardHeader><CardTitle>Ø³Ø¬Ù„ Ø§Ù„Ø·Ù„Ø¨Ø§Øª</CardTitle><CardDescription>Ø§Ù„Ø·Ù„Ø¨Ø§Øª Ù…Ø±Ø¦ÙŠØ© Ø¨Ø­Ø³Ø¨ Ù†Ø·Ø§Ù‚ ØµÙ„Ø§Ø­ÙŠØ© Ø§Ù„Ø­Ø³Ø§Ø¨.</CardDescription></CardHeader>
      <CardContent>
        {rows.length === 0 ? <EmptyState icon="staff" title="Ù„Ø§ ØªÙˆØ¬Ø¯ Ø·Ù„Ø¨Ø§Øª Ø¥Ø¬Ø§Ø²Ø©" description="Ø³ØªØ¸Ù‡Ø± Ø§Ù„Ø·Ù„Ø¨Ø§Øª Ø§Ù„Ø¬Ø¯ÙŠØ¯Ø© Ù‡Ù†Ø§ Ù„Ù„Ù…Ø±Ø§Ø¬Ø¹Ø©." /> :
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-border text-start text-xs text-muted-foreground"><th className="px-2 py-2 font-medium">Ø§Ù„Ù…ÙˆØ¸Ù</th><th className="px-2 py-2 font-medium">Ø§Ù„ÙØªØ±Ø©</th><th className="px-2 py-2 font-medium">Ø§Ù„Ù†ÙˆØ¹</th><th className="px-2 py-2 font-medium">Ø§Ù„Ø­Ø§Ù„Ø©</th><th className="px-2 py-2 font-medium">Ø§Ù„Ø³Ø¨Ø¨</th><th className="px-2 py-2 font-medium">Ø§Ù„Ø¥Ø¬Ø±Ø§Ø¡</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-b border-border/50 align-top last:border-0"><td className="px-2 py-3 font-medium">{row.employeeName}<p className="mt-1 text-xs font-normal text-muted-foreground">{formatRelative(new Date(row.createdAt))}</p></td><td className="px-2 py-3 whitespace-nowrap">{formatDateShort(new Date(row.startsOn))}<br />{formatDateShort(new Date(row.endsOn))}<p className="mt-1 text-xs text-muted-foreground">{row.days} ÙŠÙˆÙ…</p></td><td className="px-2 py-3">{row.type}</td><td className="px-2 py-3"><Badge tone={statusTone[row.status] ?? 'muted'}>{statusLabel[row.status] ?? row.status}</Badge>{row.reviewerName ? <p className="mt-1 text-xs text-muted-foreground">{row.reviewerName}</p> : null}</td><td className="max-w-xs px-2 py-3 text-muted-foreground">{row.reason}{row.decisionNote ? <p className="mt-1 text-xs">{row.decisionNote}</p> : null}</td><td className="px-2 py-3">{canDecide && row.status === 'pending' ? <div className="flex gap-2"><Button size="sm" disabled={pendingId === row.id} onClick={() => decide(row.id, true)}>Ù…ÙˆØ§ÙÙ‚Ø©</Button><Button size="sm" variant="destructive" disabled={pendingId === row.id} onClick={() => decide(row.id, false)}>Ø±ÙØ¶</Button></div> : <span className="text-xs text-muted-foreground">â€”</span>}</td></tr>)}</tbody></table></div>}
      </CardContent>
    </Card>
  </div>
}


