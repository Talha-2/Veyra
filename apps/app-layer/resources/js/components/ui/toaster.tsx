import { router, usePage } from '@inertiajs/react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { SharedProps } from '../../types';

/**
 * Flash messages as toasts.
 *
 * Every controller already says what happened (`->with('success', …)`);
 * until this existed nothing rendered it, so a save looked identical to a
 * save that failed. Listens to each Inertia visit's flash and to
 * `veyra:toast` events for client-side messages.
 */
type Kind = 'success' | 'error' | 'warning' | 'info';
interface Toast { id: number; kind: Kind; text: string }

const ICONS = { success: CheckCircle2, error: XCircle, warning: AlertTriangle, info: Info };
const COLORS: Record<Kind, string> = { success: 'var(--success-fill)', error: 'var(--danger-fill)', warning: 'var(--warning-fill)', info: 'var(--info-fill)' };

export function toast(text: string, kind: Kind = 'success') {
    window.dispatchEvent(new CustomEvent('veyra:toast', { detail: { text, kind } }));
}

export default function Toaster() {
    const { flash } = usePage<SharedProps>().props;
    const [toasts, setToasts] = useState<Toast[]>([]);
    const next = useRef(1);

    const push = useCallback((text: string, kind: Kind) => {
        const id = next.current++;
        setToasts((t) => [...t.filter((x) => x.text !== text).slice(-2), { id, kind, text }]);
        window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 7000 : 4200);
    }, []);

    const fromFlash = useCallback((f: SharedProps['flash'] | undefined) => {
        if (!f) return;
        if (f.success) push(f.success, 'success');
        if (f.warning) push(f.warning, 'warning');
        if (f.error) push(f.error, 'error');
    }, [push]);

    // The first page load's flash.
    useEffect(() => { fromFlash(flash); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        const off = router.on('success', (event) => fromFlash((event.detail.page.props as unknown as SharedProps).flash));
        const onCustom = (e: Event) => { const d = (e as CustomEvent).detail; push(d.text, d.kind ?? 'success'); };
        window.addEventListener('veyra:toast', onCustom);
        // Validation errors: say that something needs fixing, once.
        const offErr = router.on('error', () => push('Some fields need attention.', 'warning'));
        return () => { off(); offErr(); window.removeEventListener('veyra:toast', onCustom); };
    }, [fromFlash, push]);

    return (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-[200] flex w-full max-w-[440px] -translate-x-1/2 flex-col items-center gap-2 px-4" aria-live="polite">
            {toasts.map((t) => {
                const Icon = ICONS[t.kind];
                return (
                    <div key={t.id} role={t.kind === 'error' ? 'alert' : 'status'} className="v-glass pointer-events-auto flex w-full animate-pop items-start gap-3 rounded-2xl py-3 pr-2.5 pl-4" style={{ border: '1px solid var(--border)', boxShadow: 'var(--shadow-overlay)' }}>
                        <Icon size={17} strokeWidth={2.2} className="mt-px shrink-0" style={{ color: COLORS[t.kind] }} />
                        <p className="min-w-0 flex-1 text-sm font-medium text-primary">{t.text}</p>
                        <button type="button" aria-label="Dismiss" onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))} className="flex size-6 shrink-0 items-center justify-center rounded-full text-tertiary hover:text-primary">
                            <X size={13} strokeWidth={2.2} />
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
