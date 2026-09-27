import { router } from '@inertiajs/react';
import { Globe, Mail, MessageSquare, Phone, Printer } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/** Small, pure helpers shared by the inbox panes and the ticket pages. */

export const CHANNEL_ICON: Record<string, LucideIcon> = {
    call: Phone,
    sms: MessageSquare,
    email: Mail,
    web_chat: Globe,
    fax: Printer,
};

export function channelIcon(channel: string): LucideIcon {
    return CHANNEL_ICON[channel] ?? MessageSquare;
}

/** "Ada Lovelace" → "AL"; "+1 312 555" → "#". */
export function initialsOf(name: string): string {
    const letters = name
        .split(/\s+/)
        .map((part) => part.match(/\p{L}/u)?.[0] ?? '')
        .filter(Boolean);

    return letters.length ? letters.slice(0, 2).join('').toUpperCase() : '#';
}

function startOfDay(date: Date): number {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function sameDay(a: string, b: string): boolean {
    return startOfDay(new Date(a)) === startOfDay(new Date(b));
}

/** The label on a day separator, the way Messages writes it. */
export function dayLabel(at: string): string {
    const date = new Date(at);
    const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86400000);

    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days > 1 && days < 7) return date.toLocaleDateString(undefined, { weekday: 'long' });

    return date.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
    });
}

export function timeLabel(at: string): string {
    return new Date(at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function dateTimeLabel(at: string): string {
    return new Date(at).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function fileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;

    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ── inbox URL state ──────────────────────────────────────────────────────

export interface InboxState {
    view: string;
    sort: string;
    filters: { search: string | null; channel: string | null; tag: string | null; saved_view: string | null };
}

/** The inbox's query string, with empty values dropped so URLs stay short. */
export function inboxParams(state: InboxState, patch: Record<string, string | undefined> = {}): Record<string, string> {
    const merged: Record<string, string | undefined> = {
        view: state.view,
        sort: state.sort === 'recent' ? undefined : state.sort,
        search: state.filters.search || undefined,
        channel: state.filters.channel || undefined,
        tag: state.filters.tag || undefined,
        saved_view: state.filters.saved_view || undefined,
        ...patch,
    };

    return Object.fromEntries(Object.entries(merged).filter((entry): entry is [string, string] => !!entry[1]));
}

export function inboxQueryString(state: InboxState): string {
    const params = new URLSearchParams(inboxParams(state));
    const text = params.toString();

    return text ? `?${text}` : '';
}

/**
 * Re-query the list without touching the open thread. A partial reload, so
 * the conversation someone is reading stays put while the list changes.
 */
export function queryInbox(state: InboxState, patch: Record<string, string | undefined>): void {
    router.get('/desk/inbox', inboxParams(state, patch), {
        preserveState: true,
        preserveScroll: true,
        replace: true,
        only: ['conversations', 'filters', 'sort', 'counts', 'view'],
    });
}

/** Snooze presets, computed at the moment the menu opens. */
export function snoozeOptions(): { label: string; hint: string; at: Date }[] {
    const now = new Date();

    const later = new Date(now.getTime() + 3 * 3600000);
    later.setMinutes(0, 0, 0);

    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);

    const weekend = new Date(now);
    weekend.setDate(now.getDate() + ((6 - now.getDay() + 7) % 7 || 7));
    weekend.setHours(9, 0, 0, 0);

    const nextWeek = new Date(now);
    nextWeek.setDate(now.getDate() + ((8 - now.getDay()) % 7 || 7));
    nextWeek.setHours(9, 0, 0, 0);

    const fmt = (d: Date, withDay: boolean) =>
        withDay ? d.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

    return [
        { label: 'Later today', hint: fmt(later, !sameDay(later.toISOString(), now.toISOString())), at: later },
        { label: 'Tomorrow', hint: fmt(tomorrow, true), at: tomorrow },
        { label: 'This weekend', hint: fmt(weekend, true), at: weekend },
        { label: 'Next week', hint: fmt(nextWeek, true), at: nextWeek },
    ];
}
