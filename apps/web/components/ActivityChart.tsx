"use client";

/* Activity area chart (recharts) for the Overview dashboard. Buckets timestamped
   rows by day across a rolling window so the studio opens on a real signal graph
   rather than static tiles. Series are configurable and colors reference the
   design tokens, so it tracks light and dark automatically. */

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type Series = { key: string; label: string; color: string };
export type ActivityPoint = { day: string; label: string; [k: string]: string | number };

/* Bucket ISO timestamped rows into the last `days` calendar days per series. */
export function bucketByDay(
  series: { key: string; rows: { at?: string | null }[] }[],
  days = 14,
  today = new Date(),
): ActivityPoint[] {
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  const buckets: ActivityPoint[] = [];
  const index: Record<string, number> = {};
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(start);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    index[key] = buckets.length;
    const point: ActivityPoint = {
      day: key,
      label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    };
    for (const s of series) point[s.key] = 0;
    buckets.push(point);
  }
  for (const s of series) {
    for (const r of s.rows) {
      if (!r.at) continue;
      const key = new Date(r.at).toISOString().slice(0, 10);
      const idx = index[key];
      if (idx !== undefined) buckets[idx][s.key] = (buckets[idx][s.key] as number) + 1;
    }
  }
  return buckets;
}

function Tip({ active, payload, label, series }: any) {
  if (!active || !payload?.length) return null;
  const labelFor = (k: string) => series.find((s: Series) => s.key === k)?.label ?? k;
  return (
    <div
      style={{
        background: "var(--surface-overlay)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
        boxShadow: "var(--shadow-overlay)",
        padding: "8px 11px",
        fontFamily: "var(--font-studio)",
      }}
    >
      <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color }} />
          <span style={{ color: "var(--text-secondary)" }}>{labelFor(p.dataKey)}</span>
          <span className="mono" style={{ marginLeft: "auto", fontWeight: 600, color: "var(--text-primary)" }}>
            {p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function ActivityChart({ data, series }: { data: ActivityPoint[]; series: Series[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 6, left: -18, bottom: 0 }}>
        <defs>
          {series.map((s) => (
            <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={0.26} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "var(--text-tertiary)" }}
          tickLine={false}
          axisLine={false}
          minTickGap={24}
        />
        <YAxis
          allowDecimals={false}
          width={40}
          tick={{ fontSize: 11, fill: "var(--text-tertiary)" }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip content={<Tip series={series} />} cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }} />
        {series.map((s) => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            stroke={s.color}
            strokeWidth={2}
            fill={`url(#grad-${s.key})`}
            activeDot={{ r: 3, strokeWidth: 0 }}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
