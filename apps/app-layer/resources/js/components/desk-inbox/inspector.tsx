import { ChevronDown, ChevronsUpDown } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { Eyebrow } from '../ui/primitives';

/**
 * Inspector furniture, for the right-hand column of the inbox and the ticket
 * page: a titled group that can fold away, and property rows whose value is
 * the control — the way a Mac inspector edits in place.
 */

export function InspectorSection({ title, count, action, children, collapsible = true, defaultOpen = true, flush = false }: {
    title: string;
    count?: number;
    action?: ReactNode;
    children: ReactNode;
    collapsible?: boolean;
    defaultOpen?: boolean;
    flush?: boolean;
}) {
    const [open, setOpen] = useState(defaultOpen);

    return (
        <section className="px-4 py-3.5" style={{ borderTop: '1px solid var(--separator)' }}>
            <div className="flex min-h-6 items-center gap-2">
                {collapsible ? (
                    <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="group -ml-1 flex min-w-0 flex-1 items-center gap-1 rounded-md px-1 text-left">
                        <Eyebrow>{title}</Eyebrow>
                        {count != null && count > 0 && <span className="text-2xs font-medium text-tertiary tabular-nums">{count}</span>}
                        <ChevronDown size={14} strokeWidth={2} className="ml-0.5 text-tertiary opacity-0 transition-all group-hover:opacity-100" style={{ transform: open ? 'none' : 'rotate(-90deg)' }} />
                    </button>
                ) : (
                    <div className="flex min-w-0 flex-1 items-center gap-1">
                        <Eyebrow>{title}</Eyebrow>
                        {count != null && count > 0 && <span className="text-2xs font-medium text-tertiary tabular-nums">{count}</span>}
                    </div>
                )}
                {action}
            </div>
            {open && <div className={flush ? 'mt-2 -mx-2' : 'mt-2.5'}>{children}</div>}
        </section>
    );
}

/** A label on the left, a value or control on the right. */
export function PropertyRow({ label, children, icon }: { label: string; children: ReactNode; icon?: ReactNode }) {
    return (
        <div className="flex min-h-9 items-center gap-3">
            <span className="flex w-21 shrink-0 items-center gap-2 text-sm text-secondary">
                {icon && <span className="text-tertiary">{icon}</span>}
                {label}
            </span>
            <div className="flex min-w-0 flex-1 items-center justify-end">{children}</div>
        </div>
    );
}

/**
 * A native select dressed as an inspector value: a dot, the label, a chevron,
 * and a hover well. Native so the keyboard and screen readers get the real
 * thing.
 */
export function PropertySelect<T extends string>({ label, value, options, onChange, icon }: {
    label: string;
    value: T;
    options: { value: T; label: string; color?: string }[];
    onChange: (value: T) => void;
    icon?: ReactNode;
}) {
    const current = options.find((o) => o.value === value);

    return (
        <PropertyRow label={label} icon={icon}>
            <label className="relative -mr-2 flex h-8 min-w-0 max-w-full cursor-pointer items-center gap-2 rounded-lg pr-7 pl-2.5 text-sm font-medium text-primary transition-colors hover:bg-surface-hover has-focus-visible:[box-shadow:var(--ring)]">
                {current?.color && <span className="size-2 shrink-0 rounded-full" style={{ background: current.color }} aria-hidden="true" />}
                <span className="truncate">{current?.label ?? 'None'}</span>
                <ChevronsUpDown size={14} strokeWidth={2} className="pointer-events-none absolute right-2 text-tertiary" />
                <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value as T)} className="absolute inset-0 cursor-pointer opacity-0">
                    {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
            </label>
        </PropertyRow>
    );
}
