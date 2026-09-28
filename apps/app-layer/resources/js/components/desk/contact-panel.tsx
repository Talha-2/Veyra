import { Link, router } from '@inertiajs/react';
import { AlarmClock, Bot, ChevronRight, Mail, Paperclip, Phone, Plus, Star, UserPlus, UserRound } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

import Popover from '../ui/popover';
import { KeyValues, Switch } from '../ui/kit';
import { Avatar, Badge, Mono, RelativeTime, UserText } from '../ui/primitives';
import { AvatarStack } from '../desk-inbox/controls';
import { InspectorSection } from '../desk-inbox/inspector';
import { dateTimeLabel, fileSize, initialsOf } from '../desk-inbox/helpers';
import TagEditor from '../desk-inbox/tag-editor';
import type { ThreadView, TicketSummary } from '../../types/desk';

/**
 * The inspector beside a thread: who this is, how to reach them, whether
 * they can reach us (block / do-not-disturb), and what is open on them.
 *
 * Notes, reminders and tickets also appear in the thread's timeline; here
 * they are gathered so the open items can be read at a glance.
 */
export default function ContactPanel({ thread, existingTags }: { thread: ThreadView | null; existingTags: string[] }) {
    if (!thread) return null;

    const d = thread.details;
    const contact = thread.contact;

    // Tickets on this conversation first, then the contact's other open ones.
    const tickets: TicketSummary[] = [...d.tickets];
    for (const t of contact?.open_tickets ?? []) if (!tickets.some((x) => x.id === t.id)) tickets.push(t);

    return (
        <aside className="flex w-[320px] shrink-0 flex-col" style={{ background: 'var(--bg)', borderLeft: '1px solid var(--border)' }} aria-label="Conversation details">
            <div className="min-h-0 flex-1 overflow-y-auto">
                {contact ? <ContactHeader thread={thread} /> : <UnknownHeader thread={thread} />}

                {contact && (
                    <InspectorSection title="Details">
                        <KeyValues items={[
                            ...(contact.phone ? [{ label: 'Phone', value: <a href={`tel:${contact.phone}`} className="tabular-nums hover:text-accent-text">{contact.phone}</a> }] : []),
                            ...(contact.email ? [{ label: 'Email', value: <a href={`mailto:${contact.email}`} className="block truncate hover:text-accent-text">{contact.email}</a> }] : []),
                            ...(contact.company ? [{ label: 'Company', value: <UserText>{contact.company}</UserText> }] : []),
                            { label: 'Stage', value: <Badge tone={contact.stage_tone} dot>{contact.stage_label}</Badge> },
                        ]} />
                        {contact.tags.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-1.5">
                                {contact.tags.map((t) => (
                                    <span key={t.name} className="inline-flex h-[22px] items-center gap-1.5 rounded-full px-2 text-2xs font-medium text-secondary" style={{ background: 'var(--surface-sunken)' }}>
                                        <span className="size-1.5 rounded-full" style={{ background: t.color || 'var(--text-tertiary)' }} aria-hidden="true" />
                                        {t.name}
                                    </span>
                                ))}
                            </div>
                        )}
                    </InspectorSection>
                )}

                {thread.identifier && <IdentifierSection identifier={thread.identifier} />}

                <InspectorSection title="Conversation tags" count={thread.tags.length}
                    action={
                        <Popover align="end" width={260} trigger={({ toggle }) => (
                            <button type="button" onClick={toggle} title="Edit tags" aria-label="Edit tags"
                                className="flex size-6 items-center justify-center rounded-md text-tertiary transition-colors hover:bg-surface-hover hover:text-primary">
                                <Plus size={14} strokeWidth={2} />
                            </button>
                        )}>
                            {() => (
                                <div className="p-1.5">
                                    <TagEditor value={thread.tags} suggestions={existingTags}
                                        onChange={(tags) => router.post(`/desk/inbox/${thread.id}/tags`, { tags }, { preserveScroll: true })} />
                                </div>
                            )}
                        </Popover>
                    }>
                    {thread.tags.length === 0 ? (
                        <p className="text-sm text-tertiary">No tags. Tags group conversations for saved views and reports.</p>
                    ) : (
                        <div className="flex flex-wrap gap-1.5">
                            {thread.tags.map((t) => (
                                <Link key={t} href={`/desk/inbox?tag=${encodeURIComponent(t)}`} title={`Show conversations tagged ${t}`}>
                                    <Badge>#{t}</Badge>
                                </Link>
                            ))}
                        </div>
                    )}
                </InspectorSection>

                <InspectorSection title="Tickets" count={tickets.length} flush>
                    {tickets.length === 0 ? <Empty>No tickets on this conversation or contact.</Empty> : tickets.map((t) => (
                        <Link key={t.id} href={`/desk/tickets/${t.id}`} className="group flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-surface-hover">
                            <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-1.5">
                                    <Mono>{t.reference}</Mono>
                                    {t.created_by_agent && <Bot size={14} strokeWidth={2} className="text-accent" aria-label="Raised by the agent" />}
                                    <span className="flex-1" />
                                    {t.status_label && <Badge tone={t.status_tone ?? 'muted'} dot>{t.status_label}</Badge>}
                                    <Badge tone={t.priority_tone}>{t.priority}</Badge>
                                </span>
                                <span className="mt-0.5 flex items-center gap-2">
                                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-primary"><UserText>{t.subject}</UserText></span>
                                    {t.assignees && t.assignees.length > 0 && <AvatarStack people={t.assignees} size={18} />}
                                </span>
                            </span>
                            <ChevronRight size={14} strokeWidth={2} className="shrink-0 text-tertiary" />
                        </Link>
                    ))}
                </InspectorSection>

                {d.reminders.length > 0 && (
                    <InspectorSection title="Reminders" count={d.reminders.length}>
                        <div className="flex flex-col gap-2">
                            {d.reminders.map((r) => (
                                <div key={r.id} className="flex gap-2.5">
                                    <AlarmClock size={14} strokeWidth={1.9} className="mt-0.5 shrink-0" style={{ color: r.overdue ? 'var(--danger)' : 'var(--text-tertiary)' }} />
                                    <div className="min-w-0 flex-1">
                                        <div className="text-sm text-primary"><UserText>{r.text}</UserText></div>
                                        {r.due_at && <div className={`text-xs ${r.overdue ? 'text-danger' : 'text-tertiary'}`}>{r.overdue ? 'Overdue · ' : ''}{dateTimeLabel(r.due_at)}</div>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </InspectorSection>
                )}

                <InspectorSection title="Activity" count={d.activities.length} defaultOpen={d.activities.length > 0}>
                    {d.activities.length === 0 ? <Empty>Nothing has happened yet.</Empty> : <ActivityList activities={d.activities} />}
                </InspectorSection>

                {d.attachments.length > 0 && (
                    <InspectorSection title="Files" count={d.attachments.length} flush>
                        {d.attachments.map((f) => (
                            <div key={f.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm">
                                <span className="flex size-7 shrink-0 items-center justify-center rounded-md text-tertiary" style={{ background: 'var(--surface-sunken)' }}><Paperclip size={14} strokeWidth={1.9} /></span>
                                <span className="min-w-0 flex-1 truncate text-primary">{f.filename}</span>
                                <span className="shrink-0 text-xs text-tertiary tabular-nums">{fileSize(f.size_bytes)}</span>
                            </div>
                        ))}
                    </InspectorSection>
                )}
            </div>
        </aside>
    );
}

function Empty({ children }: { children: ReactNode }) {
    return <p className="px-2 text-sm text-tertiary">{children}</p>;
}

function ContactHeader({ thread }: { thread: ThreadView }) {
    const contact = thread.contact!;

    return (
        <div className="flex flex-col items-center px-5 pt-6 pb-5 text-center">
            <Avatar initials={contact.initials} name={contact.name} size={72} />
            <div className="mt-3 flex max-w-full items-center gap-1">
                <h3 className="truncate text-lg font-semibold tracking-tight text-primary"><UserText>{contact.name}</UserText></h3>
                <button type="button" title={contact.is_favorite ? 'Remove from favourites' : 'Add to favourites'} aria-label="Toggle favorite contact" aria-pressed={contact.is_favorite}
                    onClick={() => router.post(`/desk/contacts/${contact.id}/favorite`, {}, { preserveScroll: true })}
                    className="flex size-6 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-surface-hover"
                    style={{ color: contact.is_favorite ? 'var(--warning)' : 'var(--text-tertiary)' }}>
                    <Star size={14} strokeWidth={1.9} fill={contact.is_favorite ? 'currentColor' : 'none'} />
                </button>
            </div>
            {contact.company && <p className="max-w-full truncate text-sm text-secondary"><UserText>{contact.company}</UserText></p>}

            {/* Quick actions, as on a Contacts card. Only real links: nothing here pretends to dial. */}
            <div className="mt-4 grid w-full grid-cols-3 gap-2">
                <QuickAction href={contact.phone ? `tel:${contact.phone}` : undefined} icon={<Phone size={16} strokeWidth={1.9} />} label="Call" />
                <QuickAction href={contact.email ? `mailto:${contact.email}` : undefined} icon={<Mail size={16} strokeWidth={1.9} />} label="Email" />
                <QuickAction inertia href={`/desk/contacts/${contact.id}`} icon={<UserRound size={16} strokeWidth={1.9} />} label="Profile" />
            </div>
        </div>
    );
}

function QuickAction({ href, icon, label, inertia = false }: { href?: string; icon: ReactNode; label: string; inertia?: boolean }) {
    const className = 'flex flex-col items-center gap-1 rounded-lg py-2 text-2xs font-medium transition-colors';
    const style = { background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-xs)' };

    if (!href) {
        return <span className={`${className} cursor-not-allowed text-disabled`} style={style} aria-disabled="true" title={`No ${label.toLowerCase()} on file`}>{icon}{label}</span>;
    }
    if (inertia) {
        return <Link href={href} className={`${className} text-accent-text hover:bg-surface-hover`} style={style}>{icon}{label}</Link>;
    }
    return <a href={href} className={`${className} text-accent-text hover:bg-surface-hover`} style={style}>{icon}{label}</a>;
}

function UnknownHeader({ thread }: { thread: ThreadView }) {
    const label = thread.identifier?.value ?? thread.title;

    return (
        <div className="flex flex-col items-center px-5 pt-6 pb-5 text-center">
            <Avatar initials={initialsOf(label)} name={label} size={72} />
            <h3 className="mt-3 max-w-full truncate text-lg font-semibold tracking-tight text-primary tabular-nums">{label}</h3>
            <p className="mt-1 max-w-[36ch] text-sm text-secondary">
                Not a contact yet. Create one and this whole history moves with it.
            </p>
            <button type="button" onClick={() => router.post('/desk/contacts', { from_conversation_id: thread.id })} className="v-btn v-btn--quiet mt-4 w-full">
                <UserPlus size={15} strokeWidth={1.9} /> Create contact
            </button>
        </div>
    );
}

/**
 * Block and do-not-disturb as switches. Optimistic: the switch moves on
 * click and settles to the server's answer when the page props come back.
 */
function IdentifierSection({ identifier }: { identifier: NonNullable<ThreadView['identifier']> }) {
    const [blocked, setBlocked] = useState(identifier.blocked);
    const [dnd, setDnd] = useState(identifier.dnd);
    useEffect(() => { setBlocked(identifier.blocked); setDnd(identifier.dnd); }, [identifier.id, identifier.blocked, identifier.dnd]);

    const toggle = (what: 'block' | 'dnd', next: boolean, set: (v: boolean) => void, previous: boolean) => {
        set(next);
        router.post(`/desk/identifiers/${identifier.id}/${what}`, {}, { preserveScroll: true, onError: () => set(previous) });
    };

    return (
        <InspectorSection title={identifier.type === 'email' ? 'Email address' : identifier.type === 'phone' ? 'Number' : 'Address'} collapsible={false}>
            <div className="mb-3 truncate text-sm font-medium text-primary tabular-nums" title={identifier.value}>{identifier.value}</div>
            <div className="overflow-hidden rounded-lg" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <SwitchRow label="Do not disturb" hint={dnd ? (identifier.dnd_until ? `Until ${dateTimeLabel(identifier.dnd_until)}` : 'On for 30 days') : 'Turns on for 30 days'}
                    checked={dnd} onChange={(v) => toggle('dnd', v, setDnd, dnd)} />
                <div className="mx-3 h-px" style={{ background: 'var(--separator)' }} />
                <SwitchRow label="Block" hint={blocked ? 'Messages from here are ignored' : 'Ignore everything from this address'} danger
                    checked={blocked} onChange={(v) => toggle('block', v, setBlocked, blocked)} />
            </div>
        </InspectorSection>
    );
}

function SwitchRow({ label, hint, checked, onChange, danger = false }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void; danger?: boolean }) {
    return (
        <div className="flex items-center gap-3 px-3 py-2.5">
            <div className="min-w-0 flex-1">
                <div className={`text-sm font-medium ${danger && checked ? 'text-danger' : 'text-primary'}`}>{label}</div>
                <div className="text-xs text-tertiary">{hint}</div>
            </div>
            <Switch size="sm" checked={checked} onChange={onChange} label={label} />
        </div>
    );
}

function ActivityList({ activities }: { activities: ThreadView['details']['activities'] }) {
    const [all, setAll] = useState(false);
    const shown = all ? activities : activities.slice(0, 6);

    return (
        <>
            <ol className="relative flex flex-col gap-3">
                <span className="absolute top-1.5 bottom-1.5 left-[3px] w-px" style={{ background: 'var(--separator)' }} aria-hidden="true" />
                {shown.map((a) => (
                    <li key={a.id} className="relative flex gap-3">
                        <span className="relative mt-1.5 size-[7px] shrink-0 rounded-full" style={{ background: a.is_agent ? 'var(--accent)' : 'var(--border-strong)', boxShadow: '0 0 0 3px var(--bg)' }} aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                            <div className="text-sm text-primary">{a.description}</div>
                            <div className="flex items-center gap-1 text-xs text-tertiary">
                                {a.is_agent && <Bot size={12} strokeWidth={2} className="text-accent" aria-hidden="true" />}
                                {a.actor} · <RelativeTime at={a.at} />
                            </div>
                        </div>
                    </li>
                ))}
            </ol>
            {activities.length > 6 && (
                <button type="button" onClick={() => setAll((v) => !v)} className="mt-2.5 text-xs font-medium text-accent-text hover:underline">
                    {all ? 'Show less' : `Show all ${activities.length}`}
                </button>
            )}
        </>
    );
}
