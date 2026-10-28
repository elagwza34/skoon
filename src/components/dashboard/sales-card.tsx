"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { AreaChart } from "@/components/ui/chart";
import { formatCurrency } from "@/lib/format";

/**
 * SalesCard â€” the main dashboard chart with a time filter. Series are REAL
 * sales totals computed server-side (see dashboard-stats) and passed in.
 */
type Range = "day" | "week" | "month";

const RANGES: { value: Range; label: string }[] = [
  { value: "day", label: "Ø§Ù„ÙŠÙˆÙ…" },
  { value: "week", label: "Ø§Ù„Ø£Ø³Ø¨ÙˆØ¹" },
  { value: "month", label: "Ø§Ù„Ø´Ù‡Ø±" },
];

export function SalesCard({ seriesByRange }: { seriesByRange: Record<Range, { label: string; value: number }[]> }) {
  const [range, setRange] = useState<Range>("day");
  const series = seriesByRange[range];
  const total = series.reduce((s, d) => s + d.value, 0);

  const points = series.map((d) => ({
    label: d.label,
    value: d.value,
    display: formatCurrency(d.value),
  }));

  return (
    <Card>
      <CardHeader className="flex-col items-start gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div>
          <CardTitle>Ø§Ù„Ù…Ø¨ÙŠØ¹Ø§Øª</CardTitle>
          <CardDescription>Ø¥Ø¬Ù…Ø§Ù„ÙŠ {formatCurrency(total)}</CardDescription>
        </div>
        <Segmented options={RANGES} value={range} onChange={setRange} ariaLabel="Ù†Ø·Ø§Ù‚ Ø§Ù„ÙˆÙ‚Øª" />
      </CardHeader>
      <CardContent>
        <AreaChart data={points} ariaLabel="Ø±Ø³Ù… Ø¨ÙŠØ§Ù†ÙŠ Ù„Ù„Ù…Ø¨ÙŠØ¹Ø§Øª" />
      </CardContent>
    </Card>
  );
}

