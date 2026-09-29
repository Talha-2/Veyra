/** The tooltip on an action that is disabled because it is not built yet. */
export const COMING_SOON = 'Coming soon';

/**
 * The mark on anything the product shows but cannot do yet.
 *
 * Quiet on purpose: a hairline pill in the neutral greys, never a status
 * colour, so it reads as "later" rather than "broken". Put it right after the
 * thing's name. When the thing is an action, also disable it and give it
 * `title={COMING_SOON}`, so pressing it cannot fail or pretend to work.
 */
export function ComingSoon({ compact = false, className = '' }: { compact?: boolean; className?: string }) {
    return (
        <span
            className={`inline-flex shrink-0 items-center rounded-full font-medium tracking-normal whitespace-nowrap normal-case ${compact ? 'h-[18px] px-1.5' : 'h-5 px-2'} text-2xs ${className}`}
            style={{ color: 'var(--text-secondary)', background: 'var(--surface-sunken)', boxShadow: 'inset 0 0 0 1px var(--border)' }}
            title="Not available yet"
        >
            Coming soon
        </span>
    );
}
