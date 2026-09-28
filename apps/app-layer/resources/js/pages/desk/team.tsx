import { Head, Link } from '@inertiajs/react';
import { Headphones, Inbox, Phone, Ticket, Users } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Cell, DataTable, HeadCell, TableRow } from '../../components/desk-pages/collection';
import { initialsOf } from '../../components/desk-pages/format';
import { DeskPage, MetricTile, Panel } from '../../components/desk-pages/layout';
import { Callout, Meter, SearchField, SegmentedControl } from '../../components/ui/kit';
import { PageHeader } from '../../components/ui/page';
import { Avatar, Badge, EmptyState, Mono, UserText, type Tone } from '../../components/ui/primitives';

interface Member {
    id: number;
    name: string;
    email: string;
    role: string;
    extension: string | null;
    phone: string | null;
    color: string;
    open_conversations: number;
    open_tickets: number;
    last_active_at?: string | null;
    surfaces?: string[];
}

type Presence = { tone: Tone; label: string; live: boolean; rank: number };

/** Online inside five minutes, away inside an hour, otherwise when they were last seen. */
function presenceOf(at: string | null | undefined): Presence {
    if (!at) return { tone: 'muted', label: 'Not signed in', live: false, rank: 3 };
    const minutes = (Date.now() - new Date(at).getTime()) / 60000;
    if (minutes < 5) return { tone: 'success', label: 'Active now', live: true, rank: 0 };
    if (minutes < 60) return { tone: 'warning', label: `Away · ${Math.max(1, Math.round(minutes))}m`, live: false, rank: 1 };
    if (minutes < 60 * 24) return { tone: 'muted', label: `Seen ${Math.round(minutes / 60)}h ago`, live: false, rank: 2 };
    return { tone: 'muted', label: `Seen ${new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`, live: false, rank: 2 };
}

/**
 * Desk's team page answers a shift question, not an administrative one: who is
 * loaded up and who can take the next one. Inviting people and changing their
 * access is Studio's business, so this page points there rather than
 * duplicating controls that would 403.
 */
export default function Team({ members, can_manage }: { members: Member[]; can_manage: boolean }) {
    const [term, setTerm] = useState('');
    const [sort, setSort] = useState<'load' | 'presence' | 'name'>('load');

    const max = Math.max(1, ...members.map((m) => m.open_conversations + m.open_tickets));
    const totalConversations = members.reduce((a, m) => a + m.open_conversations, 0);
    const totalTickets = members.reduce((a, m) => a + m.open_tickets, 0);
    const activeNow = members.filter((m) => presenceOf(m.last_active_at).live).length;
    const presenceKnown = members.some((m) => m.last_active_at !== undefined);

    const rows = useMemo(() => {
        const needle = term.trim().toLowerCase();
        const list = members.filter((m) => !needle || m.name.toLowerCase().includes(needle) || m.email.toLowerCase().includes(needle) || (m.extension ?? '').includes(needle));
        return [...list].sort((a, b) => {
            if (sort === 'name') return a.name.localeCompare(b.name);
            if (sort === 'presence') return presenceOf(a.last_active_at).rank - presenceOf(b.last_active_at).rank || a.name.localeCompare(b.name);
            return (b.open_conversations + b.open_tickets) - (a.open_conversations + a.open_tickets);
        });
    }, [members, term, sort]);

    return (
        <>
            <Head title="Team" />

            <DeskPage width="wide" header={
                <PageHeader
                    title="Team"
                    description="Who is on shift, what each person is carrying, and how to reach them."
                    actions={can_manage ? <Link href="/studio/settings/team" className="v-btn v-btn--quiet"><Users size={14} strokeWidth={1.8} />Manage in Studio</Link> : undefined}
                />
            }>
                <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
                    <MetricTile label="People" icon={<Users size={15} strokeWidth={1.8} />} value={members.length} hint={members.length === 1 ? 'Just you so far' : 'On this organization'} />
                    <MetricTile label="Active now" icon={<Headphones size={15} strokeWidth={1.8} />} value={presenceKnown ? activeNow : '—'} tone={activeNow > 0 ? 'var(--success)' : undefined}
                        hint={presenceKnown ? 'Used Veyra in the last five minutes' : 'Presence is not recorded on this server'} />
                    <MetricTile label="Open conversations" icon={<Inbox size={15} strokeWidth={1.8} />} value={totalConversations} hint="Assigned across the team" />
                    <MetricTile label="Open tickets" icon={<Ticket size={15} strokeWidth={1.8} />} value={totalTickets} hint="Assigned, not yet resolved" />
                </div>

                <section className="flex flex-col gap-6">
                <div className="flex flex-wrap items-center gap-3">
                    <SegmentedControl value={sort} onChange={setSort} options={[
                        { value: 'load', label: 'Busiest first' },
                        { value: 'presence', label: 'Available first' },
                        { value: 'name', label: 'Name' },
                    ]} />
                    <div className="flex-1" />
                    <SearchField value={term} onChange={setTerm} placeholder="Name, email or extension" className="w-full sm:w-72 [&_input]:h-9" />
                </div>

                {rows.length === 0 ? (
                    <Panel><EmptyState icon={<Users size={22} strokeWidth={1.8} />} title={term ? 'No one matches' : 'No one on the team yet'}>{term ? 'Try a first name, or an extension number.' : 'An owner or admin invites people from Studio settings.'}</EmptyState></Panel>
                ) : (
                    <DataTable minWidth={900} head={
                        <>
                            <HeadCell>Person</HeadCell>
                            <HeadCell width={160}>Status</HeadCell>
                            <HeadCell width={120}>Role</HeadCell>
                            <HeadCell width={220}>Workload</HeadCell>
                            <HeadCell width={120}>Extension</HeadCell>
                            <HeadCell width={160}>Can open</HeadCell>
                        </>
                    }>
                        {rows.map((m) => {
                            const p = presenceOf(m.last_active_at);
                            const load = m.open_conversations + m.open_tickets;
                            return (
                                <TableRow key={m.id}>
                                    <Cell className="w-full max-w-0">
                                        <div className="flex min-w-0 items-center gap-3 py-2.5">
                                            <span className="relative shrink-0">
                                                <Avatar name={m.name} initials={initialsOf(m.name)} size={36} />
                                                {m.last_active_at !== undefined && (
                                                    <span className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full" style={{ background: p.live ? 'var(--success-fill)' : p.tone === 'warning' ? 'var(--warning-fill)' : 'var(--text-disabled)', boxShadow: '0 0 0 2px var(--surface)' }} aria-hidden="true" />
                                                )}
                                            </span>
                                            <div className="min-w-0 leading-tight">
                                                <div className="truncate text-base font-medium text-primary"><UserText>{m.name}</UserText></div>
                                                <a href={`mailto:${m.email}`} className="block truncate text-xs text-tertiary hover:text-secondary">{m.email}</a>
                                            </div>
                                        </div>
                                    </Cell>
                                    <Cell>{m.last_active_at !== undefined ? <Badge tone={p.tone} dot>{p.label}</Badge> : <span className="text-sm text-tertiary">Unknown</span>}</Cell>
                                    <Cell className="text-secondary">{m.role}</Cell>
                                    <Cell>
                                        <div className="w-[180px]">
                                            <div className="mb-1.5 flex items-center justify-between text-xs">
                                                <span className="inline-flex items-center gap-2.5 text-secondary tabular-nums">
                                                    <span className="inline-flex items-center gap-1" title="Open conversations"><Inbox size={12} strokeWidth={1.8} />{m.open_conversations}</span>
                                                    <span className="inline-flex items-center gap-1" title="Open tickets"><Ticket size={12} strokeWidth={1.8} />{m.open_tickets}</span>
                                                </span>
                                                {load === 0 && <span className="text-tertiary">Free</span>}
                                            </div>
                                            <Meter value={(load / max) * 100} tone={load === max && load > 0 && members.length > 1 ? 'warning' : 'accent'} label={`${m.name}: ${load} open items`} />
                                        </div>
                                    </Cell>
                                    <Cell>
                                        {/* The extension is how the agent transfers a call to this person,
                                            so it is operationally useful here rather than decoration. */}
                                        {m.extension
                                            ? <span className="inline-flex items-center gap-1.5"><Phone size={12} strokeWidth={1.8} className="text-tertiary" /><Mono className="text-sm text-primary">{m.extension}</Mono></span>
                                            : <span className="text-sm text-tertiary">—</span>}
                                    </Cell>
                                    <Cell>
                                        <span className="flex gap-1">
                                            {(m.surfaces ?? []).length === 0 ? <span className="text-sm text-tertiary">—</span> : (m.surfaces ?? []).map((s) => <Badge key={s} tone="muted">{s.replace(/^Veyra\s+/, '')}</Badge>)}
                                        </span>
                                    </Cell>
                                </TableRow>
                            );
                        })}
                    </DataTable>
                )}

                <div>
                    <Callout tone="muted">
                        {can_manage
                            ? <>Invite people, change roles and set which of Desk and Studio each person can open in <Link href="/studio/settings/team" className="font-medium text-accent-text">Studio settings</Link>. The extension is what the agent dials to transfer a call.</>
                            : 'Only an owner or admin can change who is on the team. The extension is what the agent dials to transfer a call.'}
                    </Callout>
                </div>
                </section>
            </DeskPage>
        </>
    );
}
