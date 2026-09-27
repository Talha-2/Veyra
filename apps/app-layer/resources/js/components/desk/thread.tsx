import { router, useForm } from '@inertiajs/react';
import {
    AlarmClock, AlertCircle, AlertTriangle, ArrowUp, Ban, BellOff, Bot, CheckCircle2, ChevronDown, Clock, MessagesSquare, MoreHorizontal,
    PanelRight, Paperclip, PhoneIncoming, PhoneOutgoing, Pin, RotateCcw, StickyNote, Star, Tag as TagIcon, ThumbsDown, ThumbsUp,
    Ticket as TicketIcon, UserPlus,
} from 'lucide-react';
import { forwardRef, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';

import { Menu, MenuItem, MenuLabel, MenuSeparator } from '../shell/menu';
import { SegmentedControl } from '../ui/kit';
import { Avatar, Badge, EmptyState, Kbd, Mono, UserText } from '../ui/primitives';
import { AutoTextarea, AvatarStack, IconButton } from '../desk-inbox/controls';
import { channelIcon, dateTimeLabel, fileSize, initialsOf, sameDay, snoozeOptions, timeLabel } from '../desk-inbox/helpers';
import TagEditor from '../desk-inbox/tag-editor';
import { DaySeparator, NoteCard, ReminderCard, TicketCard } from '../desk-inbox/timeline-cards';
import ComposeDialog, { type Composition } from './compose-dialog';
import AssignDialog from './assign-dialog';
import type { DelegationView, TeamMember, ThreadView, TicketSummary, TimelineCall, TimelineMessage } from '../../types/desk';

interface Props {
    thread: ThreadView | null;
    team: TeamMember[];
    ticketTypes: { id: number; name: string; color: string }[];
    detailsOpen: boolean;
    onToggleDetails: () => void;
    existingTags?: string[];
}

/** Fields the view model sends beyond the shared type. */
type Thread = ThreadView & { snoozed_until?: string | null };
type Note = ThreadView['details']['notes'][number];
type Reminder = ThreadView['details']['reminders'][number] & { at?: string | null };
type TicketItem = TicketSummary & { at?: string | null };

type Filter = 'all' | 'customer' | 'agent' | 'team' | 'calls';
type Mode = 'reply' | 'note';

type Item =
    | { kind: 'message'; at: string; entry: TimelineMessage }
    | { kind: 'call'; at: string; entry: TimelineCall }
    | { kind: 'note'; at: string; note: Note }
    | { kind: 'reminder'; at: string; reminder: Reminder }
    | { kind: 'ticket'; at: string; ticket: TicketItem };

const FILTERS: { value: Filter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'customer', label: 'Customer' },
    { value: 'agent', label: 'Agent' },
    { value: 'team', label: 'Team' },
    { value: 'calls', label: 'Calls' },
];

/** Consecutive messages this close together from the same sender share one header. */
const GROUP_GAP_MS = 5 * 60 * 1000;
/** A silence this long gets its own timestamp, as in Messages. */
const SEPARATOR_GAP_MS = 60 * 60 * 1000;

export default function Thread({ thread: raw, team, ticketTypes, detailsOpen, onToggleDetails, existingTags = [] }: Props) {
    const thread = raw as Thread | null;
    const bottom = useRef<HTMLDivElement>(null);
    const composer = useRef<HTMLTextAreaElement>(null);
    const [composition, setComposition] = useState<Composition | null>(null);
    const [assigning, setAssigning] = useState(false);
    const [filter, setFilter] = useState<Filter>('all');

    const canReply = !!thread && thread.can_compose && !thread.identifier?.blocked;
    const [mode, setMode] = useState<Mode>(canReply ? 'reply' : 'note');

    const items = useMemo(() => (thread ? buildItems(thread) : []), [thread]);

    useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }); }, [thread?.id, items.length]);
    useEffect(() => { setFilter('all'); setMode(canReply ? 'reply' : 'note'); }, [thread?.id]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => { if (!canReply) setMode('note'); }, [canReply]);

    if (!thread) {
        return (
            <div className="flex min-w-0 flex-1 flex-col" style={{ background: 'var(--surface)' }}>
                <EmptyState icon={<MessagesSquare size={24} strokeWidth={1.8} />} title="No conversation selected">
                    Pick a thread on the left to read it and reply. <span className="mt-2 inline-flex items-center gap-1">Use <Kbd>↑</Kbd><Kbd>↓</Kbd> to move between them.</span>
                </EmptyState>
            </div>
        );
    }

    const visible = items.filter((item) => {
        if (filter === 'all') return true;
        if (filter === 'calls') return item.kind === 'call';
        if (item.kind === 'message') {
            if (filter === 'customer') return item.entry.direction === 'inbound';
            if (filter === 'agent') return item.entry.from_agent;
            return item.entry.direction === 'outbound' && !item.entry.from_agent;
        }
        // Notes, reminders and tickets are the team's own work.
        return filter === 'team' && item.kind !== 'call';
    });

    const writeNote = () => { setMode('note'); requestAnimationFrame(() => composer.current?.focus()); };

    return (
        <div className="flex min-w-0 flex-1 flex-col" style={{ background: 'var(--surface)' }}>
            <ThreadHeader thread={thread} existingTags={existingTags} detailsOpen={detailsOpen} onToggleDetails={onToggleDetails}
                onAssign={() => setAssigning(true)} onCompose={setComposition} onNote={writeNote} />

            <div className="flex shrink-0 items-center gap-3 px-5 py-2" style={{ borderBottom: '1px solid var(--separator)' }}>
                <SegmentedControl size="sm" value={filter} onChange={setFilter} options={FILTERS} />
                <div className="flex-1" />
                {thread.pinned.length > 0 && (
                    <Menu align="right" width={320} trigger={(open, toggle) => (
                        <button type="button" onClick={toggle} aria-expanded={open}
                            className="flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium text-accent-text transition-colors hover:bg-surface-hover">
                            <Pin size={14} strokeWidth={2} /> {thread.pinned.length} pinned
                        </button>
                    )}>
                        {(close) => (
                            <>
                                <MenuLabel>Pinned by you</MenuLabel>
                                {thread.pinned.map((p) => (
                                    <MenuItem key={p.id} icon={<Pin size={14} />} onSelect={() => {
                                        close();
                                        setFilter('all');
                                        requestAnimationFrame(() => document.querySelector(`[data-mid="${p.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
                                    }}>
                                        <UserText>{p.body}</UserText>
                                    </MenuItem>
                                ))}
                            </>
                        )}
                    </Menu>
                )}
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pt-4 pb-2">
                <div className="mx-auto mt-auto flex w-full max-w-[760px] flex-col">
                    {visible.length === 0 && (
                        <p className="py-10 text-center text-sm text-tertiary">{filter === 'all' ? 'No messages yet.' : 'Nothing from this sender yet.'}</p>
                    )}
                    <Timeline items={visible} />
                    <div ref={bottom} />
                </div>
            </div>

            <Composer key={thread.id} ref={composer} thread={thread} mode={mode} onMode={setMode} canReply={canReply} onCompose={setComposition} />

            <ComposeDialog composition={composition} onClose={() => setComposition(null)} conversationId={thread.id} team={team} ticketTypes={ticketTypes} />
            <AssignDialog open={assigning} onClose={() => setAssigning(false)} conversationId={thread.id} team={team} current={thread.assignees.map((a) => a.id)} />
        </div>
    );
}

// ── timeline assembly ────────────────────────────────────────────────────

function buildItems(thread: Thread): Item[] {
    const end = new Date().toISOString();
    const items: Item[] = [];

    for (const entry of thread.timeline) {
        if (entry.kind === 'call') items.push({ kind: 'call', at: entry.at, entry });
        else items.push({ kind: 'message', at: entry.at, entry });
    }
    for (const note of thread.details.notes) items.push({ kind: 'note', at: note.at ?? end, note });
    for (const reminder of thread.details.reminders as Reminder[]) items.push({ kind: 'reminder', at: reminder.at ?? reminder.due_at ?? end, reminder });
    for (const ticket of thread.details.tickets as TicketItem[]) items.push({ kind: 'ticket', at: ticket.at ?? end, ticket });

    return items.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

function Timeline({ items }: { items: Item[] }) {
    // The last outbound message is the one whose delivery status matters.
    const lastOutbound = [...items].reverse().find((i) => i.kind === 'message' && i.entry.direction === 'outbound');

    return (
        <>
            {items.map((item, i) => {
                const prev = items[i - 1];
                const next = items[i + 1];
                const gap = prev ? new Date(item.at).getTime() - new Date(prev.at).getTime() : Infinity;
                const separator = !prev || !sameDay(prev.at, item.at) || gap > SEPARATOR_GAP_MS;
                const key = `${item.kind}-${item.kind === 'message' || item.kind === 'call' ? item.entry.id : item.kind === 'note' ? item.note.id : item.kind === 'reminder' ? item.reminder.id : item.ticket.id}`;

                let body: ReactNode;
                if (item.kind === 'message') {
                    const joinsPrev = !separator && prev?.kind === 'message' && sameSender(prev.entry, item.entry) && gap < GROUP_GAP_MS;
                    const nextGap = next ? new Date(next.at).getTime() - new Date(item.at).getTime() : Infinity;
                    const joinsNext = next?.kind === 'message' && sameSender(item.entry, next.entry) && nextGap < GROUP_GAP_MS && sameDay(item.at, next.at);
                    body = <Bubble entry={item.entry} first={!joinsPrev} last={!joinsNext} showStatus={item === lastOutbound} />;
                } else if (item.kind === 'call') {
                    body = <CallEntry call={item.entry} />;
                } else if (item.kind === 'note') {
                    body = <NoteCard note={item.note} />;
                } else if (item.kind === 'reminder') {
                    body = <ReminderCard reminder={item.reminder} />;
                } else {
                    body = <TicketCard ticket={item.ticket} />;
                }

                return (
                    <div key={key}>
                        {separator && <DaySeparator at={item.at} />}
                        {body}
                    </div>
                );
            })}
        </>
    );
}

function sameSender(a: TimelineMessage, b: TimelineMessage): boolean {
    return a.direction === b.direction && a.from_agent === b.from_agent && a.author === b.author;
}

// ── header ───────────────────────────────────────────────────────────────

function ThreadHeader({ thread, existingTags, detailsOpen, onToggleDetails, onAssign, onCompose, onNote }: {
    thread: Thread; existingTags: string[]; detailsOpen: boolean; onToggleDetails: () => void;
    onAssign: () => void; onCompose: (c: Composition) => void; onNote: () => void;
}) {
    const patch = (data: { status: string; snoozed_until?: string }) => router.patch(`/desk/inbox/${thread.id}`, data, { preserveScroll: true });
    const ChannelIcon = channelIcon(thread.channel);
    const closed = thread.status === 'closed';
    const snoozed = thread.status === 'snoozed';
    const name = thread.contact?.name ?? thread.title;

    return (
        <header className="@container flex h-16 shrink-0 items-center gap-3 px-5" style={{ borderBottom: '1px solid var(--separator)' }}>
            <Avatar initials={thread.contact?.initials ?? initialsOf(thread.title)} name={name} size={36} />
            <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                    <h2 className="truncate text-md font-semibold tracking-tight text-primary"><UserText>{thread.title}</UserText></h2>
                    {closed && <Badge>Closed</Badge>}
                    {snoozed && <Badge tone="warning" dot>{thread.snoozed_until ? `Snoozed until ${dateTimeLabel(thread.snoozed_until)}` : 'Snoozed'}</Badge>}
                    {thread.identifier?.blocked && <Badge tone="danger" dot>Blocked</Badge>}
                    {thread.identifier?.dnd && <Badge tone="warning">Do not disturb</Badge>}
                </div>
                <div className="flex min-w-0 items-center gap-1.5 overflow-hidden text-xs text-tertiary">
                    <ChannelIcon size={14} strokeWidth={1.9} className="shrink-0" aria-hidden="true" />
                    <span className="shrink-0">{thread.channel_label}</span>
                    {thread.identifier && thread.identifier.value !== thread.title && <><span aria-hidden="true">·</span><span className="min-w-0 truncate tabular-nums">{thread.identifier.value}</span></>}
                    {thread.subject && <><span aria-hidden="true">·</span><span className="truncate"><UserText>{thread.subject}</UserText></span></>}
                </div>
            </div>

            <div className="flex shrink-0 items-center gap-0.5">
                {thread.assignees.length > 0 ? (
                    <button type="button" onClick={onAssign} title={`Assigned to ${thread.assignees.map((a) => a.name).join(', ')}. Click to change.`}
                        className="mr-1 flex h-8 items-center gap-2 rounded-full pr-2.5 pl-1 text-sm text-secondary transition-colors hover:bg-surface-hover">
                        <AvatarStack people={thread.assignees} size={24} />
                        <span className="max-w-[120px] truncate @max-xl:hidden">{thread.assignees.length === 1 ? thread.assignees[0].name.split(' ')[0] : `${thread.assignees.length} people`}</span>
                    </button>
                ) : (
                    <button type="button" onClick={onAssign} title="Nobody owns this conversation yet"
                        className="mr-1 flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors hover:bg-surface-hover" style={{ color: 'var(--warning)' }}>
                        <UserPlus size={15} strokeWidth={1.9} /> <span className="@max-xl:sr-only">Assign</span>
                    </button>
                )}

                <span className="mx-1 h-5 w-px" style={{ background: 'var(--separator)' }} aria-hidden="true" />

                <IconButton label={thread.is_favorite ? 'Unstar' : 'Star'} active={thread.is_favorite} tone="warning" pressed={thread.is_favorite}
                    onClick={() => router.post(`/desk/inbox/${thread.id}/favorite`, {}, { preserveScroll: true })}>
                    <Star size={16} strokeWidth={1.9} fill={thread.is_favorite ? 'currentColor' : 'none'} />
                </IconButton>

                <Menu align="right" width={260} trigger={(open, toggle) => (
                    <IconButton label={thread.tags.length ? `Tags: ${thread.tags.join(', ')}` : 'Tags'} onClick={toggle} active={open || thread.tags.length > 0}>
                        <TagIcon size={16} strokeWidth={1.9} />
                    </IconButton>
                )}>
                    {() => (
                        <TagEditor value={thread.tags} suggestions={existingTags}
                            onChange={(tags) => router.post(`/desk/inbox/${thread.id}/tags`, { tags }, { preserveScroll: true })} />
                    )}
                </Menu>

                <Menu align="right" width={240} trigger={(open, toggle) => (
                    <IconButton label={snoozed ? 'Snoozed' : 'Snooze'} onClick={toggle} active={open || snoozed} tone={snoozed ? 'warning' : 'accent'}>
                        <Clock size={16} strokeWidth={1.9} />
                    </IconButton>
                )}>
                    {(close) => (
                        <>
                            <MenuLabel>Snooze until</MenuLabel>
                            {snoozeOptions().map((o) => (
                                <MenuItem key={o.label} onSelect={() => { patch({ status: 'snoozed', snoozed_until: o.at.toISOString() }); close(); }}
                                    trailing={<span className="text-xs text-tertiary">{o.hint}</span>}>
                                    {o.label}
                                </MenuItem>
                            ))}
                            {snoozed && (
                                <>
                                    <MenuSeparator />
                                    <MenuItem icon={<RotateCcw size={14} />} onSelect={() => { patch({ status: 'open' }); close(); }}>Wake it now</MenuItem>
                                </>
                            )}
                        </>
                    )}
                </Menu>

                <IconButton label={closed ? 'Reopen conversation' : 'Close conversation'} active={closed} tone="accent" onClick={() => patch({ status: closed ? 'open' : 'closed' })}>
                    {closed ? <RotateCcw size={16} strokeWidth={1.9} /> : <CheckCircle2 size={16} strokeWidth={1.9} />}
                </IconButton>

                <Menu align="right" width={248} trigger={(open, toggle) => (
                    <IconButton label="More actions" onClick={toggle} active={open}><MoreHorizontal size={16} strokeWidth={1.9} /></IconButton>
                )}>
                    {(close) => (
                        <>
                            <MenuItem icon={<StickyNote size={14} />} onSelect={() => { close(); onNote(); }}>Add a note</MenuItem>
                            <MenuItem icon={<AlarmClock size={14} />} onSelect={() => { onCompose('reminder'); close(); }}>Set a reminder…</MenuItem>
                            <MenuItem icon={<TicketIcon size={14} />} onSelect={() => { onCompose('ticket'); close(); }}>Raise a ticket…</MenuItem>
                            <MenuItem icon={<UserPlus size={14} />} onSelect={() => { onAssign(); close(); }}>Assign or transfer…</MenuItem>
                            {thread.identifier && (
                                <>
                                    <MenuSeparator />
                                    <MenuItem icon={<BellOff size={14} />} onSelect={() => { router.post(`/desk/identifiers/${thread.identifier!.id}/dnd`, {}, { preserveScroll: true }); close(); }}>
                                        {thread.identifier.dnd ? 'Clear do-not-disturb' : 'Do not disturb for 30 days'}
                                    </MenuItem>
                                    <MenuItem danger icon={<Ban size={14} />} onSelect={() => { router.post(`/desk/identifiers/${thread.identifier!.id}/block`, {}, { preserveScroll: true }); close(); }}>
                                        {thread.identifier.blocked ? 'Unblock' : 'Block'} {thread.identifier.value}
                                    </MenuItem>
                                </>
                            )}
                        </>
                    )}
                </Menu>

                <IconButton label={detailsOpen ? 'Hide details' : 'Show details'} onClick={onToggleDetails} active={detailsOpen} pressed={detailsOpen}>
                    <PanelRight size={16} strokeWidth={1.9} />
                </IconButton>
            </div>
        </header>
    );
}

// ── messages ─────────────────────────────────────────────────────────────

function Bubble({ entry, first, last, showStatus }: { entry: TimelineMessage; first: boolean; last: boolean; showStatus: boolean }) {
    const inbound = entry.direction === 'inbound';
    const feedback = (rating: 'up' | 'down') => router.post(`/desk/messages/${entry.id}/feedback`, { rating }, { preserveScroll: true });

    // Messages-style: the corners that face the rest of the group tighten.
    const near = 6;
    const far = 18;
    const radius = inbound
        ? { borderTopLeftRadius: first ? far : near, borderBottomLeftRadius: last ? far : near, borderTopRightRadius: far, borderBottomRightRadius: far }
        : { borderTopRightRadius: first ? far : near, borderBottomRightRadius: last ? far : near, borderTopLeftRadius: far, borderBottomLeftRadius: far };

    const look = inbound
        ? { background: 'var(--surface-sunken)', color: 'var(--text-primary)', border: '1px solid var(--border)' }
        : entry.from_agent
            ? { background: 'var(--accent-subtle)', color: 'var(--text-primary)', border: '1px solid color-mix(in srgb, var(--accent) 18%, transparent)' }
            : { background: 'var(--primary)', color: 'var(--primary-text)', border: '1px solid transparent' };

    const failed = entry.status === 'failed' || entry.status === 'undelivered';

    return (
        <div data-mid={entry.id} className={`group flex scroll-mt-4 ${inbound ? 'justify-start' : 'justify-end'} ${first ? 'mt-3' : 'mt-0.5'}`}>
            <div className={`flex max-w-[78%] flex-col ${inbound ? 'items-start' : 'items-end'}`}>
                {first && (
                    <div className="mb-1 flex items-center gap-1.5 px-1 text-xs text-tertiary">
                        {entry.from_agent && <Bot size={14} strokeWidth={2} className="text-accent" aria-label="Sent by the agent" />}
                        <span className="font-medium text-secondary">{entry.author}</span>
                        <span className="tabular-nums">{timeLabel(entry.at)}</span>
                        {entry.pinned && <Pin size={12} strokeWidth={2.2} className="text-accent" aria-label="Pinned" />}
                    </div>
                )}

                <div className={`flex max-w-full items-center gap-1.5 ${inbound ? '' : 'flex-row-reverse'}`}>
                    <div className="min-w-0 px-3.5 py-2 text-base" style={{ ...look, ...radius }} title={first ? undefined : timeLabel(entry.at)}>
                        {entry.body && <UserText className="block whitespace-pre-wrap [overflow-wrap:anywhere]">{entry.body}</UserText>}
                        {entry.attachments.length > 0 && (
                            <div className={`flex flex-col gap-1 ${entry.body ? 'mt-2' : ''}`}>
                                {entry.attachments.map((a) => (
                                    <span key={a.id} className="flex items-center gap-2 rounded-md px-2 py-1 text-sm" style={{ background: 'color-mix(in srgb, currentColor 8%, transparent)' }}>
                                        <Paperclip size={14} strokeWidth={1.9} className="shrink-0 opacity-70" />
                                        <span className="min-w-0 flex-1 truncate">{a.filename}</span>
                                        <span className="shrink-0 text-xs opacity-60">{fileSize(a.size_bytes)}</span>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Hover actions: pin for anyone; thumbs only on agent messages. */}
                    <div className="flex shrink-0 items-center gap-0.5 rounded-full px-1 py-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
                        style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-card)' }}>
                        <BubbleAction label={entry.pinned ? 'Unpin' : 'Pin'} on={entry.pinned} onClick={() => router.post(`/desk/messages/${entry.id}/pin`, {}, { preserveScroll: true })}>
                            <Pin size={14} strokeWidth={2} />
                        </BubbleAction>
                        {entry.from_agent && (
                            <>
                                <BubbleAction label="Good reply" on={entry.my_feedback === 'up'} color="var(--success)" onClick={() => feedback('up')}><ThumbsUp size={14} strokeWidth={2} /></BubbleAction>
                                <BubbleAction label="Bad reply" on={entry.my_feedback === 'down'} color="var(--danger)" onClick={() => feedback('down')}><ThumbsDown size={14} strokeWidth={2} /></BubbleAction>
                                {(entry.feedback_counts.up > 0 || entry.feedback_counts.down > 0) && (
                                    <span className="px-1 text-2xs text-tertiary tabular-nums" title="Team ratings">{entry.feedback_counts.up}↑ {entry.feedback_counts.down}↓</span>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {(showStatus || failed) && !inbound && (
                    <div className={`mt-1 flex items-center gap-1 px-1 text-2xs ${failed ? 'text-danger' : 'text-tertiary'}`}>
                        {failed && <AlertCircle size={12} strokeWidth={2.2} />}
                        {failed ? 'Not delivered' : statusLabel(entry.status)}
                    </div>
                )}
            </div>
        </div>
    );
}

function statusLabel(status: string): string {
    const labels: Record<string, string> = { queued: 'Sending…', sending: 'Sending…', sent: 'Sent', delivered: 'Delivered', read: 'Read', received: 'Received' };
    return labels[status] ?? status.charAt(0).toUpperCase() + status.slice(1);
}

function BubbleAction({ label, on, color = 'var(--accent)', onClick, children }: { label: string; on: boolean; color?: string; onClick: () => void; children: ReactNode }) {
    return (
        <button type="button" title={label} aria-label={label} aria-pressed={on} onClick={onClick}
            className="flex size-6 items-center justify-center rounded-full text-tertiary transition-colors hover:bg-surface-hover hover:text-primary"
            style={{ color: on ? color : undefined }}>
            {children}
        </button>
    );
}

// ── calls ────────────────────────────────────────────────────────────────

function CallEntry({ call }: { call: TimelineCall }) {
    const [open, setOpen] = useState(false);
    const trouble = call.work.some((d) => d.failed || d.tool_calls.some((t) => t.needs_reconciliation));
    const inbound = call.direction === 'inbound';
    const Icon = inbound ? PhoneIncoming : PhoneOutgoing;

    return (
        <div className="mx-auto my-2 w-full max-w-[520px] overflow-hidden rounded-lg"
            style={{ background: 'var(--surface)', border: `1px solid ${trouble ? 'var(--danger-border)' : 'var(--border)'}`, boxShadow: 'var(--shadow-card)' }}>
            <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-surface-hover">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px]" style={{ background: trouble ? 'var(--danger-subtle)' : 'var(--info-subtle)', color: trouble ? 'var(--danger)' : 'var(--info)' }}>
                    <Icon size={15} strokeWidth={2} />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-primary">{inbound ? 'Incoming call' : 'Outgoing call'}</span>
                    <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-tertiary tabular-nums">
                        <span>{call.duration}</span>
                        <span aria-hidden="true">·</span>
                        <span>{timeLabel(call.at)}</span>
                        {call.p95_ms != null && <><span aria-hidden="true">·</span><span style={{ color: call.p95_ms > 1200 ? 'var(--warning)' : undefined }}>p95 {call.p95_ms} ms</span></>}
                    </span>
                </span>
                {call.language && call.language !== 'en' && <Badge tone="info">{call.language.toUpperCase()}</Badge>}
                {trouble && <Badge tone="danger"><AlertTriangle size={12} strokeWidth={2.2} aria-hidden="true" />Needs review</Badge>}
                <ChevronDown size={15} strokeWidth={2} aria-hidden="true" className="shrink-0 text-tertiary transition-transform" style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
            </button>

            {open && (
                <div className="animate-fade-in px-3.5 pt-1 pb-3.5" style={{ borderTop: '1px solid var(--separator)' }}>
                    {call.recording_url && <audio controls src={call.recording_url} className="mt-3 h-8 w-full" />}
                    {call.transcript && call.transcript.length > 0 && (
                        <div className="mt-3">
                            <Mono className="mb-2 block">Transcript</Mono>
                            <div className="flex flex-col gap-1.5">
                                {call.transcript.map((turn, i) => (
                                    <div key={i} className="flex gap-3 text-sm">
                                        <span className="w-12 shrink-0 text-xs font-medium" style={{ color: turn.role === 'agent' ? 'var(--voice-agent)' : 'var(--voice-caller)' }}>{turn.role === 'agent' ? 'Agent' : 'Caller'}</span>
                                        <UserText className="min-w-0 flex-1 text-primary">{turn.text}</UserText>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    {call.work.length > 0 && <div className="mt-3">{call.work.map((d) => <Delegation key={d.sequence} delegation={d} />)}</div>}
                    {!call.recording_url && !(call.transcript?.length) && call.work.length === 0 && <p className="mt-3 text-sm text-tertiary">No recording or transcript was kept for this call.</p>}
                </div>
            )}
        </div>
    );
}

function Delegation({ delegation }: { delegation: DelegationView }) {
    return (
        <div className="mt-3 pt-3 first:mt-0 first:pt-0" style={{ borderTop: '1px solid var(--separator)' }}>
            <div className="mb-1.5 flex items-center gap-2">
                <span className="text-xs font-semibold text-secondary">{delegation.is_finalization ? 'After the call' : `Handoff ${delegation.sequence}`}</span>
                {delegation.failed && <Badge tone="danger">{delegation.status}</Badge>}
                {delegation.duration_ms != null && <Mono>{(delegation.duration_ms / 1000).toFixed(1)}s</Mono>}
            </div>
            {delegation.reply && <p className="mb-2 text-sm text-secondary italic">“{delegation.reply}”</p>}
            {delegation.error && <p className="mb-2 text-sm text-danger">{delegation.error}</p>}
            <div className="flex flex-col gap-1.5">
                {delegation.tool_calls.map((t) => (
                    <div key={t.id} className="flex flex-wrap items-center gap-2 text-sm">
                        <Badge tone={t.tone} dot>{t.status_label}</Badge>
                        <span className="text-primary">{t.action}</span>
                        {t.durable && <Mono>writes</Mono>}
                        {t.duration_ms != null && <Mono>{t.duration_ms} ms</Mono>}
                        {t.needs_reconciliation && <span className="w-full text-xs text-danger">May or may not have completed. Check before telling the customer.</span>}
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── composer ─────────────────────────────────────────────────────────────

/**
 * Docked at the bottom, as in Messages. It sends a reply on the thread's
 * channel or, switched to Note, leaves something only the team can read.
 * Reminders and tickets need more fields, so they still open their dialogs.
 */
const Composer = forwardRef<HTMLTextAreaElement, {
    thread: Thread; mode: Mode; onMode: (m: Mode) => void; canReply: boolean; onCompose: (c: Composition) => void;
}>(function Composer({ thread, mode, onMode, canReply, onCompose }, ref) {
    const { data, setData, post, processing, errors, reset, clearErrors } = useForm({ body: '' });
    const note = mode === 'note';
    const ChannelIcon = channelIcon(thread.channel);

    const submit = (event?: FormEvent) => {
        event?.preventDefault();
        if (!data.body.trim() || processing) return;
        post(note ? `/desk/inbox/${thread.id}/notes` : `/desk/inbox/${thread.id}/messages`, {
            preserveScroll: true,
            onSuccess: () => { reset('body'); if (note && canReply) onMode('reply'); },
        });
    };

    const blockedReason = thread.identifier?.blocked
        ? `${thread.identifier.value} is blocked. Unblock it from the details pane to reply.`
        : !thread.can_compose
            ? thread.channel === 'call' ? 'Calls cannot be answered in text. Text them from the contact instead.' : 'This channel needs a live visitor session, which has ended.'
            : null;

    return (
        <div className="shrink-0 px-5 pt-2 pb-4">
            {blockedReason && (
                <p className="mx-auto mb-2 flex max-w-[760px] items-center gap-2 px-1 text-xs text-tertiary">
                    {thread.identifier?.blocked ? <Ban size={14} strokeWidth={1.9} className="shrink-0 text-danger" /> : <AlertCircle size={14} strokeWidth={1.9} className="shrink-0" />}
                    {blockedReason} Notes still work.
                </p>
            )}
            <form onSubmit={submit}
                className="mx-auto max-w-[760px] rounded-xl transition-[background-color,border-color,box-shadow] focus-within:[box-shadow:var(--ring)]"
                style={{
                    background: note ? 'var(--warning-subtle)' : 'var(--surface)',
                    border: `1px solid ${note ? 'var(--warning-border)' : 'var(--border-strong)'}`,
                    boxShadow: 'var(--shadow-card)',
                }}>
                <AutoTextarea ref={ref} value={data.body} dir="auto" maxHeight={200}
                    onChange={(e) => { setData('body', e.target.value); if (errors.body) clearErrors('body'); }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); }
                        if (e.key === 'Escape' && note && canReply) onMode('reply');
                    }}
                    placeholder={note ? 'Note for the team. The customer never sees this.' : `Reply by ${thread.channel_label.toLowerCase()}`}
                    aria-label={note ? 'Note' : 'Reply'}
                    className="px-4 pt-3 pb-1.5" />
                {errors.body && <p className="px-4 pb-1 text-xs text-danger">{errors.body}</p>}

                <div className="flex items-center gap-0.5 px-2 pb-2">
                    <Menu side="top" width={240} trigger={(open, toggle) => (
                        <button type="button" onClick={toggle} aria-expanded={open} aria-haspopup="menu" title="Choose how to send"
                            className="flex h-8 items-center gap-1.5 rounded-full pr-2 pl-2.5 text-sm font-medium transition-colors hover:bg-surface-hover"
                            style={{ color: note ? 'var(--warning)' : 'var(--text-secondary)' }}>
                            {note ? <StickyNote size={15} strokeWidth={1.9} /> : <ChannelIcon size={15} strokeWidth={1.9} />}
                            {note ? 'Internal note' : thread.channel_label}
                            <ChevronDown size={14} strokeWidth={2} className="opacity-70" />
                        </button>
                    )}>
                        {(close) => (
                            <>
                                <MenuLabel>Send as</MenuLabel>
                                {canReply && (
                                    <MenuItem icon={<ChannelIcon size={14} />} active={!note} onSelect={() => { onMode('reply'); close(); }}
                                        trailing={!note ? <span className="text-xs text-tertiary">Customer sees</span> : undefined}>
                                        Reply by {thread.channel_label}
                                    </MenuItem>
                                )}
                                <MenuItem icon={<StickyNote size={14} />} active={note} onSelect={() => { onMode('note'); close(); }}
                                    trailing={note ? <span className="text-xs text-tertiary">Team only</span> : undefined}>
                                    Internal note
                                </MenuItem>
                                <MenuSeparator />
                                <MenuItem icon={<AlarmClock size={14} />} onSelect={() => { onCompose('reminder'); close(); }}>Reminder…</MenuItem>
                                <MenuItem icon={<TicketIcon size={14} />} onSelect={() => { onCompose('ticket'); close(); }}>Ticket…</MenuItem>
                            </>
                        )}
                    </Menu>

                    <IconButton size="sm" label="Set a reminder" onClick={() => onCompose('reminder')}><AlarmClock size={15} strokeWidth={1.9} /></IconButton>
                    <IconButton size="sm" label="Raise a ticket" onClick={() => onCompose('ticket')}><TicketIcon size={15} strokeWidth={1.9} /></IconButton>

                    <div className="flex-1" />
                    <span className="mr-2 hidden items-center gap-1 text-2xs text-tertiary 2xl:flex"><Kbd>↵</Kbd> to {note ? 'save' : 'send'} · <Kbd>⇧</Kbd><Kbd>↵</Kbd> new line</span>

                    <button type="submit" disabled={processing || !data.body.trim()} title={note ? 'Save note' : 'Send'} aria-label={note ? 'Save note' : 'Send'}
                        className="v-btn v-btn--primary v-btn--icon size-8 rounded-full">
                        {processing ? <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <ArrowUp size={16} strokeWidth={2.2} />}
                    </button>
                </div>
            </form>
        </div>
    );
});
