import { StatCard } from "@/components/ui/stat";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DonutChart } from "@/components/ui/chart";
import { DemoBanner } from "@/components/dashboard/demo-banner";
import { SalesCard } from "@/components/dashboard/sales-card";
import { RecentOrdersTable } from "@/components/dashboard/recent-orders-table";
import { TopProducts } from "@/components/dashboard/top-products";
import { TablesStatus } from "@/components/dashboard/tables-status";
import { QuickActions } from "@/components/dashboard/quick-actions";
import {
  totalSalesToday,
  totalSalesYesterday,
  ordersToday,
  ordersYesterday,
  avgOrderValue,
  ordersInPreparation,
  statusDistribution,
} from "@/lib/demo/dashboard";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";

/** Signed percent change between two demo totals. */
function pctDelta(now: number, before: number): { delta: string; dir: "up" | "down" } {
  const change = before === 0 ? 0 : ((now - before) / before) * 100;
  return { delta: formatPercent(Math.abs(change)), dir: change >= 0 ? "up" : "down" };
}

const salesDelta = pctDelta(totalSalesToday, totalSalesYesterday);
const ordersDelta = pctDelta(ordersToday, ordersYesterday);

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-5">
      <DemoBanner />

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="مبيعات اليوم"
          value={formatCurrency(totalSalesToday)}
          icon="trendingUp"
          delta={salesDelta.delta}
          deltaDirection={salesDelta.dir}
          hint="مقارنة بالأمس"
        />
        <StatCard
          label="عدد الطلبات"
          value={formatNumber(ordersToday)}
          icon="orders"
          delta={ordersDelta.delta}
          deltaDirection={ordersDelta.dir}
          hint="مقارنة بالأمس"
        />
        <StatCard label="متوسط قيمة الطلب" value={formatCurrency(avgOrderValue)} icon="reports" hint="لكل طلب" />
        <StatCard label="قيد التحضير" value={formatNumber(ordersInPreparation)} icon="kitchen" hint="طلبات نشطة" />
      </div>

      {/* Chart + status distribution */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SalesCard />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>توزيع حالات الطلبات</CardTitle>
            <CardDescription>اليوم — بيانات تجريبية</CardDescription>
          </CardHeader>
          <CardContent>
            <DonutChart data={statusDistribution} centerValue={formatNumber(ordersToday)} centerLabel="طلب" />
          </CardContent>
        </Card>
      </div>

      {/* Recent orders + top products */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RecentOrdersTable />
        </div>
        <TopProducts />
      </div>

      {/* Tables + quick actions */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TablesStatus />
        </div>
        <QuickActions />
      </div>
    </div>
  );
}