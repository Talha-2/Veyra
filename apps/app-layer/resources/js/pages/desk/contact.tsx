import { Head, Link, router, useForm } from '@inertiajs/react';
import { Ban, Bot, ChevronDown, ChevronLeft, Globe, Mail, MessageSquare, MoreHorizontal, Moon, Phone, Plus, Star, StickyNote, Ticket as TicketIcon, Workflow } from 'lucide-react';
import { useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';

import { ChannelIcon, channelLabel } from '../../components/desk-pages/bits';
import { MessageDialog, TicketDialog } from '../../components/desk-pages/contact-actions';
import { clockTime, humanize, initialsOf, isToday, longDate, money, relative } from '../../components/desk-pages/format';
import { Menu, MenuItem, MenuLabel } from '../../components/shell/menu';
import { Card, CardBody, CardHeader, CopyButton, IconTile, KeyValues, List, ListRow, Tabs } from '../../components/ui/kit';
import { PageHeader } from '../../components/ui/page';
import { Avatar, Badge, EmptyState, Mono, RelativeTime, UserText, type Tone } from '../../components/ui/primitives';
import TagInput from '../../components/ui/tag-input';

interface Props {
    contact: {
        id: number; name: string; initials: string; phone: string | null; email: string | null;
        company: string | null; stage: string; stage_label: string; stage_tone: Tone;
        source: string; value: number; owner: string | null; last_contact_at: string | null; is_favorite: boolean; tags: string[];
        created_at?: string | null;
        identifiers: { id: number; type: string; label: string; value: string; blocked: boolean; dnd: boolean }[];
    };
    leads: { id: number; pipeline: string | null; stage: string | null; stage_color: string | null; value: number; source: string }[];
    activities: { id: number; actor: string; is_agent: boolean; description: string; at: string }[];
    conversations: { id: number; channel: string; status: string; last_message_at: string | null; unread?: number; preview?: string | null; last_from_agent?: boolean }[];
    tickets: {
        id: number; reference: string; subject: string; status: string;
        status_label: string; status_tone: Tone; priority: string; created_by_agent: boolean;
        priority_label?: string; priority_tone?: Tone; at?: string | null;
    }[];
    notes: { id: number; body: string; author: string; at: string | null }[];
    stages: { value: string; label: string }[];
    team: { id: number; name: string }[];
    ticket_types?: { id: number; name: string; color: string }[];
    priorities?: { value: string; label: string }[];
}

type Tab = 'activity' | 'conversations' | 'tickets' | 'notes';

const DEFAULT_PRIORITIES = [{ value: 'low', label: 'Low' }, { value: 'normal', label: 'Normal' }, { value: 'high', label: 'High' }, { value: 'urgent', label: 'Urgent' }];

/**
 * One person, everything about them. The header says who they are and gives
 * the three things you do to a customer — write, call, raise a ticket; the
 * tabs hold the history; the inspector holds the facts you look up mid-call.
 */
export default function ContactDetail({ contact, conversations, tickets, notes, stages, team, leads, activities, ticket_types = [], priorities = DEFAULT_PRIORITIES }: Props) {
    const [tab, setTab] = useState<Tab>('activity');
    const [messaging, setMessaging] = useState(false);
    const [ticketing, setTicketing] = useState(false);
    const patch = (payload: { stage?: string; owner_id?: number | null; tags?: string[] }) => router.patch(`/desk/contacts/${contact.id}`, payload, { preserveScroll: true });
    const canMessage = !!(contact.phone || contact.email);
    const pipelineValue = leads.reduce((a, l) => a + l.value, 0);

    return (
        <>
            <Head title={contact.name} />

            <div className="mx-auto max-w-[1320px] px-6 py-7 md:px-8">
                <Link href="/desk/contacts" className="mb-3 -ml-1 inline-flex items-center gap-0.5 rounded-md px-1 text-sm text-secondary transition-colors hover:text-primary">
                    <ChevronLeft size={15} strokeWidth={2} />Contacts
                </Link>

                {/* Profile */}
                <Card className="mb-6">
                    <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-start">
                        <Avatar name={contact.name} initials={contact.initials} size={72} />
                        <div className="min-w-0 flex-1 [&>header]:mb-0">
                            <PageHeader
                                title={
                                    <span className="inline-flex max-w-full items-center gap-2">
                                        <span className="truncate"><UserText>{contact.name}</UserText></span>
                                        <button type="button" aria-pressed={contact.is_favorite} aria-label={contact.is_favorite ? 'Unstar' : 'Star'} title={contact.is_favorite ? 'Unstar' : 'Star'}
                                            onClick={() => router.post(`/desk/contacts/${contact.id}/favorite`, {}, { preserveScroll: true })}
                                            className="flex size-8 items-center justify-center rounded-full transition-colors hover:bg-surface-hover"
                                            style={{ color: contact.is_favorite ? 'var(--warning-fill)' : 'var(--text-disabled)' }}>
                                            <Star size={16} strokeWidth={1.8} fill={contact.is_favorite ? 'currentColor' : 'none'} />
                                        </button>
                                    </span>
                                }
                                description={contact.company ?? <span className="text-tertiary">No company</span>}
                                meta={
                                    <>
                                        <StageMenu current={contact.stage} label={contact.stage_label} tone={contact.stage_tone} stages={stages} onPick={(stage) => patch({ stage })} />
                                        <Badge tone="muted">From {humanize(contact.source).toLowerCase()}</Badge>
                                        {contact.tags.slice(0, 3).map((t) => <Badge key={t} tone="muted">#{t}</Badge>)}
                                    </>
                                }
                                actions={
                                    <>
                                        {contact.phone
                                            ? <a href={`tel:${contact.phone}`} className="v-btn v-btn--quiet"><Phone size={14} strokeWidth={1.8} />Call</a>
                                            : <button type="button" className="v-btn v-btn--quiet" disabled title="No phone number on file"><Phone size={14} strokeWidth={1.8} />Call</button>}
                                        <button type="button" className="v-btn v-btn--quiet" onClick={() => setTicketing(true)}><TicketIcon size={14} strokeWidth={1.8} />Ticket</button>
                                        <button type="button" className="v-btn v-btn--primary" onClick={() => setMessaging(true)} disabled={!canMessage} title={canMessage ? undefined : 'No phone or email on file'}>
                                            <MessageSquare size={14} strokeWidth={1.8} />Message
                                        </button>
                                    </>
                                }
                            />
                        </div>
                    </div>

                    <dl className="grid grid-cols-2 md:grid-cols-4" style={{ borderTop: '1px solid var(--separator)' }}>
                        <Fact label="Phone" value={contact.phone ? <span className="tabular-nums">{contact.phone}</span> : null} copy={contact.phone} />
                        <Fact label="Email" value={contact.email} copy={contact.email} />
                        <Fact label="Last contact" value={contact.last_contact_at ? <time dateTime={contact.last_contact_at} title={new Date(contact.last_contact_at).toLocaleString()}>{relative(contact.last_contact_at)}</time> : null} />
                        <Fact label="Open pipeline value" value={leads.length ? <span className="tabular-nums">{money(pipelineValue)}</span> : null} />
                    </dl>
                </Card>

                <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
                    {/* History */}
                    <Card>
                        <Tabs<Tab> value={tab} onChange={setTab} options={[
                            { value: 'activity', label: 'Activity', count: activities.length },
                            { value: 'conversations', label: 'Conversations', count: conversations.length },
                            { value: 'tickets', label: 'Tickets', count: tickets.length },
                            { value: 'notes', label: 'Notes', count: notes.length },
                        ]} />

                        {tab === 'activity' && <ActivityTimeline activities={activities} />}

                        {tab === 'conversations' && (conversations.length === 0 ? (
                            <EmptyState icon={<MessageSquare size={20} strokeWidth={1.8} />} title="No conversations yet"
                                action={canMessage ? <button type="button" className="v-btn v-btn--quiet" onClick={() => setMessaging(true)}>Send a message</button> : undefined}>
                                Calls, texts and emails with {contact.name} collect here as threads.
                            </EmptyState>
                        ) : (
                            <List>
                                {conversations.map((c) => (
                                    <ListRow key={c.id} href={`/desk/inbox/${c.id}`} onClick={() => router.visit(`/desk/inbox/${c.id}`)}
                                        leading={<IconTile><ChannelIcon channel={c.channel} size={15} /></IconTile>}
                                        title={<span className="flex items-center gap-2">{channelLabel(c.channel)}<Badge tone={c.status === 'open' ? 'accent' : 'muted'}>{c.status}</Badge></span>}
                                        subtitle={c.preview ? <span>{c.last_from_agent && <span className="text-tertiary">Agent: </span>}<UserText>{c.preview}</UserText></span> : <span className="text-tertiary">No messages</span>}
                                        trailing={
                                            <>
                                                {!!c.unread && <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-2xs font-semibold tabular-nums" style={{ background: 'var(--accent)', color: 'var(--text-on-accent)' }}>{c.unread}</span>}
                                                <RelativeTime at={c.last_message_at} />
                                            </>
                                        }
                                    />
                                ))}
                            </List>
                        ))}

                        {tab === 'tickets' && (tickets.length === 0 ? (
                            <EmptyState icon={<TicketIcon size={20} strokeWidth={1.8} />} title="Nothing raised"
                                action={<button type="button" className="v-btn v-btn--quiet" onClick={() => setTicketing(true)}>New ticket</button>}>
                                Tickets the team or the agent raise about {contact.name} are listed here.
                            </EmptyState>
                        ) : (
                            <List>
                                {tickets.map((t) => (
                                    <ListRow key={t.id} href={`/desk/tickets/${t.id}`} onClick={() => router.visit(`/desk/tickets/${t.id}`)}
                                        leading={<IconTile tone={t.priority_tone ?? 'muted'}><TicketIcon size={15} strokeWidth={1.8} /></IconTile>}
                                        title={<UserText>{t.subject}</UserText>}
                                        subtitle={
                                            <span className="flex items-center gap-1.5">
                                                <Mono>{t.reference}</Mono>
                                                {t.created_by_agent && <span className="inline-flex items-center gap-1 text-xs text-tertiary"><Bot size={12} strokeWidth={2} />raised by the agent</span>}
                                                {t.at && <><span className="text-tertiary" aria-hidden="true">·</span><RelativeTime at={t.at} /></>}
                                            </span>
                                        }
                                        trailing={
                                            <>
                                                {t.priority_label && t.priority !== 'normal' && <Badge tone={t.priority_tone ?? 'muted'} dot>{t.priority_label}</Badge>}
                                                <Badge tone={t.status_tone}>{t.status_label}</Badge>
                                            </>
                                        }
                                    />
                                ))}
                            </List>
                        ))}

                        {tab === 'notes' && <NotesPanel contactId={contact.id} notes={notes} />}
                    </Card>

                    {/* Inspector */}
                    <aside className="flex flex-col gap-4 lg:sticky lg:top-6">
                        <Card>
                            <CardHeader title="Details" />
                            <CardBody>
                                <KeyValues items={[
                                    { label: 'Name', value: <UserText>{contact.name}</UserText> },
                                    { label: 'Company', value: contact.company ?? <span className="text-tertiary">—</span> },
                                    { label: 'Stage', value: <Badge tone={contact.stage_tone} dot>{contact.stage_label}</Badge> },
                                    { label: 'Source', value: humanize(contact.source) },
                                    { label: 'Value', value: <span className="tabular-nums">{money(contact.value)}</span> },
                                    ...(contact.created_at ? [{ label: 'Added', value: <span title={new Date(contact.created_at).toLocaleString()}>{longDate(contact.created_at)}</span> }] : []),
                                ]} />
                            </CardBody>
                        </Card>

                        <Card>
                            <CardHeader title="Owner" />
                            <CardBody>
                                <div className="mb-3 flex items-center gap-3">
                                    {contact.owner
                                        ? <><Avatar name={contact.owner} initials={initialsOf(contact.owner)} size={32} /><span className="text-base font-medium text-primary">{contact.owner}</span></>
                                        : <span className="text-sm text-tertiary">Nobody owns this contact yet.</span>}
                                </div>
                                <select
                                    value=""
                                    aria-label="Assign owner"
                                    onChange={(e) => patch({ owner_id: e.target.value ? Number(e.target.value) : null })}
                                    className="v-field"
                                >
                                    <option value="">{contact.owner ? 'Change owner…' : 'Assign an owner…'}</option>
                                    {team.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                                </select>
                            </CardBody>
                        </Card>

                        <Card>
                            <CardHeader title="Ways to reach" description="Every number and address on file." />
                            {contact.identifiers.length === 0 ? (
                                <p className="px-5 py-4 text-sm text-tertiary">None recorded.</p>
                            ) : (
                                <ul className="py-1">
                                    {contact.identifiers.map((i) => (
                                        <li key={i.id} className="flex items-center gap-3 px-5 py-2.5" style={{ opacity: i.blocked ? 0.7 : 1 }}>
                                            <span className="text-tertiary">{identifierIcon(i.type)}</span>
                                            <div className="min-w-0 flex-1">
                                                <div className="truncate text-sm text-primary tabular-nums" style={{ textDecoration: i.blocked ? 'line-through' : undefined }}>{i.value}</div>
                                                <div className="flex items-center gap-1.5 text-xs text-tertiary">
                                                    {i.label}
                                                    {i.blocked && <Badge tone="danger">Blocked</Badge>}
                                                    {i.dnd && <Badge tone="warning">Do not disturb</Badge>}
                                                </div>
                                            </div>
                                            <Menu align="right" width={220} trigger={(open, toggle) => (
                                                <button type="button" onClick={toggle} aria-expanded={open} aria-label={`Options for ${i.value}`} className="v-btn v-btn--ghost v-btn--icon"><MoreHorizontal size={15} strokeWidth={1.8} /></button>
                                            )}>
                                                {(close) => (
                                                    <>
                                                        <MenuItem icon={<Ban size={14} strokeWidth={1.8} />} danger={!i.blocked} onSelect={() => { close(); router.post(`/desk/identifiers/${i.id}/block`, {}, { preserveScroll: true }); }}>{i.blocked ? 'Unblock' : 'Block'}</MenuItem>
                                                        <MenuItem icon={<Moon size={14} strokeWidth={1.8} />} onSelect={() => { close(); router.post(`/desk/identifiers/${i.id}/dnd`, {}, { preserveScroll: true }); }}>{i.dnd ? 'Allow messages again' : 'Do not disturb'}</MenuItem>
                                                    </>
                                                )}
                                            </Menu>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </Card>

                        <Card>
                            <CardHeader title="Tags" />
                            <CardBody>
                                <TagInput value={contact.tags} onChange={(tags) => patch({ tags })} placeholder="Add a tag…" />
                            </CardBody>
                        </Card>

                        <Card>
                            <CardHeader title="Pipelines" actions={<Link href="/desk/leads" className="v-btn v-btn--ghost v-btn--sm">Leads</Link>} />
                            {leads.length === 0 ? (
                                <p className="px-5 py-4 text-sm text-tertiary">Not in any pipeline. <Link href="/desk/leads" className="text-accent-text">Add as a lead</Link>.</p>
                            ) : (
                                <ul className="py-1">
                                    {leads.map((l) => (
                                        <li key={l.id} className="flex items-center gap-3 px-5 py-2.5">
                                            <Workflow size={15} strokeWidth={1.8} className="shrink-0 text-tertiary" />
                                            <div className="min-w-0 flex-1">
                                                <div className="truncate text-sm font-medium text-primary">{l.pipeline ?? 'Pipeline'}</div>
                                                <div className="flex items-center gap-1.5 text-xs text-secondary">
                                                    {l.stage && <><span className="size-2 rounded-full" style={{ background: l.stage_color ?? 'var(--border-strong)' }} aria-hidden="true" />{l.stage}</>}
                                                    <span className="text-tertiary">· {humanize(l.source).toLowerCase()}</span>
                                                </div>
                                            </div>
                                            <span className="text-sm font-medium text-primary tabular-nums">{money(l.value)}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </Card>
                    </aside>
                </div>
            </div>

            <MessageDialog open={messaging} onClose={() => setMessaging(false)} name={contact.name} phone={contact.phone} email={contact.email} />
            <TicketDialog open={ticketing} onClose={() => setTicketing(false)} contactId={contact.id} name={contact.name} types={ticket_types} priorities={priorities} />
        </>
    );
}

function Fact({ label, value, copy }: { label: string; value: ReactNode; copy?: string | null }) {
    return (
        <div className="group flex min-w-0 flex-col gap-0.5 px-6 py-3.5 even:border-l md:not-first:border-l nth-[n+3]:border-t md:nth-[n+3]:border-t-0" style={{ borderColor: 'var(--separator)' }}>
            <dt className="text-xs text-tertiary">{label}</dt>
            <dd className="flex h-7 min-w-0 items-center gap-2 text-sm text-primary">
                {value ? <span className="truncate">{value}</span> : <span className="text-tertiary">—</span>}
                {copy && <span className="opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"><CopyButton value={copy} /></span>}
            </dd>
        </div>
    );
}

function identifierIcon(type: string) {
    if (type === 'email') return <Mail size={15} strokeWidth={1.8} />;
    if (type === 'phone') return <Phone size={15} strokeWidth={1.8} />;
    return <Globe size={15} strokeWidth={1.8} />;
}

function StageMenu({ current, label, tone, stages, onPick }: { current: string; label: string; tone: Tone; stages: { value: string; label: string }[]; onPick: (stage: string) => void }) {
    return (
        <Menu width={200} trigger={(open, toggle) => (
            <button type="button" onClick={toggle} aria-expanded={open} aria-label={`Stage: ${label}. Change stage`} className="rounded-full transition-opacity hover:opacity-80">
                <Badge tone={tone} dot>{label}<ChevronDown size={12} strokeWidth={2} /></Badge>
            </button>
        )}>
            {(close) => (
                <>
                    <MenuLabel>Stage</MenuLabel>
                    {stages.map((s) => (
                        <MenuItem key={s.value} active={s.value === current} onSelect={() => { close(); if (s.value !== current) onPick(s.value); }}>{s.label}</MenuItem>
                    ))}
                </>
            )}
        </Menu>
    );
}

// ── activity ──────────────────────────────────────────────────────────────

function dayLabel(iso: string): string {
    if (isToday(iso)) return 'Today';
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (isToday(iso, yesterday)) return 'Yesterday';
    return new Date(iso).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

function ActivityTimeline({ activities }: { activities: Props['activities'] }) {
    if (activities.length === 0) {
        return <EmptyState icon={<Workflow size={20} strokeWidth={1.8} />} title="Nothing has happened yet">Stage changes, assignments and what the agent did for this person are recorded here as they happen.</EmptyState>;
    }

    const groups: { label: string; items: Props['activities'] }[] = [];
    for (const a of activities) {
        const label = dayLabel(a.at);
        const last = groups[groups.length - 1];
        if (last && last.label === label) last.items.push(a);
        else groups.push({ label, items: [a] });
    }

    return (
        <div className="px-5 py-4">
            {groups.map((g) => (
                <section key={g.label} className="mb-2 last:mb-0">
                    <h3 className="mb-1 text-xs font-medium text-tertiary">{g.label}</h3>
                    <ol>
                        {g.items.map((a, i) => (
                            <li key={a.id} className="relative flex gap-3.5 py-2">
                                {i < g.items.length - 1 && <span className="absolute top-9 bottom-[-6px] left-[13px] w-px" style={{ background: 'var(--separator)' }} aria-hidden="true" />}
                                {a.is_agent
                                    ? <IconTile tone="accent" size={28}><Bot size={14} strokeWidth={1.8} /></IconTile>
                                    : <Avatar name={a.actor} initials={initialsOf(a.actor)} size={28} />}
                                <div className="min-w-0 flex-1 pt-0.5">
                                    <p className="text-sm text-primary"><UserText>{a.description}</UserText></p>
                                    <p className="text-xs text-tertiary">{a.actor} · <time dateTime={a.at} title={new Date(a.at).toLocaleString()}>{clockTime(a.at)}</time></p>
                                </div>
                            </li>
                        ))}
                    </ol>
                </section>
            ))}
        </div>
    );
}

// ── notes ─────────────────────────────────────────────────────────────────

function NotesPanel({ contactId, notes }: { contactId: number; notes: Props['notes'] }) {
    const { data, setData, post, processing, reset } = useForm({ body: '' });

    const submit = (event: FormEvent | KeyboardEvent) => {
        event.preventDefault();
        if (!data.body.trim() || processing) return;
        post(`/desk/contacts/${contactId}/notes`, { preserveScroll: true, onSuccess: () => reset('body') });
    };

    return (
        <div>
            <form onSubmit={submit} className="px-5 pt-4 pb-4" style={{ borderBottom: notes.length ? '1px solid var(--separator)' : undefined }}>
                <textarea
                    value={data.body}
                    onChange={(e) => setData('body', e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e); }}
                    dir="auto"
                    rows={3}
                    placeholder="Add a note for the team. Only people on the team can see it."
                    aria-label="New note"
                    className="v-field h-auto resize-none"
                />
                <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs text-tertiary">Ctrl + Enter to add</span>
                    <button type="submit" className="v-btn v-btn--quiet v-btn--sm" disabled={processing || !data.body.trim()}>
                        <Plus size={14} strokeWidth={2} />Add note
                    </button>
                </div>
            </form>

            {notes.length === 0 ? (
                <EmptyState icon={<StickyNote size={20} strokeWidth={1.8} />} title="No notes yet">Context the next person will need: what was promised, what to avoid, who to ask.</EmptyState>
            ) : (
                <List>
                    {notes.map((note) => (
                        <div key={note.id} className="flex gap-3.5 px-5 py-4">
                            <Avatar name={note.author} initials={initialsOf(note.author)} size={28} />
                            <div className="min-w-0 flex-1">
                                <div className="mb-1 flex items-center gap-2">
                                    <span className="text-sm font-medium text-primary">{note.author}</span>
                                    <RelativeTime at={note.at} />
                                </div>
                                <p className="text-sm whitespace-pre-wrap text-secondary"><UserText>{note.body}</UserText></p>
                            </div>
                        </div>
                    ))}
                </List>
            )}
        </div>
    );
}
