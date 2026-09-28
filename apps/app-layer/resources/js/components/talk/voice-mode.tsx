import { Link } from '@inertiajs/react';
import { AlertCircle, Captions, CaptionsOff, Check, ChevronLeft, Loader2, Mic, MicOff, PhoneOff, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { useVoiceSession, type AgentState, type Caption } from './use-voice-session';
import VoiceOrb from './voice-orb';

const STATE_LABEL: Record<AgentState, string> = {
    idle: 'Ready when you are',
    connecting: 'Connecting',
    initializing: 'Joining',
    listening: 'Listening',
    thinking: 'Thinking',
    speaking: 'Speaking',
    ended: 'Session ended',
    failed: 'Could not start',
};

function clock(s: number): string {
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Voice mode: talk to the agent the way a caller would. The same voice
 * worker that answers the phone answers here, with the same skills,
 * knowledge, memory and actions; the session is recorded as a call in Desk.
 */
export default function VoiceMode({ agentName, available, onClose }: { agentName: string; available: boolean; onClose: () => void }) {
    const v = useVoiceSession();
    const [showCaptions, setShowCaptions] = useState(true);
    const live = !['idle', 'ended', 'failed'].includes(v.state);

    // Opened from the mic button: start straight away, as Claude does.
    const started = useRef(false);
    useEffect(() => {
        if (!started.current && available) {
            started.current = true;
            void v.start();
        }
    }, [available, v]);

    const close = () => {
        v.stop();
        onClose();
    };

    // Space toggles mute during a session, Escape ends it.
    useEffect(() => {
        if (!live) return;
        const onKey = (e: KeyboardEvent) => {
            if ((e.target as HTMLElement)?.closest('input, textarea, [contenteditable]')) return;
            if (e.code === 'Space') { e.preventDefault(); v.toggleMute(); }
            if (e.key === 'Escape') close();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [live, v]);

    return (
        <div className="relative flex h-full min-h-0 flex-col items-center overflow-hidden">
            <button type="button" onClick={close} className="v-btn v-btn--ghost absolute top-5 left-5 z-10"><ChevronLeft size={16} /> Back to chat</button>
            <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center px-6 pt-4">
                <div className={`transition-transform duration-700 ${live ? 'scale-100' : 'scale-90'}`}>
                    <VoiceOrb state={v.state} agentLevel={v.agentLevel} userLevel={v.userLevel} size={live ? 260 : 220} />
                </div>

                <div className="mt-10 flex flex-col items-center text-center">
                    {v.state === 'idle' && (
                        <>
                            <h2 className="text-3xl font-semibold tracking-tight text-primary">Talk to {agentName}</h2>
                            <p className="mt-3 max-w-[46ch] text-md text-secondary">Speak naturally, like a customer calling. {agentName} answers with the same skills, knowledge and tools as on the phone, and the call is saved in Desk.</p>
                            <button type="button" onClick={() => void v.start()} disabled={!available}
                                className="mt-8 flex h-14 items-center gap-2.5 rounded-full bg-ink px-8 text-md font-medium text-ink-text shadow-raised transition-transform active:scale-[0.97] disabled:opacity-40">
                                <Mic size={19} /> Start talking
                            </button>
                            {!available && <p className="mt-4 text-sm text-tertiary">Voice needs LiveKit to be configured on the server.</p>}
                            <p className="mt-4 text-xs text-tertiary">Your browser will ask for the microphone. Space mutes, Escape ends.</p>
                        </>
                    )}

                    {live && (
                        <>
                            <div className="flex items-center gap-2 text-md font-medium text-primary" aria-live="polite">
                                {(v.state === 'connecting' || v.state === 'initializing') && <Loader2 size={16} className="animate-spin text-tertiary" />}
                                <span className={v.state === 'thinking' ? 'v-shimmer' : ''}>{v.muted && v.state === 'listening' ? 'Muted' : STATE_LABEL[v.state]}</span>
                            </div>
                            <div className="mt-1 text-sm text-tertiary tabular-nums">{clock(v.seconds)}</div>
                        </>
                    )}

                    {v.state === 'ended' && (
                        <div className="animate-rise">
                            <h2 className="text-2xl font-semibold tracking-tight text-primary">Session ended</h2>
                            <p className="mt-2 text-md text-secondary">{clock(v.seconds)} with {agentName}. The transcript and what the agent did are on the call in Desk.</p>
                            <div className="mt-7 flex justify-center gap-3">
                                {v.callId && <Link href={`/desk/calls/${v.callId}`} className="v-btn v-btn--quiet v-btn--lg">View call in Desk</Link>}
                                <button type="button" onClick={onClose} className="v-btn v-btn--quiet v-btn--lg">Back to chat</button>
                                <button type="button" onClick={() => void v.start()} className="v-btn v-btn--primary v-btn--lg"><RotateCcw size={16} /> Talk again</button>
                            </div>
                        </div>
                    )}

                    {v.state === 'failed' && (
                        <div className="animate-rise">
                            <p className="flex items-center justify-center gap-2 text-md font-medium text-danger"><AlertCircle size={17} /> {v.error}</p>
                            <button type="button" onClick={() => void v.start()} className="v-btn v-btn--primary v-btn--lg mt-6"><RotateCcw size={16} /> Try again</button>
                        </div>
                    )}
                </div>

                {live && showCaptions && <CaptionStrip captions={v.captions} agentName={agentName} />}
            </div>

            {live && v.activity.length > 0 && (
                <aside className="pointer-events-none absolute top-6 right-6 hidden w-[300px] flex-col gap-2 xl:flex" aria-label="What the agent is doing">
                    {v.activity.map((a) => (
                        <div key={a.id} className="v-glass pointer-events-auto flex items-start gap-2.5 rounded-lg px-3.5 py-2.5 text-sm shadow-card animate-rise">
                            <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
                                {a.status === 'running' ? <Loader2 size={14} className="animate-spin text-tertiary" /> : a.status === 'error' ? <AlertCircle size={14} className="text-danger" /> : <Check size={14} className="text-success" />}
                            </span>
                            <span className="min-w-0">
                                <span className={`block font-medium ${a.status === 'running' ? 'v-shimmer' : 'text-primary'}`}>{a.label}</span>
                                {a.detail && <span className="block truncate text-xs text-tertiary">{a.detail}</span>}
                            </span>
                        </div>
                    ))}
                </aside>
            )}

            {live && (
                <div className="mb-8 flex shrink-0 items-center gap-4">
                    <ControlButton label={v.muted ? 'Unmute' : 'Mute'} active={v.muted} onClick={v.toggleMute}>{v.muted ? <MicOff size={21} /> : <Mic size={21} />}</ControlButton>
                    <ControlButton label={showCaptions ? 'Hide captions' : 'Show captions'} active={!showCaptions} onClick={() => setShowCaptions((c) => !c)}>{showCaptions ? <Captions size={21} /> : <CaptionsOff size={21} />}</ControlButton>
                    <button type="button" onClick={v.stop} aria-label="End session" title="End session (Esc returns to chat)"
                        className="flex size-14 items-center justify-center rounded-full bg-danger-fill text-white shadow-raised transition-transform active:scale-95">
                        <PhoneOff size={22} />
                    </button>
                </div>
            )}
        </div>
    );
}

function ControlButton({ label, active, onClick, children }: { label: string; active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button type="button" onClick={onClick} aria-label={label} title={label} aria-pressed={active}
            className={`flex size-14 items-center justify-center rounded-full border transition-colors active:scale-95 ${active ? 'border-transparent bg-ink text-ink-text' : 'border-border bg-surface text-primary shadow-card hover:bg-surface-hover'}`}>
            {children}
        </button>
    );
}

/** The last few lines of the conversation, newest at the bottom, fading upward. */
function CaptionStrip({ captions, agentName }: { captions: Caption[]; agentName: string }) {
    // The newest three lines, bottom-anchored in a fixed-height box: new text
    // pushes older lines up and they fade, with no scrolling or layout jumps.
    const recent = captions.filter((c) => c.text.trim()).slice(-3);
    if (!recent.length) return null;
    return (
        <div className="mt-8 flex h-[9.5rem] w-full max-w-[640px] flex-col justify-end overflow-hidden" style={{ maskImage: 'linear-gradient(to bottom, transparent, #000 45%)', WebkitMaskImage: 'linear-gradient(to bottom, transparent, #000 45%)' }} aria-live="polite">
            <div className="flex flex-col gap-3 px-2">
                {recent.map((c, i) => (
                    <p key={c.id} className={`text-center leading-relaxed transition-[color,font-size] duration-300 ${i === recent.length - 1 ? 'text-lg text-primary' : 'text-md text-tertiary'}`} dir="auto">
                        <span className="mr-2 text-xs font-medium uppercase tracking-wide text-tertiary">{c.who === 'agent' ? agentName : 'You'}</span>
                        {c.text}
                    </p>
                ))}
            </div>
        </div>
    );
}
