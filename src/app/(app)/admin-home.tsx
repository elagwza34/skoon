import { requirePageAccess } from "@/lib/require-page-access";
import { getDashboardStats } from "@/lib/dashboard-stats";
import { StatCard } from "@/components/ui/stat";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DonutChart } from "@/components/ui/chart";
import { SalesCard } from "@/components/dashboard/sales-card";
import { RecentOrdersTable } from "@/components/dashboard/recent-orders-table";
import { TopProducts } from "@/components/dashboard/top-products";
import { TablesStatus } from "@/components/dashboard/tables-status";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import { Icon } from "@/components/ui/icon";
import { logoutAction } from '@/app/login/actions'
import { getManagerOperations } from '@/lib/manager-operations'
import { ManagerOperationsCenter } from '@/components/dashboard/manager-operations-center'
import { ManagerServiceRequestPanel } from '@/components/dashboard/manager-service-request-panel'
import { getWaiterOperationalReadiness } from '@/lib/staff-waiter-readiness'
import { WaiterOperationalReadinessPanel } from '@/components/dashboard/waiter-operational-readiness-panel'
import { isOwner } from '@/lib/authz'
import { OwnerCommandCenter } from '@/components/owner/owner-command-center'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'

/** Signed percent change between two numbers. */
function pctDelta(now: number, before: number): { delta: string; dir: "up" | "down" } {
  const change = before === 0 ? 0 : ((now - before) / before) * 100;
  return { delta: formatPercent(Math.abs(change)), dir: change >= 0 ? "up" : "down" };
}

async function CanonicalDashboardPage({ pathname }: { pathname: '/owner' | '/manager' }) {
  const session = await requirePageAccess(pathname);

  const stats = await getDashboardStats(session);
  const managerOperations = await getManagerOperations(session)
  const waiterReadiness = await getWaiterOperationalReadiness(session)

  const salesDelta = pctDelta(stats.totalSalesToday, stats.totalSalesYesterday);
  const ordersDelta = pctDelta(stats.ordersToday, stats.ordersYesterday);

  // Owner sees the compact Owner Command Center V2; all other roles keep the existing layout.
  if (isOwner(session.role)) {
    return (
      <OwnerCommandCenter
        stats={{
          totalSalesToday: stats.totalSalesToday,
          orderValueToday: stats.orderValueToday,
          ordersToday: stats.ordersToday,
          avgOrderValue: stats.avgOrderValue,
          ordersInPreparation: stats.ordersInPreparation,
          paidOrdersToday: stats.paidOrdersToday,
          statusDistribution: stats.statusDistribution,
          salesSeriesByRange: stats.salesSeriesByRange,
          recentOrders: stats.recentOrders,
          topProducts: stats.topProducts,
          tables: stats.tables,
          tableCounts: stats.tableCounts,
        }}
        managerOperations={managerOperations}
        waiterReadiness={waiterReadiness}
        session={{ role: session.role, name: session.name, permissions: session.permissions }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">لوحة التحكم</h1>
          <p className="text-sm text-muted-foreground">جميع الأرقام مأخوذة من قاعدة البيانات الحقيقية، وتحدّث هيكلها تلقائياً.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-info/10 px-3 py-1 text-xs font-semibold text-info">
            <span className="h-1.5 w-1.5 rounded-full bg-info animate-pulse" aria-hidden="true" />
            حي (محدث تلقائياً)
          </span>
          <form action={logoutAction}>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Icon name="logout" size={16} />
              تسجيل الخروج
            </button>
          </form>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="المحصّل اليوم"
          value={formatCurrency(stats.totalSalesToday)}
          icon="trendingUp"
          delta={salesDelta.delta}
          deltaDirection={salesDelta.dir}
          hint="مدفوعات مكتملة — مقارنة بالأمس"
        />
        <StatCard
          label="قيمة طلبات اليوم"
          value={formatCurrency(stats.orderValueToday)}
          icon="orders"
          hint="طلبات غير ملغية — تشمل غير المدفوع"
        />
        <StatCard
          label="عدد الطلبات"
          value={formatNumber(stats.ordersToday)}
          icon="orders"
          delta={ordersDelta.delta}
          deltaDirection={ordersDelta.dir}
          hint="مقارنة بالأمس"
        />
        <StatCard label="متوسط المحصّل للطلب المدفوع" value={formatCurrency(stats.avgOrderValue)} icon="reports" hint={stats.paidOrdersToday ? `على ${formatNumber(stats.paidOrdersToday)} طلب مدفوع` : 'لا طلبات مدفوعة اليوم'} />
        <StatCard label="قيد التحضير" value={formatNumber(stats.ordersInPreparation)} icon="kitchen" hint="طلبات نشطة" />
      </div>

      {managerOperations ? <ManagerOperationsCenter data={managerOperations} /> : null}
      {managerOperations ? <ManagerServiceRequestPanel metrics={managerOperations.serviceRequests} /> : null}
      {waiterReadiness ? <WaiterOperationalReadinessPanel data={waiterReadiness} /> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <SalesCard seriesByRange={stats.salesSeriesByRange} />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>توزيع حالات الطلبات</CardTitle>
            <CardDescription>اليوم — من قاعدة البيانات</CardDescription>
          </CardHeader>
          <CardContent>
            <DonutChart data={stats.statusDistribution} centerValue={formatNumber(stats.ordersToday)} centerLabel="طلب" />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <RecentOrdersTable orders={stats.recentOrders} />
        </div>
        <TopProducts products={stats.topProducts} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <TablesStatus tables={stats.tables} tableCounts={stats.tableCounts} />
        </div>
        <QuickActions user={session} />
      </div>
    </div>
  );
}

/** Shared implementation for the canonical Owner and Manager pages. */
export default async function AdminHomePage() {
  const pathname = (await headers()).get('x-pathname')
  if (pathname === '/owner' || pathname === '/manager') {
    return <CanonicalDashboardPage pathname={pathname} />
  }
  // This module is imported by the canonical pages only. A direct invocation
  // without one of those paths is intentionally rejected instead of routing
  // through a legacy dashboard redirect.
  redirect('/login')
}
