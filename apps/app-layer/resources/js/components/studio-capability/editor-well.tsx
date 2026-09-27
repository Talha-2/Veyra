import { useLayoutEffect, useRef, type ReactNode } from 'react';

/**
 * A writing surface for long instructions: a quiet page with a line length a
 * person can read, that grows with its text instead of scrolling inside
 * itself. Prose, not code — so no monospace, and a comfortable measure.
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
}: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    label?: ReactNode;
    max?: number;
    minRows?: number;
    trailing?: ReactNode;
    error?: string;
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
        <div>
            <div
                className="overflow-hidden rounded-md transition-[border-color,box-shadow] duration-150 focus-within:shadow-(--ring)"
                style={{ border: `1px solid ${error ? 'var(--danger-border)' : 'var(--border-strong)'}`, background: 'var(--surface)' }}
            >
                <div className="flex items-center gap-3 px-4 py-2" style={{ background: 'var(--bg-subtle)', borderBottom: '1px solid var(--separator)' }}>
                    {label && <span className="text-sm font-medium text-secondary">{label}</span>}
                    <span className="flex-1" />
                    {trailing}
                    <span className="text-xs text-tertiary tabular-nums">
                        {words.toLocaleString()} {words === 1 ? 'word' : 'words'}
                        <span className="mx-1.5" aria-hidden="true">·</span>
                        <span style={{ color: near ? 'var(--warning)' : undefined }}>
                            {value.length.toLocaleString()}
                            {max != null && ` / ${max.toLocaleString()}`} characters
                        </span>
                    </span>
                </div>
                <textarea
                    ref={ref}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    rows={minRows}
                    maxLength={max}
                    dir="auto"
                    className="block w-full resize-none bg-transparent px-5 py-4 text-md leading-relaxed text-primary outline-none placeholder:text-tertiary"
                    // The ring belongs to the well, not the textarea inside it.
                    style={{ maxWidth: '76ch', minHeight: `${minRows * 1.7}em`, boxShadow: 'none', borderRadius: 0 }}
                />
            </div>
            {error && <p className="mt-1.5 text-sm text-danger">{error}</p>}
        </div>
    );
}
