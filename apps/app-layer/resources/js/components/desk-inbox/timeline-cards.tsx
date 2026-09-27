import { Link } from '@inertiajs/react';
import { AlarmClock, Bot, ChevronRight, StickyNote, Ticket as TicketIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { Badge, Mono, RelativeTime, UserText, type Tone } from '../ui/primitives';
import { dateTimeLabel, dayLabel, timeLabel } from './helpers';

/**
 * The things in a thread that are not messages: notes the team left,
 * reminders someone set, tickets someone raised. Each is a card centred in
 * the timeline — never a bubble, so nobody mistakes an internal note for
 * something the customer saw.
 */

export function DaySeparator({ at }: { at: string }) {
    return (
        <div className="my-3 flex items-center justify-center" role="separator">
            <span className="text-xs font-medium text-tertiary">
                <span className="font-semibold text-secondary">{dayLabel(at)}</span> {timeLabel(at)}
            </span>
        </div>
    );
}

function Card({ tint, border, icon, iconColor, title, meta, children }: {
    tint: string; border: string; icon: ReactNode; iconColor: string; title: ReactNode; meta?: ReactNode; children?: ReactNode;
}) {
    return (
        <div className="mx-auto my-1.5 w-full max-w-[460px] animate-fade-in rounded-lg px-3.5 py-3" style={{ background: tint, border: `1px solid ${border}` }}>
            <div className="flex items-center gap-2">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-md" style={{ color: iconColor, background: 'var(--surface)' }}>{icon}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-primary">{title}</span>
                {meta}
            </div>
            {children && <div className="mt-2 pl-8">{children}</div>}
        </div>
    );
}

export function NoteCard({ note }: { note: { id: number; body: string; author: string; at: string } }) {
    return (
        <Card tint="var(--warning-subtle)" border="var(--warning-border)" iconColor="var(--warning)" icon={<StickyNote size={14} strokeWidth={2} />}
            title={<>Note from {note.author}</>} meta={<RelativeTime at={note.at} />}>
            <p className="text-sm whitespace-pre-wrap text-primary"><UserText>{note.body}</UserText></p>
            <p className="mt-1.5 text-2xs text-tertiary">Only your team can see this.</p>
        </Card>
    );
}

export function ReminderCard({ reminder }: { reminder: { id: number; text: string; due_at: string | null; overdue: boolean } }) {
    return (
        <Card tint={reminder.overdue ? 'var(--danger-subtle)' : 'var(--info-subtle)'} border={reminder.overdue ? 'var(--danger-border)' : 'var(--info-border)'}
            iconColor={reminder.overdue ? 'var(--danger)' : 'var(--info)'} icon={<AlarmClock size={14} strokeWidth={2} />}
            title={<UserText>{reminder.text}</UserText>}
            meta={reminder.overdue ? <Badge tone="danger" dot>Overdue</Badge> : undefined}>
            {reminder.due_at && <p className="text-xs text-secondary">{reminder.overdue ? 'Was due' : 'Due'} {dateTimeLabel(reminder.due_at)}</p>}
        </Card>
    );
}

export function TicketCard({ ticket }: {
    ticket: { id: number; reference: string; subject: string; status_label?: string; status_tone?: Tone; priority: string; priority_tone: Tone; created_by_agent: boolean };
}) {
    return (
        <Link href={`/desk/tickets/${ticket.id}`} className="v-panel v-card-hover group mx-auto my-1.5 flex w-full max-w-[460px] animate-fade-in items-center gap-3 px-3.5 py-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px]" style={{ background: 'var(--accent-subtle)', color: 'var(--accent-text)' }}>
                <TicketIcon size={15} strokeWidth={2} />
            </span>
            <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-xs text-tertiary">
                    {ticket.created_by_agent && <Bot size={14} strokeWidth={2} className="text-accent" aria-label="Raised by the agent" />}
                    {ticket.created_by_agent ? 'The agent raised' : 'Ticket raised'} <Mono>{ticket.reference}</Mono>
                </span>
                <span className="mt-0.5 block truncate text-sm font-semibold text-primary"><UserText>{ticket.subject}</UserText></span>
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
                {ticket.status_label && <Badge tone={ticket.status_tone ?? 'muted'} dot>{ticket.status_label}</Badge>}
                <Badge tone={ticket.priority_tone}>{ticket.priority}</Badge>
            </span>
            <ChevronRight size={14} strokeWidth={2} className="shrink-0 text-tertiary transition-transform group-hover:translate-x-0.5" />
        </Link>
    );
}
