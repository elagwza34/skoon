import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * TablesStatus — a snapshot of table occupancy for the branch: summary
 * counts plus a colour-coded grid. Presentational (server) component.
 * All data comes from the real database via getDashboardStats().
 */

export type TableStatus = "available" | "occupied" | "cleaning";

export const TABLE_STATUS_META: Record<TableStatus, { label: string; tone: "success" | "warning" | "muted" }> = {
  available: { label: "متاحة", tone: "success" },
  occupied: { label: "مشغولة", tone: "warning" },
  cleaning: { label: "تحتاج تنظيف", tone: "muted" },
};

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

export function TablesStatus({
  tables,
  tableCounts,
}: {
  tables: { number: string; status: "available" | "occupied"; capacity: number }[];
  tableCounts: { available: number; occupied: number; cleaning: number };
}) {

  return (
    <Card>
      <CardHeader>
        <CardTitle>حالة الطاولات</CardTitle>
        <CardDescription>{tableCounts.occupied} مشغولة · {tableCounts.available} متاحة — من قاعدة البيانات</CardDescription>
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
                 {t.status === "occupied"
                   ? `مشغولة - ${formatNumber(t.capacity)} مقعد`
                   : TABLE_STATUS_META[t.status].label}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
