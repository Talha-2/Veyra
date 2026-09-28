import { Link, router } from '@inertiajs/react';
import { AlarmClock, Bot, Check, ChevronDown, ChevronRight, Lock, Ticket as TicketIcon } from 'lucide-react';
import { useState } from 'react';

import Popover from '../ui/popover';
import { Avatar, Badge, Mono, UserText, toneColor, type Tone } from '../ui/primitives';
import { AvatarStack } from './controls';
import { dateTimeLabel, dayLabel, initialsOf, timeLabel } from './helpers';

/**
 * The things in a thread that are not messages: notes the team left,
 * reminders someone set, tickets someone raised. None of them is a bubble,
 * so nobody mistakes an internal note for something the customer saw.
 */

/** A hairline with the day on it, as Linear and Vercel draw a break in a log. */
export function DaySeparator({ at }: { at: string }) {
    return (
        <div className="my-5 flex items-center gap-3" role="separator" aria-label={`${dayLabel(at)} ${timeLabel(at)}`}>
            <span className="h-px flex-1" style={{ background: 'var(--separator)' }} aria-hidden="true" />
            <span className="text-xs text-tertiary tabular-nums">
                <span className="font-medium text-secondary">{dayLabel(at)}</span> · {timeLabel(at)}
            </span>
            <span className="h-px flex-1" style={{ background: 'var(--separator)' }} aria-hidden="true" />
        </div>
    );
}

// ── notes ─────────────────────────────────────────────────────────────────

export interface NoteView { id: number; body: string; author: string; at: string; by_agent?: boolean }

/**
 * An internal note: the author's face, then a tinted sheet with a lock and
 * the words "Internal note" so it can never pass for a customer message.
 * Used in the inbox thread and on the ticket page alike.
 */
export function NoteCard({ note, size = 'md', when = 'datetime' }: { note: NoteView; size?: 'md' | 'lg'; when?: 'time' | 'datetime' }) {
    const agent = note.by_agent ?? note.author === 'Agent';

    return (
        <div className="flex animate-fade-in gap-3" data-note={note.id}>
            <span className="relative mt-0.5 shrink-0 rounded-full" style={{ boxShadow: '0 0 0 3px var(--surface)' }}>
                {agent
                    ? <span className="flex size-7 items-center justify-center rounded-full" style={{ background: 'var(--accent-subtle)', color: 'var(--accent-text)' }}><Bot size={14} strokeWidth={2} /></span>
                    : <Avatar initials={initialsOf(note.author)} name={note.author} size={28} />}
            </span>
            <div className="min-w-0 flex-1 rounded-lg px-4 pt-2.5 pb-3" style={{ background: 'var(--warning-subtle)', border: '1px solid var(--warning-border)' }}>
                <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                    <span className="inline-flex items-center gap-1 font-semibold" style={{ color: 'var(--warning)' }}>
                        <Lock size={11} strokeWidth={2.4} aria-hidden="true" /> Internal note
                    </span>
                    <span className="text-tertiary" aria-hidden="true">·</span>
                    <span className="font-medium text-primary">{note.author}</span>
                    <time dateTime={note.at} title={new Date(note.at).toLocaleString()} className="text-tertiary tabular-nums">{when === 'time' ? timeLabel(note.at) : dateTimeLabel(note.at)}</time>
                </div>
                <p className={`whitespace-pre-wrap text-primary wrap-anywhere ${size === 'lg' ? 'text-md leading-relaxed' : 'text-base'}`}>
                    <UserText>{note.body}</UserText>
                </p>
            </div>
        </div>
    );
}

// ── reminders ─────────────────────────────────────────────────────────────

export function ReminderCard({ reminder }: { reminder: { id: number; text: string; due_at: string | null; overdue: boolean } }) {
    const tone = reminder.overdue ? 'danger' : 'info';

    return (
        <div className="flex animate-fade-in items-center gap-3 rounded-lg px-3.5 py-2.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md" style={{ background: `var(--${tone}-subtle)`, color: `var(--${tone})` }}>
                <AlarmClock size={14} strokeWidth={2} />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-primary"><UserText>{reminder.text}</UserText></span>
                {reminder.due_at && <span className="block text-xs text-tertiary">Reminder · {reminder.overdue ? 'was due' : 'due'} {dateTimeLabel(reminder.due_at)}</span>}
            </span>
            {reminder.overdue && <Badge tone="danger" dot>Overdue</Badge>}
        </div>
    );
}

// ── tickets ───────────────────────────────────────────────────────────────

export interface TicketCardData {
    id: number; reference: string; subject: string; status: string; status_label?: string; status_tone?: Tone;
    priority: string; priority_tone: Tone; created_by_agent: boolean; assignees?: { id: number; name: string }[]; at?: string | null;
}

/**
 * A ticket raised on this conversation: reference, subject, status,
 * priority and who owns it. The whole card opens the ticket; the status
 * pill is its own control and changes status in place when the statuses
 * are known.
 */
export function TicketCard({ ticket, statuses }: { ticket: TicketCardData; statuses?: { value: string; label: string; tone: Tone }[] }) {
    const [status, setStatus] = useState(ticket.status);
    const current = statuses?.find((s) => s.value === status);
    const label = current?.label ?? ticket.status_label ?? ticket.status;
    const tone = current?.tone ?? ticket.status_tone ?? 'muted';
    const assignees = ticket.assignees ?? [];

    const change = (next: string) => {
        if (next === status) return;
        const previous = status;
        setStatus(next);
        router.patch(`/desk/tickets/${ticket.id}`, { status: next }, { preserveScroll: true, preserveState: true, onError: () => setStatus(previous) });
    };

    return (
        <div className="v-card-hover group relative flex animate-fade-in items-start gap-3.5 rounded-lg px-4 py-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <Link href={`/desk/tickets/${ticket.id}`} className="absolute inset-0 rounded-lg" aria-label={`Open ticket ${ticket.reference}: ${ticket.subject}`} />

            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                <TicketIcon size={15} strokeWidth={1.9} />
            </span>

            <span className="pointer-events-none min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-1.5 overflow-hidden text-xs whitespace-nowrap text-tertiary">
                    <Mono className="text-secondary">{ticket.reference}</Mono>
                    <span aria-hidden="true">·</span>
                    {ticket.created_by_agent
                        ? <span className="inline-flex min-w-0 items-center gap-1 truncate"><Bot size={12} strokeWidth={2.2} className="text-accent" aria-hidden="true" />Raised by the agent</span>
                        : <span>Ticket raised</span>}
                    {ticket.at && <><span aria-hidden="true">·</span><span className="tabular-nums">{timeLabel(ticket.at)}</span></>}
                </span>
                <span className="mt-0.5 block truncate text-sm font-semibold text-primary"><UserText>{ticket.subject}</UserText></span>
                <span className="mt-2 flex flex-wrap items-center gap-2">
                {statuses && statuses.length > 0 ? (
                    <span className="pointer-events-auto relative z-10"><Popover align="start" width={200} trigger={({ open, toggle }) => (
                        <button type="button" onClick={toggle} aria-expanded={open} aria-haspopup="menu" aria-label={`Status: ${label}. Change status`}
                            className="inline-flex h-5.5 items-center gap-1.5 rounded-full pr-1.5 pl-2 text-2xs font-medium whitespace-nowrap transition-[filter] hover:brightness-95"
                            style={{ color: `var(--${tone === 'muted' ? 'text-secondary' : tone === 'accent' ? 'accent-text' : tone})`, background: tone === 'muted' ? 'var(--surface-sunken)' : `var(--${tone}-subtle)` }}>
                            <span className="size-1.5 rounded-full" style={{ background: toneColor(tone) }} aria-hidden="true" />
                            {label}
                            <ChevronDown size={11} strokeWidth={2.4} className="opacity-70" aria-hidden="true" />
                        </button>
                    )}>
                        {(close) => (
                            <div className="p-1">
                                <div className="v-eyebrow px-2.5 pt-1.5 pb-1">Set status</div>
                                {statuses.map((s) => (
                                    <button key={s.value} type="button" role="menuitemradio" aria-checked={s.value === status}
                                        onClick={() => { change(s.value); close(); }}
                                        className="flex w-full items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-left text-sm text-primary transition-colors hover:bg-surface-hover">
                                        <span className="size-2 shrink-0 rounded-full" style={{ background: toneColor(s.tone) }} aria-hidden="true" />
                                        <span className="flex-1">{s.label}</span>
                                        {s.value === status && <Check size={14} strokeWidth={2.2} className="text-secondary" />}
                                    </button>
                                ))}
                            </div>
                        )}
                    </Popover></span>
                ) : (
                    <Badge tone={tone} dot>{label}</Badge>
                )}
                <Badge tone={ticket.priority_tone}>{ticket.priority.charAt(0).toUpperCase() + ticket.priority.slice(1)} priority</Badge>
                {assignees.length > 0 && <span className="ml-auto flex items-center gap-1.5 text-xs text-tertiary"><AvatarStack people={assignees} size={20} /><span className="max-w-[140px] truncate">{assignees.length === 1 ? assignees[0].name : `${assignees.length} people`}</span></span>}
                </span>
            </span>

            <ChevronRight size={15} strokeWidth={2} className="pointer-events-none mt-2.5 shrink-0 text-tertiary transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </div>
    );
}

