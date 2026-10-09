"use client";

import { useId, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { formatCurrencyCompact } from "@/lib/format";

/**
 * Charts — hand-rolled, dependency-free SVG (a sales area chart + a donut).
 * No charting library is used: the preview needs only these two, and building
 * them keeps the bundle tiny and the look consistent with the design tokens.
 * The SVG renders in a fixed viewBox (direction:ltr) so page RTL never mirrors it.
 */

export interface AreaPoint {
  label: string; // pre-formatted axis label, e.g. "14:00"
  value: number; // numeric value used for scaling + tooltip
  display?: string; // optional pre-formatted tooltip text
}

export interface AreaChartProps {
  data: AreaPoint[];
  height?: number;
  className?: string;
  ariaLabel?: string;
}

const PAD = { top: 16, end: 12, bottom: 26, start: 48 };
const VW = 640;
const VH = 240;

export function AreaChart({ data, height = 240, className, ariaLabel }: AreaChartProps) {
  const [hover, setHover] = useState<number | null>(null);
  const gradId = useId();
  const svgRef = useRef<SVGSVGElement>(null);

  const plotW = VW - PAD.start - PAD.end;
  const plotH = VH - PAD.top - PAD.bottom;

  const { path, area, points, ticks, xAt } = useMemo(() => {
    const rawMax = data.length ? Math.max(...data.map((d) => d.value)) : 0;
    const max = rawMax <= 0 ? 1 : rawMax * 1.08;
    const n = data.length;
    const xAt = (i: number) => PAD.start + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
    const yAt = (v: number) => PAD.top + plotH - (v / max) * plotH;
    const points = data.map((d, i) => ({ x: xAt(i), y: yAt(d.value), ...d }));
    const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    const base = PAD.top + plotH;
    const area = `${path} L${xAt(n - 1).toFixed(1)},${base.toFixed(1)} L${xAt(0).toFixed(1)},${base.toFixed(1)} Z`;
    const ticks = [0, 0.5, 1].map((f) => ({ y: yAt(max * f), v: max * f }));
    return { path, area, points, ticks, xAt };
  }, [data, plotW, plotH]);

  const labelStep = Math.max(1, Math.ceil(data.length / 6));

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const relX = ((e.clientX - rect.left) / rect.width) * VW;
    let best = 0;
    let bestD = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(p.x - relX);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    setHover(best);
  }

  const hp = hover != null ? points[hover] : null;

  return (
    <div className={cn("relative w-full", className)}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VW} ${VH}`}
        style={{ direction: "ltr" }}
        width="100%"
        height={height}
        preserveAspectRatio="none"
        role="img"
        aria-label={ariaLabel ?? "رسم بياني"}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        className="overflow-visible"
      >
        <defs>
          <linearGradient id={`fill-${gradId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.35" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
          </linearGradient>
        </defs>

        {ticks.map((t, i) => (
          <g key={i}>
            <line
              x1={PAD.start}
              x2={VW - PAD.end}
              y1={t.y}
              y2={t.y}
              stroke="hsl(var(--border))"
              strokeWidth={1}
              strokeDasharray={i === 0 ? undefined : "3 4"}
            />
            <text x={PAD.start - 8} y={t.y + 4} textAnchor="end" fontSize={11} fill="hsl(var(--muted-foreground))">
              {formatCurrencyCompact(t.v)}
            </text>
          </g>
        ))}

        <path d={area} fill={`url(#fill-${gradId})`} />
        <path d={path} fill="none" stroke="hsl(var(--primary))" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />

        {data.map((d, i) =>
          i % labelStep === 0 ? (
            <text key={i} x={xAt(i)} y={VH - 8} textAnchor="middle" fontSize={11} fill="hsl(var(--muted-foreground))">
              {d.label}
            </text>
          ) : null,
        )}

        {hp ? (
          <g>
            <line x1={hp.x} x2={hp.x} y1={PAD.top} y2={PAD.top + plotH} stroke="hsl(var(--primary))" strokeWidth={1} strokeDasharray="3 3" />
            <circle cx={hp.x} cy={hp.y} r={4.5} fill="hsl(var(--primary))" stroke="hsl(var(--card))" strokeWidth={2} />
          </g>
        ) : null}
      </svg>

      {hp ? (
        <div
          className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs shadow-lg"
          style={{ left: `${(hp.x / VW) * 100}%` }}
        >
          <div className="font-medium text-foreground">{hp.display ?? formatCurrencyCompact(hp.value)}</div>
          <div className="text-muted-foreground">{hp.label}</div>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Donut chart (for status / category distribution)
// ---------------------------------------------------------------------------

export interface DonutSlice {
  label: string;
  value: number;
  color: string; // CSS color (a token or hex)
}

export interface DonutChartProps {
  data: DonutSlice[];
  size?: number;
  thickness?: number;
  centerValue?: string;
  centerLabel?: string;
  className?: string;
}

export function DonutChart({
  data,
  size = 180,
  thickness = 22,
  centerValue,
  centerLabel,
  className,
}: DonutChartProps) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let acc = 0;

  const segments = data.map((d, i) => {
    const len = (d.value / total) * c;
    const el = (
      <circle
        key={i}
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={d.color}
        strokeWidth={thickness}
        strokeDasharray={`${len} ${c - len}`}
        strokeDashoffset={-acc}
      />
    );
    acc += len;
    return el;
  });

  return (
    <div className={cn("flex flex-wrap items-center gap-4", className)}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          style={{ direction: "ltr" }}
          role="img"
          aria-label={centerLabel ?? "توزيع الحالات"}
        >
          <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>{segments}</g>
        </svg>
        {centerValue ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-foreground">{centerValue}</span>
            {centerLabel ? <span className="text-xs text-muted-foreground">{centerLabel}</span> : null}
          </div>
        ) : null}
      </div>

      <ul className="flex min-w-0 flex-1 flex-col gap-2">
        {data.map((d, i) => (
          <li key={i} className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d.color }} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{d.label}</span>
            <span className="font-medium text-foreground">{d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}