import { Check, Copy, Search, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { type Tone, toneColor } from './primitives';

/**
 * The composition kit: the pieces pages are laid out from.
 *
 * Every Studio and Desk page is some arrangement of these — a Card with a
 * header, a List of Rows, a StatTile strip, a Toolbar. Using them rather
 * than re-drawing a div with the same classes is what keeps forty pages
 * looking like one product.
 */

// ── cards ────────────────────────────────────────────────────────────────

export function Card({ children, className = '', padded = false, hover = false, as: Tag = 'section' }: { children: ReactNode; className?: string; padded?: boolean; hover?: boolean; as?: 'section' | 'div' | 'article' }) {
    return <Tag className={`v-panel ${hover ? 'v-card-hover' : ''} ${padded ? 'p-5' : ''} ${className}`}>{children}</Tag>;
}

/** A card's title row. `actions` sits right; the description wraps under the title. */
export function CardHeader({ title, description, actions, icon, border = true }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; icon?: ReactNode; border?: boolean }) {
    return (
        <header className="flex items-start gap-3 px-5 pt-4 pb-3.5" style={border ? { borderBottom: '1px solid var(--separator)' } : undefined}>
            {icon && <IconTile>{icon}</IconTile>}
            <div className="min-w-0 flex-1">
                <h2 className="text-md font-semibold text-primary">{title}</h2>
                {description && <p className="mt-0.5 max-w-[70ch] text-sm text-secondary">{description}</p>}
            </div>
            {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
    );
}

export function CardBody({ children, className = '' }: { children: ReactNode; className?: string }) {
    return <div className={`px-5 py-4 ${className}`}>{children}</div>;
}

export function CardFooter({ children }: { children: ReactNode }) {
    return (
        <footer className="flex items-center justify-end gap-2 px-5 py-3" style={{ borderTop: '1px solid var(--separator)', background: 'var(--bg-subtle)', borderBottomLeftRadius: 'var(--radius-lg)', borderBottomRightRadius: 'var(--radius-lg)' }}>
            {children}
        </footer>
    );
}

/** A rounded square holding an icon: the leading mark of a row or card. */
export function IconTile({ children, tone = 'muted', size = 34 }: { children: ReactNode; tone?: Tone; size?: number }) {
    const bg = tone === 'muted' ? 'var(--surface-sunken)' : `color-mix(in srgb, ${toneColor(tone)} 13%, transparent)`;
    const fg = tone === 'muted' ? 'var(--text-secondary)' : toneColor(tone);

    return (
        <span className="flex shrink-0 items-center justify-center rounded-[10px]" style={{ width: size, height: size, background: bg, color: fg }}>
            {children}
        </span>
    );
}

// ── lists ────────────────────────────────────────────────────────────────

/** An inset list, iOS Settings style: rows separated by hairlines that start after the leading mark. */
export function List({ children, className = '' }: { children: ReactNode; className?: string }) {
    return <div className={`divide-y ${className}`} style={{ ['--tw-divide-color' as string]: 'var(--separator)', borderColor: 'var(--separator)' }}>{children}</div>;
}

export function ListRow({
    leading,
    title,
    subtitle,
    trailing,
    onClick,
    href,
    active = false,
    dim = false,
}: {
    leading?: ReactNode;
    title: ReactNode;
    subtitle?: ReactNode;
    trailing?: ReactNode;
    onClick?: () => void;
    href?: string;
    active?: boolean;
    dim?: boolean;
}) {
    const body = (
        <>
            {leading}
            <div className="min-w-0 flex-1">
                <div className="truncate text-base font-medium text-primary">{title}</div>
                {subtitle && <div className="mt-0.5 truncate text-sm text-secondary">{subtitle}</div>}
            </div>
            {trailing && <div className="flex shrink-0 items-center gap-2">{trailing}</div>}
        </>
    );
    const className = `flex w-full items-center gap-3.5 px-5 py-3.5 text-left transition-colors ${onClick || href ? 'hover:bg-surface-hover cursor-pointer' : ''} ${dim ? 'opacity-55' : ''}`;
    const style = { borderColor: 'var(--separator)', background: active ? 'var(--accent-subtle)' : undefined };

    if (href) {
        return <a href={href} className={className} style={style} onClick={(e) => { if (onClick) { e.preventDefault(); onClick(); } }}>{body}</a>;
    }
    if (onClick) {
        return <button type="button" onClick={onClick} className={className} style={style}>{body}</button>;
    }
    return <div className={className} style={style}>{body}</div>;
}

/** Label / value pairs, for detail sidebars. */
export function KeyValues({ items }: { items: { label: string; value: ReactNode }[] }) {
    return (
        <dl className="grid grid-cols-[minmax(96px,auto)_1fr] items-center gap-x-4 gap-y-2.5 text-sm">
            {items.map((item) => (
                <div key={item.label} className="contents">
                    <dt className="text-tertiary">{item.label}</dt>
                    <dd className="min-w-0 text-primary">{item.value}</dd>
                </div>
            ))}
        </dl>
    );
}

// ── numbers ──────────────────────────────────────────────────────────────

export function StatTile({ label, value, hint, tone, icon, trend }: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone; icon?: ReactNode; trend?: ReactNode }) {
    return (
        <div className="v-panel flex flex-col p-5">
            <div className="flex items-center gap-2 text-sm font-medium text-secondary">
                {icon && <span className="text-tertiary">{icon}</span>}
                {label}
            </div>
            <div className="mt-2.5 flex items-baseline gap-2">
                <span className="text-3xl font-semibold tracking-tight tabular-nums" style={{ color: tone ? toneColor(tone) : 'var(--text-primary)' }}>{value}</span>
                {trend}
            </div>
            {hint && <div className="mt-1 text-xs text-tertiary">{hint}</div>}
        </div>
    );
}

export function Meter({ value, tone = 'accent', label }: { value: number; tone?: Tone; label?: string }) {
    const pct = Math.max(0, Math.min(100, value));

    return (
        <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--surface-sunken)' }} role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
            <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: toneColor(tone) }} />
        </div>
    );
}

// ── controls ─────────────────────────────────────────────────────────────

/** An iOS switch. Accent when on. */
export function Switch({ checked, onChange, label, disabled = false, size = 'md' }: { checked: boolean; onChange: (value: boolean) => void; label?: string; disabled?: boolean; size?: 'sm' | 'md' }) {
    const w = size === 'sm' ? 32 : 40;
    const h = size === 'sm' ? 20 : 24;
    const knob = h - 4;

    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className="relative shrink-0 rounded-full transition-colors duration-200 disabled:opacity-40"
            style={{ width: w, height: h, background: checked ? 'var(--success-fill)' : 'var(--border-strong)' }}
        >
            <span
                className="absolute top-[2px] left-[2px] rounded-full bg-white transition-transform duration-200"
                style={{ width: knob, height: knob, transform: checked ? `translateX(${w - knob - 4}px)` : 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.2), 0 1px 1px rgba(0,0,0,0.08)', transitionTimingFunction: 'var(--ease-spring)' }}
            />
        </button>
    );
}

/** A button-driven segmented control, for local state (tabs inside a page). */
export function SegmentedControl<T extends string>({ value, onChange, options, size = 'md' }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; size?: 'sm' | 'md' }) {
    return (
        <div className="inline-flex items-center gap-0.5 rounded-[10px] p-[3px]" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }} role="tablist">
            {options.map((o) => {
                const active = o.value === value;
                return (
                    <button key={o.value} type="button" role="tab" aria-selected={active} onClick={() => onChange(o.value)}
                        className={`flex items-center gap-1.5 rounded-[8px] font-medium whitespace-nowrap transition-all ${size === 'sm' ? 'h-6 px-2.5 text-xs' : 'h-7 px-3 text-sm'}`}
                        style={{ background: active ? 'var(--surface-raised)' : 'transparent', color: active ? 'var(--text-primary)' : 'var(--text-secondary)', boxShadow: active ? 'var(--shadow-card)' : 'none' }}>
                        {o.label}
                    </button>
                );
            })}
        </div>
    );
}

export function SearchField({ value, onChange, placeholder = 'Search', className = 'w-[260px]', autoFocus }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; autoFocus?: boolean }) {
    return (
        <div className={`relative ${className}`}>
            <Search size={14} strokeWidth={2} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-tertiary" />
            <input type="search" className="v-field h-[34px] rounded-full pr-8 pl-8" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} autoFocus={autoFocus} />
            {value && (
                <button type="button" aria-label="Clear search" onClick={() => onChange('')} className="absolute top-1/2 right-2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full text-tertiary hover:text-primary" style={{ background: 'var(--surface-sunken)' }}>
                    <X size={11} strokeWidth={2.5} />
                </button>
            )}
        </div>
    );
}

/** The strip above a list: filters left, search and actions right. */
export function Toolbar({ children, trailing }: { children?: ReactNode; trailing?: ReactNode }) {
    return (
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
            {children}
            <div className="flex-1" />
            {trailing}
        </div>
    );
}

/** A tinted message block, for things the person should know before acting. */
export function Callout({ tone = 'info', title, children, icon, action }: { tone?: Tone; title?: ReactNode; children?: ReactNode; icon?: ReactNode; action?: ReactNode }) {
    const color = toneColor(tone);

    return (
        <div className="flex items-start gap-3 rounded-[var(--radius-lg)] px-4 py-3.5" style={{ background: `color-mix(in srgb, ${color} 8%, var(--surface))`, border: `1px solid color-mix(in srgb, ${color} 22%, transparent)` }}>
            {icon && <span className="mt-0.5 shrink-0" style={{ color }}>{icon}</span>}
            <div className="min-w-0 flex-1 text-sm text-secondary">
                {title && <div className="mb-0.5 font-semibold text-primary">{title}</div>}
                {children}
            </div>
            {action && <div className="shrink-0">{action}</div>}
        </div>
    );
}

export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
    const [copied, setCopied] = useState(false);
    const timer = useRef<number>(0);
    useEffect(() => () => window.clearTimeout(timer.current), []);

    return (
        <button
            type="button"
            className="v-btn v-btn--quiet v-btn--sm"
            onClick={() => {
                navigator.clipboard?.writeText(value);
                setCopied(true);
                timer.current = window.setTimeout(() => setCopied(false), 1600);
            }}
        >
            {copied ? <Check size={13} strokeWidth={2.2} /> : <Copy size={13} strokeWidth={2} />}
            {copied ? 'Copied' : label}
        </button>
    );
}

export function Skeleton({ className = '' }: { className?: string }) {
    return <div className={`v-skeleton ${className}`} aria-hidden="true" />;
}

/** A small tab strip with an underline, for switching views inside a card. */
export function Tabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; count?: number }[] }) {
    return (
        <div className="flex items-center gap-5 px-5" style={{ borderBottom: '1px solid var(--separator)' }} role="tablist">
            {options.map((o) => {
                const active = o.value === value;
                return (
                    <button key={o.value} type="button" role="tab" aria-selected={active} onClick={() => onChange(o.value)}
                        className="-mb-px flex h-11 items-center gap-1.5 border-b-2 text-sm font-medium transition-colors"
                        style={{ borderColor: active ? 'var(--text-primary)' : 'transparent', color: active ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                        {o.label}
                        {o.count != null && <span className="text-2xs text-tertiary tabular-nums">{o.count}</span>}
                    </button>
                );
            })}
        </div>
    );
}
