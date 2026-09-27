import { Head, Link, router, useForm } from '@inertiajs/react';
import { Bot, ChevronRight, CircleDot, Flag, Layers, Mail, MessagesSquare, Phone, Plus, Users } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';

import Popover from '../../components/ui/popover';
import { Card, CardHeader, KeyValues, SegmentedControl } from '../../components/ui/kit';
import { Avatar, Badge, Kbd, Mono, RelativeTime, UserText, toneColor, type Tone } from '../../components/ui/primitives';
import { PageHeader } from '../../components/ui/page';
import { AutoTextarea, AvatarStack, FieldError, PeoplePicker } from '../../components/desk-inbox/controls';
import { channelIcon, dateTimeLabel, initialsOf } from '../../components/desk-inbox/helpers';
import { PropertyRow, PropertySelect } from '../../components/desk-inbox/inspector';
import TagEditor from '../../components/desk-inbox/tag-editor';

interface Props {
    ticket: {
        id: number; reference: string; subject: string; body: string | null; status: string; priority: string; ticket_type_id: number | null;
        channel: string; created_by: string; created_by_agent: boolean; created_at: string; resolved_at: string | null; conversation_id: number | null;
        updated_at?: string | null;
        contact: { id: number; name: string; initials: string; phone: string | null; email: string | null; company?: string | null } | null;
        conversation?: { id: number; title: string; channel: string; channel_label: string; status: string; last_message_at: string | null } | null;
        assignee_ids: number[]; tags: string[];
        notes: { id: number; body: string; author: string; at: string }[];
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
            <div className="mx-auto max-w-295 px-8 py-8">
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

                <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="flex min-w-0 flex-col gap-6">
                        <Card>
                            <div className="flex items-center gap-3 px-5 pt-4 pb-3.5" style={{ borderBottom: '1px solid var(--separator)' }}>
                                {ticket.created_by_agent
                                    ? <span className="flex size-8 items-center justify-center rounded-full" style={{ background: 'var(--accent-subtle)', color: 'var(--accent-text)' }}><Bot size={16} strokeWidth={2} /></span>
                                    : <Avatar initials={initialsOf(ticket.created_by)} name={ticket.created_by} size={32} />}
                                <div className="min-w-0 flex-1">
                                    <div className="text-sm font-semibold text-primary">{ticket.created_by}</div>
                                    <div className="text-xs text-tertiary">Opened <RelativeTime at={ticket.created_at} /> · {SOURCE[ticket.channel] ?? ticket.channel}</div>
                                </div>
                            </div>
                            <div className="px-5 py-4">
                                {ticket.body
                                    ? <p className="max-w-[72ch] text-base whitespace-pre-wrap text-primary"><UserText>{ticket.body}</UserText></p>
                                    : <p className="text-sm text-tertiary">No details were given. Add what you know as a note below.</p>}
                            </div>
                        </Card>

                        <Discussion ticketId={ticket.id} notes={ticket.notes} activities={ticket.activities} />
                    </div>

                    <aside className="flex flex-col gap-4 lg:sticky lg:top-8">
                        <Card>
                            <div className="px-4 pt-2 pb-2">
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
                            <div className="px-4 py-3.5" style={{ borderTop: '1px solid var(--separator)' }}>
                                <Tags value={ticket.tags} onChange={(tags) => patch({ tags })} />
                            </div>
                            <div className="px-4 py-3.5" style={{ borderTop: '1px solid var(--separator)' }}>
                                <KeyValues items={[
                                    { label: 'Reference', value: <Mono>{ticket.reference}</Mono> },
                                    { label: 'Opened', value: dateTimeLabel(ticket.created_at) },
                                    ...(ticket.updated_at ? [{ label: 'Updated', value: <RelativeTime at={ticket.updated_at} className="text-sm text-primary" /> }] : []),
                                    ...(ticket.resolved_at ? [{ label: 'Resolved', value: dateTimeLabel(ticket.resolved_at) }] : []),
                                    ...(type ? [{ label: 'Type', value: <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: type.color }} />{type.name}</span> }] : []),
                                ]} />
                            </div>
                        </Card>

                        {ticket.contact && <ContactCard contact={ticket.contact} />}
                        {ticket.conversation ? <ConversationCard conversation={ticket.conversation} /> : ticket.conversation_id ? (
                            <LinkCard href={`/desk/inbox/${ticket.conversation_id}`} icon={<MessagesSquare size={16} strokeWidth={1.9} />} title="Linked conversation" subtitle="Open the thread this came from" />
                        ) : null}
                    </aside>
                </div>
            </div>
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
        <Link href={href} className="v-panel v-card-hover group flex items-center gap-3 px-4 py-3.5">
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
        <Card>
            <CardHeader title="Contact" />
            <Link href={`/desk/contacts/${contact.id}`} className="group flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-surface-hover">
                <Avatar initials={contact.initials} name={contact.name} size={40} />
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-semibold text-primary"><UserText>{contact.name}</UserText></span>
                    {contact.company && <span className="block truncate text-sm text-secondary"><UserText>{contact.company}</UserText></span>}
                </span>
                <ChevronRight size={15} strokeWidth={2} className="shrink-0 text-tertiary transition-transform group-hover:translate-x-0.5" />
            </Link>
            {(contact.phone || contact.email) && (
                <div className="flex flex-col gap-1.5 px-5 pb-4">
                    {contact.phone && <a href={`tel:${contact.phone}`} className="flex items-center gap-2 text-sm text-secondary tabular-nums hover:text-accent-text"><Phone size={14} strokeWidth={1.9} className="text-tertiary" />{contact.phone}</a>}
                    {contact.email && <a href={`mailto:${contact.email}`} className="flex items-center gap-2 truncate text-sm text-secondary hover:text-accent-text"><Mail size={14} strokeWidth={1.9} className="text-tertiary" /><span className="truncate">{contact.email}</span></a>}
                </div>
            )}
        </Card>
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
        <Card>
            <CardHeader title="Discussion" description="Notes are for the team; the customer never sees them."
                actions={<SegmentedControl size="sm" value={show} onChange={setShow} options={[
                    { value: 'all', label: 'All' },
                    { value: 'notes', label: <>Notes{notes.length > 0 && <span className="text-tertiary tabular-nums">{notes.length}</span>}</> },
                    { value: 'activity', label: 'Activity' },
                ]} />} />

            <div className="px-5 py-4">
                {entries.length === 0 ? (
                    <p className="py-4 text-center text-sm text-tertiary">{show === 'activity' ? 'Nothing has happened yet.' : 'No notes yet. Start the discussion below.'}</p>
                ) : (
                    <ol className="relative flex flex-col gap-4">
                        <span className="absolute top-3 bottom-3 left-3.25 w-px" style={{ background: 'var(--separator)' }} aria-hidden="true" />
                        {entries.map((e) => e.kind === 'note' ? (
                            <li key={`n-${e.note.id}`} className="relative flex gap-3">
                                <span className="relative rounded-full" style={{ boxShadow: '0 0 0 3px var(--surface)' }}>
                                    <Avatar initials={initialsOf(e.note.author)} name={e.note.author} size={28} />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="mb-1 flex items-baseline gap-2">
                                        <span className="text-sm font-semibold text-primary">{e.note.author}</span>
                                        <RelativeTime at={e.note.at} />
                                    </div>
                                    <div className="rounded-lg px-3.5 py-2.5 text-base whitespace-pre-wrap text-primary" style={{ background: 'var(--surface-sunken)' }}>
                                        <UserText>{e.note.body}</UserText>
                                    </div>
                                </div>
                            </li>
                        ) : (
                            <li key={`a-${e.activity.id}`} className="relative flex items-center gap-3">
                                <span className="flex w-7 shrink-0 justify-center">
                                    <span className="relative size-2 rounded-full" style={{ background: e.activity.is_agent ? 'var(--accent)' : 'var(--border-strong)', boxShadow: '0 0 0 3px var(--surface)' }} aria-hidden="true" />
                                </span>
                                <p className="min-w-0 flex-1 text-sm text-secondary">
                                    {e.activity.is_agent && <Bot size={14} strokeWidth={2} className="mr-1 inline text-accent" aria-hidden="true" />}
                                    <span className="font-medium text-primary">{e.activity.actor}</span> · {e.activity.description}
                                </p>
                                <RelativeTime at={e.activity.at} />
                            </li>
                        ))}
                    </ol>
                )}
            </div>

            <form onSubmit={submit} className="px-5 pt-1 pb-5">
                <div className="rounded-xl transition-shadow focus-within:[box-shadow:var(--ring)]" style={{ background: 'var(--surface)', border: '1px solid var(--border-strong)' }}>
                    <AutoTextarea value={data.body} onChange={(e) => setData('body', e.target.value)} dir="auto" maxHeight={240} aria-label="Add a note"
                        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); } }}
                        placeholder="Add a note for the team" className="px-4 pt-3 pb-2" style={{ minHeight: 64 }} />
                    <div className="flex items-center justify-end gap-3 px-2.5 pb-2.5">
                        <span className="hidden items-center gap-1 text-2xs text-tertiary sm:flex"><Kbd>Ctrl</Kbd><Kbd>↵</Kbd> to add</span>
                        <button type="submit" className="v-btn v-btn--primary v-btn--sm" disabled={processing || !data.body.trim()}>{processing ? 'Adding…' : 'Add note'}</button>
                    </div>
                </div>
                <FieldError>{errors.body}</FieldError>
            </form>
        </Card>
    );
}
