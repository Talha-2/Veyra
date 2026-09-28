import { useLayoutEffect, useRef, type ReactNode } from 'react';

/**
 * A writing surface for long text — skill instructions, expert prompts, an
 * automation's goal, a persona, a memory. It takes the full width of its
 * column, sets 15px text at 1.6, and grows with its text instead of
 * scrolling inside itself (the page is the one scroll). The word and
 * character count sits underneath, out of the way of the writing.
 */
export function EditorWell({
    value,
    onChange,
    placeholder,
    label,
    max,
    minRows = 10,
    trailing,
    error,
    id,
    autoFocus,
    onKeyDown,
    mono = false,
}: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    /** The accessible name when no visible <label> points at `id`. */
    label?: string;
    max?: number;
    minRows?: number;
    /** Extra detail on the left of the counter row, e.g. a token estimate. */
    trailing?: ReactNode;
    error?: string;
    id?: string;
    autoFocus?: boolean;
    onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
    mono?: boolean;
}) {
    const ref = useRef<HTMLTextAreaElement>(null);

    // Grow to fit: reset, then take the scroll height.
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight + 2}px`;
    }, [value]);

    const words = value.trim() ? value.trim().split(/\s+/).length : 0;
    const near = max != null && value.length > max * 0.9;

    return (
        <div className="min-w-0">
            <textarea
                ref={ref}
                id={id}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={placeholder}
                rows={minRows}
                maxLength={max}
                dir="auto"
                aria-label={id ? undefined : label}
                autoFocus={autoFocus}
                className={`v-field block w-full resize-none overflow-hidden px-5 py-4 text-md leading-[1.6] ${mono ? 'font-mono text-sm' : ''}`}
                style={{ minHeight: `calc(${minRows} * 1.6em + 34px)`, borderColor: error ? 'var(--danger-border)' : undefined }}
            />
            <div className="mt-2 flex items-center justify-between gap-4 text-xs text-tertiary tabular-nums">
                <span className="min-w-0 truncate">{error ? <span className="text-sm text-danger">{error}</span> : trailing}</span>
                <span className="shrink-0">
                    {words.toLocaleString()} {words === 1 ? 'word' : 'words'}
                    <span className="mx-1.5" aria-hidden="true">·</span>
                    <span style={{ color: near ? 'var(--warning)' : undefined }}>
                        {value.length.toLocaleString()}
                        {max != null && ` / ${max.toLocaleString()}`} characters
                    </span>
                </span>
            </div>
        </div>
    );
}
