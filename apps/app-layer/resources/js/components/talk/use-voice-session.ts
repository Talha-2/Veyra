import { ConnectionState, Room, RoomEvent, Track, type Participant, type RemoteTrack } from 'livekit-client';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A browser voice session with the agent, over LiveKit.
 *
 * The app creates a call row and a private room and signs a token; the voice
 * worker (the same one that answers the phone) is dispatched into the room and
 * speaks first. Everything shown on the page comes from the room itself:
 *
 * - the agent's state ("listening", "thinking", "speaking") from its
 *   `lk.agent.state` participant attribute;
 * - captions from the `lk.transcription` text streams (agent and caller);
 * - the agent's tool steps from `agent_activity` data messages the worker
 *   publishes as it looks things up and acts;
 * - audio levels, read every frame, for the orb.
 */

export type AgentState = 'idle' | 'connecting' | 'initializing' | 'listening' | 'thinking' | 'speaking' | 'ended' | 'failed';

export interface Caption {
    id: string;
    who: 'agent' | 'you';
    text: string;
    final: boolean;
}

export interface Activity {
    id: string;
    label: string;
    detail?: string;
    status: 'running' | 'done' | 'error';
    summary?: string;
    ms?: number;
}

export interface VoiceSession {
    state: AgentState;
    error: string | null;
    captions: Caption[];
    activity: Activity[];
    muted: boolean;
    seconds: number;
    callId: number | null;
    agentLevel: React.MutableRefObject<number>;
    userLevel: React.MutableRefObject<number>;
    start: () => Promise<void>;
    stop: () => void;
    toggleMute: () => void;
}

function xsrf(): string {
    const m = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : '';
}

export function useVoiceSession(): VoiceSession {
    const [state, setState] = useState<AgentState>('idle');
    const [error, setError] = useState<string | null>(null);
    const [captions, setCaptions] = useState<Caption[]>([]);
    const [activity, setActivity] = useState<Activity[]>([]);
    const [muted, setMuted] = useState(false);
    const [seconds, setSeconds] = useState(0);
    const [callId, setCallId] = useState<number | null>(null);

    const room = useRef<Room | null>(null);
    const audioEls = useRef<HTMLMediaElement[]>([]);
    const agentLevel = useRef(0);
    const userLevel = useRef(0);
    const raf = useRef(0);
    const timer = useRef(0);

    const cleanup = useCallback(() => {
        cancelAnimationFrame(raf.current);
        window.clearInterval(timer.current);
        audioEls.current.forEach((el) => el.remove());
        audioEls.current = [];
        agentLevel.current = 0;
        userLevel.current = 0;
    }, []);

    const stop = useCallback(() => {
        const r = room.current;
        room.current = null;
        if (r) void r.disconnect();
        cleanup();
        setState((s) => (s === 'idle' || s === 'failed' ? s : 'ended'));
    }, [cleanup]);

    useEffect(() => () => { room.current?.disconnect(); cleanup(); }, [cleanup]);

    const start = useCallback(async () => {
        setError(null);
        setCaptions([]);
        setActivity([]);
        setSeconds(0);
        setMuted(false);
        setState('connecting');

        let session: { url: string; token: string; call_id: number };
        try {
            const res = await fetch('/studio/talk/voice', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'X-XSRF-TOKEN': xsrf() },
                body: '{}',
            });
            if (!res.ok) {
                const body = (await res.json().catch(() => null)) as { message?: string } | null;
                throw new Error(body?.message ?? `Could not start a session (HTTP ${res.status}).`);
            }
            session = await res.json();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not start a session.');
            setState('failed');
            return;
        }
        setCallId(session.call_id);

        const r = new Room({ adaptiveStream: true, dynacast: true });
        room.current = r;

        const isAgent = (p?: Participant) => !!p && p.identity !== r.localParticipant.identity;

        r.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
            if (track.kind === Track.Kind.Audio) {
                const el = track.attach();
                el.style.display = 'none';
                document.body.appendChild(el);
                audioEls.current.push(el);
            }
        });
        r.on(RoomEvent.ParticipantAttributesChanged, (changed, participant) => {
            const next = changed['lk.agent.state'];
            if (next && isAgent(participant)) setState(next as AgentState);
        });
        r.on(RoomEvent.ParticipantConnected, (p) => {
            const s = p.attributes?.['lk.agent.state'];
            if (s) setState(s as AgentState);
        });
        r.on(RoomEvent.ParticipantDisconnected, (p) => {
            // The agent left: the call is over (it hung up or ended the session).
            if (isAgent(p) && room.current === r) stop();
        });
        r.on(RoomEvent.Disconnected, () => {
            if (room.current === r) stop();
        });
        r.on(RoomEvent.DataReceived, (payload, _participant, _kind, topic) => {
            if (topic !== 'agent_activity') return;
            try {
                const e = JSON.parse(new TextDecoder().decode(payload)) as Activity;
                if (!e.id) return;
                setActivity((list) => {
                    const i = list.findIndex((a) => a.id === e.id);
                    if (i >= 0) {
                        const copy = [...list];
                        copy[i] = { ...copy[i], ...e };
                        return copy;
                    }
                    return [...list, e].slice(-8);
                });
            } catch {
                // a malformed frame is skipped
            }
        });
        // Captions arrive a few characters at a time. Fold them into a buffer
        // and publish at most once per animation frame, so the page renders
        // at display speed instead of once per fragment (which made the
        // captions trail the voice and stutter).
        const pending = new Map<string, Caption>();
        let flushScheduled = false;
        const flush = () => {
            flushScheduled = false;
            if (!pending.size) return;
            const updates = [...pending.values()];
            pending.clear();
            setCaptions((list) => {
                const next = [...list];
                for (const u of updates) {
                    const i = next.findIndex((c) => c.id === u.id);
                    if (i >= 0) next[i] = { ...next[i], ...u };
                    else next.push(u);
                }
                return next.slice(-40);
            });
        };
        const queue = (c: Caption) => {
            pending.set(c.id, c);
            if (!flushScheduled) {
                flushScheduled = true;
                requestAnimationFrame(flush);
            }
        };
        r.registerTextStreamHandler('lk.transcription', async (reader, participantInfo) => {
            const attrs = (reader.info as { attributes?: Record<string, string> }).attributes ?? {};
            const id = attrs['lk.segment_id'] ?? reader.info.id;
            const who: Caption['who'] = participantInfo.identity === r.localParticipant.identity ? 'you' : 'agent';
            let text = '';
            for await (const chunk of reader) {
                text += chunk;
                queue({ id, who, text, final: false });
            }
            queue({ id, who, text, final: true });
        });

        try {
            await r.connect(session.url, session.token);
            await r.localParticipant.setMicrophoneEnabled(true);
        } catch (e) {
            room.current = null;
            void r.disconnect();
            cleanup();
            const denied = e instanceof Error && /permission|notallowed/i.test(e.name + e.message);
            setError(denied ? 'Microphone access was blocked. Allow the microphone for this site and try again.' : 'Could not connect to the voice service.');
            setState('failed');
            return;
        }

        if (r.state === ConnectionState.Connected) setState((s) => (s === 'connecting' ? 'initializing' : s));
        const began = Date.now();
        timer.current = window.setInterval(() => setSeconds(Math.floor((Date.now() - began) / 1000)), 1000);

        // Levels, smoothed, for the orb. Read from the participants each frame.
        const tick = () => {
            const agent = [...r.remoteParticipants.values()][0];
            const a = agent?.audioLevel ?? 0;
            const u = r.localParticipant.audioLevel ?? 0;
            agentLevel.current += (a - agentLevel.current) * 0.25;
            userLevel.current += (u - userLevel.current) * 0.25;
            raf.current = requestAnimationFrame(tick);
        };
        raf.current = requestAnimationFrame(tick);
    }, [cleanup, stop]);

    const toggleMute = useCallback(() => {
        const r = room.current;
        if (!r) return;
        const next = !muted;
        void r.localParticipant.setMicrophoneEnabled(!next);
        setMuted(next);
    }, [muted]);

    return { state, error, captions, activity, muted, seconds, callId, agentLevel, userLevel, start, stop, toggleMute };
}
