import { router, useForm } from '@inertiajs/react';
import {
    AlarmClock, AlertCircle, ArrowUp, Ban, BellOff, Bot, Check, CheckCheck, CheckCircle2, Clock, Lock, MessagesSquare, MoreHorizontal,
    PanelRight, Paperclip, Pin, RotateCcw, StickyNote, Star, Tag as TagIcon, ThumbsDown, ThumbsUp,
    Ticket as TicketIcon, UserPlus,
} from 'lucide-react';
import { forwardRef, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';

import { Menu, MenuItem, MenuLabel, MenuSeparator } from '../shell/menu';
import { SegmentedControl } from '../ui/kit';
import { Avatar, Badge, EmptyState, Kbd, UserText } from '../ui/primitives';
import AgentSteps from '../desk-inbox/agent-steps';
import CallCard from '../desk-inbox/call-card';
import { AutoTextarea, AvatarStack, IconButton } from '../desk-inbox/controls';
import { channelIcon, dateTimeLabel, fileSize, initialsOf, sameDay, snoozeOptions, timeLabel } from '../desk-inbox/helpers';
import TagEditor from '../desk-inbox/tag-editor';
import { DaySeparator, NoteCard, ReminderCard, TicketCard } from '../desk-inbox/timeline-cards';
import ComposeDialog, { type Composition } from './compose-dialog';
import AssignDialog from './assign-dialog';
import type { TeamMember, ThreadView, TicketSummary, TimelineCall, TimelineMessage } from '../../types/desk';

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

            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pt-2 pb-4">
                <div className="mx-auto mt-auto flex w-full max-w-[760px] flex-col">
                    {visible.length === 0 && (
                        <p className="py-10 text-center text-sm text-tertiary">{filter === 'all' ? 'No messages yet.' : filter === 'calls' ? 'No calls on this conversation.' : 'Nothing from this sender yet.'}</p>
                    )}
                    <Timeline items={visible} statuses={thread.ticket_statuses}
                        contact={{ name: thread.contact?.name ?? thread.identifier?.value ?? thread.title, initials: thread.contact?.initials ?? initialsOf(thread.identifier?.value ?? thread.title) }}
                        callerName={thread.contact?.name ?? 'Caller'} />
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

function Timeline({ items, statuses, contact, callerName }: {
    items: Item[]; statuses?: ThreadView['ticket_statuses']; contact: { name: string; initials: string }; callerName: string;
}) {
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
                    body = <MessageRow entry={item.entry} first={!joinsPrev} last={!joinsNext} showStatus={item === lastOutbound} contact={contact} />;
                } else if (item.kind === 'call') {
                    body = <CallCard call={item.entry} callerName={callerName} />;
                } else if (item.kind === 'note') {
                    body = <NoteCard note={item.note} when="time" />;
                } else if (item.kind === 'reminder') {
                    body = <ReminderCard reminder={item.reminder} />;
                } else {
                    body = <TicketCard ticket={item.ticket} statuses={statuses} />;
                }

                return (
                    <div key={key}>
                        {separator && <DaySeparator at={item.at} />}
                        {item.kind === 'message' ? body : <div className={separator ? 'mb-3' : 'my-3'}>{body}</div>}
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

/**
 * One message. The first of a run carries the face and the name; the rest
 * sit tight under it. Customer on the left, the team and the agent on the
 * right: the agent in an Ember-tinted bubble with an Agent badge, a
 * colleague in ink, so a person's promise never reads as the agent's.
 */
function MessageRow({ entry, first, last, showStatus, contact }: {
    entry: TimelineMessage; first: boolean; last: boolean; showStatus: boolean; contact: { name: string; initials: string };
}) {
    const inbound = entry.direction === 'inbound';
    const agent = entry.from_agent;
    const feedback = (rating: 'up' | 'down') => router.post(`/desk/messages/${entry.id}/feedback`, { rating }, { preserveScroll: true });
    const failed = entry.status === 'failed' || entry.status === 'undelivered';
    const steps = entry.steps ?? [];

    // The corners that face the rest of the run tighten, as in Messages.
    const near = 4;
    const far = 14;
    const radius = inbound
        ? { borderTopLeftRadius: first ? far : near, borderBottomLeftRadius: last ? far : near, borderTopRightRadius: far, borderBottomRightRadius: far }
        : { borderTopRightRadius: first ? far : near, borderBottomRightRadius: last ? far : near, borderTopLeftRadius: far, borderBottomLeftRadius: far };

    const look = inbound
        ? { background: 'var(--surface-sunken)', color: 'var(--text-primary)', border: '1px solid var(--border)' }
        : agent
            ? { background: 'var(--accent-subtle)', color: 'var(--text-primary)', border: '1px solid color-mix(in srgb, var(--accent) 22%, transparent)' }
            : { background: 'var(--primary)', color: 'var(--primary-text)', border: '1px solid transparent' };

    const name = inbound ? contact.name : agent ? null : entry.author;

    return (
        <div data-mid={entry.id} className={`group/msg flex scroll-mt-4 gap-2.5 ${inbound ? '' : 'flex-row-reverse'} ${first ? 'mt-5' : 'mt-1'}`}>
            <span className="w-7 shrink-0 pt-0.5">
                {first && (agent
                    ? <span className="flex size-7 items-center justify-center rounded-full" style={{ background: 'var(--accent-subtle)', color: 'var(--accent-text)' }} title="The agent"><Bot size={14} strokeWidth={2} /></span>
                    : inbound
                        ? <Avatar initials={contact.initials} name={contact.name} size={28} />
                        : <Avatar initials={initialsOf(entry.author)} name={entry.author} size={28} />)}
            </span>

            <div className={`flex min-w-0 max-w-[80%] flex-col ${inbound ? 'items-start' : 'items-end'}`}>
                {first && (
                    <div className={`mb-1 flex items-center gap-1.5 px-0.5 text-xs text-tertiary ${inbound ? '' : 'flex-row-reverse'}`}>
                        {name && <span className="max-w-[240px] truncate font-medium text-secondary"><UserText>{name}</UserText></span>}
                        {agent && (
                            <span className="inline-flex h-4.5 items-center gap-1 rounded-xs px-1.5 text-2xs font-semibold" style={{ background: 'var(--accent-subtle)', color: 'var(--accent-text)' }}>
                                <Bot size={11} strokeWidth={2.2} aria-hidden="true" />Agent
                            </span>
                        )}
                        <time dateTime={entry.at} title={new Date(entry.at).toLocaleString()} className="tabular-nums">{timeLabel(entry.at)}</time>
                        {entry.pinned && <Pin size={12} strokeWidth={2.2} className="text-accent" aria-label="Pinned" />}
                    </div>
                )}

                {agent && steps.length > 0 && <AgentSteps steps={steps} align="end" />}

                <div className={`flex max-w-full items-center gap-2 ${inbound ? '' : 'flex-row-reverse'}`}>
                    <div className="min-w-0 px-3.5 py-2 text-base" style={{ ...look, ...radius }}>
                        {entry.body && <UserText className="block whitespace-pre-wrap wrap-anywhere">{entry.body}</UserText>}
                        {entry.attachments.length > 0 && (
                            <div className={`flex flex-col gap-1 ${entry.body ? 'mt-2' : ''}`}>
                                {entry.attachments.map((a) => (
                                    <span key={a.id} className="flex items-center gap-2 rounded-sm px-2 py-1 text-sm" style={{ background: 'color-mix(in srgb, currentColor 8%, transparent)' }}>
                                        <Paperclip size={14} strokeWidth={1.9} className="shrink-0 opacity-70" />
                                        <span className="min-w-0 flex-1 truncate">{a.filename}</span>
                                        <span className="shrink-0 text-xs opacity-60">{fileSize(a.size_bytes)}</span>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* On hover: pin, ratings on the agent's replies, and the time for a message deeper in a run. */}
                    <div className={`flex shrink-0 items-center gap-1.5 opacity-0 transition-opacity group-hover/msg:opacity-100 focus-within:opacity-100 ${inbound ? '' : 'flex-row-reverse'}`}>
                        <div className="flex items-center gap-0.5 rounded-md p-0.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-card)' }}>
                            <BubbleAction label={entry.pinned ? 'Unpin' : 'Pin'} on={entry.pinned} onClick={() => router.post(`/desk/messages/${entry.id}/pin`, {}, { preserveScroll: true })}>
                                <Pin size={14} strokeWidth={2} />
                            </BubbleAction>
                            {agent && (
                                <>
                                    <BubbleAction label="Good reply" on={entry.my_feedback === 'up'} color="var(--success)" onClick={() => feedback('up')}><ThumbsUp size={14} strokeWidth={2} /></BubbleAction>
                                    <BubbleAction label="Bad reply" on={entry.my_feedback === 'down'} color="var(--danger)" onClick={() => feedback('down')}><ThumbsDown size={14} strokeWidth={2} /></BubbleAction>
                                    {(entry.feedback_counts.up > 0 || entry.feedback_counts.down > 0) && (
                                        <span className="px-1 text-2xs text-tertiary tabular-nums" title="Team ratings">{entry.feedback_counts.up}↑ {entry.feedback_counts.down}↓</span>
                                    )}
                                </>
                            )}
                        </div>
                        {!first && <time dateTime={entry.at} className="text-2xs text-tertiary tabular-nums">{timeLabel(entry.at)}</time>}
                    </div>
                </div>

                {(showStatus || failed) && !inbound && <Delivery status={entry.status} failed={failed} />}
            </div>
        </div>
    );
}

function Delivery({ status, failed }: { status: string; failed: boolean }) {
    const sending = status === 'queued' || status === 'sending';
    const Icon = failed ? AlertCircle : sending ? Clock : status === 'delivered' || status === 'read' ? CheckCheck : Check;

    return (
        <div className={`mt-1 flex items-center gap-1 px-0.5 text-2xs ${failed ? 'text-danger' : 'text-tertiary'}`}>
            <Icon size={12} strokeWidth={2.2} aria-hidden="true" style={{ color: status === 'read' && !failed ? 'var(--accent-text)' : undefined }} />
            {failed ? 'Not delivered' : statusLabel(status)}
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
            className="flex size-6 items-center justify-center rounded-sm text-tertiary transition-colors hover:bg-surface-hover hover:text-primary"
            style={{ color: on ? color : undefined }}>
            {children}
        </button>
    );
}

// ── composer ─────────────────────────────────────────────────────────────

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const MOD = isMac ? '⌘' : 'Ctrl';

/**
 * Docked at the bottom. Two modes, switched by the tabs on top: Reply goes
 * to the customer on the thread's channel; Internal note turns the whole
 * composer amber and stays with the team. Enter sends a reply; a note is
 * longer-form, so Enter is a new line there and Cmd/Ctrl+Enter saves (it
 * sends in either mode). Reminders and tickets need more fields, so they
 * open their dialogs.
 */
const Composer = forwardRef<HTMLTextAreaElement, {
    thread: Thread; mode: Mode; onMode: (m: Mode) => void; canReply: boolean; onCompose: (c: Composition) => void;
}>(function Composer({ thread, mode, onMode, canReply, onCompose }, ref) {
    const { data, setData, post, processing, errors, reset, clearErrors } = useForm({ body: '' });
    const note = mode === 'note';
    const ChannelIcon = channelIcon(thread.channel);
    const inner = useRef<HTMLTextAreaElement | null>(null);

    const submit = (event?: FormEvent) => {
        event?.preventDefault();
        if (!data.body.trim() || processing) return;
        post(note ? `/desk/inbox/${thread.id}/notes` : `/desk/inbox/${thread.id}/messages`, {
            preserveScroll: true,
            onSuccess: () => { reset('body'); if (note && canReply) onMode('reply'); },
        });
    };

    const switchTo = (next: Mode) => { onMode(next); requestAnimationFrame(() => inner.current?.focus()); };

    // Why Reply is off, short enough for the tab row; the full reason is its tooltip.
    const blocked = thread.identifier?.blocked
        ? { short: `${thread.identifier.value} is blocked`, full: `${thread.identifier.value} is blocked. Unblock it in the details pane to reply.` }
        : !thread.can_compose
            ? thread.channel === 'call'
                ? { short: 'Calls can’t be answered in text', full: 'A call can’t be answered in text. Text them from their contact page; notes still work here.' }
                : { short: 'The visitor has left the chat', full: 'The visitor has left the chat, so a reply can’t reach them. Notes still work.' }
            : null;

    return (
        <div className="shrink-0 px-6 pt-2 pb-5">
            <form onSubmit={submit}
                className="mx-auto max-w-[760px] overflow-hidden rounded-lg transition-[background-color,border-color,box-shadow] focus-within:[box-shadow:var(--ring)]"
                style={{
                    background: note ? 'var(--warning-subtle)' : 'var(--surface)',
                    border: `1px solid ${note ? 'var(--warning-border)' : 'var(--border-strong)'}`,
                    boxShadow: 'var(--shadow-card)',
                }}>
                <div className="flex items-center gap-1 px-2 pt-2" role="tablist" aria-label="Write a">
                    <ModeTab active={!note} disabled={!canReply} title={blocked?.full ?? `Reply to the customer by ${thread.channel_label}`} onClick={() => switchTo('reply')}>
                        <ChannelIcon size={14} strokeWidth={1.9} /> Reply
                    </ModeTab>
                    <ModeTab active={note} tone="warning" title="Only your team can see notes" onClick={() => switchTo('note')}>
                        <Lock size={13} strokeWidth={2} /> Internal note
                    </ModeTab>
                    {blocked ? (
                        <span className="ml-auto flex min-w-0 items-center gap-1.5 pr-2 pl-3 text-xs text-tertiary" title={blocked.full}>
                            {thread.identifier?.blocked
                                ? <Ban size={13} strokeWidth={2} className="shrink-0 text-danger" aria-hidden="true" />
                                : <AlertCircle size={13} strokeWidth={2} className="shrink-0" aria-hidden="true" />}
                            <span className="truncate">{blocked.short}</span>
                            <span className="sr-only">{blocked.full}</span>
                        </span>
                    ) : (
                        <span className="ml-auto truncate pr-2 pl-3 text-xs" style={{ color: note ? 'var(--warning)' : 'var(--text-tertiary)' }}>
                            {note ? 'Only your team sees this' : `The customer gets this by ${thread.channel_label.toLowerCase()}`}
                        </span>
                    )}
                </div>

                <AutoTextarea
                    ref={(el) => {
                        inner.current = el;
                        if (typeof ref === 'function') ref(el);
                        else if (ref) ref.current = el;
                    }}
                    value={data.body} dir="auto" maxHeight={260}
                    onChange={(e) => { setData('body', e.target.value); if (errors.body) clearErrors('body'); }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                            if (e.metaKey || e.ctrlKey) { e.preventDefault(); submit(); }
                            else if (!note && !e.shiftKey) { e.preventDefault(); submit(); }
                        }
                        if (e.key === 'Escape' && note && canReply) onMode('reply');
                    }}
                    placeholder={note ? 'Write a note for the team. The customer never sees it.' : `Reply by ${thread.channel_label.toLowerCase()}…`}
                    aria-label={note ? 'Internal note' : 'Reply'}
                    className="v-bare px-4 pt-2.5 pb-2 text-md"
                    style={{ minHeight: note ? 80 : 52 }} />
                {errors.body && <p className="px-4 pb-1 text-xs text-danger">{errors.body}</p>}

                <div className="flex items-center gap-0.5 px-2 pb-2">
                    <IconButton size="sm" label="Set a reminder" onClick={() => onCompose('reminder')}><AlarmClock size={15} strokeWidth={1.9} /></IconButton>
                    <IconButton size="sm" label="Raise a ticket" onClick={() => onCompose('ticket')}><TicketIcon size={15} strokeWidth={1.9} /></IconButton>

                    <div className="flex-1" />
                    <span className="mr-3 hidden items-center gap-1 text-2xs text-tertiary xl:flex">
                        {note
                            ? <><Kbd>{MOD}</Kbd><Kbd>↵</Kbd> to save</>
                            : <><Kbd>↵</Kbd> to send · <Kbd>⇧</Kbd><Kbd>↵</Kbd> new line</>}
                    </span>

                    <button type="submit" disabled={processing || !data.body.trim()} className="v-btn v-btn--primary v-btn--sm"
                        title={note ? `Save note (${MOD}+Enter)` : 'Send (Enter)'}>
                        {processing
                            ? <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
                            : note ? <StickyNote size={14} strokeWidth={2} /> : <ArrowUp size={14} strokeWidth={2.2} />}
                        {note ? 'Save note' : 'Send'}
                    </button>
                </div>
            </form>
        </div>
    );
});

function ModeTab({ active, disabled = false, tone, title, onClick, children }: {
    active: boolean; disabled?: boolean; tone?: 'warning'; title: string; onClick: () => void; children: ReactNode;
}) {
    const on = active && !disabled;

    return (
        <button type="button" role="tab" aria-selected={on} disabled={disabled} title={title} onClick={onClick}
            className="inline-flex h-7 items-center gap-1.5 rounded-sm px-2.5 text-xs font-medium transition-colors enabled:hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-45"
            style={{
                color: on ? (tone ? `var(--${tone})` : 'var(--text-primary)') : 'var(--text-secondary)',
                background: on ? (tone ? 'color-mix(in srgb, var(--warning-fill) 16%, transparent)' : 'var(--surface-active)') : undefined,
            }}>
            {children}
        </button>
    );
}
