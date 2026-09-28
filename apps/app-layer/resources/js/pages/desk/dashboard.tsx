import { Head, Link, usePage } from '@inertiajs/react';
import { AlertTriangle, ArrowRight, Bot, CalendarClock, Inbox, MessagesSquare, Phone, Target, Ticket as TicketIcon, ThumbsDown, ThumbsUp, TrendingUp, Users } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { ChannelIcon, Delta, SplitBar } from '../../components/desk-pages/bits';
import { firstName, greeting, humanize, initialsOf } from '../../components/desk-pages/format';
import { DeskPage, MetricTile, Panel, PanelBody, PanelFooter, PanelHeader, PanelRow, PanelRows, PanelTabs, WithSidePanel } from '../../components/desk-pages/layout';
import { Callout, IconTile, Meter } from '../../components/ui/kit';
import { PageHeader, Segmented } from '../../components/ui/page';
import { Avatar, Badge, EmptyState, Eyebrow, Mono, RelativeTime, UserText, type Tone } from '../../components/ui/primitives';
import Sparkline from '../../components/ui/sparkline';
import type { SharedProps } from '../../types';

interface Pair { value: number; previous: number; delta_pct: number | null }
interface Props {
    window_days: number;
    topline: {
        ai_handled: Pair; support_volume: Pair; leads: Pair;
        most_active_number: { number: string; calls: number } | null;
    };
    support: {
        new_contacts: Pair; new_conversations: Pair; tickets_created: Pair;
        open_tickets: number; unassigned_conversations: number;
        ticket_pipeline: Record<string, number>; by_priority: Record<string, number>;
    };
    ai: {
        conversations_agent_only: number; conversations_team_touched: number;
        calls_answered: number; calls_transferred: number; call_minutes: number;
        tickets_raised_by_agent: number; contacts_in_ai_conversations: number;
        actions_needing_review: number; feedback: { up: number; down: number };
    };
    channels: { channel: string; label: string; conversations: number }[];
    volume_trend: { date: string; contacts: number; conversations: number; tickets: number; calls?: number; leads?: number }[];
    needs_you?: {
        counts: { assigned: number; unread: number; overdue: number; tickets: number };
        conversations: { id: number; title: string; initials: string; company: string | null; channel: string; unread: number; preview: string | null; last_message_at: string | null }[];
        tickets: { id: number; reference: string; subject: string; status_label: string; status_tone: Tone; priority_label: string; priority_tone: Tone; created_by_agent: boolean; at: string | null }[];
        overdue: { key: string; kind: 'reminder' | 'lead'; title: string; subtitle: string | null; href: string | null; due_at: string | null }[];
    };
    agent_activity?: { id: number; type: string; description: string; subject: string | null; href: string | null; at: string | null }[];
    workload?: { id: number; name: string; role: string; open_conversations: number; open_tickets: number; is_you: boolean }[];
}

const EMPTY_NEEDS: NonNullable<Props['needs_you']> = { counts: { assigned: 0, unread: 0, overdue: 0, tickets: 0 }, conversations: [], tickets: [], overdue: [] };

/**
 * The operator's morning view. It answers, in order: what is mine, what did
 * the agent do while I was away, and who on the team can take the next one.
 *
 * The AI figures stay the honest version: only what is countable. Z360 shows
 * "value delivered" and "time saved"; those need a cost model nobody has
 * agreed, and PRODUCT.md forbids invented figures.
 */
export default function Dashboard({ window_days, topline, support, ai, channels, volume_trend, needs_you = EMPTY_NEEDS, agent_activity = [], workload = [] }: Props) {
    const { auth } = usePage<SharedProps>().props;
    const total = ai.conversations_agent_only + ai.conversations_team_touched;
    const aiShare = total ? Math.round((ai.conversations_agent_only / total) * 100) : 0;
    const series = (key: 'contacts' | 'conversations' | 'tickets' | 'calls' | 'leads') => volume_trend.map((d) => d[key] ?? 0);
    const period = `last ${window_days} days`;

    const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    const mineSummary = needs_you.counts.assigned === 0 && needs_you.counts.overdue === 0
        ? 'Nothing is waiting on you. The team queue is below.'
        : [
            needs_you.counts.assigned > 0 && `${needs_you.counts.assigned} conversation${needs_you.counts.assigned === 1 ? '' : 's'} assigned to you`,
            needs_you.counts.unread > 0 && `${needs_you.counts.unread} unread`,
            needs_you.counts.overdue > 0 && `${needs_you.counts.overdue} overdue`,
        ].filter(Boolean).join(', ') + '.';

    return (
        <>
            <Head title="Dashboard" />

            <DeskPage header={
                <PageHeader
                    eyebrow={today}
                    title={`${greeting()}${auth.user ? `, ${firstName(auth.user.name)}` : ''}`}
                    description={mineSummary}
                    actions={
                        <Segmented className="" current={String(window_days)} hrefFor={(k) => `/desk/dashboard?days=${k}`}
                            options={[{ key: '7', label: '7 days' }, { key: '14', label: '14 days' }, { key: '30', label: '30 days' }]} />
                    }
                />
            }>
                {ai.actions_needing_review > 0 && (
                    <Callout tone="danger" icon={<AlertTriangle size={16} strokeWidth={2} />}
                        title={`${ai.actions_needing_review} agent action${ai.actions_needing_review === 1 ? '' : 's'} need${ai.actions_needing_review === 1 ? 's' : ''} a human to check`}
                        action={<Link href="/desk/calls?view=review" className="v-btn v-btn--quiet v-btn--sm">Review calls</Link>}>
                        An action that changes something outside timed out, so nobody knows whether it happened. Check the other system before calling the customer back.
                    </Callout>
                )}

                {/* The numbers, each with its shape over the window. */}
                <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
                    <MetricTile label="Conversations" icon={<MessagesSquare size={15} strokeWidth={1.8} />} value={topline.support_volume.value}
                        trend={<Delta pct={topline.support_volume.delta_pct} />}
                        aside={<Sparkline points={series('conversations')} color="var(--chart-1)" width={76} height={28} label="Conversations per day" />}
                        hint={`${topline.support_volume.previous} in the ${window_days} days before`} />
                    <MetricTile label="Agent handled alone" icon={<Bot size={15} strokeWidth={1.8} />} value={topline.ai_handled.value}
                        trend={<Delta pct={topline.ai_handled.delta_pct} />}
                        hint={
                            <div className="flex items-center gap-3">
                                <span className="shrink-0 tabular-nums">{aiShare}% of all</span>
                                <span className="min-w-0 flex-1"><Meter value={aiShare} label="Share handled by the agent alone" /></span>
                            </div>
                        } />
                    <MetricTile label="Calls answered" icon={<Phone size={15} strokeWidth={1.8} />} value={ai.calls_answered}
                        aside={<Sparkline points={series('calls')} color="var(--chart-2)" width={76} height={28} label="Calls per day" />}
                        hint={`${ai.call_minutes.toLocaleString()} min on the phone`} />
                    <MetricTile label="New leads" icon={<TrendingUp size={15} strokeWidth={1.8} />} value={topline.leads.value}
                        trend={<Delta pct={topline.leads.delta_pct} />}
                        aside={<Sparkline points={series('leads')} color="var(--chart-3)" width={76} height={28} label="Leads per day" />}
                        hint={`${topline.leads.previous} in the ${window_days} days before`} />
                </div>

                {/* The work column carries what needs doing and the team's load; the
                    agent's own report runs beside it, so neither side is left
                    half-empty the way a short "Needs you" beside a tall report was. */}
                <WithSidePanel
                    main={<>
                        <NeedsYou data={needs_you} unassigned={support.unassigned_conversations} />
                        <div className="grid items-start gap-6 lg:grid-cols-2">
                            <WorkloadCard members={workload} />
                            <TicketHealth support={support} trend={series('tickets')} windowDays={window_days} />
                        </div>
                        <ChannelsCard channels={channels} support={support} trend={series('contacts')} busiest={topline.most_active_number} period={period} />
                    </>}
                    side={<AgentCard ai={ai} aiShare={aiShare} period={period} activity={agent_activity} />} />
            </DeskPage>
        </>
    );
}

// ── needs you ─────────────────────────────────────────────────────────────

type NeedsTab = 'conversations' | 'tickets' | 'overdue';

function NeedsYou({ data, unassigned }: { data: NonNullable<Props['needs_you']>; unassigned: number }) {
    const first: NeedsTab = data.counts.overdue > 0 ? 'overdue' : data.conversations.length > 0 ? 'conversations' : data.tickets.length > 0 ? 'tickets' : 'conversations';
    const [tab, setTab] = useState<NeedsTab>(first);

    return (
        <Panel>
            <PanelHeader
                title="Needs you"
                description="Assigned to you, waiting on a reply, or past its time."
                border={false}
                actions={
                    <>
                        {data.counts.unread > 0 && <Badge tone="accent" dot>{data.counts.unread} unread</Badge>}
                        <Link href="/desk/inbox?view=mine" className="v-btn v-btn--quiet v-btn--sm">My inbox</Link>
                    </>
                }
            />
            <PanelTabs<NeedsTab>
                value={tab}
                onChange={setTab}
                options={[
                    { value: 'conversations', label: 'Conversations', count: data.counts.assigned },
                    { value: 'tickets', label: 'Tickets', count: data.counts.tickets },
                    { value: 'overdue', label: data.counts.overdue > 0 ? <span className="text-danger">Overdue</span> : 'Overdue', count: data.counts.overdue },
                ]}
            />

            {tab === 'conversations' && (
                data.conversations.length === 0
                    ? <EmptyState icon={<Inbox size={20} strokeWidth={1.8} />} title="No conversations assigned to you">Take one from the unassigned queue, or wait for the agent to hand one over.</EmptyState>
                    : (
                        <PanelRows>
                            {data.conversations.map((c) => (
                                <PanelRow key={c.id} href={`/desk/inbox/${c.id}`}
                                    leading={<ContactMark name={c.title} initials={c.initials} channel={c.channel} />}
                                    title={<span className="flex items-center gap-2"><span className={`truncate ${c.unread > 0 ? 'font-semibold' : ''}`}><UserText>{c.title}</UserText></span>{c.company && <span className="truncate text-sm font-normal text-tertiary">{c.company}</span>}</span>}
                                    subtitle={c.preview ? <UserText>{c.preview}</UserText> : <span className="text-tertiary">No messages yet</span>}
                                    trailing={
                                        <span className="flex flex-col items-end gap-1">
                                            <RelativeTime at={c.last_message_at} />
                                            {c.unread > 0 ? <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-2xs font-semibold tabular-nums" style={{ background: 'var(--accent)', color: 'var(--text-on-accent)' }}>{c.unread}</span> : <span className="h-[18px]" />}
                                        </span>
                                    }
                                />
                            ))}
                        </PanelRows>
                    )
            )}

            {tab === 'tickets' && (
                data.tickets.length === 0
                    ? <EmptyState icon={<TicketIcon size={20} strokeWidth={1.8} />} title="No open tickets on your plate">Tickets assigned to you land here, most urgent first.</EmptyState>
                    : (
                        <PanelRows>
                            {data.tickets.map((t) => (
                                <PanelRow key={t.id} href={`/desk/tickets/${t.id}`}
                                    leading={<IconTile tone={t.priority_tone}><TicketIcon size={15} strokeWidth={1.8} /></IconTile>}
                                    title={<UserText>{t.subject}</UserText>}
                                    subtitle={<span className="flex items-center gap-1.5"><Mono>{t.reference}</Mono>{t.created_by_agent && <span className="inline-flex items-center gap-1 text-xs text-tertiary"><Bot size={12} strokeWidth={2} /> raised by the agent</span>}</span>}
                                    trailing={<><Badge tone={t.status_tone}>{t.status_label}</Badge><Badge tone={t.priority_tone} dot>{t.priority_label}</Badge></>}
                                />
                            ))}
                        </PanelRows>
                    )
            )}

            {tab === 'overdue' && (
                data.overdue.length === 0
                    ? <EmptyState icon={<CalendarClock size={20} strokeWidth={1.8} />} title="Nothing overdue">Reminders you set and lead follow-ups past their date show up here.</EmptyState>
                    : (
                        <PanelRows>
                            {data.overdue.map((o) => (
                                <PanelRow key={o.key} href={o.href ?? undefined}
                                    leading={<IconTile tone="danger">{o.kind === 'lead' ? <Target size={15} strokeWidth={1.8} /> : <CalendarClock size={15} strokeWidth={1.8} />}</IconTile>}
                                    title={<UserText>{o.title}</UserText>}
                                    subtitle={o.subtitle ? <UserText>{o.subtitle}</UserText> : (o.kind === 'lead' ? 'Lead follow-up' : 'Reminder')}
                                    trailing={<span className="flex flex-col items-end gap-0.5"><span className="text-2xs font-medium text-danger">Due</span><RelativeTime at={o.due_at} /></span>}
                                />
                            ))}
                        </PanelRows>
                    )
            )}

            {unassigned > 0 && (
                <PanelFooter>
                    <span className="flex flex-1 items-center gap-2.5 text-sm text-secondary">
                        <span className="size-2 rounded-full" style={{ background: 'var(--warning-fill)' }} aria-hidden="true" />
                        <span><span className="font-semibold text-primary tabular-nums">{unassigned}</span> conversation{unassigned === 1 ? ' is' : 's are'} waiting with nobody on {unassigned === 1 ? 'it' : 'them'}.</span>
                    </span>
                    <Link href="/desk/inbox?view=unassigned" className="v-btn v-btn--ghost v-btn--sm">Open the queue <ArrowRight size={14} strokeWidth={2} /></Link>
                </PanelFooter>
            )}
        </Panel>
    );
}

function ContactMark({ name, initials, channel }: { name: string; initials: string; channel: string }) {
    return (
        <span className="relative shrink-0">
            <Avatar name={name} initials={initials} size={36} />
            <span className="absolute -right-1 -bottom-1 flex size-[18px] items-center justify-center rounded-full text-secondary" style={{ background: 'var(--surface)', boxShadow: '0 0 0 1px var(--border)' }}>
                <ChannelIcon channel={channel} size={10} />
            </span>
        </span>
    );
}

// ── the agent ─────────────────────────────────────────────────────────────

function AgentCard({ ai, aiShare, period, activity }: { ai: Props['ai']; aiShare: number; period: string; activity: NonNullable<Props['agent_activity']> }) {
    const facts: { n: number; label: string; tone?: Tone }[] = [
        { n: ai.calls_transferred, label: 'Handed to a person' },
        { n: ai.tickets_raised_by_agent, label: 'Tickets raised' },
        { n: ai.contacts_in_ai_conversations, label: 'People spoken with' },
        { n: ai.actions_needing_review, label: 'Need review', tone: ai.actions_needing_review > 0 ? 'danger' : undefined },
    ];

    return (
        <Panel>
            <PanelHeader icon={<Bot size={17} strokeWidth={1.8} />} title="What the agent did" description={`Across the ${period}.`} />
            <PanelBody>
                <div className="flex items-baseline justify-between gap-3">
                    <span className="text-3xl font-semibold tracking-tight text-primary tabular-nums">{aiShare}%</span>
                    <span className="text-right text-xs text-tertiary">of conversations handled alone</span>
                </div>
                <div className="mt-3">
                    <SplitBar parts={[
                        { value: ai.conversations_agent_only, color: 'var(--accent)', label: 'Agent alone' },
                        { value: ai.conversations_team_touched, color: 'var(--border-strong)', label: 'Team replied' },
                    ]} />
                </div>
                <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-tertiary">
                    <Legend color="var(--accent)">{ai.conversations_agent_only} agent alone</Legend>
                    <Legend color="var(--border-strong)">{ai.conversations_team_touched} team replied</Legend>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-x-5 gap-y-5">
                    {facts.map((f) => (
                        <div key={f.label}>
                            <div className="text-xl font-semibold tracking-tight tabular-nums" style={{ color: f.tone === 'danger' ? 'var(--danger)' : 'var(--text-primary)' }}>{f.n.toLocaleString()}</div>
                            <div className="mt-0.5 text-xs text-tertiary">{f.label}</div>
                        </div>
                    ))}
                </div>
            </PanelBody>

            <div style={{ borderTop: '1px solid var(--separator)' }}>
                <div className="flex items-center justify-between px-7 pt-5 pb-2">
                    <Eyebrow>Latest actions</Eyebrow>
                    <Link href="/desk/calls" className="text-xs font-medium text-accent-text">All calls</Link>
                </div>
                {activity.length === 0 ? (
                    <p className="px-7 pb-6 text-sm text-tertiary">Nothing yet. Actions the agent takes, like raising a ticket or updating a contact, are listed here.</p>
                ) : (
                    <ol className="px-7 pb-4">
                        {activity.map((a, i) => {
                            const body = (
                                <>
                                    <span className="relative flex w-3 shrink-0 justify-center pt-1.5">
                                        <span className="relative z-10 size-2 rounded-full" style={{ background: 'var(--accent)', boxShadow: '0 0 0 3px var(--surface)' }} />
                                        {i < activity.length - 1 && <span className="absolute top-3 bottom-[-14px] w-px" style={{ background: 'var(--separator)' }} aria-hidden="true" />}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-sm text-primary"><UserText>{a.description}</UserText></span>
                                        <span className="mt-0.5 flex items-center gap-1.5 text-xs text-tertiary">
                                            {a.subject && <span className="truncate"><UserText>{a.subject}</UserText></span>}
                                            {a.subject && <span aria-hidden="true">·</span>}
                                            <RelativeTime at={a.at} />
                                        </span>
                                    </span>
                                </>
                            );
                            return (
                                <li key={a.id}>
                                    {a.href
                                        ? <Link href={a.href} className="-mx-2 flex gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-surface-hover">{body}</Link>
                                        : <div className="flex gap-3 py-2.5">{body}</div>}
                                </li>
                            );
                        })}
                    </ol>
                )}
            </div>

            <PanelFooter>
                <span className="flex-1 text-xs text-tertiary">Team feedback on agent replies</span>
                <Badge tone="success"><ThumbsUp size={11} strokeWidth={2} /> {ai.feedback.up}</Badge>
                <Badge tone={ai.feedback.down > 0 ? 'danger' : 'muted'}><ThumbsDown size={11} strokeWidth={2} /> {ai.feedback.down}</Badge>
            </PanelFooter>
        </Panel>
    );
}

function Legend({ color, children }: { color: string; children: ReactNode }) {
    return <span className="inline-flex items-center gap-1.5 tabular-nums"><span className="size-2 rounded-full" style={{ background: color }} aria-hidden="true" />{children}</span>;
}

// ── the team and the queues ───────────────────────────────────────────────

function WorkloadCard({ members }: { members: NonNullable<Props['workload']> }) {
    const max = Math.max(1, ...members.map((m) => m.open_conversations + m.open_tickets));

    return (
        <Panel>
            <PanelHeader icon={<Users size={17} strokeWidth={1.8} />} title="Team workload" description="Open conversations and tickets per person."
                actions={<Link href="/desk/team" className="v-btn v-btn--ghost v-btn--sm">Team</Link>} />
            {members.length === 0 ? (
                <p className="px-7 py-6 text-sm text-tertiary">No one on the team yet.</p>
            ) : (
                <ul className="px-7 py-4">
                    {members.slice(0, 7).map((m) => {
                        const load = m.open_conversations + m.open_tickets;
                        return (
                            <li key={m.id} className="flex items-center gap-3.5 py-2.5">
                                <Avatar name={m.name} initials={initialsOf(m.name)} size={32} />
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-baseline justify-between gap-2">
                                        <span className="truncate text-sm font-medium text-primary"><UserText>{m.name}</UserText>{m.is_you && <span className="ml-1.5 text-xs font-normal text-tertiary">you</span>}</span>
                                        <span className="shrink-0 text-xs text-tertiary tabular-nums" title="Open conversations · open tickets">{m.open_conversations} · {m.open_tickets}</span>
                                    </div>
                                    <div className="mt-2"><Meter value={(load / max) * 100} tone={load === max && load > 0 && members.length > 1 ? 'warning' : 'accent'} label={`${m.name}: ${load} open`} /></div>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </Panel>
    );
}

const PRIORITY_ORDER: { key: string; tone: Tone }[] = [
    { key: 'urgent', tone: 'danger' }, { key: 'high', tone: 'warning' }, { key: 'normal', tone: 'info' }, { key: 'low', tone: 'muted' },
];

function TicketHealth({ support, trend, windowDays }: { support: Props['support']; trend: number[]; windowDays: number }) {
    const rows: [string, number, Tone][] = [
        ['Open', support.ticket_pipeline.open ?? 0, 'info'],
        ['In progress', support.ticket_pipeline.in_progress ?? 0, 'accent'],
        ['Pending', support.ticket_pipeline.pending ?? 0, 'warning'],
    ];
    const max = Math.max(1, ...rows.map(([, n]) => n));

    return (
        <Panel>
            <PanelHeader icon={<TicketIcon size={17} strokeWidth={1.8} />} title="Tickets" description="Everything not yet resolved, by where it stands."
                actions={<Link href="/desk/tickets" className="v-btn v-btn--ghost v-btn--sm">Tickets</Link>} />
            <PanelBody>
                <div className="flex items-end justify-between gap-4">
                    <div>
                        <div className="text-3xl font-semibold tracking-tight text-primary tabular-nums">{support.open_tickets}</div>
                        <div className="text-xs text-tertiary">unresolved</div>
                    </div>
                    <div className="text-right">
                        <div className="flex items-center justify-end gap-1.5 text-sm text-secondary"><span className="font-semibold text-primary tabular-nums">{support.tickets_created.value}</span> created <Delta pct={support.tickets_created.delta_pct} invert /></div>
                        <div className="mt-1 flex justify-end"><Sparkline points={trend} color="var(--chart-3)" width={112} height={26} label={`Tickets created per day, last ${windowDays} days`} /></div>
                    </div>
                </div>

                <div className="mt-6 flex flex-col gap-4">
                    {rows.map(([label, n, tone]) => (
                        <div key={label}>
                            <div className="mb-2 flex justify-between text-sm"><span className="text-secondary">{label}</span><span className="font-medium text-primary tabular-nums">{n}</span></div>
                            <Meter value={(n / max) * 100} tone={tone} label={`${label}: ${n}`} />
                        </div>
                    ))}
                </div>

                <div className="mt-6 flex flex-wrap gap-1.5">
                    {PRIORITY_ORDER.filter((p) => (support.by_priority[p.key] ?? 0) > 0).map((p) => (
                        <Badge key={p.key} tone={p.tone} dot>{support.by_priority[p.key]} {humanize(p.key).toLowerCase()}</Badge>
                    ))}
                </div>
            </PanelBody>
        </Panel>
    );
}

function ChannelsCard({ channels, support, trend, busiest, period }: { channels: Props['channels']; support: Props['support']; trend: number[]; busiest: Props['topline']['most_active_number']; period: string }) {
    const max = Math.max(1, ...channels.map((c) => c.conversations));
    const sorted = [...channels].sort((a, b) => b.conversations - a.conversations);

    return (
        <Panel>
            <PanelHeader icon={<MessagesSquare size={17} strokeWidth={1.8} />} title="Channels" description={`Where conversations started, ${period}.`} />
            <PanelBody>
                <div className="flex flex-col gap-4">
                    {sorted.map((c) => (
                        <div key={c.channel} className="flex items-center gap-3.5">
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-md text-secondary" style={{ background: 'var(--surface-sunken)' }}><ChannelIcon channel={c.channel} size={14} /></span>
                            <div className="min-w-0 flex-1">
                                <div className="mb-1.5 flex justify-between text-sm"><span className="text-secondary">{c.label}</span><span className="font-medium text-primary tabular-nums">{c.conversations}</span></div>
                                <Meter value={(c.conversations / max) * 100} tone="info" label={`${c.label}: ${c.conversations}`} />
                            </div>
                        </div>
                    ))}
                </div>

                <div className="mt-6 flex items-end justify-between gap-3 pt-5" style={{ borderTop: '1px solid var(--separator)' }}>
                    <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-sm text-secondary"><span className="font-semibold text-primary tabular-nums">{support.new_contacts.value}</span> new contacts <Delta pct={support.new_contacts.delta_pct} /></div>
                        <div className="mt-0.5 text-xs text-tertiary">
                            {busiest ? <>Busiest line <Mono>{busiest.number}</Mono> · {busiest.calls} calls</> : 'No calls in this window.'}
                        </div>
                    </div>
                    <Sparkline points={trend} color="var(--chart-1)" width={96} height={26} label="New contacts per day" />
                </div>
            </PanelBody>
        </Panel>
    );
}
