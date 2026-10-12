import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * A popover menu anchored to its trigger. Closes on outside click and Escape.
 */
export function Menu({ trigger, children, align = 'left', side = 'bottom', width = 260, escapeContainer = false }: { trigger: (open: boolean, toggle: () => void) => ReactNode; children: (close: () => void) => ReactNode; align?: 'left' | 'right'; side?: 'top' | 'bottom'; width?: number; escapeContainer?: boolean }) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const [anchor, setAnchor] = useState<{ left: number; top: number }>({ left: 0, top: 0 });

    useLayoutEffect(() => {
        if (!open || !escapeContainer) return;
        const position = () => {
            const rect = ref.current?.getBoundingClientRect();
            if (!rect) return;
            setAnchor({ left: Math.max(8, Math.min(align === 'left' ? rect.left : rect.right - width, window.innerWidth - width - 8)), top: side === 'bottom' ? rect.bottom + 6 : rect.top - 6 });
        };
        position();
        menuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
        window.addEventListener('resize', position);
        window.addEventListener('scroll', position, true);
        return () => { window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true); };
    }, [open, escapeContainer, align, side, width]);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node) && !menuRef.current?.contains(e.target as Node)) setOpen(false); };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); ref.current?.querySelector('button')?.focus(); } };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
    }, [open]);

    const menu = open ? <div ref={menuRef} role="menu" onKeyDown={event => {
        if (!escapeContainer) return;
        if (event.key === 'Tab') { event.preventDefault(); setOpen(false); ref.current?.querySelector('button')?.focus(); }
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
            const index = items.indexOf(document.activeElement as HTMLButtonElement);
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
            items[next]?.focus();
        }
    }} className={`v-glass z-[120] animate-pop overflow-auto rounded-xl p-1.5 ${escapeContainer ? 'fixed' : 'absolute'}`}
        style={escapeContainer ? { width: `min(${width}px, calc(100vw - 16px))`, left: anchor.left, top: anchor.top, translate: side === 'top' ? '0 -100%' : undefined, maxHeight: side === 'top' ? Math.max(120, anchor.top - 8) : `calc(100vh - ${anchor.top + 8}px)`, border: '1px solid var(--border)', boxShadow: 'var(--shadow-overlay)' } : { width, [align]: 0, [side === 'bottom' ? 'top' : 'bottom']: 'calc(100% + 6px)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-overlay)' }}>
        {children(() => setOpen(false))}
    </div> : null;

    return (
        <div ref={ref} className="relative">
            {trigger(open, () => setOpen((v) => !v))}
            {escapeContainer && menu ? createPortal(menu, document.body) : menu}
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
