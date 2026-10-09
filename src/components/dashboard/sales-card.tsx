"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { AreaChart } from "@/components/ui/chart";
import { salesSeriesByRange } from "@/lib/demo/dashboard";
import { formatCurrency } from "@/lib/format";

/**
 * SalesCard — the main dashboard chart with a demo time filter. Switching the
 * range swaps the (fabricated) series; the tooltip shows the formatted value.
 */
type Range = "day" | "week" | "month";

const RANGES: { value: Range; label: string }[] = [
  { value: "day", label: "اليوم" },
  { value: "week", label: "الأسبوع" },
  { value: "month", label: "الشهر" },
];

export function SalesCard() {
  const [range, setRange] = useState<Range>("day");
  const series = salesSeriesByRange[range];
  const total = series.reduce((s, d) => s + d.value, 0);

  const points = series.map((d) => ({
    label: d.label,
    value: d.value,
    display: formatCurrency(d.value),
  }));

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>المبيعات</CardTitle>
          <CardDescription>إجمالي {formatCurrency(total)} — بيانات تجريبية</CardDescription>
        </div>
        <Segmented options={RANGES} value={range} onChange={setRange} ariaLabel="نطاق الوقت" />
      </CardHeader>
      <CardContent>
        <AreaChart data={points} ariaLabel="رسم بياني للمبيعات التجريبية" />
      </CardContent>
    </Card>
  );
}