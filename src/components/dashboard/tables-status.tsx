import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { tables, tableCounts, TABLE_STATUS_META, type TableStatus } from "@/lib/demo/dashboard";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * TablesStatus — a snapshot of table occupancy for the demo branch: summary
 * counts plus a colour-coded grid. Presentational (server) component.
 */

const CHIP: Record<TableStatus, string> = {
  available: "border-success/40 bg-success/10 text-success",
  occupied: "border-warning/40 bg-warning/10 text-warning",
  cleaning: "border-border bg-muted text-muted-foreground",
};

const DOT: Record<TableStatus, string> = {
  available: "bg-success",
  occupied: "bg-warning",
  cleaning: "bg-muted-foreground",
};

export function TablesStatus() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>حالة الطاولات</CardTitle>
        <CardDescription>{tableCounts.occupied} مشغولة · {tableCounts.available} متاحة · {tableCounts.cleaning} تنظيف — بيانات تجريبية</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {tables.map((t) => (
            <div
              key={t.number}
              className={cn("flex flex-col items-center gap-1 rounded-lg border px-2 py-3", CHIP[t.status])}
              title={TABLE_STATUS_META[t.status].label}
            >
              <span className="flex items-center gap-1.5">
                <span className={cn("h-2 w-2 rounded-full", DOT[t.status])} aria-hidden="true" />
                <span className="text-sm font-bold">{t.number}</span>
              </span>
              <span className="text-[11px]">
                {t.status === "occupied" && t.guests != null
                  ? `${formatNumber(t.guests)}/${formatNumber(t.capacity)}`
                  : TABLE_STATUS_META[t.status].label}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}