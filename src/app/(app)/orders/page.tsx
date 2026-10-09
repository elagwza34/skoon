"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Segmented } from "@/components/ui/segmented";
import { EmptyState } from "@/components/ui/empty-state";
import { recentOrders, sourceLabel, ORDER_STATUS_META, ORDER_STATUSES, type OrderStatusKey } from "@/lib/demo/orders";
import { formatCurrency, formatRelative } from "@/lib/format";

/**
 * Orders — searchable, filterable list of demo orders. Local data only.
 */

type Filter = "all" | OrderStatusKey;
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "الكل" },
  ...ORDER_STATUSES.map((s) => ({ value: s as Filter, label: ORDER_STATUS_META[s].label })),
];

export default function OrdersPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return recentOrders.filter(
      (o) =>
        (filter === "all" || o.status === filter) &&
        (!q || o.number.toLowerCase().includes(q) || o.table.includes(q) || (o.customerName ?? "").includes(q)),
    );
  }, [filter, query]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input icon="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="بحث برقم الطلب أو الطاولة…" aria-label="بحث الطلبات" className="max-w-xs" />
        <Segmented options={FILTERS} value={filter} onChange={setFilter} ariaLabel="تصفية حسب الحالة" />
      </div>

      <Card>
        <CardContent className="pt-5">
          {rows.length === 0 ? (
            <EmptyState icon="orders" title="لا توجد طلبات مطابقة" description="جرّب بحثاً أو تصفية أخرى." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="px-2 py-2 text-start font-medium">رقم الطلب</th>
                    <th className="px-2 py-2 text-start font-medium">الطاولة</th>
                    <th className="px-2 py-2 text-start font-medium">العميل</th>
                    <th className="px-2 py-2 text-start font-medium">المصدر</th>
                    <th className="px-2 py-2 text-start font-medium">الأصناف</th>
                    <th className="px-2 py-2 text-start font-medium">الإجمالي</th>
                    <th className="px-2 py-2 text-start font-medium">الوقت</th>
                    <th className="px-2 py-2 text-start font-medium">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((o) => {
                    const meta = ORDER_STATUS_META[o.status];
                    return (
                      <tr key={o.id} className="border-b border-border/50 last:border-0 hover:bg-accent/40">
                        <td className="px-2 py-2.5 font-medium text-foreground">{o.number}</td>
                        <td className="px-2 py-2.5 text-muted-foreground">{o.table}</td>
                        <td className="px-2 py-2.5 text-muted-foreground">{o.customerName ?? "—"}</td>
                        <td className="px-2 py-2.5 text-muted-foreground">{sourceLabel(o.source)}</td>
                        <td className="px-2 py-2.5 text-muted-foreground">{o.itemsCount}</td>
                        <td className="px-2 py-2.5 font-medium text-foreground">{formatCurrency(o.total)}</td>
                        <td className="px-2 py-2.5 text-muted-foreground">{formatRelative(new Date(Date.now() - o.minutesAgo * 60000))}</td>
                        <td className="px-2 py-2.5">
                          <Badge tone={meta.tone as BadgeTone}>{meta.label}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}