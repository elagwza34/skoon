"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { tables as demoTables, TABLE_STATUS_META, type TableStatus } from "@/lib/demo/dashboard";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Tables — grid of demo tables. Tapping a table advances its status locally
 * (available → occupied → cleaning → available) as a preview; nothing persists.
 */

type T = { number: string; status: TableStatus; capacity: number; guests?: number };

const CYCLE: Record<TableStatus, TableStatus> = { available: "occupied", occupied: "cleaning", cleaning: "available" };
const ACTION: Record<TableStatus, string> = { available: "شغّل الطاولة", occupied: "اطلب تنظيف", cleaning: "جاهزة" };

const CHIP: Record<TableStatus, string> = {
  available: "border-success/40 bg-success/10",
  occupied: "border-warning/40 bg-warning/10",
  cleaning: "border-border bg-muted/50",
};
const DOT: Record<TableStatus, string> = { available: "bg-success", occupied: "bg-warning", cleaning: "bg-muted-foreground" };

export default function TablesPage() {
  const [tables, setTables] = useState<T[]>(() => demoTables.map((t) => ({ ...t })));

  function advance(number: string) {
    setTables((ts) =>
      ts.map((t) => {
        if (t.number !== number) return t;
        const next = CYCLE[t.status];
        return { ...t, status: next, guests: next === "occupied" ? t.capacity : next === "cleaning" ? undefined : undefined };
      }),
    );
  }

  const counts = {
    available: tables.filter((t) => t.status === "available").length,
    occupied: tables.filter((t) => t.status === "occupied").length,
    cleaning: tables.filter((t) => t.status === "cleaning").length,
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3 text-sm">
        <Summary tone="success" label="متاحة" value={counts.available} />
        <Summary tone="warning" label="مشغولة" value={counts.occupied} />
        <Summary tone="muted" label="تحتاج تنظيف" value={counts.cleaning} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
        {tables.map((t) => {
          const meta = TABLE_STATUS_META[t.status];
          return (
            <Card key={t.number} className={cn("flex flex-col", CHIP[t.status])}>
              <CardContent className="flex flex-1 flex-col gap-2 p-4">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <span className={cn("h-2.5 w-2.5 rounded-full", DOT[t.status])} aria-hidden="true" />
                    <span className="text-lg font-bold text-foreground">{t.number}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">{formatNumber(t.capacity)} مقاعد</span>
                </div>
                <div className="flex flex-col leading-tight">
                  <span className="text-sm font-medium text-foreground">{meta.label}</span>
                  {t.status === "occupied" && t.guests != null ? (
                    <span className="text-xs text-muted-foreground">{formatNumber(t.guests)} ضيوف</span>
                  ) : null}
                </div>
                <Button size="sm" variant={t.status === "available" ? "primary" : "outline"} className="mt-auto w-full" onClick={() => advance(t.number)}>
                  <Icon name={t.status === "available" ? "plus" : t.status === "occupied" ? "utensils" : "check"} size={14} />
                  {ACTION[t.status]}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Summary({ tone, label, value }: { tone: "success" | "warning" | "muted"; label: string; value: number }) {
  const cls = { success: "text-success", warning: "text-warning", muted: "text-muted-foreground" }[tone];
  return (
    <span className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5">
      <span className="text-lg font-bold text-foreground">{formatNumber(value)}</span>
      <span className={cls}>{label}</span>
    </span>
  );
}