import { Link } from '@inertiajs/react';
import { AlertTriangle, ArrowUpRight, ChevronDown, MicOff, PhoneIncoming, PhoneMissed, PhoneOutgoing, Volume2 } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';

import { Badge, Eyebrow, Mono, StatusDot, UserText, type Tone } from '../ui/primitives';
import RecordingPlayer, { type RecordingPlayerHandle } from './recording-player';
import { clock, latencyLabel, offsetSeconds, timeLabel } from './helpers';
import type { DelegationView, TimelineCall, TranscriptTurn } from '../../types/desk';

/** Voice-to-voice p95 budget (ARCHITECTURE.md); over it, the figure turns amber. */
const P95_BUDGET_MS = 1800;

const MISSED = new Set(['no-answer', 'busy', 'canceled', 'failed']);

function callState(status: string): { label: string; tone: Tone; live?: boolean } | null {
    if (status === 'in-progress') return { label: 'Live', tone: 'accent', live: true };
    if (status === 'ringing') return { label: 'Ringing', tone: 'info', live: true };
    if (status === 'failed') return { label: 'Failed', tone: 'danger' };
    if (MISSED.has(status)) return { label: 'Missed', tone: 'warning' };
    return null;
}

/**
 * A call in the thread: which way, how long, when, what came of it and how
 * fast the agent answered. Open, it plays the recording, reads the
 * transcript as a conversation (a line with a time seeks the recording),
 * and lists what the agent did.
 */
export default function CallCard({ call, callerName }: { call: TimelineCall; callerName: string }) {
    const [open, setOpen] = useState(false);
    const [now, setNow] = useState(0);
    const player = useRef<RecordingPlayerHandle>(null);

    const trouble = call.work.some((d) => d.failed || d.tool_calls.some((t) => t.needs_reconciliation));
    const inbound = call.direction === 'inbound';
    const state = callState(call.status);
    const missed = state?.label === 'Missed';
    const Icon = missed ? PhoneMissed : inbound ? PhoneIncoming : PhoneOutgoing;
    const turns = call.transcript ?? [];
    const hasDetail = !!call.recording_url || turns.length > 0 || call.work.length > 0;
    const slow = call.p95_ms != null && call.p95_ms > P95_BUDGET_MS;

    return (
        <article className="animate-fade-in overflow-hidden rounded-lg"
            style={{ background: 'var(--surface)', border: `1px solid ${trouble ? 'var(--danger-border)' : 'var(--border)'}`, boxShadow: 'var(--shadow-card)' }}
            aria-label={`${inbound ? 'Incoming' : 'Outgoing'} call at ${timeLabel(call.at)}`}>
            <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
                className="flex w-full items-start gap-3.5 px-4 pt-3.5 pb-3 text-left transition-colors hover:bg-surface-hover">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md"
                    style={{ background: trouble ? 'var(--danger-subtle)' : 'var(--surface-sunken)', border: `1px solid ${trouble ? 'var(--danger-border)' : 'var(--border)'}`, color: trouble ? 'var(--danger)' : missed ? 'var(--warning)' : 'var(--text-secondary)' }}>
                    <Icon size={15} strokeWidth={1.9} />
                </span>

                <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-primary">{inbound ? 'Incoming call' : 'Outgoing call'}</span>
                        {state && <Badge tone={state.tone}>{state.live && <StatusDot tone={state.tone} live />}{state.label}</Badge>}
                        {trouble && <Badge tone="danger"><AlertTriangle size={11} strokeWidth={2.4} aria-hidden="true" />Needs review</Badge>}
                        {call.language && call.language !== 'en' && <Badge tone="info">{call.language.toUpperCase()}</Badge>}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-tertiary tabular-nums">
                        <span>{timeLabel(call.at)}</span>
                        <Dot />
                        <span>{call.duration && call.duration !== '—' ? call.duration : 'No duration'}</span>
                        {call.p95_ms != null && (
                            <>
                                <Dot />
                                <span title="Voice-to-voice latency, 95th percentile: caller stops speaking to the agent's first audio" style={{ color: slow ? 'var(--warning)' : undefined }}>
                                    p95 {latencyLabel(call.p95_ms)}
                                </span>
                            </>
                        )}
                        {turns.length > 0 && <><Dot /><span>{turns.length} {turns.length === 1 ? 'turn' : 'turns'}</span></>}
                        {call.recording_url && <><Dot /><span className="inline-flex items-center gap-1"><Volume2 size={12} strokeWidth={2} aria-hidden="true" />Recording</span></>}
                    </span>
                    {call.summary && (
                        <UserText className={`mt-2 block text-sm leading-relaxed text-secondary ${open ? '' : 'line-clamp-2'}`}>{call.summary}</UserText>
                    )}
                </span>

                <ChevronDown size={16} strokeWidth={2} aria-hidden="true" className="mt-1.5 shrink-0 text-tertiary transition-transform" style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
            </button>

            {open && (
                <div className="animate-fade-in" style={{ borderTop: '1px solid var(--separator)' }}>
                    <Section label="Recording">
                        {call.recording_url
                            ? <RecordingPlayer ref={player} src={call.recording_url} onTime={setNow} label={`Recording of the call at ${timeLabel(call.at)}`} />
                            : <p className="flex items-center gap-2 text-sm text-tertiary"><MicOff size={14} strokeWidth={1.9} aria-hidden="true" />No recording was kept for this call.</p>}
                    </Section>

                    {turns.length > 0 && (
                        <Section label="Transcript" aside={<Mono>{turns.length} turns</Mono>}>
                            <Transcript turns={turns} start={call.at} callerName={callerName} now={now}
                                onSeek={call.recording_url ? (s) => player.current?.seek(s) : undefined} />
                        </Section>
                    )}

                    {call.work.length > 0 && (
                        <Section label="What the agent did">
                            <div className="flex flex-col gap-3">{call.work.map((d) => <Delegation key={d.sequence} delegation={d} />)}</div>
                        </Section>
                    )}

                    {!hasDetail && <p className="px-4 pb-3 text-sm text-tertiary">No transcript was kept either.</p>}

                    <div className="flex items-center justify-end px-4 py-2.5" style={{ borderTop: '1px solid var(--separator)' }}>
                        <Link href={`/desk/calls/${call.id}`} className="inline-flex items-center gap-1 rounded-sm text-xs font-medium text-secondary transition-colors hover:text-primary">
                            Open call details <ArrowUpRight size={13} strokeWidth={2} aria-hidden="true" />
                        </Link>
                    </div>
                </div>
            )}
        </article>
    );
}

function Dot() {
    return <span aria-hidden="true">·</span>;
}

function Section({ label, aside, children }: { label: string; aside?: ReactNode; children: ReactNode }) {
    return (
        <section className="px-4 pt-3.5 pb-4 [&+&]:border-t [&+&]:border-separator">
            <div className="mb-2.5 flex items-center justify-between"><Eyebrow>{label}</Eyebrow>{aside}</div>
            {children}
        </section>
    );
}

/**
 * The call as a conversation: the speaker once per run of turns, the words,
 * and the time into the call when it is known. With a recording, a timed
 * line is a button that plays from there, and the line being played is lit.
 */
function Transcript({ turns, start, callerName, now, onSeek }: {
    turns: TranscriptTurn[]; start: string; callerName: string; now: number; onSeek?: (seconds: number) => void;
}) {
    const offsets = turns.map((t) => offsetSeconds(t.at, start));
    const activeIndex = onSeek && now > 0 ? offsets.reduce<number>((hit, o, i) => (o != null && o <= now ? i : hit), -1) : -1;

    return (
        <ol className="-mx-2 flex max-h-[420px] flex-col overflow-y-auto">
            {turns.map((turn, i) => {
                const offset = offsets[i];
                const system = turn.role !== 'agent' && turn.role !== 'caller';
                const startsRun = i === 0 || turns[i - 1].role !== turn.role;

                if (system) {
                    return <li key={i} className="my-1.5 px-2 text-center text-xs text-tertiary italic"><UserText>{turn.text}</UserText></li>;
                }

                const agent = turn.role === 'agent';
                const seekable = onSeek && offset != null;
                const body = (
                    <>
                        <span className="w-16 shrink-0 pt-px text-xs font-semibold" style={{ color: agent ? 'var(--voice-agent)' : 'var(--voice-caller)' }}>
                            {startsRun ? (agent ? 'Agent' : <span className="block truncate">{callerName}</span>) : ''}
                        </span>
                        <span className="min-w-0 flex-1 text-sm leading-relaxed text-primary" dir="auto" lang={turn.lang}><UserText>{turn.text}</UserText></span>
                        {offset != null && <span className="shrink-0 pt-px text-2xs text-tertiary tabular-nums">{clock(offset)}</span>}
                    </>
                );

                return (
                    <li key={i} className={startsRun && i > 0 ? 'mt-2' : ''}>
                        {seekable ? (
                            <button type="button" onClick={() => onSeek(offset)} title={`Play from ${clock(offset)}`}
                                className="flex w-full items-start gap-3 rounded-sm px-2 py-1 text-left transition-colors hover:bg-surface-hover"
                                style={{ background: activeIndex === i ? 'var(--accent-subtle)' : undefined }} aria-current={activeIndex === i ? 'true' : undefined}>
                                {body}
                            </button>
                        ) : (
                            <div className="flex items-start gap-3 px-2 py-1">{body}</div>
                        )}
                    </li>
                );
            })}
        </ol>
    );
}

function Delegation({ delegation }: { delegation: DelegationView }) {
    return (
        <div className="rounded-md px-3 py-2.5" style={{ background: 'var(--surface-sunken)', border: `1px solid ${delegation.failed ? 'var(--danger-border)' : 'var(--border)'}` }}>
            <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-secondary">{delegation.is_finalization ? 'After the call' : `Handoff ${delegation.sequence}`}</span>
                {delegation.failed && <Badge tone="danger">{delegation.status}</Badge>}
                <span className="flex-1" />
                {delegation.duration_ms != null && <Mono>{(delegation.duration_ms / 1000).toFixed(1)} s</Mono>}
            </div>
            {delegation.reply && <p className="mt-1 text-sm text-secondary" dir="auto">{delegation.reply}</p>}
            {delegation.error && <p className="mt-1 text-sm text-danger">{delegation.error}</p>}
            {delegation.tool_calls.length > 0 && (
                <div className="mt-2 flex flex-col gap-1.5">
                    {delegation.tool_calls.map((t) => (
                        <div key={t.id} className="flex flex-wrap items-center gap-2 text-sm">
                            <Badge tone={t.tone} dot>{t.status_label}</Badge>
                            <span className="text-primary">{t.action}</span>
                            {t.durable && <Mono>writes</Mono>}
                            {t.duration_ms != null && <Mono>{t.duration_ms} ms</Mono>}
                            {t.needs_reconciliation && <span className="w-full text-xs text-danger">May or may not have completed. Check before telling the customer.</span>}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
