import { Check } from 'lucide-react';
import { forwardRef, useLayoutEffect, useRef, type ReactNode, type TextareaHTMLAttributes } from 'react';

import { Avatar } from '../ui/primitives';
import { initialsOf } from './helpers';

/**
 * Toolbar icon button, the kind in a Mail window's title bar: quiet until
 * hovered, tinted when its state is on. `label` is both the tooltip and the
 * accessible name, so an icon never goes unexplained.
 */
export const IconButton = forwardRef<HTMLButtonElement, {
    label: string;
    onClick?: () => void;
    children: ReactNode;
    active?: boolean;
    tone?: 'accent' | 'warning' | 'danger';
    size?: 'sm' | 'md';
    disabled?: boolean;
    pressed?: boolean;
}>(function IconButton({ label, onClick, children, active = false, tone = 'accent', size = 'md', disabled, pressed }, ref) {
    const color = active ? (tone === 'accent' ? 'var(--accent-text)' : `var(--${tone})`) : undefined;

    return (
        <button
            ref={ref}
            type="button"
            title={label}
            aria-label={label}
            aria-pressed={pressed}
            onClick={onClick}
            disabled={disabled}
            className={`inline-flex shrink-0 items-center justify-center rounded-lg text-secondary transition-colors hover:bg-surface-hover hover:text-primary disabled:opacity-40 ${size === 'sm' ? 'size-7' : 'size-8'}`}
            style={{ color, background: active && tone === 'accent' ? 'var(--accent-subtle)' : undefined }}
        >
            {children}
        </button>
    );
});

/** A textarea that grows with its content up to `maxHeight`, then scrolls. */
export const AutoTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { maxHeight?: number }>(
    function AutoTextarea({ maxHeight = 220, value, className = '', style, ...rest }, forwarded) {
        const inner = useRef<HTMLTextAreaElement | null>(null);

        useLayoutEffect(() => {
            const el = inner.current;
            if (!el) return;
            el.style.height = 'auto';
            el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
            el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
        }, [value, maxHeight]);

        return (
            <textarea
                ref={(el) => {
                    inner.current = el;
                    if (typeof forwarded === 'function') forwarded(el);
                    else if (forwarded) forwarded.current = el;
                }}
                value={value}
                rows={1}
                className={`block w-full resize-none bg-transparent text-base text-primary outline-none placeholder:text-tertiary ${className}`}
                style={{ boxShadow: 'none', ...style }}
                {...rest}
            />
        );
    },
);

/** Overlapping avatars for the people on something, with a +N tail. */
export function AvatarStack({ people, size = 22, max = 3 }: { people: { id: number; name: string }[]; size?: number; max?: number }) {
    if (people.length === 0) return null;
    const shown = people.slice(0, max);
    const rest = people.length - shown.length;

    return (
        <span className="inline-flex items-center" title={people.map((p) => p.name).join(', ')}>
            {shown.map((p, i) => (
                <span key={p.id} className="rounded-full" style={{ marginLeft: i === 0 ? 0 : -size * 0.3, boxShadow: '0 0 0 2px var(--surface)' }}>
                    <Avatar initials={initialsOf(p.name)} name={p.name} size={size} />
                </span>
            ))}
            {rest > 0 && (
                <span className="inline-flex items-center justify-center rounded-full text-2xs font-semibold text-secondary tabular-nums"
                    style={{ width: size, height: size, marginLeft: -size * 0.3, background: 'var(--surface-sunken)', boxShadow: '0 0 0 2px var(--surface)' }}>
                    +{rest}
                </span>
            )}
        </span>
    );
}

/**
 * Pick people from the team: a checklist with faces, as in a share sheet.
 * Multi-select; the caller decides whether a change saves immediately.
 */
export function PeoplePicker({ team, value, onChange, maxHeight = 240 }: {
    team: { id: number; name: string }[];
    value: number[];
    onChange: (ids: number[]) => void;
    maxHeight?: number;
}) {
    const toggle = (id: number) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

    if (team.length === 0) {
        return <p className="rounded-md px-3 py-3 text-sm text-tertiary" style={{ background: 'var(--surface-sunken)' }}>No one on the team yet.</p>;
    }

    return (
        <div className="overflow-y-auto rounded-md p-1" style={{ maxHeight, background: 'var(--surface-sunken)' }}>
            {team.map((u) => {
                const on = value.includes(u.id);
                return (
                    <button key={u.id} type="button" role="checkbox" aria-checked={on} onClick={() => toggle(u.id)}
                        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm text-primary transition-colors hover:bg-surface-hover"
                        style={{ background: on ? 'var(--surface)' : undefined, boxShadow: on ? 'var(--shadow-xs)' : undefined }}>
                        <Avatar initials={initialsOf(u.name)} name={u.name} size={24} />
                        <span className="min-w-0 flex-1 truncate">{u.name}</span>
                        <span className="flex size-[18px] items-center justify-center rounded-full transition-colors"
                            style={{ background: on ? 'var(--accent)' : 'transparent', border: on ? 'none' : '1.5px solid var(--border-strong)' }}>
                            {on && <Check size={11} strokeWidth={3} style={{ color: 'var(--text-on-accent)' }} />}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

/** A form error line under a field. */
export function FieldError({ children }: { children?: string }) {
    if (!children) return null;
    return <p className="mt-1.5 text-xs text-danger">{children}</p>;
}
