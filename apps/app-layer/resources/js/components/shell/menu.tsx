import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * A popover menu anchored to its trigger. Closes on outside click and Escape.
 */
export function Menu({ trigger, children, align = 'left', side = 'bottom', width = 260 }: { trigger: (open: boolean, toggle: () => void) => ReactNode; children: (close: () => void) => ReactNode; align?: 'left' | 'right'; side?: 'top' | 'bottom'; width?: number }) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
    }, [open]);

    return (
        <div ref={ref} className="relative">
            {trigger(open, () => setOpen((v) => !v))}
            {open && (
                <div role="menu" className="v-glass absolute z-[120] animate-pop overflow-hidden rounded-xl p-1.5"
                    style={{ width, [align]: 0, [side === 'bottom' ? 'top' : 'bottom']: 'calc(100% + 6px)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-overlay)' }}>
                    {children(() => setOpen(false))}
                </div>
            )}
        </div>
    );
}

export function MenuItem({ children, onSelect, icon, active = false, danger = false, trailing }: { children: ReactNode; onSelect: () => void; icon?: ReactNode; active?: boolean; danger?: boolean; trailing?: ReactNode }) {
    return (
        <button type="button" role="menuitem" onClick={onSelect}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-surface-hover"
            style={{ color: danger ? 'var(--danger)' : 'var(--text-primary)', background: active ? 'var(--surface-active)' : undefined }}>
            {icon && <span className="flex w-4 shrink-0 justify-center text-secondary">{icon}</span>}
            <span className="min-w-0 flex-1 truncate">{children}</span>
            {trailing}
        </button>
    );
}

export function MenuLabel({ children }: { children: ReactNode }) {
    return <div className="v-eyebrow px-2.5 pt-2 pb-1">{children}</div>;
}

export function MenuSeparator() {
    return <div className="mx-1 my-1.5 h-px" style={{ background: 'var(--separator)' }} />;
}
