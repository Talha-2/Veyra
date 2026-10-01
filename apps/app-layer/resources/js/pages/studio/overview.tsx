import { Head, Link, router, usePage } from '@inertiajs/react';
import {
    AlertTriangle,
    ArrowRight,
    ArrowUpRight,
    Check,
    CheckCircle2,
    ShieldAlert,
    ShieldCheck,
    Sparkles,
    Split,
    Ticket,
    Timer,
    X,
} from 'lucide-react';
import { Fragment, useState } from 'react';

import { languageLabel, sayList } from '../../components/studio-agent/languages';
import { StatLink } from '../../components/studio-agent/stat-link';
import { Disclosure, Group, PageStack } from '../../components/studio/space';
import { ComingSoon } from '../../components/ui/coming-soon';
import { Callout, Card, IconTile, List, ListRow, Meter } from '../../components/ui/kit';
import { PageHeader } from '../../components/ui/page';
import { Badge, Mono, RelativeTime } from '../../components/ui/primitives';
import type { SharedProps } from '../../types';

interface Props {
    window_days: number;
    agent_name?: string | null;
    health: {
        calls: number;
        p95_ms: number | null;
        p95_budget_ms: number;
        failed_delegations: number;
        needs_reconciliation: number;
        agent_tickets_open: number;
        awaiting_approval: number;
    };
    reconcile: { id: number; action: string; contact: string | null; conversation_id: number | null; at: string }[];
    approvals: Approval[];
    setup: {
        agent_named: boolean;
        greeting_set: boolean;
        voice_set?: boolean;
        numbers: number;
        experts: number;
        skills: number;
        languages: string[];
    };
}

interface Approval {
    id: number;
    action: string;
    kind: string | null;
    writes: boolean;
    missing: boolean;
    expert: string | null;
    contact: string | null;
    conversation_id: number | null;
    arguments: Record<string, unknown>;
    at: string;
}

/** The reconcile query stops at eight; past that the count is a floor. */
const RECONCILE_LIMIT = 8;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function greeting(): string {
    const hour = new Date().getHours();
    return hour < 5 ? 'Good evening' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

/**
 * Studio's home. The first screen answers "is the agent behaving?": the
 * health strip is the four ways it fails a customer — it is slow, it said
 * something happened that did not, it promised follow-up nobody did, a
 * handoff broke — and each tile opens where the fix lives. Below it, what a
 * human must check now, what is left to set up, and the way into every area.
 */
export default function Overview({ window_days, agent_name, health, reconcile, approvals, setup }: Props) {
    const { auth } = usePage<SharedProps>().props;
    const firstName = auth.user?.name.split(' ')[0];
    const agent = agent_name || 'The agent';

    const overBudget = health.p95_ms != null && health.p95_ms > health.p95_budget_ms;
    const unconfirmed = health.needs_reconciliation;
    const unconfirmedLabel = `${unconfirmed}${unconfirmed >= RECONCILE_LIMIT ? '+' : ''}`;
    const attention = (unconfirmed > 0 ? 1 : 0) + (overBudget ? 1 : 0) + (health.agent_tickets_open > 3 ? 1 : 0) + (health.failed_delegations > 0 ? 1 : 0) + (health.awaiting_approval > 0 ? 1 : 0);

    // `soon`: shown so the step is not a surprise later, but it cannot be done
    // yet, so it neither counts toward setup nor becomes "Continue setup".
    const steps: { key: string; done: boolean; title: string; detail: string; href: string; soon?: boolean }[] = [
        {
            key: 'identity',
            done: setup.agent_named && setup.greeting_set,
            title: 'Name and greeting',
            detail: setup.agent_named && setup.greeting_set
                ? `Introduces itself as ${agent_name ?? 'the agent'}`
                : !setup.agent_named ? 'Give the agent the name callers will hear' : 'Write the first line every caller hears',
            href: '/studio/agent#identity',
        },
        {
            key: 'voice',
            done: setup.voice_set ?? true,
            title: 'Voice',
            detail: setup.voice_set === false ? 'Pick a voice and hear it in the agent’s language' : 'A voice is chosen',
            href: '/studio/voice',
        },
        {
            key: 'numbers',
            done: setup.numbers > 0,
            title: 'Phone number',
            detail: setup.numbers > 0 ? `${plural(setup.numbers, 'active number')} answering calls` : 'Connect a number so the agent can answer calls',
            href: '/studio/telephony',
            // No SIP trunk or carrier is wired, so a phone line cannot reach the agent yet.
            soon: true,
        },
        {
            key: 'experts',
            done: setup.experts >= 2,
            title: 'Talker and worker',
            detail: setup.experts >= 2 ? `${plural(setup.experts, 'expert')} enabled` : 'Every call needs one talker and one worker enabled',
            href: '/studio/experts',
        },
        {
            key: 'skills',
            done: setup.skills > 0,
            title: 'First skill',
            detail: setup.skills > 0 ? `${plural(setup.skills, 'skill')} the worker can follow` : 'Write a procedure the worker can follow on a call',
            href: '/studio/skills',
        },
        {
            key: 'languages',
            done: true,
            title: 'Languages',
            detail: `Speaks ${sayList(setup.languages.map(languageLabel))}`,
            href: '/studio/agent#languages',
        },
    ];
    const required = steps.filter((s) => !s.soon);
    const done = required.filter((s) => s.done).length;
    const next = required.find((s) => !s.done);

    // Coming-soon steps sit at the end of the list, after everything that can be done now.
    const remaining = [...required.filter((s) => !s.done), ...steps.filter((s) => s.soon && !s.done)];
    const outstanding = required.length - done;
    const completed = steps.filter((s) => s.done);

    return (
        <>
            <Head title="Studio" />

            <PageHeader
                eyebrow={`Last ${window_days} days`}
                title={firstName ? `${greeting()}, ${firstName}` : greeting()}
                description={
                    attention > 0
                        ? `${agent} handled ${plural(health.calls, 'call')}. ${attention === 1 ? 'One thing needs' : `${attention} things need`} your attention.`
                        : health.calls > 0
                          ? `${agent} handled ${plural(health.calls, 'call')} and nothing needs your attention.`
                          : `${agent} has not taken a call in the last ${window_days} days.`
                }
                meta={
                    attention > 0
                        ? <Badge tone={unconfirmed > 0 ? 'danger' : 'warning'} dot>{attention === 1 ? '1 issue' : `${attention} issues`}</Badge>
                        : <Badge tone="success" dot>Healthy</Badge>
                }
                actions={
                    <>
                        <Link href="/studio/ask" className="v-btn v-btn--quiet">
                            <Sparkles size={15} strokeWidth={1.9} />
                            Ask Studio
                        </Link>
                        {next && (
                            <Link href={next.href} className="v-btn v-btn--primary">
                                Continue setup
                                <ArrowRight size={15} strokeWidth={1.9} />
                            </Link>
                        )}
                    </>
                }
            />

            <PageStack>
                {/* Health: the four ways the agent fails a customer. */}
                <Group title="Is the agent behaving?" description="Each number opens the place where it is fixed.">
                    <div className="@container">
                        <div className="grid gap-6 @min-[560px]:grid-cols-2 @min-[1000px]:grid-cols-4">
                            <StatLink
                                href="/studio/agent#timing"
                                label="Response time, p95"
                                icon={<Timer size={14} strokeWidth={1.9} />}
                                value={health.p95_ms != null ? latency(health.p95_ms) : '—'}
                                tone={overBudget ? 'warning' : undefined}
                                trend={health.p95_ms != null ? <Badge tone={overBudget ? 'warning' : 'success'}>{overBudget ? 'Over budget' : 'In budget'}</Badge> : undefined}
                                hint={
                                    health.p95_ms == null
                                        ? `No calls to measure in ${window_days} days.`
                                        : overBudget
                                          ? `Budget ${seconds(health.p95_budget_ms)}. Past ~1.5 s callers start saying “hello?”.`
                                          : `Inside the ${seconds(health.p95_budget_ms)} budget across ${plural(health.calls, 'call')}.`
                                }
                            />
                            <StatLink
                                href="/studio/integrations"
                                label="Unconfirmed actions"
                                icon={<ShieldAlert size={14} strokeWidth={1.9} />}
                                value={unconfirmedLabel}
                                tone={unconfirmed > 0 ? 'danger' : undefined}
                                hint={unconfirmed > 0 ? 'Timed out mid-write. Check each before the customer is told either way.' : 'Every write succeeded or provably did not.'}
                            />
                            <StatLink
                                href="/desk/tickets?view=agent"
                                external
                                label="Agent tickets open"
                                icon={<Ticket size={14} strokeWidth={1.9} />}
                                value={health.agent_tickets_open}
                                tone={health.agent_tickets_open > 3 ? 'warning' : undefined}
                                hint={health.agent_tickets_open > 0 ? 'Promises made to callers. A growing pile means follow-up is slipping.' : 'Nothing the agent handed to the team is waiting.'}
                            />
                            <StatLink
                                href="/studio/experts"
                                label="Failed handoffs"
                                icon={<Split size={14} strokeWidth={1.9} />}
                                value={health.failed_delegations}
                                tone={health.failed_delegations > 0 ? 'warning' : undefined}
                                hint={health.failed_delegations > 0 ? `Worker tasks that failed, timed out or were aborted in ${window_days} days.` : 'Every task the talker handed off came back.'}
                            />
                        </div>
                    </div>
                </Group>

                {/* Actions the agent asked to run that need a person's yes. */}
                {approvals.length > 0 && (
                    <Group
                        id="approvals"
                        title="Waiting for approval"
                        description="The agent asked to run these actions, which are set to need approval. Nothing has happened yet. Approve to run one now, exactly as the agent asked, or reject it."
                        aside={health.awaiting_approval > approvals.length ? <Mono>{approvals.length} of {health.awaiting_approval}</Mono> : undefined}
                    >
                        <Card className="border-(--warning-border)">
                            <List>
                                {approvals.map((a) => <ApprovalRow key={a.id} approval={a} />)}
                            </List>
                        </Card>
                    </Group>
                )}

                {/* What a human must check now. */}
                {reconcile.length > 0 ? (
                    <Group
                        title="Needs a human to check"
                        description="These writes timed out, so nobody knows whether they happened. Look each one up in the system it writes to before anyone tells the customer it did or did not."
                        aside={
                            <Link href="/studio/integrations" className="v-btn v-btn--ghost v-btn--sm">
                                Review in Integrations
                                <ArrowRight size={14} strokeWidth={1.9} />
                            </Link>
                        }
                    >
                        <Card className="border-(--danger-border)">
                            <List>
                                {reconcile.map((r) => {
                                    const href = r.conversation_id ? `/desk/inbox/${r.conversation_id}` : undefined;
                                    return (
                                        <ListRow
                                            key={r.id}
                                            href={href}
                                            leading={<IconTile tone="danger"><AlertTriangle size={15} strokeWidth={1.9} /></IconTile>}
                                            title={r.action}
                                            subtitle={`For ${r.contact ?? 'an unknown caller'} · timed out mid-write`}
                                            trailing={
                                                <>
                                                    <RelativeTime at={r.at} />
                                                    {href ? (
                                                        <span className="inline-flex items-center gap-0.5 text-sm font-medium text-accent-text">
                                                            Open in Desk
                                                            <ArrowUpRight size={14} strokeWidth={1.9} />
                                                        </span>
                                                    ) : (
                                                        <Mono>No conversation</Mono>
                                                    )}
                                                </>
                                            }
                                        />
                                    );
                                })}
                            </List>
                        </Card>
                    </Group>
                ) : (
                    <Callout tone="success" icon={<CheckCircle2 size={16} strokeWidth={1.9} />} title="Nothing needs a human">
                        Every durable write in the last {window_days} days either succeeded or provably did not, so nothing is waiting to be checked by hand.
                    </Callout>
                )}

                {/* Setup: only what is left is on the first screen. */}
                <Group
                    title={outstanding === 0 ? 'Setup is complete' : 'Finish setting up'}
                    description={outstanding === 0 ? 'Everything a live call needs is in place.' : `${done} of ${required.length} done. ${next ? `Next: ${next.title.toLowerCase()}.` : ''}`}
                    aside={<Mono>{Math.round((done / required.length) * 100)}%</Mono>}
                >
                    <Card>
                        <div className="px-6 pt-6 pb-5">
                            <Meter value={(done / required.length) * 100} tone={outstanding === 0 ? 'success' : 'accent'} label="Setup progress" />
                        </div>
                        {remaining.length > 0 && (
                            <div style={{ borderTop: '1px solid var(--separator)' }}>
                                <List>
                                    {remaining.map((s) => (
                                        <ListRow
                                            key={s.key}
                                            href={s.href}
                                            onClick={() => router.visit(s.href)}
                                            leading={<span className="size-6 shrink-0 rounded-full" style={{ border: '1.5px dashed var(--border-strong)' }} aria-hidden="true" />}
                                            title={s.title}
                                            subtitle={s.detail}
                                            dim={s.soon}
                                            trailing={s.soon ? <ComingSoon /> : (
                                                <span className="inline-flex items-center gap-0.5 text-sm font-medium text-accent-text">
                                                    Set up
                                                    <ArrowRight size={14} strokeWidth={1.9} />
                                                </span>
                                            )}
                                        />
                                    ))}
                                </List>
                            </div>
                        )}
                        {completed.length > 0 && (
                            <div className="px-6 pt-2 pb-4" style={{ borderTop: '1px solid var(--separator)' }}>
                                <Disclosure inset title={`${completed.length} ${completed.length === 1 ? 'step' : 'steps'} done`} defaultOpen={outstanding === 0}>
                                    <ul className="-mx-3 -mt-2 flex flex-col">
                                        {completed.map((s) => (
                                            <li key={s.key}>
                                                <Link href={s.href} className="flex min-h-13 items-center gap-3.5 rounded-md px-3 py-2 transition-colors hover:bg-surface-hover">
                                                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full" style={{ background: 'var(--success-fill)', color: 'var(--text-inverse)' }}>
                                                        <Check size={14} strokeWidth={2.4} />
                                                    </span>
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block text-base font-medium text-secondary">{s.title}</span>
                                                        <span className="block truncate text-sm text-tertiary">{s.detail}</span>
                                                    </span>
                                                </Link>
                                            </li>
                                        ))}
                                    </ul>
                                </Disclosure>
                            </div>
                        )}
                    </Card>
                </Group>
            </PageStack>
        </>
    );
}

/** One request: what would run, with what, for whom; Approve runs it, Reject records that it never will. */
function ApprovalRow({ approval: a }: { approval: Approval }) {
    const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
    const args = Object.entries(a.arguments);
    const decide = (verb: 'approve' | 'reject') => {
        if (verb === 'approve' && a.writes && !confirm(`Run “${a.action}” now? It changes something outside Veyra.`)) return;
        setBusy(verb);
        router.post(`/studio/approvals/${a.id}/${verb}`, {}, { preserveScroll: true, onFinish: () => setBusy(null) });
    };
    const who = [a.contact ? `For ${a.contact}` : null, a.expert ? `asked by ${a.expert}` : null].filter(Boolean).join(' · ');

    return (
        <div className="flex flex-wrap items-start gap-x-3.5 gap-y-3 px-5 py-4">
            <IconTile tone="warning"><ShieldCheck size={15} strokeWidth={1.9} /></IconTile>
            <div className="min-w-0 flex-1 basis-60">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-medium text-primary">{a.action}</span>
                    {a.writes ? <Badge tone="warning">Writes</Badge> : <Badge>Reads</Badge>}
                    {a.kind && <span className="text-sm text-tertiary">{a.kind}</span>}
                </div>
                <div className="mt-0.5 text-sm text-secondary">
                    {who || 'Requested by the agent'} · <RelativeTime at={a.at} />
                    {a.conversation_id && <> · <a href={`/desk/inbox/${a.conversation_id}`} className="text-accent-text hover:underline">Open in Desk</a></>}
                </div>
                {args.length > 0 && (
                    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
                        {args.slice(0, 6).map(([k, v]) => (
                            <Fragment key={k}>
                                <dt className="font-mono text-xs leading-5 text-tertiary">{k}</dt>
                                <dd className="min-w-0 wrap-break-word text-secondary">{typeof v === 'string' ? v : JSON.stringify(v)}</dd>
                            </Fragment>
                        ))}
                    </dl>
                )}
                {a.missing && <p className="mt-2 text-sm text-danger">This action no longer exists, so it cannot run. Reject the request.</p>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
                <button type="button" className="v-btn v-btn--ghost v-btn--sm" disabled={busy !== null} onClick={() => decide('reject')}>
                    <X size={14} strokeWidth={2} />{busy === 'reject' ? 'Rejecting…' : 'Reject'}
                </button>
                <button type="button" className="v-btn v-btn--primary v-btn--sm" disabled={busy !== null || a.missing} onClick={() => decide('approve')}>
                    <Check size={14} strokeWidth={2} />{busy === 'approve' ? 'Running…' : 'Approve'}
                </button>
            </div>
        </div>
    );
}

/** 780 → "780 ms", 2608.9 → "2.6 s": a latency a person reads at a glance. */
function latency(ms: number) {
    const [value, unit] = ms < 1000 ? [Math.round(ms).toString(), 'ms'] : [(ms / 1000).toFixed(1), 's'];
    return <>{value}<span className="ml-1 text-lg font-medium text-tertiary">{unit}</span></>;
}

function seconds(ms: number): string {
    return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1).replace(/\.0$/, '')} s`;
}
