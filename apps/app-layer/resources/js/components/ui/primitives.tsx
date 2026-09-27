import type { ReactNode } from 'react';

/**
 * The small pieces both products build from.
 *
 * Every colour comes from a token: a hex literal in a component is almost
 * always a bug, because it will be wrong in one of the two themes.
 */

export type Tone = 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'muted';

const TONE_VARS: Record<Tone, { fg: string; bg: string; dot: string }> = {
    accent: { fg: 'var(--accent-text)', bg: 'var(--accent-subtle)', dot: 'var(--accent)' },
    success: { fg: 'var(--success)', bg: 'var(--success-subtle)', dot: 'var(--success-fill)' },
    warning: { fg: 'var(--warning)', bg: 'var(--warning-subtle)', dot: 'var(--warning-fill)' },
    danger: { fg: 'var(--danger)', bg: 'var(--danger-subtle)', dot: 'var(--danger-fill)' },
    info: { fg: 'var(--info)', bg: 'var(--info-subtle)', dot: 'var(--info-fill)' },
    muted: { fg: 'var(--text-secondary)', bg: 'var(--surface-sunken)', dot: 'var(--text-tertiary)' },
};

export function toneColor(tone: Tone): string {
    return TONE_VARS[tone].dot;
}

/** Meta text: counts, durations, identifiers. Quiet, tabular, never shouting. */
export function Mono({ children, className = '', style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
    return (
        <span className={`v-mono ${className}`} style={style}>
            {children}
        </span>
    );
}

/** A group label: small caps, the one place the app uses uppercase. */
export function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
    return <span className={`v-eyebrow ${className}`}>{children}</span>;
}

export function Badge({ tone = 'muted', children, dot = false }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
    const { fg, bg, dot: dotColor } = TONE_VARS[tone];

    return (
        <span
            className="inline-flex h-[22px] items-center gap-1.5 rounded-full px-2 text-2xs font-medium whitespace-nowrap"
            style={{ color: fg, background: bg }}
        >
            {dot && <span className="size-1.5 rounded-full" style={{ background: dotColor }} aria-hidden="true" />}
            {children}
        </span>
    );
}

/** A status dot. `live` pulses, for things happening now. */
export function StatusDot({ tone = 'success', live = false, label }: { tone?: Tone; live?: boolean; label?: string }) {
    const color = TONE_VARS[tone].dot;

    return (
        <span className="relative inline-flex size-2 shrink-0" role={label ? 'img' : undefined} aria-label={label}>
            {live && <span className="absolute inset-0 rounded-full" style={{ background: color, animation: 'pulse-dot 1.6s var(--ease-out) infinite' }} />}
            <span className="relative size-2 rounded-full" style={{ background: color }} />
        </span>
    );
}

const AVATAR_TINTS = [
    ['#ffd8c2', '#b3461a'], ['#d6e6ff', '#1f5fb8'], ['#dff5e3', '#1d7a36'], ['#eadcff', '#6b3fb8'],
    ['#fff0c2', '#8a6100'], ['#ffd9e4', '#b8284f'], ['#d8f3f5', '#1a7480'], ['#e8e8ed', '#48484a'],
];

function hash(text: string): number {
    let h = 0;
    for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
    return Math.abs(h);
}

/** A monogram disc, tinted from the name so the same person is always the same colour. */
export function Avatar({ initials, size = 28, tone, name }: { initials: string; size?: number; tone?: string; name?: string }) {
    const [bg, fg] = AVATAR_TINTS[hash(name ?? initials) % AVATAR_TINTS.length];

    return (
        <span
            className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold select-none"
            style={{
                width: size,
                height: size,
                fontSize: Math.max(9, Math.round(size * 0.38)),
                background: tone ?? bg,
                color: fg,
                letterSpacing: '0.01em',
            }}
            aria-hidden="true"
        >
            {initials}
        </span>
    );
}

/**
 * A timestamp that reads the way people talk about time. The full value stays
 * in the title attribute for when the exact moment matters.
 */
export function RelativeTime({ at, className = '' }: { at: string | null; className?: string }) {
    if (!at) return null;

    const date = new Date(at);
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

    const label =
        seconds < 0
            ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
            : seconds < 60
              ? 'Just now'
              : seconds < 3600
                ? `${Math.floor(seconds / 60)}m ago`
                : seconds < 86400
                  ? `${Math.floor(seconds / 3600)}h ago`
                  : seconds < 604800
                    ? `${Math.floor(seconds / 86400)}d ago`
                    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

    return (
        <time dateTime={at} title={date.toLocaleString()} className={`text-xs tabular-nums whitespace-nowrap text-tertiary ${className}`}>
            {label}
        </time>
    );
}

/**
 * What a pane shows when there is nothing in it. Seen mostly by someone on
 * their first day, so it teaches: what goes here, and the one thing to do.
 */
export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
    return (
        <div className="flex h-full flex-col items-center justify-center px-8 py-14 text-center">
            {icon && (
                <div className="mb-4 flex size-12 items-center justify-center rounded-2xl text-tertiary" style={{ background: 'var(--surface-sunken)' }}>
                    {icon}
                </div>
            )}
            <p className="text-md font-semibold text-primary">{title}</p>
            {children && <p className="mt-1 max-w-[46ch] text-sm text-secondary">{children}</p>}
            {action && <div className="mt-5">{action}</div>}
        </div>
    );
}

/** Arabic script, which for us means Urdu — also Arabic, Persian, Pashto. */
const ARABIC_SCRIPT = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;

/**
 * User-authored text of unknown language: `dir="auto"` picks direction from
 * the first strong character, and `lang="ur"` on Arabic script gives Nastaliq
 * the leading it needs and tells a screen reader to switch voices.
 */
export function UserText({ children, className = '' }: { children: ReactNode; className?: string }) {
    const isArabicScript = typeof children === 'string' && ARABIC_SCRIPT.test(children);

    return (
        <span dir="auto" lang={isArabicScript ? 'ur' : undefined} className={className}>
            {children}
        </span>
    );
}

export function Kbd({ children }: { children: ReactNode }) {
    return (
        <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-md px-1 font-sans text-2xs font-medium text-tertiary" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
            {children}
        </kbd>
    );
}
