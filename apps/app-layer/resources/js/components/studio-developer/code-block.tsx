import { useSyncExternalStore, type ReactNode } from 'react';

import { CopyButton } from '../ui/kit';

/**
 * Code, copyable, in a bounded well — one of the few regions allowed its own
 * scroll. Tabs switch language for every block on the page at once, and the
 * choice is remembered: someone writing Python wants Python everywhere.
 */

const STORAGE = 'veyra-dev-lang';
const listeners = new Set<() => void>();
let current: string | null = null;

function read(fallback: string): string {
    if (current) return current;
    try {
        current = localStorage.getItem(STORAGE);
    } catch {
        current = null;
    }
    return current ?? fallback;
}

export function usePreferredLang(fallback: string): [string, (v: string) => void] {
    const value = useSyncExternalStore(
        (cb) => {
            listeners.add(cb);
            return () => listeners.delete(cb);
        },
        () => read(fallback),
        () => fallback,
    );
    const set = (v: string) => {
        current = v;
        try {
            localStorage.setItem(STORAGE, v);
        } catch {
            /* private mode: remember for this page only */
        }
        listeners.forEach((l) => l());
    };
    return [value, set];
}

export function CodeBlock({ code, title, maxHeight = 420 }: { code: string; title?: ReactNode; maxHeight?: number }) {
    return (
        <div className="overflow-hidden rounded-md" style={{ background: 'var(--surface-sunken)', boxShadow: 'inset 0 0 0 1px var(--border)' }}>
            <div className="flex min-h-11 items-center justify-between gap-3 py-1.5 pr-2 pl-4" style={{ borderBottom: '1px solid var(--border)' }}>
                <div className="min-w-0 text-xs font-medium text-secondary">{title}</div>
                <CopyButton value={code} />
            </div>
            <pre className="overflow-auto px-4 py-3.5 font-mono text-sm leading-relaxed text-primary" style={{ maxHeight, background: 'none', border: 'none', margin: 0 }}>
                <code style={{ background: 'none', border: 'none', padding: 0 }}>{code}</code>
            </pre>
        </div>
    );
}

/** Several versions of one sample, one visible. */
export function CodeTabs({ samples, fallback, maxHeight }: { samples: { value: string; label: string; code: string }[]; fallback?: string; maxHeight?: number }) {
    const [lang, setLang] = usePreferredLang(fallback ?? samples[0].value);
    const active = samples.find((s) => s.value === lang) ?? samples[0];

    return (
        <CodeBlock
            maxHeight={maxHeight}
            code={active.code}
            title={
                <div className="flex items-center gap-1" role="tablist" aria-label="Language">
                    {samples.map((s) => {
                        const on = s.value === active.value;
                        return (
                            <button key={s.value} type="button" role="tab" aria-selected={on} onClick={() => setLang(s.value)}
                                className="h-7 rounded-full px-3 text-xs font-medium transition-colors"
                                style={on ? { background: 'var(--surface)', color: 'var(--text-primary)', boxShadow: 'var(--shadow-card), inset 0 0 0 1px var(--border)' } : { color: 'var(--text-secondary)' }}>
                                {s.label}
                            </button>
                        );
                    })}
                </div>
            }
        />
    );
}

export const pretty = (v: unknown) => JSON.stringify(v, null, 2);
