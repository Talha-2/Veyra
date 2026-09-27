import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * A modal sheet. Portalled to body so it escapes every overflow-hidden pane.
 */
export default function Dialog({
    open,
    onClose,
    title,
    description,
    children,
    width = 520,
}: {
    open: boolean;
    onClose: () => void;
    title: string;
    description?: string;
    children: ReactNode;
    width?: number;
}) {
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
        document.addEventListener('keydown', onKey);
        const overflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = overflow;
        };
    }, [open, onClose]);

    if (!open) return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[100] flex animate-fade-in items-start justify-center overflow-y-auto px-4 py-[8vh]"
            style={{ background: 'rgba(0, 0, 0, 0.28)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)' }}
            onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label={title}
                className="w-full animate-pop rounded-[var(--radius-xl)]"
                style={{ maxWidth: width, background: 'var(--surface-raised)', boxShadow: 'var(--shadow-overlay)' }}
            >
                <header className="flex items-start gap-3 px-6 pt-5 pb-1">
                    <div className="min-w-0 flex-1">
                        <h2 className="text-lg font-semibold tracking-tight text-primary">{title}</h2>
                        {description && <p className="mt-1 text-sm text-secondary">{description}</p>}
                    </div>
                    <button type="button" onClick={onClose} aria-label="Close" className="-mr-1.5 flex size-7 items-center justify-center rounded-full text-tertiary transition-colors hover:text-primary" style={{ background: 'var(--surface-sunken)' }}>
                        <X size={14} strokeWidth={2.2} />
                    </button>
                </header>
                <div className="px-6 pt-4 pb-6">{children}</div>
            </div>
        </div>,
        document.body,
    );
}
