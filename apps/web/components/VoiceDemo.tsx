"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useLocalParticipant,
  useRoomContext,
  useVoiceAssistant,
} from "@livekit/components-react";
import { RoomEvent } from "livekit-client";
import { Mic, MicOff, Phone, PhoneOff } from "lucide-react";
import { api } from "@/lib/api";

type Seg = { id: string; role: "you" | "agent"; text: string; final: boolean };
type TurnLatency = {
  eou_ms?: number;
  transcription_ms?: number;
  llm_ttft_ms?: number;
  tts_ttfb_ms?: number;
  total_ms?: number;
};
type TransferEvent = { mode: string; status: string; detail?: string };

export default function VoiceDemo() {
  const [conn, setConn] = useState<{ token: string; url: string } | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const t = await api.post("/api/livekit/token", {});
      setConn({ token: t.token, url: t.url });
    } catch (e: any) {
      setError(e.message ?? "Could not get a session token. Is the backend running?");
    } finally {
      setConnecting(false);
    }
  }, []);

  return (
    <div className="stage flex flex-col p-6 md:p-8" style={{ minHeight: 440 }}>
      {!conn ? (
        <div className="relative flex flex-1 flex-col items-center justify-center gap-6 py-10 text-center">
          <span
            className="badge"
            style={{ background: "rgba(255,255,255,0.05)", borderColor: "var(--stage-border)", color: "var(--stage-text-muted)" }}
          >
            <span className="dot dot-pulse" style={{ background: "var(--success)" }} /> Live demo
          </span>

          {/* animated orb */}
          <div className="relative flex h-32 w-32 items-center justify-center">
            {!connecting && (
              <>
                <span className="pulse-ring" />
                <span className="pulse-ring" style={{ animationDelay: "1.4s" }} />
              </>
            )}
            <button
              className="call-orb"
              onClick={start}
              disabled={connecting}
              aria-label="Start a live call with the agent"
              style={connecting ? { opacity: 0.7, cursor: "wait" } : undefined}
            >
              <Phone strokeWidth={2} />
            </button>
          </div>

          <div>
            <h3 style={{ fontSize: 26, fontWeight: 300, letterSpacing: "-0.02em", color: "var(--stage-text)" }}>
              Talk to the agent, live.
            </h3>
            <p
              className="mx-auto mt-2.5 max-w-md text-[15px] leading-relaxed"
              style={{ color: "var(--stage-text-muted)" }}
            >
              A real microphone conversation with barge-in, streaming transcription, and a per-turn latency
              readout. Your browser will ask for mic access.
            </p>
          </div>

          {/* pipeline chips */}
          <div className="mono flex flex-wrap items-center justify-center gap-2 text-[11px]" style={{ color: "var(--stage-text-muted)" }}>
            <span className="pipe-chip">Deepgram STT</span>
            <span>→</span>
            <span className="pipe-chip">GPT-4.1 nano</span>
            <span>→</span>
            <span className="pipe-chip">Cartesia voice</span>
          </div>

          <button className="btn-ember" onClick={start} disabled={connecting} style={connecting ? { opacity: 0.7 } : undefined}>
            <Phone size={14} /> {connecting ? "Connecting…" : "Start the call"}
          </button>

          {error && (
            <p className="max-w-md text-sm" style={{ color: "var(--danger)" }}>
              {error}
            </p>
          )}
        </div>
      ) : (
        <LiveKitRoom
          serverUrl={conn.url}
          token={conn.token}
          connect
          audio
          video={false}
          onDisconnected={() => setConn(null)}
          onError={(e) => setError(e.message)}
        >
          <RoomAudioRenderer />
          <CallUI onEnd={() => setConn(null)} />
        </LiveKitRoom>
      )}
    </div>
  );
}

function CallUI({ onEnd }: { onEnd: () => void }) {
  const room = useRoomContext();
  const { state: agentState } = useVoiceAssistant();
  const { localParticipant } = useLocalParticipant();
  const [segments, setSegments] = useState<Seg[]>([]);
  const [latency, setLatency] = useState<TurnLatency | null>(null);
  const [transfer, setTransfer] = useState<TransferEvent | null>(null);
  const [muted, setMuted] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true); // auto-scroll only while the reader is at the bottom

  // live transcript via LiveKit text streams (topic lk.transcription)
  useEffect(() => {
    const handler = async (reader: any, participantInfo: any) => {
      const attrs: Record<string, string> = reader.info?.attributes ?? {};
      const segId = attrs["lk.segment_id"] ?? reader.info?.id ?? Math.random().toString(36);
      const isLocal = participantInfo?.identity === room.localParticipant.identity;
      const role: Seg["role"] = isLocal ? "you" : "agent";
      let text = "";
      try {
        for await (const chunk of reader) {
          text += chunk;
          const final = attrs["lk.transcription_final"] === "true";
          setSegments((prev) => {
            const idx = prev.findIndex((s) => s.id === segId);
            const seg = { id: segId, role, text, final };
            if (idx === -1) return [...prev, seg];
            const next = [...prev];
            next[idx] = seg;
            return next;
          });
        }
      } catch {
        /* stream aborted on disconnect — fine */
      }
    };
    try {
      room.registerTextStreamHandler("lk.transcription", handler);
    } catch {
      /* already registered (react strict-mode double effect) */
    }
    return () => {
      try {
        room.unregisterTextStreamHandler("lk.transcription");
      } catch {}
    };
  }, [room]);

  // latency + transfer events published by the worker
  useEffect(() => {
    const onData = (payload: Uint8Array, _p?: any, _k?: any, topic?: string) => {
      try {
        const data = JSON.parse(new TextDecoder().decode(payload));
        if (topic === "agent_metrics" && data.type === "turn_latency") setLatency(data);
        if (topic === "transfer") setTransfer(data);
      } catch {}
    };
    room.on(RoomEvent.DataReceived, onData);
    return () => {
      room.off(RoomEvent.DataReceived, onData);
    };
  }, [room]);

  // Auto-scroll instantly (not smooth) and only when the reader is already at the
  // bottom. A smooth scroll fired on every interim token stacks up competing
  // animations — that is what made the transcript feel slow and jittery.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [segments]);

  const onTranscriptScroll = () => {
    const el = scrollRef.current;
    if (el) stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  };

  const toggleMute = async () => {
    await localParticipant.setMicrophoneEnabled(muted);
    setMuted(!muted);
  };

  const stateLabel =
    agentState === "speaking"
      ? "Speaking — interrupt any time"
      : agentState === "thinking"
        ? "Thinking…"
        : agentState === "listening"
          ? "Listening"
          : "Connecting…";

  const waveClass =
    agentState === "speaking"
      ? "wave agent animate"
      : agentState === "listening"
        ? "wave caller animate"
        : "wave";

  return (
    <div className="grid flex-1 gap-6 md:grid-cols-[264px_1fr] md:gap-8">
      {/* left rail: status, orb, controls, latency */}
      <div className="flex flex-col items-center gap-5">
        <span
          className="badge badge-mono"
          style={{
            background: "color-mix(in srgb, var(--stage-text) 8%, transparent)",
            borderColor: "var(--stage-border)",
            color: "var(--stage-text)",
          }}
        >
          <span className="dot dot-pulse" style={{ color: "var(--accent)" }} />
          {stateLabel}
        </span>

        <div className="flex flex-col items-center gap-2">
          <button className="call-orb live" onClick={onEnd} aria-label="End call">
            <PhoneOff strokeWidth={2} />
          </button>
          <span
            className="mono text-[11px] uppercase tracking-[0.14em]"
            style={{ color: "var(--stage-text-muted)" }}
          >
            End call
          </span>
        </div>

        <div className={waveClass} aria-hidden="true">
          {Array.from({ length: 24 }).map((_, i) => (
            <span key={i} />
          ))}
        </div>

        <button className="btn btn-stage" onClick={toggleMute}>
          {muted ? <MicOff strokeWidth={2} /> : <Mic strokeWidth={2} />}
          {muted ? "Unmute" : "Mute"}
        </button>

        <LatencyHUD latency={latency} />

        {transfer && (
          <div
            className="w-full rounded-[var(--radius-sm)] border p-3 text-xs"
            style={{ borderColor: "var(--warning-border)", color: "var(--stage-text)" }}
          >
            <b style={{ color: "var(--warning)" }}>
              {transfer.mode === "warm" ? "Warm" : "Cold"} transfer &mdash; {transfer.status}
            </b>
            {transfer.detail && (
              <p className="mt-1" style={{ color: "var(--stage-text-muted)" }}>
                {transfer.detail}
              </p>
            )}
          </div>
        )}
      </div>

      {/* right: live transcript */}
      <div className="stage-raised flex flex-col overflow-hidden" style={{ height: "min(620px, 72vh)" }}>
        <div
          className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
          style={{ borderBottom: "1px solid var(--stage-border)" }}
        >
          <span className="text-[13px] font-semibold" style={{ color: "var(--stage-text)" }}>
            Live transcript
          </span>
          <span
            className="badge badge-mono"
            style={{
              background: "transparent",
              borderColor: "var(--stage-border)",
              color: "var(--stage-text-muted)",
            }}
          >
            <span className="dot dot-pulse" style={{ color: "var(--success)" }} /> streaming
          </span>
        </div>
        <div
          ref={scrollRef}
          onScroll={onTranscriptScroll}
          className="transcript-scroll flex-1 space-y-3 overflow-y-auto p-4 md:p-5"
          style={{ scrollBehavior: "auto", overscrollBehavior: "contain" }}
        >
          {segments.length === 0 && (
            <p className="text-sm" style={{ color: "var(--stage-text-muted)" }}>
              Say hello &mdash; words appear here as they&apos;re recognized, before you finish
              speaking.
            </p>
          )}
          {segments.map((s) => (
            <TranscriptRow key={s.id} seg={s} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* Memoized so a new interim token on the latest segment does not re-render every
   earlier bubble — the source of the "slow, weary" feel on a long call. */
const TranscriptRow = memo(function TranscriptRow({ seg }: { seg: Seg }) {
  const you = seg.role === "you";
  return (
    <div className={`flex ${you ? "justify-end" : "justify-start"}`}>
      <div className={`flex max-w-[86%] flex-col gap-1 ${you ? "items-end text-right" : "text-left"}`}>
        <span
          className="mono text-[10px] uppercase tracking-[0.16em]"
          style={{ color: you ? "var(--voice-caller)" : "var(--voice-agent)" }}
        >
          {you ? "You" : "Agent"}
        </span>
        <div
          className="rounded-[14px] px-3.5 py-2.5 text-[14.5px] leading-relaxed transition-opacity"
          style={{
            color: "var(--stage-text)",
            opacity: seg.final ? 1 : 0.72,
            overflowWrap: "anywhere",
            background: you
              ? "color-mix(in srgb, var(--voice-caller) 24%, var(--stage))"
              : "var(--stage-raised)",
            borderBottomRightRadius: you ? 4 : undefined,
            borderBottomLeftRadius: you ? undefined : 4,
          }}
        >
          {seg.text}
          {!seg.final && <span className="typing-caret" aria-hidden="true" />}
        </div>
      </div>
    </div>
  );
});

function LatencyHUD({ latency }: { latency: TurnLatency | null }) {
  const total = latency?.total_ms ?? null;
  const color =
    total === null
      ? "var(--stage-text-muted)"
      : total < 1200
        ? "var(--success)"
        : total < 1800
          ? "var(--warning)"
          : "var(--danger)";
  const rows: [string, number | undefined][] = [
    ["endpointing", latency?.eou_ms],
    ["LLM first token", latency?.llm_ttft_ms],
    ["TTS first byte", latency?.tts_ttfb_ms],
  ];
  return (
    <div
      className="w-full rounded-[var(--radius-sm)] border p-4"
      style={{ borderColor: "var(--stage-border)" }}
    >
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span
          className="mono text-[11px] uppercase tracking-[0.12em]"
          style={{ color: "var(--stage-text-muted)" }}
        >
          Turn latency
        </span>
        <span className="mono tabular text-[28px] leading-none" style={{ color }}>
          {total === null ? "—" : `${Math.round(total)} ms`}
        </span>
      </div>
      <div className="space-y-1">
        {rows.map(([label, v]) => (
          <div
            key={label}
            className="mono flex justify-between text-[12px]"
            style={{ color: "var(--stage-text-muted)" }}
          >
            <span>{label}</span>
            <span className="tabular">{v === undefined ? "—" : `${Math.round(v)} ms`}</span>
          </div>
        ))}
      </div>
      <p
        className="mono mt-3 text-[10px] uppercase tracking-[0.1em] leading-snug"
        style={{ color: "var(--stage-text-muted)" }}
      >
        voice-to-voice, measured live &middot; target &lt;1.2s
      </p>
    </div>
  );
}
