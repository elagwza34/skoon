"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Segmented } from "@/components/ui/segmented";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { kitchenOrders } from "@/lib/demo/orders";
import { ORDER_STATUS_META, type OrderStatusKey } from "@/lib/demo/orders";
import { cn } from "@/lib/utils";

/**
 * Kitchen board — moves demo orders between statuses with local state only.
 * No cross-device sync or persistence; this is a preview of the kitchen flow.
 */

type KOrder = { id: string; number: string; table: string; status: OrderStatusKey; minutesAgo: number; items: { name: string; qty: number; note?: string }[] };

const NEXT: Partial<Record<OrderStatusKey, { to: OrderStatusKey; label: string }>> = {
  new: { to: "preparing", label: "بدء التحضير" },
  preparing: { to: "ready", label: "جاهز للتقديم" },
  ready: { to: "served", label: "تم التقديم" },
};

const FILTERS = [
  { value: "all", label: "الكل" },
  { value: "new", label: "جديد" },
  { value: "preparing", label: "قيد التحضير" },
  { value: "ready", label: "جاهز" },
] as const;

export default function KitchenPage() {
  const [orders, setOrders] = useState<KOrder[]>(() => kitchenOrders.map((o) => ({ ...o })));
  const [filter, setFilter] = useState<string>("all");

  function advance(id: string) {
    setOrders((os) => os.map((o) => (o.id === id && NEXT[o.status] ? { ...o, status: NEXT[o.status]!.to } : o)));
  }

  const visible = orders.filter((o) => filter === "all" || o.status === filter);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">انقل الطلبات بين الحالات — بيانات محلية تجريبية فقط (بلا مزامنة حقيقية).</p>
        <Segmented options={FILTERS.map((f) => ({ value: f.value, label: f.label }))} value={filter} onChange={setFilter} ariaLabel="تصفية الحالات" />
      </div>

      {visible.length === 0 ? (
        <EmptyState icon="kitchen" title="لا توجد طلبات في هذه الحالة" description="اختر حالة أخرى أو انتظر طلبات جديدة." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((o) => {
            const meta = ORDER_STATUS_META[o.status];
            const next = NEXT[o.status];
            return (
              <Card key={o.id} className={cn("flex flex-col", o.status === "ready" && "border-primary/40")}>
                <CardContent className="flex flex-1 flex-col gap-3 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col leading-tight">
                      <span className="text-base font-bold text-foreground">{o.number}</span>
                      <span className="text-xs text-muted-foreground">{o.table}</span>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge tone={meta.tone as BadgeTone}>{meta.label}</Badge>
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Icon name="clock" size={13} /> {o.minutesAgo} دقيقة
                      </span>
                    </div>
                  </div>

                  <ul className="flex flex-col gap-1.5 border-t border-border pt-3 text-sm">
                    {o.items.map((it, idx) => (
                      <li key={idx} className="flex items-start justify-between gap-2">
                        <span className="text-foreground">
                          <span className="font-semibold">{it.qty}×</span> {it.name}
                          {it.note ? <span className="block text-xs text-warning">ملاحظة: {it.note}</span> : null}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {next ? (
                    <Button className="mt-auto w-full" onClick={() => advance(o.id)}>
                      <Icon name={next.to === "ready" ? "check" : next.to === "served" ? "utensils" : "flame"} size={16} />
                      {next.label}
                    </Button>
                  ) : (
                    <div className="mt-auto flex items-center justify-center gap-2 rounded-md bg-success/15 py-2 text-sm font-medium text-success">
                      <Icon name="check" size={16} /> تم التقديم
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}