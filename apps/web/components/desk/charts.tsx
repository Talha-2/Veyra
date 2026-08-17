"use client";

/* Veyra Desk chart primitives.

   Built to fixed mark specs rather than to taste: 2px lines with round caps,
   a ~10% area wash (never a saturated block), 1px solid recessive gridlines,
   ≥8px end markers carrying a 2px surface ring, bars capped at 24px with a
   4px rounded data-end and a 2px surface gap between touching marks.

   Three rules this layer exists to enforce:
   • ONE axis. Two measures of different scale get two charts, never two scales.
   • Text never wears the data color — identity comes from a swatch beside the
     label, so a light hue is never asked to be legible as type.
   • Every chart ships a table view, so nothing is gated behind hover or hue.

   Series colors come from --chart-1..5 in fixed slot order. Those steps are
   validated for colorblind separation and 3:1 contrast in both themes; see the
   note above the tokens in globals.css. Never assign them by rank — a filter
   that drops a series must not repaint the survivors. */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Table2, LineChart as LineIcon } from "lucide-react";

// ── shared plumbing ──────────────────────────────────────────────────────────

/** Actual pixel width, so the SVG is drawn 1:1 and never scaled (scaling an
    SVG with preserveAspectRatio="none" stretches strokes and lies about the
    geometry — the single most common chart-rendering defect). */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return { ref, w };
}

/** 1,284 / 12.9K / 4.2M — compact so a tile never wraps. */
export function compact(n: number): string {
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
  if (Math.abs(n) >= 1e4) return `${(n / 1e3).toFixed(1).replace(/\.0$/, "")}K`;
  return n.toLocaleString();
}

const niceTicks = (max: number, count = 4): number[] => {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10;
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
};

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="chart-legend">
      {items.map((s) => (
        <li key={s.label}>
          <span className="chart-legend__key" style={{ background: s.color }} aria-hidden />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

function ViewToggle({ table, onToggle }: { table: boolean; onToggle: () => void }) {
  return (
    <button
      className="chart-toggle"
      onClick={onToggle}
      aria-pressed={table}
      title={table ? "Show the chart" : "Show the numbers as a table"}
    >
      {table ? <LineIcon size={13} /> : <Table2 size={13} />}
      {table ? "Chart" : "Table"}
    </button>
  );
}

// ── trend: two series over time, one axis ────────────────────────────────────
export type TrendPoint = { date: string; ai: number; team: number };

const SERIES = [
  { key: "ai" as const, label: "Handled by Veyra", color: "var(--chart-1)" },
  { key: "team" as const, label: "Handled by the team", color: "var(--chart-2)" },
];

export function TrendArea({ data, height = 260 }: { data: TrendPoint[]; height?: number }) {
  const { ref, w } = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);

  const padL = 44, padR = 52, padT = 12, padB = 26;
  const W = Math.max(320, w);
  const iw = Math.max(1, W - padL - padR);
  const ih = Math.max(1, height - padT - padB);
  const n = data.length;

  const peak = Math.max(1, ...data.flatMap((p) => [p.ai, p.team]));
  const ticks = niceTicks(peak);
  const top = ticks[ticks.length - 1] || 1;

  const x = (i: number) => padL + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v: number) => padT + ih - (v / top) * ih;

  const line = (k: "ai" | "team") =>
    data.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p[k]).toFixed(1)}`).join(" ");
  const area = (k: "ai" | "team") =>
    `${line(k)} L ${x(n - 1).toFixed(1)} ${y(0).toFixed(1)} L ${x(0).toFixed(1)} ${y(0).toFixed(1)} Z`;

  const onMove = useCallback(
    (e: React.PointerEvent) => {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const rel = e.clientX - rect.left;
      const i = Math.round(((rel - padL) / iw) * (n - 1));
      setHover(Math.max(0, Math.min(n - 1, i)));
    },
    [iw, n],
  );

  // keyboard: the hover layer must not be the only way to read a value
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") { e.preventDefault(); setHover((h) => Math.min(n - 1, (h ?? -1) + 1)); }
    if (e.key === "ArrowLeft") { e.preventDefault(); setHover((h) => Math.max(0, (h ?? n) - 1)); }
    if (e.key === "Escape") setHover(null);
  };

  const day = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  if (table) {
    return (
      <figure className="chart">
        <figcaption className="chart__head">
          <Legend items={SERIES.map((s) => ({ label: s.label, color: s.color }))} />
          <ViewToggle table onToggle={() => setTable(false)} />
        </figcaption>
        <div className="chart__tablewrap">
          <table className="chart__table">
            <thead>
              <tr><th scope="col">Date</th><th scope="col">Veyra</th><th scope="col">Team</th></tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.date}>
                  <th scope="row">{day(p.date)}</th>
                  <td>{p.ai.toLocaleString()}</td>
                  <td>{p.team.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </figure>
    );
  }

  const hp = hover != null ? data[hover] : null;
  const labelEvery = Math.max(1, Math.ceil(n / 6));
  const last = data[n - 1];

  return (
    <figure className="chart">
      <figcaption className="chart__head">
        <Legend items={SERIES.map((s) => ({ label: s.label, color: s.color }))} />
        <ViewToggle table={false} onToggle={() => setTable(true)} />
      </figcaption>

      <div
        ref={ref}
        className="chart__plot"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        onKeyDown={onKey}
        tabIndex={0}
        role="application"
        aria-label="Conversations handled per day, by Veyra and by the team. Arrow keys read individual days."
      >
        {w > 0 && (
          <svg width={W} height={height} role="img">
            {/* gridlines: hairline, solid, recessive */}
            {ticks.map((t) => (
              <g key={t}>
                <line x1={padL} x2={padL + iw} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} />
                <text x={padL - 8} y={y(t) + 4} textAnchor="end" className="chart__tick">
                  {compact(t)}
                </text>
              </g>
            ))}

            {SERIES.map((s) => (
              <g key={s.key}>
                <path d={area(s.key)} fill={s.color} fillOpacity={0.1} />
                <path
                  d={line(s.key)}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            ))}

            {/* x labels, thinned so they never collide */}
            {data.map((p, i) =>
              i % labelEvery === 0 || i === n - 1 ? (
                <text key={p.date} x={x(i)} y={height - 8} textAnchor="middle" className="chart__tick">
                  {day(p.date)}
                </text>
              ) : null,
            )}

            {/* Direct end-labels, but only while the series separate at the right
                edge. Two labels 11px apart overlap into mush and detach from
                their lines; nudging them apart is worse. When they converge the
                legend and the tooltip carry identity instead. */}
            {(() => {
              const ys = SERIES.map((s) => y(last?.[s.key] ?? 0));
              const converged = Math.abs(ys[0] - ys[1]) < 12;
              if (converged) return null;
              return SERIES.map((s, i) => (
                <text key={`end-${s.key}`} x={padL + iw + 8} y={ys[i] + 4} className="chart__endlabel">
                  {compact(last?.[s.key] ?? 0)}
                </text>
              ));
            })()}

            {/* crosshair + markers, each ringed in the surface color */}
            {hp && (
              <>
                <line
                  x1={x(hover!)} x2={x(hover!)} y1={padT} y2={padT + ih}
                  stroke="var(--border-strong)" strokeWidth={1}
                />
                {SERIES.map((s) => (
                  <circle
                    key={`m-${s.key}`}
                    cx={x(hover!)} cy={y(hp[s.key])} r={4}
                    fill={s.color} stroke="var(--surface)" strokeWidth={2}
                  />
                ))}
              </>
            )}
          </svg>
        )}

        {hp && (
          <div
            className="chart__tip"
            style={{
              left: Math.min(Math.max(x(hover!), 70), W - 70),
              top: padT,
            }}
            role="status"
          >
            <div className="chart__tip-date">{day(hp.date)}</div>
            {SERIES.map((s) => (
              <div key={s.key} className="chart__tip-row">
                <span className="chart-legend__key" style={{ background: s.color }} aria-hidden />
                <span className="flex-1">{s.label}</span>
                <b>{hp[s.key].toLocaleString()}</b>
              </div>
            ))}
          </div>
        )}
      </div>
    </figure>
  );
}

// ── categorical mix: horizontal bars, one slot per entity ────────────────────
export type MixItem = { label: string; value: number; color: string; hint?: string };

export function BarMix({ items, unit = "" }: { items: MixItem[]; unit?: string }) {
  const [table, setTable] = useState(false);
  const total = items.reduce((a, b) => a + b.value, 0);
  const peak = Math.max(1, ...items.map((i) => i.value));

  if (table) {
    return (
      <figure className="chart">
        <figcaption className="chart__head">
          <span className="chart__total">{compact(total)} {unit}</span>
          <ViewToggle table onToggle={() => setTable(false)} />
        </figcaption>
        <div className="chart__tablewrap">
          <table className="chart__table">
            <thead><tr><th scope="col">Channel</th><th scope="col">Count</th><th scope="col">Share</th></tr></thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.label}>
                  <th scope="row">{i.label}</th>
                  <td>{i.value.toLocaleString()}</td>
                  <td>{total ? Math.round((i.value / total) * 100) : 0}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </figure>
    );
  }

  return (
    <figure className="chart">
      <figcaption className="chart__head">
        <span className="chart__total">{compact(total)} {unit}</span>
        <ViewToggle table={false} onToggle={() => setTable(true)} />
      </figcaption>
      <ul className="mix">
        {items.map((i) => {
          const pct = total ? Math.round((i.value / total) * 100) : 0;
          return (
            <li key={i.label} className="mix__row">
              <span className="mix__label">
                <span className="chart-legend__key" style={{ background: i.color }} aria-hidden />
                {i.label}
              </span>
              <span className="mix__track">
                <span
                  className="mix__bar"
                  style={{ width: `${(i.value / peak) * 100}%`, background: i.color }}
                />
              </span>
              {/* value at the tip; share carries the comparison the bar implies */}
              <span className="mix__value">{i.value.toLocaleString()}</span>
              <span className="mix__pct">{pct}%</span>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}

// ── figures ──────────────────────────────────────────────────────────────────

/** The one number a view leads with. Exactly one per screen. */
export function HeroFigure({
  value, label, sub, meter,
}: {
  value: string;
  label: string;
  sub?: string;
  meter?: number;
}) {
  return (
    <div className="hero-fig">
      <div className="hero-fig__label">{label}</div>
      <div className="hero-fig__value">{value}</div>
      {meter != null && (
        <div className="hero-fig__meter" role="img" aria-label={`${meter}% of conversations`}>
          <span style={{ width: `${Math.max(0, Math.min(100, meter))}%` }} />
        </div>
      )}
      {sub && <p className="hero-fig__sub">{sub}</p>}
    </div>
  );
}

export function Sparkline({ points, color = "var(--chart-1)" }: { points: number[]; color?: string }) {
  const W = 68, H = 20;
  if (points.length < 2) return null;
  const peak = Math.max(1, ...points);
  const d = points
    .map((v, i) => `${i === 0 ? "M" : "L"} ${((i / (points.length - 1)) * W).toFixed(1)} ${(H - (v / peak) * H).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={W} height={H} aria-hidden className="spark">
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** label · value · optional delta · optional trend. Values use proportional
    figures — tabular-nums is for columns, not display numbers. */
export function StatTile({
  label, value, sub, delta, trend, trendColor,
}: {
  label: string;
  value: string;
  sub?: string;
  delta?: { dir: "up" | "down"; text: string; good?: boolean };
  trend?: number[];
  trendColor?: string;
}) {
  return (
    <div className="stat">
      <div className="stat__label">{label}</div>
      <div className="stat__row">
        <span className="stat__value">{value}</span>
        {trend && <Sparkline points={trend} color={trendColor} />}
      </div>
      {sub && <p className="stat__sub">{sub}</p>}
      {delta && (
        <span className={`stat__delta ${delta.good === false ? "bad" : delta.dir === "up" ? "good" : "bad"}`}>
          {delta.dir === "up" ? "↑" : "↓"} {delta.text}
        </span>
      )}
    </div>
  );
}
