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
 * Reports board — revenue + orders aggregates from the real DB.
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
          المحصّل = مدفوعات مكتملة بتاريخ الدفع · قيمة الطلبات = طلبات بتاريخ الطلب · حدود الأيام بتوقيت الفرع
        </p>
        <Segmented
          options={[
            { value: '7', label: '7 أيام' },
            { value: '30', label: '30 يوم' },
            { value: '90', label: '90 يوم' },
          ]}
          value={String(summary.days)}
          onChange={(v) => {
            window.location.search = `?days=${v}`
          }}
          ariaLabel="النطاق الزمني"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="المحصّل (نقد محتفظ به)" value={formatCurrency(summary.totalRevenue)} icon="reports" hint={`آخر ${summary.days} يوم — مدفوعات مكتملة`} />
        <StatCard label="قيمة الطلبات" value={formatCurrency(summary.totalOrderValue)} icon="orders" hint="غير ملغية — تشمل غير المدفوع" />
        <StatCard label="المسترد" value={formatCurrency(summary.refundedTotal)} icon="trendingDown" hint="سطر منفصل — غير مخصوم مجدداً" />
        <StatCard label="عدد الطلبات" value={formatNumber(summary.totalOrders)} icon="orders" hint={`آخر ${summary.days} يوم — شامل الملغي`} />
        <StatCard label="طلبات مدفوعة" value={formatNumber(summary.paidOrders)} icon="pos" hint="بمدفوعات مكتملة في النطاق" />
        <StatCard label="متوسط المحصّل للمدفوع" value={formatCurrency(summary.avgCollectedPerPaidOrder)} icon="trendingUp" hint="المحصّل ÷ المدفوعة" />
        {vatSummary ? <Link href="/reports?tab=vat" className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><StatCard label="صافي ضريبة القيمة المضافة" value={formatCurrency(vatSummary.netCollectedVat)} icon="reports" hint={`${formatNumber(vatSummary.paidInvoices)} فواتير VAT مؤهلة`} /></Link> : null}
      </div>

      {summary.byMethod.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>المحصّل حسب طريقة الدفع</CardTitle>
            <CardDescription>مدفوعات مكتملة — مجموعها يساوي المحصّل</CardDescription>
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
          <CardTitle>قيمة الطلبات اليومية</CardTitle>
          <CardDescription>قيمة الطلبات غير الملغية بتاريخ الطلب — المحصّل النقدي في البطاقات أعلاه</CardDescription>
        </CardHeader>
        <CardContent>
          <AreaChart data={points} ariaLabel="رسم بياني للإيراد" />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>الأكثر مبيعاً</CardTitle>
            <CardDescription>حسب الإيراد في النطاق</CardDescription>
          </CardHeader>
          <CardContent>
            {summary.topProducts.length === 0 ? (
              <EmptyState icon="products" title="لا توجد مبيعات" description="لا توجد أصناف مباعة في هذا النطاق." />
            ) : (
              <ul className="flex flex-col divide-y divide-border/60">
                {summary.topProducts.map((p) => (
                  <li key={p.name} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="font-medium text-foreground">{p.name}</span>
                    <span className="text-xs text-muted-foreground">{formatNumber(p.qty)} ×</span>
                    <span className="font-semibold">{formatCurrency(p.revenue)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>توزيع الحالات</CardTitle>
            <CardDescription>كل الطلبات في النطاق</CardDescription>
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
              عرض الطلبات ←
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
