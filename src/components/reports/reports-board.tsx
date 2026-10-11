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
export function ReportsBoard({ summary }: { summary: ReportsSummary }) {
  const points = summary.daily.map((d) => ({
    label: d.label, value: d.revenue, display: formatCurrency(d.revenue),
  }))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          الملغي مستبعد من الإيراد · حدود الأيام بتوقيت القاهرة
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
        <StatCard label="إجمالي الإيراد" value={formatCurrency(summary.totalRevenue)} icon="reports" hint={`آخر ${summary.days} يوم`} />
        <StatCard label="عدد الطلبات" value={formatNumber(summary.totalOrders)} icon="orders" hint={`آخر ${summary.days} يوم`} />
        <StatCard label="متوسط الطلب" value={formatCurrency(summary.avgOrderValue)} icon="trendingUp" hint="غير شامل الملغي" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>الإيراد اليومي</CardTitle>
          <CardDescription>من قاعدة البيانات — ترتيب زمني</CardDescription>
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
