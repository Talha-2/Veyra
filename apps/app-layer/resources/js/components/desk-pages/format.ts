/**
 * Small formatting helpers shared by the Desk pages. Pure functions only, so
 * every page formats a name, a sum or a time of day the same way.
 */

export function initialsOf(name: string | null | undefined): string {
    const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
    return parts.map((p) => p[0]).slice(0, 2).join('').toUpperCase() || '?';
}

export function money(value: number): string {
    return `$${value.toLocaleString()}`;
}

/** $12.4k, $1.2m: for totals that sit in tight headers. */
export function compactMoney(value: number): string {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}m`;
    if (value >= 10_000) return `$${Math.round(value / 1000)}k`;
    if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
    return `$${value}`;
}

export function humanize(value: string): string {
    const text = value.replace(/[_.]/g, ' ');
    return text.charAt(0).toUpperCase() + text.slice(1);
}

export function greeting(now = new Date()): string {
    const h = now.getHours();
    if (h < 5) return 'Good evening';
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
}

export function firstName(name: string | null | undefined): string {
    return (name ?? '').trim().split(/\s+/)[0] ?? '';
}

export function isToday(iso: string | null | undefined, now = new Date()): boolean {
    if (!iso) return false;
    const d = new Date(iso);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

/** 9:41 AM — the clock time, for things that happened today. */
export function clockTime(iso: string | null | undefined): string {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function longDate(iso: string | null | undefined): string {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

/** "3h ago", "2d ago", "Sep 3": the same wording RelativeTime uses, as plain text. */
export function relative(iso: string | null | undefined): string {
    if (!iso) return '';
    const date = new Date(iso);
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 0) return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}

export function ms(value: number | null | undefined): string {
    if (value == null) return '—';
    return value >= 1000 ? `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}s` : `${value}ms`;
}
