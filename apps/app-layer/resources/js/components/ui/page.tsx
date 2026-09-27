import { Link, router } from '@inertiajs/react';
import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';

import { Eyebrow } from './primitives';

/**
 * Page furniture for list and detail screens, shared by Desk and Studio so
 * moving between them feels like one company made both.
 */
export function PageHeader({
    eyebrow,
    title,
    description,
    actions,
    back,
    meta,
}: {
    eyebrow?: ReactNode;
    title: ReactNode;
    description?: ReactNode;
    actions?: ReactNode;
    back?: { href: string; label: string };
    meta?: ReactNode;
}) {
    return (
        <header className="mb-7 animate-rise">
            {back && (
                <Link href={back.href} className="mb-3 -ml-1 inline-flex items-center gap-0.5 rounded-md px-1 text-sm text-secondary transition-colors hover:text-primary">
                    <ChevronLeft size={15} strokeWidth={2} />
                    {back.label}
                </Link>
            )}
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
                <div className="min-w-0">
                    {eyebrow && <Eyebrow className="mb-1.5 block">{eyebrow}</Eyebrow>}
                    <h1 className="text-3xl font-semibold tracking-tight text-primary">{title}</h1>
                    {description && <p className="mt-1.5 max-w-[68ch] text-base text-secondary">{description}</p>}
                    {meta && <div className="mt-2.5 flex flex-wrap items-center gap-2">{meta}</div>}
                </div>
                {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
            </div>
        </header>
    );
}

/**
 * A segmented control — the Apple one: a sunken track with a raised thumb.
 * Link-driven, so the choice lives in the URL.
 */
export function Segmented({
    options,
    current,
    hrefFor,
    className = 'mb-4',
}: {
    options: { key: string; label: string; count?: number }[];
    current: string;
    hrefFor: (key: string) => string;
    className?: string;
}) {
    return (
        <div className={`inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-[10px] p-[3px] ${className}`} style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
            {options.map((option) => {
                const active = option.key === current;

                return (
                    <Link
                        key={option.key}
                        href={hrefFor(option.key)}
                        preserveState
                        preserveScroll
                        aria-current={active ? 'page' : undefined}
                        className="flex h-7 shrink-0 items-center gap-1.5 rounded-[8px] px-3 text-sm font-medium whitespace-nowrap transition-all"
                        style={{
                            background: active ? 'var(--surface-raised)' : 'transparent',
                            color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                            boxShadow: active ? 'var(--shadow-card)' : 'none',
                        }}
                    >
                        {option.label}
                        {option.count != null && option.count > 0 && (
                            <span className="text-2xs tabular-nums" style={{ color: active ? 'var(--text-secondary)' : 'var(--text-tertiary)' }}>
                                {option.count}
                            </span>
                        )}
                    </Link>
                );
            })}
        </div>
    );
}

export function Table({ head, children }: { head: ReactNode; children: ReactNode }) {
    return (
        // overflow-x-auto, not hidden: a wide table scrolls sideways inside the
        // card rather than losing its last column under the edge.
        <div className="v-panel overflow-x-auto">
            <table className="w-full border-collapse text-left">
                <thead>
                    <tr style={{ borderBottom: '1px solid var(--separator)' }}>{head}</tr>
                </thead>
                <tbody>{children}</tbody>
            </table>
        </div>
    );
}

export function Th({ children, align = 'left' }: { children?: ReactNode; align?: 'left' | 'right' }) {
    return (
        <th scope="col" className="h-10 px-4 text-xs font-medium whitespace-nowrap text-tertiary first:pl-5 last:pr-5" style={{ textAlign: align }}>
            {children}
        </th>
    );
}

export function Td({ children, align = 'left', muted = false }: { children?: ReactNode; align?: 'left' | 'right'; muted?: boolean }) {
    return (
        <td className="px-4 py-3 text-sm first:pl-5 last:pr-5" style={{ textAlign: align, color: muted ? 'var(--text-secondary)' : 'var(--text-primary)' }}>
            {children}
        </td>
    );
}

export function Row({ children, href }: { children: ReactNode; href?: string }) {
    const style = { borderTop: '1px solid var(--separator)' };

    if (!href) {
        return (
            <tr className="transition-colors first:border-t-0 hover:bg-surface-hover" style={style}>
                {children}
            </tr>
        );
    }

    // A row cannot hold an anchor that wraps its cells, so the whole row
    // navigates. Keyboard users get there through the link in the first cell.
    return (
        <tr
            className="cursor-pointer transition-colors hover:bg-surface-hover"
            style={style}
            onClick={(e) => {
                if ((e.target as HTMLElement).closest('a,button,input,select,label')) return;
                router.visit(href);
            }}
        >
            {children}
        </tr>
    );
}
