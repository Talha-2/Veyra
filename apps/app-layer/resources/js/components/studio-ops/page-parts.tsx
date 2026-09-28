import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

import { type Tone, toneColor } from '../ui/primitives';

/**
 * Page furniture for the roomier Studio pages (DESIGN.md › "Space and
 * scrolling"): sections 48px apart, cards padded 28px, rows 52–60px, figures
 * in one calm strip instead of a wall of tiles.
 */

/** A titled band of a page. Consecutive sections sit 48px apart. */
export function PageSection({ title, description, actions, children, id }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; id?: string }) {
    return (
        <section id={id} className="mt-12 scroll-mt-8 first:mt-0">
            <header className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
                <div className="min-w-0">
                    <h2 className="text-xl font-semibold tracking-tight text-primary">{title}</h2>
                    {description && <p className="mt-1 max-w-[68ch] text-base text-secondary">{description}</p>}
                </div>
                {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
            </header>
            {children}
        </section>
    );
}

/**
 * The figures that change what you do next, in one card. Each cell is a
 * label, the number, and the context that makes the number mean something.
 */
export function StatRow({ items }: { items: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone; icon?: ReactNode }[] }) {
    const cols = items.length >= 4 ? 'sm:grid-cols-2 xl:grid-cols-4' : items.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2';

    return (
        <div className={`v-panel grid overflow-hidden ${cols}`}>
            {items.map((s) => (
                <div key={s.label} className="-mt-px -ml-px border-t border-l px-7 py-6" style={{ borderColor: 'var(--separator)' }}>
                    <div className="flex items-center gap-2 text-sm font-medium text-secondary">
                        {s.icon && <span className="text-tertiary">{s.icon}</span>}
                        {s.label}
                    </div>
                    <div className="mt-2 text-3xl font-semibold tracking-tight tabular-nums" style={{ color: s.tone ? toneColor(s.tone) : 'var(--text-primary)' }}>{s.value}</div>
                    {s.hint && <div className="mt-1 text-sm text-tertiary">{s.hint}</div>}
                </div>
            ))}
        </div>
    );
}

/** A quiet, one-line empty state for a section that has nothing yet, so it does not take a whole screen. */
export function InlineEmpty({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
    return (
        <div className="v-panel flex flex-col gap-4 px-7 py-6 sm:flex-row sm:items-center">
            {icon && (
                <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] text-tertiary" style={{ background: 'var(--surface-sunken)' }}>
                    {icon}
                </span>
            )}
            <div className="min-w-0 flex-1">
                <p className="text-md font-semibold text-primary">{title}</p>
                {children && <p className="mt-0.5 max-w-[68ch] text-sm text-secondary">{children}</p>}
            </div>
            {action && <div className="shrink-0">{action}</div>}
        </div>
    );
}

/** Reference material that is useful once and noise after: closed until asked for. */
export function Disclosure({ summary, children, icon, defaultOpen = false }: { summary: ReactNode; children: ReactNode; icon?: ReactNode; defaultOpen?: boolean }) {
    return (
        <details className="group v-panel" open={defaultOpen}>
            <summary className="flex cursor-pointer list-none items-center gap-2.5 rounded-lg px-6 py-4 text-base font-medium text-primary transition-colors select-none hover:bg-surface-hover [&::-webkit-details-marker]:hidden">
                <ChevronRight size={15} strokeWidth={2} className="shrink-0 text-tertiary transition-transform group-open:rotate-90" />
                {icon && <span className="text-tertiary">{icon}</span>}
                {summary}
            </summary>
            <div className="px-6 pt-1 pb-6">{children}</div>
        </details>
    );
}

/**
 * A settings group, System Settings style: a card with a title, and rows of
 * label-left / control-right separated by hairlines.
 */
export function SettingsGroup({ title, description, aside, children, flush = false }: { title?: ReactNode; description?: ReactNode; aside?: ReactNode; children: ReactNode; flush?: boolean }) {
    return (
        <section className="v-panel mb-6">
            {title && (
                <header className="flex items-start justify-between gap-4 px-7 pt-6 pb-1">
                    <div className="min-w-0">
                        <h2 className="text-md font-semibold text-primary">{title}</h2>
                        {description && <p className="mt-1 max-w-[62ch] text-sm text-secondary">{description}</p>}
                    </div>
                    {aside && <div className="flex shrink-0 items-center gap-2">{aside}</div>}
                </header>
            )}
            <div className={flush ? 'pt-3' : `px-7 pb-3 ${title ? 'pt-2' : 'pt-3'}`}>{children}</div>
        </section>
    );
}

/** One setting: label and its consequence on the left, the control on the right. Stacks on a phone. */
export function SettingRow({ label, hint, error, children, htmlFor }: { label: string; hint?: ReactNode; error?: string; children: ReactNode; htmlFor?: string }) {
    return (
        <div className="grid gap-x-10 gap-y-2.5 border-t py-5 first:border-t-0 md:grid-cols-[minmax(0,240px)_minmax(0,1fr)] md:items-start" style={{ borderColor: 'var(--separator)' }}>
            <div className="md:pt-2">
                <label htmlFor={htmlFor} className="text-base font-medium text-primary">{label}</label>
                {hint && <p className="mt-1 text-sm text-secondary">{hint}</p>}
            </div>
            <div className="min-w-0">
                {children}
                {error && <p className="mt-2 text-sm text-danger">{error}</p>}
            </div>
        </div>
    );
}

/** A card's title row, padded to the roomier rhythm (28px sides). */
export function PanelHeader({ title, description, actions, icon, border = true }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; icon?: ReactNode; border?: boolean }) {
    return (
        <header className={`flex items-start gap-3.5 px-7 pt-6 ${border ? 'pb-5' : 'pb-2'}`} style={border ? { borderBottom: '1px solid var(--separator)' } : undefined}>
            {icon}
            <div className="min-w-0 flex-1">
                <h2 className="text-md font-semibold text-primary">{title}</h2>
                {description && <p className="mt-1 max-w-[68ch] text-sm text-secondary">{description}</p>}
            </div>
            {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
    );
}

/** A dialog's footer: optional things on the left, Cancel and the action on the right. */
export function DialogActions({ children, start }: { children: ReactNode; start?: ReactNode }) {
    return (
        <div className="mt-8 flex flex-wrap items-center gap-2">
            {start}
            <div className="flex-1" />
            {children}
        </div>
    );
}
