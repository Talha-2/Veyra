import { Link, router } from '@inertiajs/react';
import { Archive, ArrowUpDown, Ban, Bot, Check, Clock, Inbox, MailOpen, PanelLeft, SquarePen, Star, UserMinus, UserPlus, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Menu, MenuItem, MenuLabel, MenuSeparator } from '../shell/menu';
import { SearchField } from '../ui/kit';
import { Avatar, Badge, EmptyState, UserText } from '../ui/primitives';
import { AvatarStack, IconButton } from '../desk-inbox/controls';
import { channelIcon, inboxQueryString, initialsOf, queryInbox, timeLabel, type InboxState } from '../desk-inbox/helpers';
import type { ConversationRow, TeamMember } from '../../types/desk';

interface Props {
    conversations: ConversationRow[];
    selectedId: number | null;
    view: string;
    sort: string;
    sorts: { value: string; label: string }[];
    channels: { value: string; label: string }[];
    filters: { search: string | null; channel: string | null; tag: string | null; saved_view: string | null };
    team: TeamMember[];
    onNew: () => void;
    /** The heading: the view's or saved view's name. */
    title?: string;
    railOpen?: boolean;
    onToggleRail?: () => void;
}

type Row = ConversationRow & { snoozed_until?: string | null };

/**
 * The conversation list, with search, sort, filters and bulk select.
 *
 * Bulk select is entered by clicking a row's avatar — the checkbox lives over
 * it — so the common path (click the row to open it) does not grow a checkbox
 * column that nobody uses ninety percent of the time.
 *
 * ↑/↓ (or j/k) move through the list when focus is not in a field.
 */
export default function ConversationList({ conversations, selectedId, view, sort, sorts, channels, filters, team, onNew, title = 'Inbox', railOpen = true, onToggleRail }: Props) {
    const state: InboxState = { view, sort, filters };
    const [term, setTerm] = useState(filters.search ?? '');
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const scroller = useRef<HTMLDivElement>(null);

    // Opening a thread marks it read on the server, but the list is not
    // reloaded for it (the thread is a partial reload). Hide the dot at once;
    // the next list load carries the server's truth and resets this.
    const [opened, setOpened] = useState<Set<number>>(new Set());
    useEffect(() => { setOpened(new Set(selectedId ? [selectedId] : [])); }, [conversations]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => { if (selectedId) setOpened((s) => new Set(s).add(selectedId)); }, [selectedId]);

    useEffect(() => {
        if ((filters.search ?? '') === term) return;
        const t = setTimeout(() => queryInbox(state, { search: term || undefined }), 250);
        return () => clearTimeout(t);
    }, [term]); // eslint-disable-line react-hooks/exhaustive-deps

    const query = useMemo(() => inboxQueryString(state), [view, sort, filters.search, filters.channel, filters.tag, filters.saved_view]); // eslint-disable-line react-hooks/exhaustive-deps
    const hrefFor = (id: number) => `/desk/inbox/${id}${query}`;

    // Keyboard: walk the list like Mail.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const t = e.target;
            if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
            if (t instanceof Element && t.closest('input,textarea,select,[contenteditable="true"],[role="dialog"],[role="menu"]')) return;
            const step = e.key === 'ArrowDown' || e.key === 'j' ? 1 : e.key === 'ArrowUp' || e.key === 'k' ? -1 : 0;
            if (!step || conversations.length === 0) return;
            e.preventDefault();
            const at = conversations.findIndex((c) => c.id === selectedId);
            const next = conversations[Math.max(0, Math.min(conversations.length - 1, at === -1 ? 0 : at + step))];
            if (next && next.id !== selectedId) router.visit(hrefFor(next.id), { preserveState: true, preserveScroll: true, only: ['thread'] });
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }); // re-bound each render so it sees the current list

    useEffect(() => {
        if (selectedId) scroller.current?.querySelector(`[data-cid="${selectedId}"]`)?.scrollIntoView({ block: 'nearest' });
    }, [selectedId]);

    const toggle = (id: number) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
    const bulk = (operation: string, extra: Record<string, unknown> = {}) => {
        router.post('/desk/inbox/bulk', { ids: [...selected], operation, ...extra }, { preserveScroll: true, onSuccess: () => setSelected(new Set()) });
    };
    const allSelected = conversations.length > 0 && conversations.every((c) => selected.has(c.id));

    const unread = conversations.filter((c) => c.unread_count > 0 && !opened.has(c.id)).length;
    const channelLabel = channels.find((c) => c.value === filters.channel)?.label;
    const hasFilters = !!(filters.search || filters.channel || filters.tag);

    return (
        <div className="flex w-87 shrink-0 flex-col" style={{ background: 'var(--surface)', borderRight: '1px solid var(--border)' }}>
            <div className="shrink-0 px-4 pt-4 pb-3">
                <div className="flex items-center gap-1.5">
                    {onToggleRail && (
                        <IconButton label={railOpen ? 'Hide views' : 'Show views'} onClick={onToggleRail} pressed={railOpen}>
                            <PanelLeft size={16} strokeWidth={1.9} />
                        </IconButton>
                    )}
                    <div className="min-w-0 flex-1 pl-0.5">
                        <h1 className="truncate text-xl font-semibold tracking-tight text-primary">{title}</h1>
                        <p className="text-xs text-tertiary tabular-nums">
                            {conversations.length === 0 ? 'No conversations' : `${conversations.length}${conversations.length >= 80 ? '+' : ''} conversation${conversations.length === 1 ? '' : 's'}`}
                            {unread > 0 && <> · <span className="font-medium text-accent-text">{unread} unread</span></>}
                        </p>
                    </div>

                    <Menu align="right" width={200} trigger={(open, toggleMenu) => (
                        <IconButton label="Sort" onClick={toggleMenu} active={open || sort !== 'recent'}><ArrowUpDown size={16} strokeWidth={1.9} /></IconButton>
                    )}>
                        {(close) => (
                            <>
                                <MenuLabel>Sort by</MenuLabel>
                                {sorts.map((s) => (
                                    <MenuItem key={s.value} onSelect={() => { queryInbox(state, { sort: s.value }); close(); }} active={s.value === sort}
                                        trailing={s.value === sort ? <Check size={14} strokeWidth={2.2} className="text-accent" /> : undefined}>
                                        {s.value === 'title' ? 'Contact' : s.label}
                                    </MenuItem>
                                ))}
                            </>
                        )}
                    </Menu>

                    {!railOpen && (
                        <IconButton label="New conversation" onClick={onNew}><SquarePen size={16} strokeWidth={1.9} /></IconButton>
                    )}
                </div>

                <SearchField value={term} onChange={setTerm} placeholder="Search name, number or message" className="mt-3 w-full" />

                {(channelLabel || filters.tag) && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        {channelLabel && <FilterChip onClear={() => queryInbox(state, { channel: undefined })}>{channelLabel}</FilterChip>}
                        {filters.tag && <FilterChip onClear={() => queryInbox(state, { tag: undefined })}>#{filters.tag}</FilterChip>}
                    </div>
                )}
            </div>

            {selected.size > 0 && (
                <div className="mx-3 mb-2 flex shrink-0 animate-pop items-center gap-0.5 rounded-xl py-1 pr-1 pl-2" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
                    <button type="button" role="checkbox" aria-checked={allSelected} aria-label={allSelected ? 'Deselect all' : 'Select all'} title={allSelected ? 'Deselect all' : 'Select all'}
                        onClick={() => setSelected(allSelected ? new Set() : new Set(conversations.map((c) => c.id)))}
                        className="mr-1.5 flex size-4.5 items-center justify-center rounded-full" style={{ background: 'var(--accent)' }}>
                        {allSelected ? <Check size={11} strokeWidth={3} style={{ color: 'var(--text-on-accent)' }} /> : <span className="h-0.5 w-2 rounded-full" style={{ background: 'var(--text-on-accent)' }} />}
                    </button>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-primary tabular-nums">{selected.size} selected</span>
                    <IconButton size="sm" label="Mark as read" onClick={() => bulk('read')}><MailOpen size={15} strokeWidth={1.9} /></IconButton>
                    <IconButton size="sm" label="Star" onClick={() => bulk('favorite')}><Star size={15} strokeWidth={1.9} /></IconButton>
                    <Menu align="right" width={220} trigger={(open, toggleMenu) => (
                        <IconButton size="sm" label="Assign" onClick={toggleMenu} active={open}><UserPlus size={15} strokeWidth={1.9} /></IconButton>
                    )}>
                        {(close) => (
                            <>
                                <MenuLabel>Assign to</MenuLabel>
                                <div className="max-h-60 overflow-y-auto">
                                    {team.map((u) => (
                                        <MenuItem key={u.id} icon={<Avatar initials={initialsOf(u.name)} name={u.name} size={20} />} onSelect={() => { bulk('assign', { user_id: u.id }); close(); }}>{u.name}</MenuItem>
                                    ))}
                                </div>
                                <MenuSeparator />
                                <MenuItem danger icon={<UserMinus size={14} />} onSelect={() => { bulk('unassign'); close(); }}>Unassign everyone</MenuItem>
                            </>
                        )}
                    </Menu>
                    {view === 'closed'
                        ? <IconButton size="sm" label="Reopen" onClick={() => bulk('reopen')}><Inbox size={15} strokeWidth={1.9} /></IconButton>
                        : <IconButton size="sm" label="Close" onClick={() => bulk('close')}><Archive size={15} strokeWidth={1.9} /></IconButton>}
                    <IconButton size="sm" label="Clear selection" onClick={() => setSelected(new Set())}><X size={15} strokeWidth={1.9} /></IconButton>
                </div>
            )}

            <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-2 pb-2" role="list" aria-label="Conversations">
                {conversations.length === 0 ? (
                    <EmptyState icon={<Inbox size={22} strokeWidth={1.8} />} title={hasFilters ? 'No matches' : 'Nothing here'}
                        action={hasFilters ? <Link href={`/desk/inbox?view=${view}`} className="v-btn v-btn--quiet v-btn--sm">Clear filters</Link> : undefined}>
                        {hasFilters
                            ? 'No conversation matches these filters.'
                            : view === 'snoozed' ? 'Snoozed conversations wait here until their time comes, then return to the inbox.'
                                : 'When someone calls, texts or emails, the thread appears here.'}
                    </EmptyState>
                ) : conversations.map((c) => (
                    <RowItem key={c.id} c={c} href={hrefFor(c.id)} selected={c.id === selectedId} checked={selected.has(c.id)}
                        onCheck={() => toggle(c.id)} selecting={selected.size > 0} unread={c.unread_count > 0 && !opened.has(c.id)} />
                ))}
            </div>
        </div>
    );
}

function FilterChip({ onClear, children }: { onClear: () => void; children: React.ReactNode }) {
    return (
        <span className="inline-flex h-6 items-center gap-1 rounded-full pr-1 pl-2.5 text-xs font-medium" style={{ background: 'var(--accent-subtle)', color: 'var(--accent-text)' }}>
            {children}
            <button type="button" onClick={onClear} aria-label="Remove filter" className="flex size-4 items-center justify-center rounded-full hover:bg-surface-hover">
                <X size={11} strokeWidth={2.5} />
            </button>
        </span>
    );
}

/** Time in the row: today's as a clock time, older as the day, as Mail does. */
function RowTime({ at, unread }: { at: string | null; unread: boolean }) {
    if (!at) return null;
    const date = new Date(at);
    const days = Math.floor((Date.now() - date.getTime()) / 86400000);
    const today = date.toDateString() === new Date().toDateString();
    const label = today ? timeLabel(at)
        : days < 2 && new Date(Date.now() - 86400000).toDateString() === date.toDateString() ? 'Yesterday'
            : days < 7 ? date.toLocaleDateString(undefined, { weekday: 'short' })
                : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

    return (
        <time dateTime={at} title={date.toLocaleString()} className={`shrink-0 text-xs tabular-nums ${unread ? 'font-medium text-accent-text' : 'text-tertiary'}`}>
            {label}
        </time>
    );
}

function RowItem({ c, href, selected, checked, onCheck, selecting, unread }: {
    c: Row; href: string; selected: boolean; checked: boolean; onCheck: () => void; selecting: boolean; unread: boolean;
}) {
    const Icon = channelIcon(c.channel);
    const name = c.contact?.name ?? c.title;
    const snoozed = c.status === 'snoozed';

    return (
        <div data-cid={c.id} role="listitem"
            className={`group relative flex items-start gap-2 rounded-lg py-2.5 pr-3 pl-1.5 transition-colors ${selected ? '' : 'hover:bg-surface-hover'}`}
            style={{ background: selected ? 'color-mix(in srgb, var(--accent) 12%, var(--surface))' : checked ? 'var(--surface-hover)' : undefined }}>

            {/* Unread: a dot in the gutter, as in Mail. */}
            <span className="mt-3.75 size-2 shrink-0 rounded-full transition-opacity" style={{ background: 'var(--accent)', opacity: unread ? 1 : 0 }} aria-hidden="true" />

            {/* The checkbox sits over the avatar: hover or an active selection reveals it. */}
            <button type="button" role="checkbox" aria-checked={checked} aria-label={`Select ${c.title}`} onClick={onCheck}
                className="relative size-9 shrink-0 rounded-full">
                <span className={selecting || checked ? 'hidden' : 'block group-hover:hidden'}>
                    <Avatar initials={c.contact?.initials ?? initialsOf(c.title)} name={name} size={36} />
                </span>
                <span className={`${selecting || checked ? 'flex' : 'hidden group-hover:flex'} size-9 items-center justify-center rounded-full transition-colors`}
                    style={{ background: checked ? 'var(--accent)' : 'var(--surface)', border: checked ? 'none' : '1.5px solid var(--border-strong)' }}>
                    {checked && <Check size={16} strokeWidth={2.6} style={{ color: 'var(--text-on-accent)' }} />}
                </span>
            </button>

            <Link href={href} preserveState preserveScroll only={['thread']} aria-current={selected ? 'page' : undefined} className="min-w-0 flex-1 rounded-md pl-1">
                <div className="flex items-center gap-2">
                    <span className={`min-w-0 flex-1 truncate text-base text-primary ${unread ? 'font-semibold' : 'font-medium'}`}>
                        <UserText>{c.title}</UserText>
                    </span>
                    <RowTime at={c.last_message_at} unread={unread} />
                </div>

                <div className="mt-0.5 flex items-center gap-1.5">
                    <Icon size={14} strokeWidth={1.9} aria-label={c.channel} className="shrink-0 text-tertiary" />
                    {c.last_from_agent && <Bot size={14} strokeWidth={2} aria-label="Last reply from the agent" className="shrink-0 text-accent" />}
                    <span className={`min-w-0 flex-1 truncate text-sm ${unread ? 'text-primary' : 'text-secondary'}`}>
                        {c.last_direction === 'outbound' && !c.last_from_agent && <span className="text-tertiary">You: </span>}
                        <UserText>{c.preview ?? 'No messages yet'}</UserText>
                    </span>
                </div>

                {(c.tags.length > 0 || c.assignees.length > 0 || c.is_favorite || c.blocked || snoozed) && (
                    <div className="mt-1.5 flex items-center gap-1">
                        {c.tags.slice(0, 2).map((t) => <Badge key={t}>{t}</Badge>)}
                        {c.tags.length > 2 && <span className="text-2xs text-tertiary tabular-nums">+{c.tags.length - 2}</span>}
                        <span className="flex-1" />
                        {snoozed && <Clock size={14} strokeWidth={1.9} aria-label="Snoozed" className="shrink-0 text-warning" />}
                        {c.blocked && <Ban size={14} strokeWidth={1.9} aria-label="Blocked" className="shrink-0 text-danger" />}
                        {c.is_favorite && <Star size={14} fill="currentColor" strokeWidth={1.8} aria-label="Starred" className="shrink-0 text-warning" />}
                        <AvatarStack people={c.assignees} size={18} max={2} />
                    </div>
                )}
            </Link>
        </div>
    );
}
