import { Head, Link, router, usePage } from '@inertiajs/react';
import {
    AlertTriangle,
    ArrowRight,
    ArrowUpRight,
    AudioLines,
    Blocks,
    BookOpenText,
    Bot,
    Check,
    CheckCircle2,
    FlaskConical,
    Library,
    Phone,
    ShieldAlert,
    Sparkles,
    Split,
    Ticket,
    Timer,
    UserRound,
    type LucideIcon,
} from 'lucide-react';

import { languageLabel, sayList } from '../../components/studio-agent/languages';
import { StatLink } from '../../components/studio-agent/stat-link';
import { Callout, Card, CardFooter, CardHeader, IconTile, List, ListRow, Meter } from '../../components/ui/kit';
import { PageHeader } from '../../components/ui/page';
import { Badge, Eyebrow, Mono, RelativeTime } from '../../components/ui/primitives';
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
    };
    reconcile: { id: number; action: string; contact: string | null; conversation_id: number | null; at: string }[];
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
export default function Overview({ window_days, agent_name, health, reconcile, setup }: Props) {
    const { auth } = usePage<SharedProps>().props;
    const firstName = auth.user?.name.split(' ')[0];
    const agent = agent_name || 'The agent';

    const overBudget = health.p95_ms != null && health.p95_ms > health.p95_budget_ms;
    const unconfirmed = health.needs_reconciliation;
    const unconfirmedLabel = `${unconfirmed}${unconfirmed >= RECONCILE_LIMIT ? '+' : ''}`;
    const attention = (unconfirmed > 0 ? 1 : 0) + (overBudget ? 1 : 0) + (health.agent_tickets_open > 3 ? 1 : 0) + (health.failed_delegations > 0 ? 1 : 0);

    const steps: { key: string; done: boolean; title: string; detail: string; href: string }[] = [
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
    const done = steps.filter((s) => s.done).length;
    const next = steps.find((s) => !s.done);

    const areas: { href: string; label: string; detail: string; meta?: string; icon: LucideIcon }[] = [
        { href: '/studio/agent', label: 'Identity', detail: 'Name, greeting, languages and models', icon: UserRound },
        { href: '/studio/voice', label: 'Voice', detail: 'What callers hear, and how fast', icon: AudioLines },
        { href: '/studio/experts', label: 'Experts', detail: 'Who talks, who acts', meta: `${setup.experts} enabled`, icon: Bot },
        { href: '/studio/skills', label: 'Skills', detail: 'Procedures the worker follows', meta: `${setup.skills} enabled`, icon: BookOpenText },
        { href: '/studio/knowledge', label: 'Knowledge', detail: 'Documents it looks up mid-call', icon: Library },
        { href: '/studio/integrations', label: 'Integrations', detail: 'Tools and actions it can take', icon: Blocks },
        { href: '/studio/telephony', label: 'Telephony', detail: 'Numbers and call routing', meta: `${setup.numbers} active`, icon: Phone },
        { href: '/studio/evals', label: 'Evaluations', detail: 'Test calls before customers do', icon: FlaskConical },
    ];

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

            {/* Health: the four ways the agent fails a customer. */}
            <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatLink
                    href="/studio/agent#timing"
                    label="Response time, p95"
                    icon={<Timer size={14} strokeWidth={1.9} />}
                    value={health.p95_ms != null ? <>{health.p95_ms}<span className="ml-0.5 text-lg font-medium text-tertiary">ms</span></> : '—'}
                    tone={overBudget ? 'warning' : undefined}
                    trend={health.p95_ms != null ? <Badge tone={overBudget ? 'warning' : 'success'}>{overBudget ? 'Over budget' : 'In budget'}</Badge> : undefined}
                    hint={
                        health.p95_ms == null
                            ? `No calls to measure in ${window_days} days.`
                            : overBudget
                              ? `Budget ${health.p95_budget_ms}ms. Past ~1.5s callers start saying “hello?”.`
                              : `Inside the ${health.p95_budget_ms}ms budget across ${plural(health.calls, 'call')}.`
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

            {/* What a human must check now. */}
            <div className="mb-8">
                {reconcile.length > 0 ? (
                    <Card className="border-(--danger-border)">
                        <CardHeader
                            title="Needs a human to check"
                            description="These writes timed out, so nobody knows whether they happened. Look each one up in the system it writes to before anyone tells the customer it did or did not."
                            actions={<Badge tone="danger" dot>{plural(reconcile.length, 'action')}</Badge>}
                        />
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
                        <CardFooter>
                            <Link href="/studio/integrations" className="v-btn v-btn--ghost v-btn--sm">
                                Review actions in Integrations
                                <ArrowRight size={14} strokeWidth={1.9} />
                            </Link>
                        </CardFooter>
                    </Card>
                ) : (
                    <Callout tone="success" icon={<CheckCircle2 size={16} strokeWidth={1.9} />} title="Nothing needs a human">
                        Every durable write in the last {window_days} days either succeeded or provably did not, so nothing is waiting to be checked by hand.
                    </Callout>
                )}
            </div>

            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
                {/* Setup checklist. */}
                <Card>
                    <CardHeader
                        title="Setup"
                        description={done === steps.length ? 'Everything a live call needs is in place.' : `${done} of ${steps.length} done. ${next ? `Next: ${next.title.toLowerCase()}.` : ''}`}
                        actions={<Mono>{Math.round((done / steps.length) * 100)}%</Mono>}
                        border={false}
                    />
                    <div className="px-5 pb-4">
                        <Meter value={(done / steps.length) * 100} tone={done === steps.length ? 'success' : 'accent'} label="Setup progress" />
                    </div>
                    <div style={{ borderTop: '1px solid var(--separator)' }}>
                        <List>
                            {steps.map((s) => (
                                <ListRow
                                    key={s.key}
                                    href={s.href}
                                    onClick={() => router.visit(s.href)}
                                    leading={
                                        s.done ? (
                                            <span className="flex size-6 shrink-0 items-center justify-center rounded-full" style={{ background: 'var(--success-fill)', color: 'var(--text-inverse)' }}>
                                                <Check size={14} strokeWidth={2.4} />
                                            </span>
                                        ) : (
                                            <span className="size-6 shrink-0 rounded-full" style={{ border: '1.5px dashed var(--border-strong)' }} aria-hidden="true" />
                                        )
                                    }
                                    title={<span className={s.done ? 'text-secondary' : undefined}>{s.title}</span>}
                                    subtitle={s.detail}
                                    trailing={
                                        s.done ? <span className="sr-only">Done</span> : (
                                            <span className="inline-flex items-center gap-0.5 text-sm font-medium text-accent-text">
                                                Set up
                                                <ArrowRight size={14} strokeWidth={1.9} />
                                            </span>
                                        )
                                    }
                                />
                            ))}
                        </List>
                    </div>
                </Card>

                {/* The way into every area. */}
                <section>
                    <Eyebrow className="mb-3 block">Build and tune</Eyebrow>
                    <div className="grid gap-3 sm:grid-cols-2">
                        {areas.map((a) => (
                            <Link key={a.href} href={a.href} className="v-panel v-card-hover group flex items-start gap-3.5 p-4">
                                <IconTile>
                                    <a.icon size={16} strokeWidth={1.8} />
                                </IconTile>
                                <span className="min-w-0 flex-1">
                                    <span className="flex items-center gap-2">
                                        <span className="text-base font-semibold text-primary">{a.label}</span>
                                        {a.meta && <Mono>{a.meta}</Mono>}
                                    </span>
                                    <span className="mt-0.5 block text-sm text-secondary">{a.detail}</span>
                                </span>
                                <ArrowRight size={15} strokeWidth={1.9} className="mt-1 shrink-0 text-tertiary opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100" />
                            </Link>
                        ))}
                    </div>
                </section>
            </div>
        </>
    );
}
