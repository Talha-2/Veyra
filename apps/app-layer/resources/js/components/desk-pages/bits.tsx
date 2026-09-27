import { Link } from '@inertiajs/react';
import { ArrowDownRight, ArrowUpRight, Globe, Mail, MessageSquare, Phone, Printer, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { Avatar } from '../ui/primitives';
import { initialsOf } from './format';

/**
 * Pieces several Desk pages share that the kit does not carry: channel marks,
 * a period-over-period delta, the view switch, and pagination.
 */

const CHANNELS: Record<string, { icon: LucideIcon; label: string }> = {
    call: { icon: Phone, label: 'Call' },
    sms: { icon: MessageSquare, label: 'SMS' },
    email: { icon: Mail, label: 'Email' },
    web_chat: { icon: Globe, label: 'Chat' },
    fax: { icon: Printer, label: 'Fax' },
};

export function channelLabel(channel: string): string {
    return CHANNELS[channel]?.label ?? channel;
}

export function ChannelIcon({ channel, size = 14 }: { channel: string; size?: number }) {
    const Icon = CHANNELS[channel]?.icon ?? MessageSquare;
    return <Icon size={size} strokeWidth={1.8} aria-label={channelLabel(channel)} />;
}

/** A row of channel marks, quiet, each with its name for screen readers and hover. */
export function ChannelMarks({ channels }: { channels: string[] }) {
    if (channels.length === 0) return <span className="text-sm text-tertiary">—</span>;

    return (
        <span className="inline-flex items-center gap-1">
            {channels.map((c) => (
                <span key={c} title={channelLabel(c)} className="flex size-6 items-center justify-center rounded-md text-secondary" style={{ background: 'var(--surface-sunken)' }}>
                    <ChannelIcon channel={c} size={13} />
                </span>
            ))}
        </span>
    );
}

/** Change against the previous window. Up is not always good, so the tone is neutral unless asked. */
export function Delta({ pct, invert = false }: { pct: number | null; invert?: boolean }) {
    if (pct == null) return null;
    const up = pct > 0;
    const flat = pct === 0;
    const good = invert ? !up : up;
    const color = flat ? 'var(--text-tertiary)' : good ? 'var(--success)' : 'var(--danger)';

    return (
        <span className="inline-flex items-center gap-0.5 text-xs font-medium tabular-nums" style={{ color }}>
            {!flat && (up ? <ArrowUpRight size={13} strokeWidth={2} /> : <ArrowDownRight size={13} strokeWidth={2} />)}
            {up ? '+' : ''}{pct}%
        </span>
    );
}

/** Link-driven icon switch (table / board), styled like the segmented control. */
export function ViewSwitch({ options, current }: { options: { key: string; label: string; icon: ReactNode; href: string }[]; current: string }) {
    return (
        <div className="inline-flex items-center gap-0.5 rounded-[10px] p-[3px]" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
            {options.map((o) => {
                const active = o.key === current;
                return (
                    <Link key={o.key} href={o.href} preserveState preserveScroll aria-label={o.label} title={o.label} aria-current={active ? 'page' : undefined}
                        className="flex h-7 w-8 items-center justify-center rounded-[8px] transition-all"
                        style={{ background: active ? 'var(--surface-raised)' : 'transparent', color: active ? 'var(--text-primary)' : 'var(--text-tertiary)', boxShadow: active ? 'var(--shadow-card)' : 'none' }}>
                        {o.icon}
                    </Link>
                );
            })}
        </div>
    );
}

/** Laravel's paginator links, as quiet pills. */
export function PageLinks({ links, summary }: { links: { url: string | null; label: string; active: boolean }[]; summary?: ReactNode }) {
    if (links.length <= 3 && !summary) return null;

    return (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-tertiary tabular-nums">{summary}</span>
            {links.length > 3 && (
                <nav className="flex items-center gap-1" aria-label="Pagination">
                    {links.map((link, i) => (
                        <Link key={i} href={link.url ?? '#'} preserveScroll aria-disabled={!link.url} aria-current={link.active ? 'page' : undefined}
                            className="flex h-7 min-w-7 items-center justify-center rounded-full px-2.5 text-xs font-medium tabular-nums transition-colors hover:bg-surface-hover"
                            style={{ background: link.active ? 'var(--primary)' : undefined, color: link.active ? 'var(--primary-text)' : 'var(--text-secondary)', opacity: link.url ? 1 : 0.35, pointerEvents: link.url ? undefined : 'none' }}
                            dangerouslySetInnerHTML={{ __html: link.label }} />
                    ))}
                </nav>
            )}
        </div>
    );
}

/** Overlapping avatars for a set of people, with a +n when there are more than fit. */
export function AvatarStack({ people, size = 22, max = 3 }: { people: { id: number; name: string }[]; size?: number; max?: number }) {
    if (people.length === 0) return null;
    const shown = people.slice(0, max);
    const rest = people.length - shown.length;

    return (
        <span className="inline-flex items-center" title={people.map((p) => p.name).join(', ')} aria-label={people.map((p) => p.name).join(', ')}>
            {shown.map((p, i) => (
                <span key={p.id} className="rounded-full" style={{ marginLeft: i === 0 ? 0 : -6, boxShadow: '0 0 0 2px var(--surface)' }}>
                    <Avatar name={p.name} initials={initialsOf(p.name)} size={size} />
                </span>
            ))}
            {rest > 0 && <span className="ml-1 text-2xs font-medium text-tertiary tabular-nums">+{rest}</span>}
        </span>
    );
}

/** A tiny proportional bar made of segments, for "how this total splits". */
export function SplitBar({ parts, height = 6 }: { parts: { value: number; color: string; label: string }[]; height?: number }) {
    const total = parts.reduce((a, p) => a + p.value, 0);

    return (
        <div className="flex w-full gap-[2px] overflow-hidden rounded-full" style={{ height, background: 'var(--surface-sunken)' }} role="img"
            aria-label={parts.map((p) => `${p.label} ${p.value}`).join(', ')}>
            {total > 0 && parts.filter((p) => p.value > 0).map((p) => (
                <div key={p.label} className="h-full transition-[width] duration-500" style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />
            ))}
        </div>
    );
}
