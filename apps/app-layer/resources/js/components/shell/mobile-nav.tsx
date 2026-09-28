import { router } from '@inertiajs/react';
import { Menu as MenuIcon, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import Sidebar, { VeyraMark } from './sidebar';

/**
 * Below tablet width the sidebar would take a third of the screen and push
 * every page sideways. It becomes a drawer instead, opened from a slim top
 * bar; it closes on navigation, on Escape and on a tap outside.
 */
export default function MobileNav({ product }: { product: 'studio' | 'desk' }) {
    const [open, setOpen] = useState(false);

    useEffect(() => router.on('navigate', () => setOpen(false)), []);
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
        document.addEventListener('keydown', onKey);
        const overflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; };
    }, [open]);

    return (
        <>
            <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-bg/90 px-4 backdrop-blur md:hidden">
                <button type="button" onClick={() => setOpen(true)} aria-label="Open navigation" className="flex size-9 items-center justify-center rounded-sm text-primary hover:bg-surface-hover">
                    <MenuIcon size={20} />
                </button>
                <VeyraMark size={24} />
                <span className="text-sm font-semibold text-primary">Veyra {product === 'studio' ? 'Studio' : 'Desk'}</span>
            </div>
            {open && (
                <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
                    <button type="button" aria-label="Close navigation" className="absolute inset-0 bg-black/40 animate-fade-in" onClick={() => setOpen(false)} />
                    <div className="absolute inset-y-0 left-0 flex animate-rise shadow-overlay">
                        <Sidebar product={product} />
                        <button type="button" onClick={() => setOpen(false)} aria-label="Close navigation" className="absolute top-3 -right-12 flex size-9 items-center justify-center rounded-full bg-surface text-primary shadow-raised">
                            <X size={18} />
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
