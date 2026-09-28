import { Link } from '@inertiajs/react';
import type { ReactNode } from 'react';

/**
 * The Desk page frame and the roomier card pieces Desk pages are laid out
 * from (DESIGN.md › "Space and scrolling", binding).
 *
 * - DeskPage: the content column. Same padding as Studio, 1200px by default,
 *   1440px (`wide`) for boards and tables. The header sits 40px above the
 *   first section; sections are 48px apart. The document scrolls; nothing
 *   here adds a scrolling wrapper.
 * - Panel / PanelHeader / PanelBody: a card with 28px of padding.
 * - PanelRow: a 60px hairline-separated row.
 */

// Wider on big monitors (a 1200px column on a 2000px screen read as a narrow
// strip floating in empty space).
const WIDTHS = { narrow: 'max-w-[1000px]', default: 'max-w-[1200px] min-[1800px]:max-w-[1360px]', wide: 'max-w-[1440px] min-[1800px]:max-w-[1640px]' } as const;

export function DeskPage({ header, children, width = 'default' }: { header?: ReactNode; children: ReactNode; width?: keyof typeof WIDTHS }) {
    return (
        <div className={`mx-auto w-full px-6 pt-10 pb-28 md:px-10 lg:px-14 lg:pt-12 ${WIDTHS[width]}`}>
            {header && <div className="mb-10 [&>header]:mb-0">{header}</div>}
            <div className="flex flex-col gap-12">{children}</div>
        </div>
    );
}

/** A labelled group of cards: 24px between the cards inside, 48px to the next group (from DeskPage). */
export function PageSection({ title, description, actions, children, className = '' }: { title?: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
    return (
        <section className={`flex min-w-0 flex-col gap-6 ${className}`}>
            {(title || actions) && (
                <div className="-mb-1 flex flex-wrap items-end justify-between gap-3">
                    <div className="min-w-0">
                        {title && <h2 className="text-xl font-semibold tracking-tight text-primary">{title}</h2>}
                        {description && <p className="mt-1 max-w-[68ch] text-sm text-secondary">{description}</p>}
                    </div>
                    {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
                </div>
            )}
            {children}
        </section>
    );
}

export function Panel({ children, className = '', as: Tag = 'section' }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'aside' | 'article' }) {
    return <Tag className={`v-panel min-w-0 ${className}`}>{children}</Tag>;
}

export function PanelHeader({ title, description, actions, icon, border = true }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; icon?: ReactNode; border?: boolean }) {
    return (
        <header className="flex items-start gap-3.5 px-7 pt-6 pb-5" style={border ? { borderBottom: '1px solid var(--separator)' } : undefined}>
            {icon && <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] text-secondary" style={{ background: 'var(--surface-sunken)' }}>{icon}</span>}
            <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold tracking-tight text-primary">{title}</h2>
                {description && <p className="mt-1 max-w-[68ch] text-sm text-secondary">{description}</p>}
            </div>
            {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
    );
}

export function PanelBody({ children, className = '' }: { children: ReactNode; className?: string }) {
    return <div className={`px-7 py-6 ${className}`}>{children}</div>;
}

export function PanelFooter({ children, className = '' }: { children: ReactNode; className?: string }) {
    return (
        <footer className={`flex items-center gap-3 px-7 py-4 ${className}`} style={{ borderTop: '1px solid var(--separator)', background: 'var(--bg-subtle)', borderBottomLeftRadius: 'var(--radius-lg)', borderBottomRightRadius: 'var(--radius-lg)' }}>
            {children}
        </footer>
    );
}

/** Rows inside a Panel: hairlines between, none after the last. */
export function PanelRows({ children, className = '' }: { children: ReactNode; className?: string }) {
    return <div className={`divide-y ${className}`} style={{ ['--tw-divide-color' as string]: 'var(--separator)' }}>{children}</div>;
}

/**
 * A 60px row: leading mark, title and one line under it, trailing meta.
 * `href` makes the whole row an Inertia link.
 */
export function PanelRow({ leading, title, subtitle, trailing, href, onClick, tint }: {
    leading?: ReactNode; title: ReactNode; subtitle?: ReactNode; trailing?: ReactNode; href?: string; onClick?: () => void; tint?: string;
}) {
    const body = (
        <>
            {leading}
            <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-medium text-primary">{title}</span>
                {subtitle && <span className="mt-0.5 block truncate text-sm text-secondary">{subtitle}</span>}
            </span>
            {trailing && <span className="flex shrink-0 items-center gap-2.5">{trailing}</span>}
        </>
    );
    const cls = `flex min-h-15 w-full items-center gap-4 px-7 py-2.5 text-left transition-colors ${href || onClick ? 'cursor-pointer hover:bg-surface-hover' : ''}`;
    const style = tint ? { background: tint } : undefined;

    if (href) return <Link href={href} className={cls} style={style}>{body}</Link>;
    if (onClick) return <button type="button" onClick={onClick} className={cls} style={style}>{body}</button>;
    return <div className={cls} style={style}>{body}</div>;
}

/** Main column + side panel. Two columns only at ≥1280px; the panel stacks below that. */
export function WithSidePanel({ main, side, sticky = true }: { main: ReactNode; side: ReactNode; sticky?: boolean }) {
    return (
        <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="flex min-w-0 flex-col gap-6">{main}</div>
            <aside className={`flex min-w-0 flex-col gap-6 ${sticky ? 'xl:sticky xl:top-10' : ''}`}>{side}</aside>
        </div>
    );
}

/** Tabs across the top of a Panel, aligned to its 28px inset. */
export function PanelTabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; count?: number }[] }) {
    return (
        <div className="flex items-center gap-7 overflow-x-auto px-7" style={{ borderBottom: '1px solid var(--separator)' }} role="tablist">
            {options.map((o) => {
                const active = o.value === value;
                return (
                    <button key={o.value} type="button" role="tab" aria-selected={active} onClick={() => onChange(o.value)}
                        className="-mb-px flex h-12 shrink-0 items-center gap-2 border-b-2 text-base font-medium transition-colors"
                        style={{ borderColor: active ? 'var(--text-primary)' : 'transparent', color: active ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                        {o.label}
                        {o.count != null && <span className="text-xs text-tertiary tabular-nums">{o.count}</span>}
                    </button>
                );
            })}
        </div>
    );
}

/** A number at a glance, with its context under it. */
export function MetricTile({ label, value, icon, trend, hint, tone, href, aside }: { label: ReactNode; value: ReactNode; icon?: ReactNode; trend?: ReactNode; hint?: ReactNode; tone?: string; href?: string; aside?: ReactNode }) {
    const body = (
        <>
            <div className="flex items-center gap-2 text-sm font-medium text-secondary">
                {icon && <span className="text-tertiary">{icon}</span>}
                {label}
            </div>
            <div className="mt-3 flex items-end gap-2.5">
                <span className="text-3xl font-semibold tracking-tight text-primary tabular-nums" style={tone ? { color: tone } : undefined}>{value}</span>
                {trend && <span className="pb-1">{trend}</span>}
                {aside && <span className="ml-auto shrink-0 pb-1">{aside}</span>}
            </div>
            {hint && <div className="mt-1.5 text-xs text-tertiary">{hint}</div>}
        </>
    );
    return href
        ? <Link href={href} preserveScroll className="v-panel v-card-hover block min-w-0 p-6">{body}</Link>
        : <div className="v-panel min-w-0 p-6">{body}</div>;
}

/** A figure with its label, for summary strips inside a panel. */
export function Figure({ label, value, hint, tone }: { label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: string }) {
    return (
        <div className="min-w-0">
            <div className="text-sm text-secondary">{label}</div>
            <div className="mt-1 text-2xl font-semibold tracking-tight text-primary tabular-nums" style={tone ? { color: tone } : undefined}>{value}</div>
            {hint && <div className="mt-0.5 text-xs text-tertiary">{hint}</div>}
        </div>
    );
}
