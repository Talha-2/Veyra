import { Head, Link, router } from '@inertiajs/react';
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Bot, Check, ChevronDown, ChevronRight, CircleDot, Flag, Gauge, MessagesSquare, Ticket, Timer, Wrench, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { clockTime, longDate, ms, relative } from '../../components/desk-pages/format';
import { Callout, Card, CardBody, CardHeader, CopyButton, IconTile, KeyValues, List, ListRow, StatTile } from '../../components/ui/kit';
import { PageHeader } from '../../components/ui/page';
import { Avatar, Badge, EmptyState, Eyebrow, Mono, toneColor, UserText, type Tone } from '../../components/ui/primitives';

interface ToolCall {
    id: number; action: string; kind: string; status: string; status_label: string; tone: Tone;
    arguments: Record<string, unknown> | null; result: unknown; error: string | null; attempt: number;
    duration_ms: number | null; durable: boolean; needs_reconciliation: boolean; at: string | null;
}
interface Delegation {
    id: number; sequence: number; transcript_delta: string; reply: string | null; status: string; failed: boolean; durable: boolean;
    is_finalization: boolean; duration_ms: number | null; error: string | null; started_at: string | null; tool_calls: ToolCall[];
}
interface Props {
    call: {
        id: number; at: string; direction: string; from: string | null; to: string | null; line: string | null; status: string; live: boolean;
        duration: string; language: string | null; language_label: string; recording_url: string | null; transferred_to: string | null; error: string | null;
        conversation_id: number | null; contact: { id: number; name: string; initials: string } | null; summary: string | null;
        metrics: Record<string, unknown>; transcript: { role: string; text: string; at?: string; lang?: string }[];
        delegations: Delegation[]; loose_tool_calls: ToolCall[]; tickets: { id: number; reference: string; subject: string; status: string }[];
    };
}

/** Voice-to-voice budget, ARCHITECTURE.md: caller stops speaking → agent's first audio. */
const BUDGET = { p50: 1200, p95: 1800 };

const humanAction = (slug: string) => slug.replace(/_/g, ' ');

/**
 * One call: what was said, and what the agent actually did about it.
 *
 * The page answers "the agent said it was booked; was it?" — and the answer is
 * the tool call under the handoff, not the sentence in the transcript. So the
 * handoffs come first, as a timeline, and anything that needs a person to
 * check sits above everything else.
 */
export default function CallDetail({ call }: Props) {
    const v2v = call.metrics.voice_to_voice as { p50?: number; p95?: number; turns?: number } | undefined;
    const review = [...call.loose_tool_calls, ...call.delegations.flatMap((d) => d.tool_calls)].filter((t) => t.needs_reconciliation);
    const title = call.contact ? call.contact.name : call.from ?? 'Unknown caller';
    const statusTone: Tone = call.live ? 'accent' : call.status === 'completed' ? 'success' : call.status === 'failed' ? 'danger' : 'muted';
    const toolCount = call.loose_tool_calls.length + call.delegations.reduce((a, d) => a + d.tool_calls.length, 0);

    return (
        <>
            <Head title={`Call · ${title}`} />
            <div className="mx-auto max-w-[1320px] px-6 py-7 md:px-8">
                <PageHeader
                    back={{ href: '/desk/calls', label: 'Calls' }}
                    eyebrow={`${call.direction === 'inbound' ? 'Inbound' : 'Outbound'} call${call.line ? ` · ${call.line}` : ''} · ${call.language_label}`}
                    title={<UserText>{title}</UserText>}
                    description={<>{longDate(call.at)} at {clockTime(call.at)} · <span className="tabular-nums">{call.duration}</span></>}
                    meta={
                        <>
                            <Badge tone={statusTone} dot>{call.live ? 'Live' : call.status}</Badge>
                            {review.length > 0 && <Badge tone="danger" dot>Needs review</Badge>}
                            {call.transferred_to && <Badge tone="info">Transferred to {call.transferred_to}</Badge>}
                            <Badge tone="muted">{call.delegations.length} handoff{call.delegations.length === 1 ? '' : 's'} · {toolCount} tool{toolCount === 1 ? '' : 's'}</Badge>
                        </>
                    }
                    actions={
                        <>
                            {call.contact && <Link href={`/desk/contacts/${call.contact.id}`} className="v-btn v-btn--quiet">Contact</Link>}
                            {call.conversation_id && <Link href={`/desk/inbox/${call.conversation_id}`} className="v-btn v-btn--quiet"><MessagesSquare size={14} strokeWidth={1.8} />Open conversation</Link>}
                        </>
                    }
                />

                {review.length > 0 && (
                    <div className="mb-6">
                        <Callout tone="danger" icon={<AlertTriangle size={16} strokeWidth={2} />} title="Needs review before anyone calls back">
                            <span className="font-medium text-primary">{review.map((t) => humanAction(t.action)).join(', ')}</span> timed out on this call. The action is not safe to repeat blindly and may or may not have happened; check the other system before telling the customer either way.
                        </Callout>
                    </div>
                )}

                <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
                    <div className="flex min-w-0 flex-col gap-6">
                        {call.summary && (
                            <Card>
                                <CardBody>
                                    <Eyebrow className="mb-2 block">What happened</Eyebrow>
                                    <p className="text-md text-primary" dir="auto"><UserText>{call.summary}</UserText></p>
                                </CardBody>
                            </Card>
                        )}

                        <Card>
                            <CardHeader title="Handoffs" description="What the front desk sent the worker, what came back, and the tools that ran in between."
                                actions={<Badge tone="muted">{call.delegations.length}</Badge>} />
                            {call.delegations.length === 0 ? (
                                <p className="px-5 py-6 text-sm text-tertiary">{call.live ? 'Nothing handed off yet.' : 'The agent handled this call without handing anything off: informational only.'}</p>
                            ) : (
                                <ol className="px-5 pt-5 pb-3">
                                    {call.delegations.map((d, i) => <DelegationNode key={d.id} d={d} last={i === call.delegations.length - 1} />)}
                                </ol>
                            )}
                            {call.loose_tool_calls.length > 0 && (
                                <div className="px-5 py-4" style={{ borderTop: '1px solid var(--separator)' }}>
                                    <Eyebrow className="mb-2.5 block">Outside any handoff</Eyebrow>
                                    <ToolCallList calls={call.loose_tool_calls} />
                                </div>
                            )}
                        </Card>

                        <Card>
                            <CardHeader title="Transcript" description={call.transcript.length ? `${call.transcript.length} turns, in the language they were spoken.` : undefined}
                                actions={call.live ? <Badge tone="accent" dot>Live</Badge> : undefined} />
                            {call.transcript.length === 0
                                ? <EmptyState icon={<MessagesSquare size={20} strokeWidth={1.8} />} title="No transcript yet">{call.live ? 'Turns appear once the call ends.' : 'This call was not transcribed.'}</EmptyState>
                                : <Transcript turns={call.transcript} callerName={title} contact={call.contact} />}
                        </Card>
                    </div>

                    {/* Inspector */}
                    <aside className="flex flex-col gap-4 lg:sticky lg:top-6">
                        <Card>
                            <CardHeader title="Call" icon={call.direction === 'inbound' ? <ArrowDownLeft size={16} strokeWidth={1.8} /> : <ArrowUpRight size={16} strokeWidth={1.8} />} />
                            <CardBody>
                                <KeyValues items={[
                                    { label: 'When', value: <time dateTime={call.at} title={new Date(call.at).toLocaleString()}>{relative(call.at)}</time> },
                                    { label: 'Length', value: <span className="tabular-nums">{call.duration}</span> },
                                    { label: 'From', value: call.from ? <CopyValue value={call.from} /> : '—' },
                                    { label: 'To', value: call.to ? <CopyValue value={call.to} /> : '—' },
                                    ...(call.line ? [{ label: 'Line', value: call.line }] : []),
                                    { label: 'Language', value: call.language_label },
                                    ...(call.transferred_to ? [{ label: 'Transferred', value: call.transferred_to }] : []),
                                    ...(call.error ? [{ label: 'Error', value: <span className="text-danger">{call.error}</span> }] : []),
                                ]} />
                                {call.recording_url && (
                                    <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--separator)' }}>
                                        <Eyebrow className="mb-2 block">Recording</Eyebrow>
                                        <audio controls preload="none" src={call.recording_url} className="w-full" />
                                    </div>
                                )}
                            </CardBody>
                        </Card>

                        {call.contact && (
                            <Card>
                                <List>
                                    <ListRow href={`/desk/contacts/${call.contact.id}`} onClick={() => router.visit(`/desk/contacts/${call.contact!.id}`)}
                                        leading={<Avatar name={call.contact.name} initials={call.contact.initials} size={36} />}
                                        title={<UserText>{call.contact.name}</UserText>}
                                        subtitle="Known customer · open profile"
                                        trailing={<ChevronRight size={15} strokeWidth={2} className="text-tertiary" />} />
                                </List>
                            </Card>
                        )}

                        <div>
                            <div className="mb-2 flex items-center justify-between px-1">
                                <Eyebrow>Latency</Eyebrow>
                                <span className="text-xs text-tertiary">voice to voice</span>
                            </div>
                            {v2v?.p50 ? (
                                <div className="grid grid-cols-2 gap-3">
                                    <StatTile label="p50" icon={<Gauge size={14} strokeWidth={1.8} />} value={ms(v2v.p50)} tone={v2v.p50 > BUDGET.p50 ? 'warning' : undefined} hint={`Budget ${ms(BUDGET.p50)}`} />
                                    <StatTile label="p95" icon={<Timer size={14} strokeWidth={1.8} />} value={ms(v2v.p95)} tone={v2v.p95 && v2v.p95 > BUDGET.p95 ? 'warning' : undefined} hint={`Budget ${ms(BUDGET.p95)}`} />
                                </div>
                            ) : (
                                <Card padded><p className="text-sm text-tertiary">No latency figures on this call.</p></Card>
                            )}
                            <p className="mt-2 px-1 text-xs text-tertiary">
                                From the caller going quiet to the agent's first audio{v2v?.turns ? `, over ${v2v.turns} turns` : ''}.
                            </p>
                        </div>

                        <Card>
                            <CardHeader title="Tickets from this call" actions={call.tickets.length ? <Badge tone="muted">{call.tickets.length}</Badge> : undefined} />
                            {call.tickets.length === 0 ? (
                                <p className="px-5 py-4 text-sm text-tertiary">None raised. If the agent promised a follow-up, there should be one here.</p>
                            ) : (
                                <List>
                                    {call.tickets.map((t) => (
                                        <ListRow key={t.id} href={`/desk/tickets/${t.id}`} onClick={() => router.visit(`/desk/tickets/${t.id}`)}
                                            leading={<IconTile size={30}><Ticket size={14} strokeWidth={1.8} /></IconTile>}
                                            title={<UserText>{t.subject}</UserText>}
                                            subtitle={<Mono>{t.reference}</Mono>}
                                            trailing={<Badge tone="muted">{t.status.replace(/_/g, ' ')}</Badge>} />
                                    ))}
                                </List>
                            )}
                        </Card>
                    </aside>
                </div>
            </div>
        </>
    );
}

function CopyValue({ value }: { value: string }) {
    return (
        <span className="group flex items-center justify-between gap-2">
            <span className="truncate tabular-nums">{value}</span>
            <span className="opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"><CopyButton value={value} /></span>
        </span>
    );
}

// ── transcript ────────────────────────────────────────────────────────────

function turnTime(at?: string) {
    if (!at) return null;
    return Number.isNaN(Date.parse(at)) ? null : clockTime(at);
}

function Transcript({ turns, callerName, contact }: { turns: Props['call']['transcript']; callerName: string; contact: Props['call']['contact'] }) {
    return (
        <div className="flex flex-col px-5 py-5">
            {turns.map((turn, i) => {
                const prev = turns[i - 1];
                const startsGroup = !prev || prev.role !== turn.role;
                const time = turnTime(turn.at);

                if (turn.role !== 'agent' && turn.role !== 'caller') {
                    return (
                        <div key={i} className="my-3 flex justify-center">
                            <span className="rounded-full px-3 py-1 text-xs text-tertiary" style={{ background: 'var(--surface-sunken)' }} dir="auto"><UserText>{turn.text}</UserText></span>
                        </div>
                    );
                }

                const caller = turn.role === 'caller';

                return (
                    <div key={i} className={`flex items-end gap-2.5 ${caller ? 'flex-row-reverse' : ''} ${startsGroup ? 'mt-4 first:mt-0' : 'mt-1'}`}>
                        <span className="w-7 shrink-0">
                            {startsGroup && (caller
                                ? <Avatar name={contact?.name ?? callerName} initials={contact?.initials ?? '?'} size={28} />
                                : <IconTile tone="info" size={28}><Bot size={14} strokeWidth={1.8} /></IconTile>)}
                        </span>
                        <div className={`flex max-w-[76%] flex-col ${caller ? 'items-end' : 'items-start'}`}>
                            {startsGroup && (
                                <span className="mb-1 flex items-center gap-1.5 px-1 text-xs text-tertiary">
                                    <span className="font-medium text-secondary">{caller ? callerName : 'Agent'}</span>
                                    {time && <span className="tabular-nums">{time}</span>}
                                </span>
                            )}
                            <div className="px-3.5 py-2 text-base text-primary" dir="auto" lang={turn.lang}
                                style={{
                                    background: caller ? 'color-mix(in srgb, var(--voice-caller) 13%, var(--surface))' : 'var(--surface-sunken)',
                                    borderRadius: 'var(--radius-xl)',
                                    borderBottomRightRadius: caller ? 'var(--radius-xs)' : 'var(--radius-xl)',
                                    borderBottomLeftRadius: caller ? 'var(--radius-xl)' : 'var(--radius-xs)',
                                }}>
                                <UserText>{turn.text}</UserText>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// ── handoffs ──────────────────────────────────────────────────────────────

function delegationState(d: Delegation): { tone: Tone; icon: ReactNode; label: string } {
    if (d.tool_calls.some((t) => t.needs_reconciliation)) return { tone: 'danger', icon: <AlertTriangle size={14} strokeWidth={2} />, label: 'Needs review' };
    if (d.failed) return { tone: 'danger', icon: <X size={14} strokeWidth={2} />, label: d.status === 'completed' ? 'Empty reply' : d.status };
    if (d.is_finalization) return { tone: 'info', icon: <Flag size={14} strokeWidth={2} />, label: 'Replied' };
    return { tone: 'success', icon: <Check size={14} strokeWidth={2} />, label: 'Replied' };
}

function DelegationNode({ d, last }: { d: Delegation; last: boolean }) {
    const [open, setOpen] = useState(d.failed || d.tool_calls.some((t) => t.needs_reconciliation));
    const state = delegationState(d);

    return (
        <li className="relative flex gap-4 pb-5 last:pb-2">
            {!last && <span className="absolute top-9 bottom-0 left-[15px] w-px" style={{ background: 'var(--separator)' }} aria-hidden="true" />}
            <IconTile tone={state.tone} size={32}>{state.icon}</IconTile>

            <div className="min-w-0 flex-1">
                <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="group -mx-2 flex w-[calc(100%+1rem)] items-start gap-3 rounded-md px-2 py-1 text-left transition-colors hover:bg-surface-hover">
                    <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1.5">
                            <span className="text-base font-semibold text-primary">Handoff {d.sequence}</span>
                            <Badge tone={state.tone}>{state.label}</Badge>
                            {d.is_finalization && <Badge tone="info">After the call</Badge>}
                            {d.durable && <Badge tone="success" dot>Durable write confirmed</Badge>}
                        </span>
                        {!open && (
                            <span className="mt-1 line-clamp-2 block text-sm text-secondary" dir="auto">{d.reply ?? d.error ?? 'Nothing came back.'}</span>
                        )}
                    </span>
                    <span className="flex shrink-0 items-center gap-3 pt-0.5 text-xs text-tertiary tabular-nums">
                        <span className="inline-flex items-center gap-1"><Wrench size={12} strokeWidth={1.8} />{d.tool_calls.length}</span>
                        {d.duration_ms != null && <span>{ms(d.duration_ms)}</span>}
                        {d.started_at && <span className="hidden sm:inline">{clockTime(d.started_at)}</span>}
                        <ChevronDown size={14} strokeWidth={2} className="transition-transform" style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
                    </span>
                </button>

                {open && (
                    <div className="mt-3 flex flex-col gap-3">
                        <div className="grid gap-3 md:grid-cols-2">
                            <Well label="Sent to the worker">
                                <pre className="v-code whitespace-pre-wrap text-secondary" dir="auto">{d.transcript_delta}</pre>
                            </Well>
                            <Well label="Came back · private guidance, not spoken" tone={d.failed ? 'danger' : undefined}>
                                <p className="text-sm whitespace-pre-wrap" dir="auto" style={{ color: d.failed ? 'var(--danger)' : 'var(--text-primary)' }}>{d.reply ?? d.error ?? 'Nothing came back.'}</p>
                            </Well>
                        </div>
                        {d.tool_calls.length > 0 && (
                            <div>
                                <Eyebrow className="mb-2 block">Tools</Eyebrow>
                                <ToolCallList calls={d.tool_calls} />
                            </div>
                        )}
                    </div>
                )}
            </div>
        </li>
    );
}

function Well({ label, children, tone }: { label: string; children: ReactNode; tone?: 'danger' }) {
    return (
        <div className="min-w-0 rounded-md p-3" style={{ background: 'var(--surface-sunken)', border: `1px solid ${tone === 'danger' ? 'var(--danger-border)' : 'var(--border)'}` }}>
            <div className="mb-1.5 text-xs font-medium text-tertiary">{label}</div>
            {children}
        </div>
    );
}

function ToolCallList({ calls }: { calls: ToolCall[] }) {
    return (
        <div className="overflow-hidden rounded-md" style={{ border: '1px solid var(--border)' }}>
            {calls.map((t, i) => <ToolCallRow key={t.id} t={t} first={i === 0} />)}
        </div>
    );
}

function ToolCallRow({ t, first }: { t: ToolCall; first: boolean }) {
    const [open, setOpen] = useState(t.needs_reconciliation);

    return (
        <div style={{ borderTop: first ? undefined : '1px solid var(--separator)', background: t.needs_reconciliation ? 'color-mix(in srgb, var(--danger) 5%, var(--surface))' : 'var(--surface)' }}>
            <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-surface-hover">
                {t.needs_reconciliation
                    ? <AlertTriangle size={14} strokeWidth={2} className="shrink-0 text-danger" />
                    : <CircleDot size={14} strokeWidth={2} className="shrink-0" style={{ color: toneColor(t.tone) }} />}
                <span className="min-w-0 truncate text-sm font-medium text-primary">{humanAction(t.action)}</span>
                <Mono>{t.kind}</Mono>
                {t.durable && <Badge tone="info">Writes</Badge>}
                <span className="flex-1" />
                {t.attempt > 1 && <Mono>attempt {t.attempt}</Mono>}
                {t.duration_ms != null && <Mono>{ms(t.duration_ms)}</Mono>}
                <Badge tone={t.tone}>{t.status_label}</Badge>
                <ChevronDown size={13} strokeWidth={2} className="shrink-0 text-tertiary transition-transform" style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
            </button>
            {open && (
                <div className="grid gap-2.5 px-3 pb-3 md:grid-cols-2">
                    <Well label="Arguments"><pre className="v-code whitespace-pre-wrap text-secondary">{JSON.stringify(t.arguments ?? {}, null, 2)}</pre></Well>
                    <Well label={t.error ? 'Error' : 'Result'} tone={t.error ? 'danger' : undefined}>
                        <pre className="v-code whitespace-pre-wrap" style={{ color: t.error ? 'var(--danger)' : 'var(--text-secondary)' }}>{t.error ?? JSON.stringify(t.result ?? null, null, 2)}</pre>
                    </Well>
                    {t.needs_reconciliation && (
                        <p className="text-sm text-danger md:col-span-2">Timed out on a non-repeatable action: unknown whether it took effect. Reconcile in the other system before repeating.</p>
                    )}
                </div>
            )}
        </div>
    );
}
