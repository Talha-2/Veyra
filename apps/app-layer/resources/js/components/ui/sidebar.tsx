import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** A task sidebar with native focus trapping and an inert background. */
export default function Sidebar({ open, onClose, title, description, children, width = 620 }: {
    open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; width?: number;
}) {
    const dialog = useRef<HTMLDialogElement>(null);
    const titleId = useId();
    const descriptionId = useId();
    useEffect(() => {
        if (!open || !dialog.current) return;
        const element = dialog.current;
        const previousFocus = document.activeElement as HTMLElement | null;
        const overflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        element.showModal();
        return () => {
            element.close();
            document.body.style.overflow = overflow;
            if (previousFocus?.isConnected) previousFocus.focus();
        };
    }, [open]);
    if (!open) return null;
    return createPortal(<dialog ref={dialog} aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined}
        className="v-task-sidebar" style={{ width: `min(100vw, ${width}px)` }}
        onCancel={event => { event.preventDefault(); onClose(); }}
        onKeyDown={event => {
            if (event.key !== 'Tab') return;
            const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]'))
                .filter(element => !element.matches(':disabled') && element.tabIndex >= 0 && element.getClientRects().length > 0);
            const first = controls[0];
            const last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }}>
        <div className="flex h-full min-h-0 flex-col">
            <header className="flex shrink-0 items-start gap-4 border-b border-border px-6 py-5 sm:px-8">
                <div className="min-w-0 flex-1"><h2 id={titleId} className="text-xl font-semibold text-primary">{title}</h2>{description && <p id={descriptionId} className="mt-2 text-sm text-secondary">{description}</p>}</div>
                <button type="button" onClick={onClose} aria-label="Close sidebar" className="v-btn v-btn--ghost size-10 shrink-0 p-0"><X size={20} /></button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-6 sm:px-8">{children}</div>
        </div>
    </dialog>, document.body);
}
