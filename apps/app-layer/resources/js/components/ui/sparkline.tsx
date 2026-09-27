/**
 * A small inline line chart with no axes. Inline SVG, one colour, no library.
 *
 * Deliberately minimal: a sparkline is for "is this going up or down", not for
 * reading values off. The tooltip carries the exact figures.
 */
export default function Sparkline({
    points,
    color = 'var(--accent)',
    height = 36,
    width = 160,
    label,
}: {
    points: number[];
    color?: string;
    height?: number;
    width?: number;
    label?: string;
}) {
    if (points.length < 2) return <div style={{ height }} aria-hidden="true" />;

    const max = Math.max(...points, 1);
    const step = width / (points.length - 1);
    const y = (v: number) => height - 2 - (v / max) * (height - 4);
    const d = points.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${y(v).toFixed(1)}`).join(' ');

    return (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label ?? 'trend'} className="block">
            <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={((points.length - 1) * step).toFixed(1)} cy={y(points[points.length - 1]).toFixed(1)} r="2" fill={color} />
        </svg>
    );
}
