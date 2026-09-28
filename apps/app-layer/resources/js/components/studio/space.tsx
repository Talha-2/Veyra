import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Studio's roomy layout vocabulary (DESIGN.md › "Space and scrolling").
 *
 * `studio/form` holds the controls; this file holds the space around them:
 * 48px between page sections, 24px between cards, 28px inside a card, 20px
 * between fields, labels above fields, and two columns only when the main
 * column can still be at least 640px wide.
 */

/** The page body under a PageHeader: 40px below the header, 48px between sections. */
export function PageStack({ children, className = '' }: { children: ReactNode; className?: string }) {
    return <div className={`flex flex-col gap-12 pt-3 ${className}`}>{children}</div>;
}

/**
 * A page section drawn as one card: title row, then a body with 28px of
 * padding and 20px between fields. `flush` hands the body edge to edge to a
 * list or table.
 */
export function Panel({
    id,
    title,
    description,
    aside,
    children,
    flush = false,
    className = '',
    tone,
}: {
    id?: string;
    title?: ReactNode;
    description?: ReactNode;
    aside?: ReactNode;
    children: ReactNode;
    flush?: boolean;
    className?: string;
    tone?: 'danger';
}) {
    return (
        <section id={id} className={`v-panel scroll-mt-10 ${className}`} style={tone === 'danger' ? { borderColor: 'var(--danger-border)' } : undefined}>
            {title && (
                <header className={`flex items-start justify-between gap-6 px-7 pt-7 ${flush ? 'pb-5' : 'pb-6'}`}>
                    <div className="min-w-0">
                        <h2 className="text-lg font-semibold tracking-tight text-primary">{title}</h2>
                        {description && <p className="mt-1.5 max-w-[64ch] text-sm text-secondary">{description}</p>}
                    </div>
                    {aside && <div className="flex shrink-0 items-center gap-2 pt-0.5">{aside}</div>}
                </header>
            )}
            <div className={flush ? '' : `flex flex-col gap-5 px-7 pb-7 ${title ? '' : 'pt-7'}`}>{children}</div>
        </section>
    );
}

/** A section whose heading sits on the canvas, above the card(s) it introduces. */
export function Group({ id, title, description, aside, children }: { id?: string; title: ReactNode; description?: ReactNode; aside?: ReactNode; children: ReactNode }) {
    return (
        <section id={id} className="scroll-mt-10">
            <header className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
                <div className="min-w-0">
                    <h2 className="text-lg font-semibold tracking-tight text-primary">{title}</h2>
                    {description && <p className="mt-1 max-w-[68ch] text-sm text-secondary">{description}</p>}
                </div>
                {aside && <div className="flex shrink-0 items-center gap-2.5">{aside}</div>}
            </header>
            {children}
        </section>
    );
}

/**
 * One field, label above. The hint sits under the label, so it is read
 * before typing — use it only when it prevents a mistake.
 */
export function Stacked({ label, hint, error, htmlFor, children, aside }: { label: ReactNode; hint?: ReactNode; error?: string; htmlFor?: string; children: ReactNode; aside?: ReactNode }) {
    return (
        <div className="min-w-0">
            <div className="mb-2 flex items-baseline justify-between gap-4">
                <label htmlFor={htmlFor} className="text-sm font-medium text-primary">{label}</label>
                {aside}
            </div>
            {hint && <p className="-mt-1 mb-2.5 max-w-[68ch] text-sm text-secondary">{hint}</p>}
            {children}
            {error && <p className="mt-1.5 text-sm text-danger">{error}</p>}
        </div>
    );
}

/**
 * Settings that most people never need, folded away. Closed by default; the
 * summary says what is inside so nobody has to open it to find out.
 */
export function Disclosure({ title, summary, children, defaultOpen = false, inset = false }: { title: ReactNode; summary?: ReactNode; children: ReactNode; defaultOpen?: boolean; inset?: boolean }) {
    return (
        <details open={defaultOpen} className={`group ${inset ? '' : 'v-panel'}`}>
            <summary className={`flex cursor-pointer list-none items-center gap-3 rounded-lg transition-colors hover:bg-surface-hover [&::-webkit-details-marker]:hidden ${inset ? '-mx-3 px-3 py-2.5' : 'px-7 py-5'}`}>
                <ChevronRight size={16} strokeWidth={2} className="shrink-0 text-tertiary transition-transform duration-200 group-open:rotate-90" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                    <span className={`block font-semibold text-primary ${inset ? 'text-base' : 'text-md'}`}>{title}</span>
                    {summary && <span className="mt-0.5 block text-sm text-secondary">{summary}</span>}
                </span>
            </summary>
            <div className={`flex flex-col gap-5 ${inset ? 'pt-4' : 'px-7 pt-2 pb-7'}`}>{children}</div>
        </details>
    );
}

/**
 * The editor-with-inspector layout. The side panel (360px) moves beside the
 * main column only when the content area is wide enough to keep the main
 * column at 640px or more; below that it stacks underneath. Measured on the
 * content column itself (a container query), not the window, because the
 * sidebar takes its share first.
 */
export function WithSide({ children, side, sticky = false }: { children: ReactNode; side: ReactNode; sticky?: boolean }) {
    return (
        <div className="@container">
            <div className="grid items-start gap-12 @min-[1040px]:grid-cols-[minmax(0,1fr)_360px] @min-[1040px]:gap-8">
                <div className="flex min-w-0 flex-col gap-12">{children}</div>
                <aside className={`flex min-w-0 flex-col gap-6 ${sticky ? '@min-[1040px]:sticky @min-[1040px]:top-10' : ''}`}>{side}</aside>
            </div>
        </div>
    );
}

/** A labelled row inside a side panel card: text left, value right. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex min-h-10 items-center justify-between gap-4 border-t py-2.5 text-sm first:border-t-0 first:pt-0 last:pb-0" style={{ borderColor: 'var(--separator)' }}>
            <span className="text-tertiary">{label}</span>
            <span className="min-w-0 text-right text-primary">{children}</span>
        </div>
    );
}

/** A side panel card: 24px padding, a plain title. */
export function SideCard({ title, aside, children, tone }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; tone?: 'danger' }) {
    return (
        <section className="v-panel p-6" style={tone === 'danger' ? { borderColor: 'var(--danger-border)' } : undefined}>
            {title && (
                <header className="mb-4 flex items-center justify-between gap-3">
                    <h2 className="text-md font-semibold text-primary">{title}</h2>
                    {aside}
                </header>
            )}
            {/* Wrapped, so the first row of the body is a first child and draws no divider under the title. */}
            <div>{children}</div>
        </section>
    );
}
