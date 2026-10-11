"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { sourceLabel } from "@/lib/demo/orders";
import { ORDER_STATUS_META, ORDER_STATUSES, type OrderStatusKey } from "@/lib/demo/orders";
import type { RecentOrder } from "@/lib/demo/orders";
import { formatCurrency, formatRelative } from "@/lib/format";

/**
 * RecentOrdersTable — demo orders with a working status filter. The status
 * vocabulary matches the shared demo domain so Kitchen/Orders stay consistent.
 */

type Filter = "all" | OrderStatusKey;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "الكل" },
  ...ORDER_STATUSES.filter((s) => s !== "cancelled").map((s) => ({ value: s as Filter, label: ORDER_STATUS_META[s].label })),
];

export function RecentOrdersTable({ orders }: { orders: RecentOrder[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const rows = orders.filter((o) => filter === "all" || o.status === filter);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>أحدث الطلبات</CardTitle>
          <CardDescription>آخر ما ورد في الفرع — </CardDescription>
        </div>
        <Segmented options={FILTERS} value={filter} onChange={setFilter} ariaLabel="تصفية حسب الحالة" />
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState icon="orders" title="لا توجد طلبات بهذه الحالة" description="جرّب اختيار حالة أخرى." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-start text-xs text-muted-foreground">
                  <th className="px-2 py-2 text-start font-medium">رقم الطلب</th>
                  <th className="px-2 py-2 text-start font-medium">الطاولة</th>
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
  );
}