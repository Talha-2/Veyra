import { Fragment, type ReactNode } from 'react';

import type { Method } from './openapi';

/**
 * The spec's descriptions use a sliver of Markdown: paragraphs, **bold** and
 * `code`. Rendered here as elements — never as HTML — so a description can
 * never inject markup.
 */
function inline(text: string): ReactNode[] {
    return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) return <strong key={i} className="font-semibold text-primary">{part.slice(2, -2)}</strong>;
        if (part.startsWith('`') && part.endsWith('`')) return <code key={i} className="rounded px-1 py-px font-mono text-[0.92em] text-primary" style={{ background: 'var(--surface-sunken)', boxShadow: 'inset 0 0 0 1px var(--border)' }}>{part.slice(1, -1)}</code>;
        return <Fragment key={i}>{part}</Fragment>;
    });
}

export function Prose({ text, className = '' }: { text: string; className?: string }) {
    const paragraphs = text.split(/\n\n+/).filter(Boolean);
    return (
        <div className={`flex max-w-[72ch] flex-col gap-3 text-base leading-relaxed text-secondary ${className}`}>
            {paragraphs.map((p, i) => <p key={i}>{inline(p)}</p>)}
        </div>
    );
}

export function InlineProse({ text }: { text: string }) {
    return <>{inline(text)}</>;
}

const METHOD_TONE: Record<Method, string> = {
    get: 'var(--info)',
    post: 'var(--success)',
    patch: 'var(--warning)',
    put: 'var(--warning)',
    delete: 'var(--danger)',
};

export function MethodBadge({ method, size = 'md' }: { method: Method; size?: 'sm' | 'md' }) {
    const color = METHOD_TONE[method];
    return (
        <span className={`inline-flex shrink-0 items-center justify-center rounded-md font-mono font-semibold tracking-wide uppercase ${size === 'sm' ? 'h-5 w-12 text-2xs' : 'h-6 w-14 text-xs'}`}
            style={{ color, background: `color-mix(in srgb, ${color} 12%, transparent)` }}>
            {method === 'delete' ? 'DEL' : method}
        </span>
    );
}
