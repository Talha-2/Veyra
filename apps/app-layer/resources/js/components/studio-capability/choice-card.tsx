import { Check } from 'lucide-react';
import type { ReactNode } from 'react';

import { IconTile } from '../ui/kit';

/**
 * A selectable card: one option among a few that each need a sentence to
 * explain. `multiple` makes it a checkbox (any combination), otherwise a radio.
 *
 * Selection is shown three ways — accent hairline, tinted tile, filled
 * indicator — so it reads without colour too.
 */
export function ChoiceCard({
    selected,
    onSelect,
    icon,
    title,
    description,
    multiple = false,
    meta,
    disabled = false,
    disabledReason,
}: {
    selected: boolean;
    onSelect: () => void;
    icon?: ReactNode;
    title: ReactNode;
    description?: ReactNode;
    multiple?: boolean;
    meta?: ReactNode;
    disabled?: boolean;
    disabledReason?: string;
}) {
    return (
        <button
            type="button"
            role={multiple ? 'checkbox' : 'radio'}
            aria-checked={selected}
            onClick={onSelect}
            disabled={disabled}
            title={disabled ? disabledReason : undefined}
            className="flex h-full w-full items-start gap-3.5 rounded-md p-4.5 text-left transition-[background-color,border-color,box-shadow] duration-150 disabled:cursor-not-allowed"
            style={{
                background: selected ? 'var(--accent-subtle)' : 'var(--surface)',
                border: `1px solid ${selected ? 'var(--border-accent)' : 'var(--border-strong)'}`,
                boxShadow: selected ? 'none' : 'var(--shadow-xs)',
            }}
        >
            {icon && <IconTile tone={selected ? 'accent' : 'muted'} size={34}>{icon}</IconTile>}
            <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-base font-medium text-primary">
                    {title}
                    {meta}
                </span>
                {description && <span className="mt-1 block text-sm text-secondary">{description}</span>}
            </span>
            <span
                aria-hidden="true"
                className={`mt-0.5 flex size-4.5 shrink-0 items-center justify-center transition-colors ${multiple ? 'rounded-[5px]' : 'rounded-full'}`}
                style={{
                    background: selected ? 'var(--accent)' : 'transparent',
                    border: selected ? '1px solid var(--accent)' : '1.5px solid var(--border-strong)',
                    color: 'var(--text-on-accent)',
                }}
            >
                {selected && <Check size={11} strokeWidth={3} />}
            </span>
        </button>
    );
}
