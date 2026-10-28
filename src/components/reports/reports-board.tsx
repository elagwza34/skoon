'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Segmented } from '@/components/ui/segmented'
import { StatCard } from '@/components/ui/stat'
import { AreaChart } from '@/components/ui/chart'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { formatCurrency, formatNumber } from '@/lib/format'
import type { ReportsSummary } from '@/lib/staff-reports'

/**
 * Reports board â€” revenue + orders aggregates from the real DB.
 * Day-range selector navigates (?days=7/30/90); chart + tables re-render.
 */
export function ReportsBoard({ summary, vatSummary }: { summary: ReportsSummary; vatSummary?: { netCollectedVat: number; paidInvoices: number } }) {
  const points = summary.daily.map((d) => ({
    label: d.label, value: d.revenue, display: formatCurrency(d.revenue),
  }))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Ø§Ù„Ù…Ø­ØµÙ‘Ù„ = Ù…Ø¯ÙÙˆØ¹Ø§Øª Ù…ÙƒØªÙ…Ù„Ø© Ø¨ØªØ§Ø±ÙŠØ® Ø§Ù„Ø¯ÙØ¹ Â· Ù‚ÙŠÙ…Ø© Ø§Ù„Ø·Ù„Ø¨Ø§Øª = Ø·Ù„Ø¨Ø§Øª Ø¨ØªØ§Ø±ÙŠØ® Ø§Ù„Ø·Ù„Ø¨ Â· Ø­Ø¯ÙˆØ¯ Ø§Ù„Ø£ÙŠØ§Ù… Ø¨ØªÙˆÙ‚ÙŠØª Ø§Ù„ÙØ±Ø¹
        </p>
        <Segmented
          options={[
            { value: '7', label: '7 Ø£ÙŠØ§Ù…' },
            { value: '30', label: '30 ÙŠÙˆÙ…' },
            { value: '90', label: '90 ÙŠÙˆÙ…' },
          ]}
          value={String(summary.days)}
          onChange={(v) => {
            window.location.search = `?days=${v}`
          }}
          ariaLabel="Ø§Ù„Ù†Ø·Ø§Ù‚ Ø§Ù„Ø²Ù…Ù†ÙŠ"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Ø§Ù„Ù…Ø­ØµÙ‘Ù„ (Ù†Ù‚Ø¯ Ù…Ø­ØªÙØ¸ Ø¨Ù‡)" value={formatCurrency(summary.totalRevenue)} icon="reports" hint={`Ø¢Ø®Ø± ${summary.days} ÙŠÙˆÙ… â€” Ù…Ø¯ÙÙˆØ¹Ø§Øª Ù…ÙƒØªÙ…Ù„Ø©`} />
        <StatCard label="Ù‚ÙŠÙ…Ø© Ø§Ù„Ø·Ù„Ø¨Ø§Øª" value={formatCurrency(summary.totalOrderValue)} icon="orders" hint="ØºÙŠØ± Ù…Ù„ØºÙŠØ© â€” ØªØ´Ù…Ù„ ØºÙŠØ± Ø§Ù„Ù…Ø¯ÙÙˆØ¹" />
        <StatCard label="Ø§Ù„Ù…Ø³ØªØ±Ø¯" value={formatCurrency(summary.refundedTotal)} icon="trendingDown" hint="Ø³Ø·Ø± Ù…Ù†ÙØµÙ„ â€” ØºÙŠØ± Ù…Ø®ØµÙˆÙ… Ù…Ø¬Ø¯Ø¯Ø§Ù‹" />
        <StatCard label="Ø¹Ø¯Ø¯ Ø§Ù„Ø·Ù„Ø¨Ø§Øª" value={formatNumber(summary.totalOrders)} icon="orders" hint={`Ø¢Ø®Ø± ${summary.days} ÙŠÙˆÙ… â€” Ø´Ø§Ù…Ù„ Ø§Ù„Ù…Ù„ØºÙŠ`} />
        <StatCard label="Ø·Ù„Ø¨Ø§Øª Ù…Ø¯ÙÙˆØ¹Ø©" value={formatNumber(summary.paidOrders)} icon="pos" hint="Ø¨Ù…Ø¯ÙÙˆØ¹Ø§Øª Ù…ÙƒØªÙ…Ù„Ø© ÙÙŠ Ø§Ù„Ù†Ø·Ø§Ù‚" />
        <StatCard label="Ù…ØªÙˆØ³Ø· Ø§Ù„Ù…Ø­ØµÙ‘Ù„ Ù„Ù„Ù…Ø¯ÙÙˆØ¹" value={formatCurrency(summary.avgCollectedPerPaidOrder)} icon="trendingUp" hint="Ø§Ù„Ù…Ø­ØµÙ‘Ù„ Ã· Ø§Ù„Ù…Ø¯ÙÙˆØ¹Ø©" />
        {vatSummary ? <Link href="/reports?tab=vat" className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><StatCard label="ØµØ§ÙÙŠ Ø¶Ø±ÙŠØ¨Ø© Ø§Ù„Ù‚ÙŠÙ…Ø© Ø§Ù„Ù…Ø¶Ø§ÙØ©" value={formatCurrency(vatSummary.netCollectedVat)} icon="reports" hint={`${formatNumber(vatSummary.paidInvoices)} ÙÙˆØ§ØªÙŠØ± VAT Ù…Ø¤Ù‡Ù„Ø©`} /></Link> : null}
      </div>

      {summary.byMethod.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Ø§Ù„Ù…Ø­ØµÙ‘Ù„ Ø­Ø³Ø¨ Ø·Ø±ÙŠÙ‚Ø© Ø§Ù„Ø¯ÙØ¹</CardTitle>
            <CardDescription>Ù…Ø¯ÙÙˆØ¹Ø§Øª Ù…ÙƒØªÙ…Ù„Ø© â€” Ù…Ø¬Ù…ÙˆØ¹Ù‡Ø§ ÙŠØ³Ø§ÙˆÙŠ Ø§Ù„Ù…Ø­ØµÙ‘Ù„</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {summary.byMethod.map((m) => (
                <span key={m.method} className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm">
                  <Badge tone="muted">{m.label}</Badge>
                  <span className="font-bold">{formatCurrency(m.value)}</span>
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Ù‚ÙŠÙ…Ø© Ø§Ù„Ø·Ù„Ø¨Ø§Øª Ø§Ù„ÙŠÙˆÙ…ÙŠØ©</CardTitle>
          <CardDescription>Ù‚ÙŠÙ…Ø© Ø§Ù„Ø·Ù„Ø¨Ø§Øª ØºÙŠØ± Ø§Ù„Ù…Ù„ØºÙŠØ© Ø¨ØªØ§Ø±ÙŠØ® Ø§Ù„Ø·Ù„Ø¨ â€” Ø§Ù„Ù…Ø­ØµÙ‘Ù„ Ø§Ù„Ù†Ù‚Ø¯ÙŠ ÙÙŠ Ø§Ù„Ø¨Ø·Ø§Ù‚Ø§Øª Ø£Ø¹Ù„Ø§Ù‡</CardDescription>
        </CardHeader>
        <CardContent>
          <AreaChart data={points} ariaLabel="Ø±Ø³Ù… Ø¨ÙŠØ§Ù†ÙŠ Ù„Ù„Ø¥ÙŠØ±Ø§Ø¯" />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Ø§Ù„Ø£ÙƒØ«Ø± Ù…Ø¨ÙŠØ¹Ø§Ù‹</CardTitle>
            <CardDescription>Ø­Ø³Ø¨ Ø§Ù„Ø¥ÙŠØ±Ø§Ø¯ ÙÙŠ Ø§Ù„Ù†Ø·Ø§Ù‚</CardDescription>
          </CardHeader>
          <CardContent>
            {summary.topProducts.length === 0 ? (
              <EmptyState icon="products" title="Ù„Ø§ ØªÙˆØ¬Ø¯ Ù…Ø¨ÙŠØ¹Ø§Øª" description="Ù„Ø§ ØªÙˆØ¬Ø¯ Ø£ØµÙ†Ø§Ù Ù…Ø¨Ø§Ø¹Ø© ÙÙŠ Ù‡Ø°Ø§ Ø§Ù„Ù†Ø·Ø§Ù‚." />
            ) : (
              <ul className="flex flex-col divide-y divide-border/60">
                {summary.topProducts.map((p) => (
                  <li key={p.name} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="font-medium text-foreground">{p.name}</span>
                    <span className="text-xs text-muted-foreground">{formatNumber(p.qty)} Ã—</span>
                    <span className="font-semibold">{formatCurrency(p.revenue)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>ØªÙˆØ²ÙŠØ¹ Ø§Ù„Ø­Ø§Ù„Ø§Øª</CardTitle>
            <CardDescription>ÙƒÙ„ Ø§Ù„Ø·Ù„Ø¨Ø§Øª ÙÙŠ Ø§Ù„Ù†Ø·Ø§Ù‚</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {summary.byStatus.map((s) => (
                <span key={s.key} className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm">
                  <Badge tone="muted">{s.label}</Badge>
                  <span className="font-bold">{formatNumber(s.value)}</span>
                </span>
              ))}
            </div>
            <Link href="/orders" className="mt-4 inline-block text-sm text-primary hover:underline">
              Ø¹Ø±Ø¶ Ø§Ù„Ø·Ù„Ø¨Ø§Øª â†
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}


