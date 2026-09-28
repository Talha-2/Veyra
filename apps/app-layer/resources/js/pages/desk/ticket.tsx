import { Head, Link, router, useForm } from '@inertiajs/react';
import { Bot, ChevronRight, CircleDot, Flag, Layers, Lock, Mail, MessagesSquare, Phone, Plus, StickyNote, Users } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';

import Popover from '../../components/ui/popover';
import { DeskPage, Panel, PanelHeader, WithSidePanel } from '../../components/desk-pages/layout';
import { KeyValues, SegmentedControl } from '../../components/ui/kit';
import { Avatar, Badge, Kbd, Mono, RelativeTime, UserText, toneColor, type Tone } from '../../components/ui/primitives';
import { PageHeader } from '../../components/ui/page';
import { AutoTextarea, AvatarStack, FieldError, PeoplePicker } from '../../components/desk-inbox/controls';
import { channelIcon, dateTimeLabel, initialsOf } from '../../components/desk-inbox/helpers';
import { PropertyRow, PropertySelect } from '../../components/desk-inbox/inspector';
import TagEditor from '../../components/desk-inbox/tag-editor';
import { NoteCard } from '../../components/desk-inbox/timeline-cards';

interface Props {
    ticket: {
        id: number; reference: string; subject: string; body: string | null; status: string; priority: string; ticket_type_id: number | null;
        channel: string; created_by: string; created_by_agent: boolean; created_at: string; resolved_at: string | null; conversation_id: number | null;
        updated_at?: string | null;
        contact: { id: number; name: string; initials: string; phone: string | null; email: string | null; company?: string | null } | null;
        conversation?: { id: number; title: string; channel: string; channel_label: string; status: string; last_message_at: string | null } | null;
        assignee_ids: number[]; tags: string[];
        notes: { id: number; body: string; author: string; at: string; by_agent?: boolean }[];
        activities: { id: number; actor: string; is_agent: boolean; description: string; at: string }[];
    };
    statuses: { value: string; label: string; tone?: Tone }[];
    priorities: { value: string; label: string; tone?: Tone }[];
    types: { id: number; name: string; color: string }[];
    team: { id: number; name: string }[];
}

/** Where a ticket came from, in words. */
const SOURCE: Record<string, string> = {
    manual: 'Created by hand', call: 'From a call', sms: 'From an SMS thread', email: 'From an email thread', web_chat: 'From web chat', fax: 'From a fax',
};

type Patch = { status?: string; priority?: string; ticket_type_id?: number | null; assignee_ids?: number[]; tags?: string[] };

/**
 * One ticket: what was asked, the team's discussion of it, and an inspector
 * that edits in place. Every change saves on its own — there is no Save.
 */
export default function TicketDetail({ ticket, statuses, priorities, types, team }: Props) {
    const patch = (data: Patch) => router.patch(`/desk/tickets/${ticket.id}`, data, { preserveScroll: true });

    const status = statuses.find((s) => s.value === ticket.status);
    const priority = priorities.find((p) => p.value === ticket.priority);
    const type = types.find((t) => t.id === ticket.ticket_type_id);
    const conversationId = ticket.conversation?.id ?? ticket.conversation_id;

    return (
        <>
            <Head title={`${ticket.reference} ${ticket.subject}`} />
            <DeskPage header={
                <PageHeader
                    back={{ href: '/desk/tickets', label: 'Tickets' }}
                    title={<UserText>{ticket.subject}</UserText>}
                    meta={
                        <>
                            <Mono>{ticket.reference}</Mono>
                            {status && <Badge tone={status.tone ?? 'muted'} dot>{status.label}</Badge>}
                            {priority && <Badge tone={priority.tone ?? 'muted'}>{priority.label} priority</Badge>}
                            {ticket.created_by_agent && <Badge tone="accent"><Bot size={12} strokeWidth={2.2} aria-hidden="true" />Raised by the agent</Badge>}
                        </>
                    }
                    actions={conversationId ? (
                        <Link href={`/desk/inbox/${conversationId}`} className="v-btn v-btn--quiet">
                            <MessagesSquare size={15} strokeWidth={1.9} /> Open conversation
                        </Link>
                    ) : undefined}
                />
            }>
                <WithSidePanel main={
                    <>
                        <Panel>
                            <div className="flex items-center gap-3.5 px-7 pt-6 pb-5" style={{ borderBottom: '1px solid var(--separator)' }}>
                                {ticket.created_by_agent
                                    ? <span className="flex size-9 items-center justify-center rounded-full" style={{ background: 'var(--accent-subtle)', color: 'var(--accent-text)' }}><Bot size={16} strokeWidth={2} /></span>
                                    : <Avatar initials={initialsOf(ticket.created_by)} name={ticket.created_by} size={36} />}
                                <div className="min-w-0 flex-1">
                                    <div className="text-base font-semibold text-primary">{ticket.created_by}</div>
                                    <div className="text-xs text-tertiary">Opened <RelativeTime at={ticket.created_at} /> · {SOURCE[ticket.channel] ?? ticket.channel}</div>
                                </div>
                            </div>
                            <div className="px-7 py-6">
                                {ticket.body
                                    ? <p className="max-w-[72ch] text-md leading-relaxed whitespace-pre-wrap text-primary"><UserText>{ticket.body}</UserText></p>
                                    : <p className="text-sm text-tertiary">No details were given. Add what you know as a note below.</p>}
                            </div>
                        </Panel>

                        <Discussion ticketId={ticket.id} notes={ticket.notes} activities={ticket.activities} />
                    </>
                } side={
                    <>
                        <Panel>
                            <div className="px-7 pt-3 pb-3">
                                <PropertySelect label="Status" icon={<CircleDot size={14} strokeWidth={1.9} />} value={ticket.status}
                                    options={statuses.map((s) => ({ value: s.value, label: s.label, color: toneColor(s.tone ?? 'muted') }))}
                                    onChange={(v) => patch({ status: v })} />
                                <PropertySelect label="Priority" icon={<Flag size={14} strokeWidth={1.9} />} value={ticket.priority}
                                    options={priorities.map((p) => ({ value: p.value, label: p.label, color: toneColor(p.tone ?? 'muted') }))}
                                    onChange={(v) => patch({ priority: v })} />
                                <PropertySelect label="Type" icon={<Layers size={14} strokeWidth={1.9} />} value={ticket.ticket_type_id ? String(ticket.ticket_type_id) : ''}
                                    options={[{ value: '', label: 'None' }, ...types.map((t) => ({ value: String(t.id), label: t.name, color: t.color }))]}
                                    onChange={(v) => patch({ ticket_type_id: v ? Number(v) : null })} />
                                <Assignees team={team} value={ticket.assignee_ids} onChange={(ids) => patch({ assignee_ids: ids })} />
                            </div>
                            <div className="px-7 py-5" style={{ borderTop: '1px solid var(--separator)' }}>
                                <Tags value={ticket.tags} onChange={(tags) => patch({ tags })} />
                            </div>
                            <div className="px-7 py-5" style={{ borderTop: '1px solid var(--separator)' }}>
                                <KeyValues items={[
                                    { label: 'Reference', value: <Mono>{ticket.reference}</Mono> },
                                    { label: 'Opened', value: dateTimeLabel(ticket.created_at) },
                                    ...(ticket.updated_at ? [{ label: 'Updated', value: <RelativeTime at={ticket.updated_at} className="text-sm text-primary" /> }] : []),
                                    ...(ticket.resolved_at ? [{ label: 'Resolved', value: dateTimeLabel(ticket.resolved_at) }] : []),
                                    ...(type ? [{ label: 'Type', value: <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: type.color }} />{type.name}</span> }] : []),
                                ]} />
                            </div>
                        </Panel>

                        {ticket.contact && <ContactCard contact={ticket.contact} />}
                        {ticket.conversation ? <ConversationCard conversation={ticket.conversation} /> : ticket.conversation_id ? (
                            <LinkCard href={`/desk/inbox/${ticket.conversation_id}`} icon={<MessagesSquare size={16} strokeWidth={1.9} />} title="Linked conversation" subtitle="Open the thread this came from" />
                        ) : null}
                    </>
                } />
            </DeskPage>
        </>
    );
}

// ── inspector pieces ─────────────────────────────────────────────────────

function Assignees({ team, value, onChange }: { team: Props['team']; value: number[]; onChange: (ids: number[]) => void }) {
    // Optimistic: the stack updates as boxes are ticked; the page props settle it.
    const [ids, setIds] = useState(value);
    useEffect(() => { setIds(value); }, [value.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
    const people = team.filter((u) => ids.includes(u.id));

    return (
        <PropertyRow label="Assigned" icon={<Users size={14} strokeWidth={1.9} />}>
            <Popover align="end" width={280} trigger={({ toggle, open }) => (
                <button type="button" onClick={toggle} aria-expanded={open}
                    className="-mr-2 flex h-8 min-w-0 items-center gap-2 rounded-lg px-2.5 text-sm font-medium text-primary transition-colors hover:bg-surface-hover">
                    {people.length > 0
                        ? <><AvatarStack people={people} size={22} /><span className="truncate">{people.length === 1 ? people[0].name : `${people.length} people`}</span></>
                        : <span className="text-tertiary">Nobody</span>}
                </button>
            )}>
                {() => (
                    <div className="p-2">
                        <PeoplePicker team={team} value={ids} onChange={(next) => { setIds(next); onChange(next); }} />
                    </div>
                )}
            </Popover>
        </PropertyRow>
    );
}

function Tags({ value, onChange }: { value: string[]; onChange: (tags: string[]) => void }) {
    return (
        <div>
            <div className="mb-2 flex items-center justify-between">
                <span className="text-sm text-secondary">Tags</span>
                <Popover align="end" width={260} trigger={({ toggle }) => (
                    <button type="button" onClick={toggle} title="Edit tags" aria-label="Edit tags"
                        className="flex size-6 items-center justify-center rounded-md text-tertiary transition-colors hover:bg-surface-hover hover:text-primary">
                        <Plus size={14} strokeWidth={2} />
                    </button>
                )}>
                    {() => <div className="p-1.5"><TagEditor value={value} suggestions={[]} onChange={onChange} /></div>}
                </Popover>
            </div>
            {value.length === 0
                ? <p className="text-sm text-tertiary">None yet.</p>
                : <div className="flex flex-wrap gap-1.5">{value.map((t) => <Badge key={t}>#{t}</Badge>)}</div>}
        </div>
    );
}

function LinkCard({ href, icon, title, subtitle, trailing }: { href: string; icon: ReactNode; title: ReactNode; subtitle?: ReactNode; trailing?: ReactNode }) {
    return (
        <Link href={href} className="v-panel v-card-hover group flex min-h-16 items-center gap-3.5 px-6 py-4">
            {icon}
            <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-primary">{title}</span>
                {subtitle && <span className="block truncate text-xs text-tertiary">{subtitle}</span>}
            </span>
            {trailing}
            <ChevronRight size={15} strokeWidth={2} className="shrink-0 text-tertiary transition-transform group-hover:translate-x-0.5" />
        </Link>
    );
}

function ContactCard({ contact }: { contact: NonNullable<Props['ticket']['contact']> }) {
    return (
        <Panel className="overflow-hidden">
            <PanelHeader title="Contact" />
            <Link href={`/desk/contacts/${contact.id}`} className="group flex items-center gap-3.5 px-7 py-4 transition-colors hover:bg-surface-hover">
                <Avatar initials={contact.initials} name={contact.name} size={40} />
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-semibold text-primary"><UserText>{contact.name}</UserText></span>
                    {contact.company && <span className="block truncate text-sm text-secondary"><UserText>{contact.company}</UserText></span>}
                </span>
                <ChevronRight size={15} strokeWidth={2} className="shrink-0 text-tertiary transition-transform group-hover:translate-x-0.5" />
            </Link>
            {(contact.phone || contact.email) && (
                <div className="flex flex-col gap-2.5 px-7 pb-6">
                    {contact.phone && <a href={`tel:${contact.phone}`} className="flex items-center gap-2 text-sm text-secondary tabular-nums hover:text-accent-text"><Phone size={14} strokeWidth={1.9} className="text-tertiary" />{contact.phone}</a>}
                    {contact.email && <a href={`mailto:${contact.email}`} className="flex items-center gap-2 truncate text-sm text-secondary hover:text-accent-text"><Mail size={14} strokeWidth={1.9} className="text-tertiary" /><span className="truncate">{contact.email}</span></a>}
                </div>
            )}
        </Panel>
    );
}

function ConversationCard({ conversation }: { conversation: NonNullable<Props['ticket']['conversation']> }) {
    const Icon = channelIcon(conversation.channel);

    return (
        <LinkCard href={`/desk/inbox/${conversation.id}`}
            icon={<span className="flex size-9 shrink-0 items-center justify-center rounded-[10px]" style={{ background: 'var(--surface-sunken)', color: 'var(--text-secondary)' }}><Icon size={16} strokeWidth={1.9} /></span>}
            title={<UserText>{conversation.title}</UserText>}
            subtitle={<>{conversation.channel_label} conversation{conversation.last_message_at ? <> · last message <RelativeTime at={conversation.last_message_at} /></> : null}</>}
            trailing={conversation.status === 'closed' ? <Badge>Closed</Badge> : undefined} />
    );
}

// ── discussion: notes and activity, with a composer ─────────────────────

type Entry =
    | { kind: 'note'; at: string; note: Props['ticket']['notes'][number] }
    | { kind: 'activity'; at: string; activity: Props['ticket']['activities'][number] };

const MOD = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘' : 'Ctrl';

/**
 * The team's discussion of a ticket: notes (the same amber "Internal note"
 * sheet the inbox thread uses) interleaved with what changed, on one rail,
 * and a roomy editor underneath. Cmd/Ctrl+Enter saves.
 */
function Discussion({ ticketId, notes, activities }: { ticketId: number; notes: Props['ticket']['notes']; activities: Props['ticket']['activities'] }) {
    const [show, setShow] = useState<'all' | 'notes' | 'activity'>('all');
    const { data, setData, post, processing, errors, reset } = useForm({ body: '' });

    const submit = (e?: FormEvent) => {
        e?.preventDefault();
        if (!data.body.trim() || processing) return;
        post(`/desk/tickets/${ticketId}/notes`, { preserveScroll: true, onSuccess: () => reset() });
    };

    const entries: Entry[] = [
        ...(show !== 'activity' ? notes.map((note) => ({ kind: 'note' as const, at: note.at, note })) : []),
        ...(show !== 'notes' ? activities.map((activity) => ({ kind: 'activity' as const, at: activity.at, activity })) : []),
    ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

    return (
        <Panel>
            <PanelHeader title="Discussion" description="Notes are for the team; the customer never sees them."
                actions={<SegmentedControl size="sm" value={show} onChange={setShow} options={[
                    { value: 'all', label: 'All' },
                    { value: 'notes', label: <>Notes{notes.length > 0 && <span className="text-tertiary tabular-nums">{notes.length}</span>}</> },
                    { value: 'activity', label: <>Activity{activities.length > 0 && <span className="text-tertiary tabular-nums">{activities.length}</span>}</> },
                ]} />} />

            <div className="px-7 py-6">
                {entries.length === 0 ? (
                    <div className="flex flex-col items-center py-6 text-center">
                        <span className="mb-3 flex size-10 items-center justify-center rounded-md text-tertiary" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
                            <StickyNote size={17} strokeWidth={1.8} />
                        </span>
                        <p className="text-sm font-medium text-primary">{show === 'activity' ? 'Nothing has happened yet' : 'No notes yet'}</p>
                        <p className="mt-0.5 text-sm text-tertiary">{show === 'activity' ? 'Status, priority and owner changes land here.' : 'Write down what the next person should know.'}</p>
                    </div>
                ) : (
                    <ol className="relative flex flex-col gap-4">
                        <span className="absolute top-3 bottom-3 left-3.5 w-px" style={{ background: 'var(--separator)' }} aria-hidden="true" />
                        {entries.map((e) => e.kind === 'note' ? (
                            <li key={`n-${e.note.id}`} className="relative">
                                <NoteCard note={e.note} size="lg" />
                            </li>
                        ) : (
                            <li key={`a-${e.activity.id}`} className="relative flex min-h-7 items-center gap-3">
                                <span className="flex w-7 shrink-0 justify-center">
                                    {e.activity.is_agent
                                        ? <span className="relative flex size-5 items-center justify-center rounded-full" style={{ background: 'var(--accent-subtle)', color: 'var(--accent-text)', boxShadow: '0 0 0 3px var(--surface)' }}><Bot size={11} strokeWidth={2.2} aria-hidden="true" /></span>
                                        : <span className="relative size-2 rounded-full" style={{ background: 'var(--border-strong)', boxShadow: '0 0 0 3px var(--surface)' }} aria-hidden="true" />}
                                </span>
                                <p className="min-w-0 flex-1 text-sm text-secondary">
                                    <span className="font-medium text-primary">{e.activity.actor}</span> {lowerFirst(e.activity.description)}
                                </p>
                                <RelativeTime at={e.activity.at} />
                            </li>
                        ))}
                    </ol>
                )}
            </div>

            <form onSubmit={submit} className="px-7 pt-1 pb-7">
                <div className="overflow-hidden rounded-lg transition-shadow focus-within:[box-shadow:var(--ring)]"
                    style={{ background: 'var(--warning-subtle)', border: '1px solid var(--warning-border)' }}>
                    <div className="flex items-center gap-1.5 px-4 pt-3 text-xs font-semibold" style={{ color: 'var(--warning)' }}>
                        <Lock size={12} strokeWidth={2.4} aria-hidden="true" /> Internal note
                        <span className="font-normal text-tertiary">· only your team sees this</span>
                    </div>
                    <AutoTextarea value={data.body} onChange={(e) => setData('body', e.target.value)} dir="auto" maxHeight={320} aria-label="Add a note"
                        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); } }}
                        placeholder="What the next person should know: what you checked, what you promised, what is still open."
                        className="v-bare px-4 pt-2 pb-2 text-md leading-relaxed" style={{ minHeight: 120 }} />
                    <div className="flex items-center justify-end gap-3 px-3 pb-3">
                        <span className="hidden items-center gap-1 text-2xs text-tertiary sm:flex"><Kbd>{MOD}</Kbd><Kbd>↵</Kbd> to save</span>
                        <button type="submit" className="v-btn v-btn--primary v-btn--sm" disabled={processing || !data.body.trim()}>{processing ? 'Saving…' : 'Save note'}</button>
                    </div>
                </div>
                <FieldError>{errors.body}</FieldError>
            </form>
        </Panel>
    );
}

/** "Status set to Open" reads as a sentence after the actor's name. */
function lowerFirst(text: string): string {
    return text.length > 1 && text[1] !== text[1].toUpperCase() ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}
