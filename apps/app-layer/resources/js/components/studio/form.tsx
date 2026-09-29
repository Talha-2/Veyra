import type { ReactNode } from 'react';

import { COMING_SOON, ComingSoon } from '../ui/coming-soon';
import { Switch } from '../ui/kit';

/**
 * Studio's form vocabulary.
 *
 * Most of what Studio offers is a setting with a consequence, so every
 * setting carries its consequence next to it — `hint` is where the trade-off
 * gets stated, not decoration.
 */

/** A settings group: a card with a title row and a body. */
export function Section({
    title,
    description,
    children,
    aside,
    flush = false,
    id,
}: {
    title: ReactNode;
    description?: ReactNode;
    children: ReactNode;
    aside?: ReactNode;
    flush?: boolean;
    id?: string;
}) {
    return (
        <section id={id} className="v-panel mb-5 scroll-mt-6">
            <header className="flex items-start justify-between gap-4 px-6 pt-5 pb-4">
                <div className="min-w-0">
                    <h2 className="text-md font-semibold text-primary">{title}</h2>
                    {description && <p className="mt-1 max-w-[68ch] text-sm text-secondary">{description}</p>}
                </div>
                {aside && <div className="flex shrink-0 items-center gap-2">{aside}</div>}
            </header>
            <div className={flush ? '' : 'px-6 pb-6'}>{children}</div>
        </section>
    );
}

/**
 * One setting. Stacked by default; `inline` puts the label and its hint in a
 * left column and the control on the right — the System Settings layout.
 */
export function Field({
    label,
    hint,
    error,
    children,
    inline = false,
}: {
    label: string;
    hint?: ReactNode;
    error?: string;
    children: ReactNode;
    inline?: boolean;
}) {
    if (inline) {
        return (
            <div className="grid gap-x-8 gap-y-2 border-t py-4 first:border-t-0 first:pt-0 last:pb-0 md:grid-cols-[minmax(180px,260px)_1fr]" style={{ borderColor: 'var(--separator)' }}>
                <div>
                    <label className="text-base font-medium text-primary">{label}</label>
                    {hint && <p className="mt-0.5 text-sm text-secondary">{hint}</p>}
                </div>
                <div className="min-w-0">
                    {children}
                    {error && <p className="mt-1.5 text-sm text-danger">{error}</p>}
                </div>
            </div>
        );
    }

    return (
        <div className="mb-5 last:mb-0">
            <label className="v-label">{label}</label>
            {children}
            {hint && !error && <p className="mt-1.5 text-sm text-tertiary">{hint}</p>}
            {error && <p className="mt-1.5 text-sm text-danger">{error}</p>}
        </div>
    );
}

/** A labelled switch: text left, switch right. */
export function Toggle({
    checked,
    onChange,
    label,
    hint,
    caution,
    soon = false,
}: {
    checked: boolean;
    onChange: (value: boolean) => void;
    label: string;
    hint?: string;
    caution?: string;
    /** What it switches is not built yet: tagged, and the switch is locked at its saved value. */
    soon?: boolean;
}) {
    return (
        <div className="flex items-start justify-between gap-6 border-t py-3.5 first:border-t-0 first:pt-0 last:pb-0" style={{ borderColor: 'var(--separator)' }}>
            <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-base font-medium text-primary">{label}{soon && <ComingSoon />}</div>
                {hint && <div className="mt-0.5 text-sm text-secondary">{hint}</div>}
                {/* A caution is a consequence the person needs before flipping this. */}
                {caution && <div className="mt-1 text-sm text-warning">{caution}</div>}
            </div>
            <span title={soon ? COMING_SOON : undefined} className="inline-flex">
                <Switch checked={checked} onChange={onChange} label={label} disabled={soon} />
            </span>
        </div>
    );
}

/**
 * The save bar. Hidden until something changed, then it floats up from the
 * bottom edge — so the page is never cluttered with a button that does
 * nothing, and an unsaved change is impossible to miss.
 */
export function SaveBar({ processing, dirty, label = 'Save changes', onDiscard }: { processing: boolean; dirty: boolean; label?: string; onDiscard?: () => void }) {
    return (
        <div aria-live="polite" className="pointer-events-none sticky bottom-5 z-30 mt-4 flex justify-center transition-all duration-300"
            style={{ opacity: dirty || processing ? 1 : 0, transform: dirty || processing ? 'none' : 'translateY(12px)', transitionTimingFunction: 'var(--ease-entrance)' }}>
            <div className="v-glass pointer-events-auto flex items-center gap-3 rounded-full py-1.5 pr-1.5 pl-5" style={{ border: '1px solid var(--border)', boxShadow: 'var(--shadow-overlay)' }}>
                <span className="size-1.5 rounded-full" style={{ background: 'var(--warning-fill)' }} aria-hidden="true" />
                <span className="text-sm font-medium text-primary">Unsaved changes</span>
                {onDiscard && <button type="button" className="v-btn v-btn--ghost v-btn--sm" onClick={onDiscard} disabled={processing}>Discard</button>}
                <button type="submit" className="v-btn v-btn--primary" disabled={processing || !dirty}>{processing ? 'Saving…' : label}</button>
            </div>
        </div>
    );
}

/** A yes/no capability cell — the honest table needs a lot of these. */
export function Cap({ ok, label }: { ok: boolean; label?: string }) {
    return (
        <span className="inline-flex items-center gap-1.5 text-sm" style={{ color: ok ? 'var(--success)' : 'var(--warning)' }}>
            <span className="size-1.5 rounded-full" style={{ background: ok ? 'var(--success-fill)' : 'var(--warning-fill)' }} aria-hidden="true" />
            <span className="sr-only">{ok ? 'yes' : 'no'}</span>
            {label ?? (ok ? 'Yes' : 'No')}
        </span>
    );
}
