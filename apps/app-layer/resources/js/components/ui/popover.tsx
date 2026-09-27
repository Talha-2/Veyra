import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * A small anchored menu, portalled.
 *
 * Required rather than nice-to-have: every inbox pane is an overflow container,
 * and a plain absolutely-positioned menu gets clipped by whichever one it is
 * inside. Position is computed from the trigger's rect at open time.
 */
export default function Popover({
    trigger,
    children,
    align = 'start',
    width = 220,
}: {
    trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
    children: (close: () => void) => ReactNode;
    align?: 'start' | 'end';
    width?: number;
}) {
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
    const anchor = useRef<HTMLDivElement>(null);
    const panel = useRef<HTMLDivElement>(null);

    const toggle = () => {
        if (!open && anchor.current) {
            const r = anchor.current.getBoundingClientRect();
            const left = align === 'end' ? Math.max(8, r.right - width) : Math.min(r.left, window.innerWidth - width - 8);
            setPos({ top: r.bottom + 6, left });
        }
        setOpen((v) => !v);
    };

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            const t = e.target as Node;
            if (!anchor.current?.contains(t) && !panel.current?.contains(t)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    return (
        <>
            <div ref={anchor} className="inline-flex">{trigger({ open, toggle })}</div>
            {open && pos && createPortal(
                <div
                    ref={panel}
                    role="menu"
                    className="v-panel fixed z-[90] overflow-hidden"
                    style={{ top: pos.top, left: pos.left, width, background: 'var(--surface-raised)' }}
                >
                    {children(() => setOpen(false))}
                </div>,
                document.body,
            )}
        </>
    );
}

export function MenuItem({ onClick, children, danger = false }: { onClick: () => void; children: ReactNode; danger?: boolean }) {
    return (
        <button
            type="button"
            role="menuitem"
            onClick={onClick}
            className="flex w-full items-center gap-2 border-b px-3 py-2 text-left text-[13px] transition-colors last:border-b-0"
            style={{ borderColor: 'var(--border)', color: danger ? 'var(--danger)' : 'var(--text-primary)' }}
        >
            {children}
        </button>
    );
}
