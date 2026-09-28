import { AlertCircle, Pause, Play, RotateCcw } from 'lucide-react';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

import { clock } from './helpers';

export interface RecordingPlayerHandle {
    /** Jump to a point in the recording, and start playing unless told not to. */
    seek: (seconds: number, play?: boolean) => void;
}

const SPEEDS = [1, 1.5, 2] as const;

/**
 * A call recording, played in place: play/pause, a track you can drag or
 * step with the arrow keys, elapsed and total, and playback speed.
 *
 * The native <audio controls> looked different in every browser and theme;
 * this keeps the element (hidden) for decoding and draws its own controls
 * from the tokens. `onTime` lets a transcript follow along.
 */
const RecordingPlayer = forwardRef<RecordingPlayerHandle, { src: string; label?: string; onTime?: (seconds: number) => void; fallbackDuration?: number | null }>(
    function RecordingPlayer({ src, label = 'Call recording', onTime, fallbackDuration = null }, ref) {
        const audio = useRef<HTMLAudioElement>(null);
        const track = useRef<HTMLDivElement>(null);
        const [playing, setPlaying] = useState(false);
        const [time, setTime] = useState(0);
        const [duration, setDuration] = useState<number | null>(null);
        const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
        const [failed, setFailed] = useState(false);
        const [dragging, setDragging] = useState(false);

        const total = duration ?? fallbackDuration ?? null;
        const progress = total ? Math.min(1, time / total) : 0;

        const seek = useCallback((seconds: number, play = false) => {
            const el = audio.current;
            if (!el) return;
            const max = Number.isFinite(el.duration) ? el.duration : total ?? seconds;
            el.currentTime = Math.max(0, Math.min(seconds, max));
            setTime(el.currentTime);
            if (play) void el.play().catch(() => setFailed(true));
        }, [total]);

        useImperativeHandle(ref, () => ({ seek: (s, play = true) => seek(s, play) }), [seek]);

        useEffect(() => { if (audio.current) audio.current.playbackRate = speed; }, [speed]);

        const toggle = () => {
            const el = audio.current;
            if (!el) return;
            if (el.paused) void el.play().catch(() => setFailed(true));
            else el.pause();
        };

        const fromPointer = (clientX: number) => {
            const box = track.current?.getBoundingClientRect();
            if (!box || !total) return;
            seek(((clientX - box.left) / box.width) * total);
        };

        const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
            if (!total) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            setDragging(true);
            fromPointer(e.clientX);
        };

        const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
            const steps: Record<string, number> = { ArrowLeft: -5, ArrowDown: -5, ArrowRight: 5, ArrowUp: 5, PageDown: -15, PageUp: 15 };
            if (e.key in steps) { e.preventDefault(); seek(time + steps[e.key]); }
            else if (e.key === 'Home') { e.preventDefault(); seek(0); }
            else if (e.key === 'End' && total) { e.preventDefault(); seek(total); }
            else if (e.key === ' ' || e.key === 'k') { e.preventDefault(); toggle(); }
        };

        if (failed) {
            return (
                <div className="flex h-12 items-center gap-2.5 rounded-md px-3.5 text-sm text-secondary" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
                    <AlertCircle size={15} strokeWidth={1.9} className="shrink-0 text-tertiary" />
                    <span className="min-w-0 flex-1">The recording could not be loaded. It may have expired at the phone provider.</span>
                    <button type="button" onClick={() => { setFailed(false); audio.current?.load(); }} className="v-btn v-btn--ghost v-btn--sm shrink-0">
                        <RotateCcw size={13} strokeWidth={2} /> Retry
                    </button>
                </div>
            );
        }

        return (
            <div className="@container rounded-md" role="group" aria-label={label} style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
            <div className="flex h-12 items-center gap-2.5 pr-2 pl-1.5 @sm:gap-3">
                <audio ref={audio} src={src} preload="metadata" className="hidden"
                    onLoadedMetadata={(e) => { const d = e.currentTarget.duration; if (Number.isFinite(d) && d > 0) setDuration(d); }}
                    onDurationChange={(e) => { const d = e.currentTarget.duration; if (Number.isFinite(d) && d > 0) setDuration(d); }}
                    onTimeUpdate={(e) => { if (!dragging) setTime(e.currentTarget.currentTime); onTime?.(e.currentTarget.currentTime); }}
                    onPlay={() => setPlaying(true)}
                    onPause={() => setPlaying(false)}
                    onEnded={() => setPlaying(false)}
                    onError={() => setFailed(true)} />

                <button type="button" onClick={toggle} aria-label={playing ? 'Pause recording' : 'Play recording'} title={playing ? 'Pause' : 'Play'}
                    className="flex size-9 shrink-0 items-center justify-center rounded-full transition-transform active:scale-95"
                    style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}>
                    {playing ? <Pause size={15} strokeWidth={2.2} fill="currentColor" /> : <Play size={15} strokeWidth={2.2} fill="currentColor" className="translate-x-px" />}
                </button>

                <span className="hidden w-10 shrink-0 text-right text-xs font-medium text-secondary tabular-nums @sm:inline">{clock(time)}</span>

                <div ref={track} role="slider" tabIndex={0} aria-label="Seek" aria-valuemin={0} aria-valuemax={Math.round(total ?? 0)} aria-valuenow={Math.round(time)}
                    aria-valuetext={`${clock(time)} of ${total ? clock(total) : 'unknown'}`}
                    onPointerDown={onPointerDown}
                    onPointerMove={(e) => { if (dragging) fromPointer(e.clientX); }}
                    onPointerUp={(e) => { setDragging(false); e.currentTarget.releasePointerCapture(e.pointerId); }}
                    onKeyDown={onKey}
                    className="group/track relative flex h-8 min-w-0 flex-1 cursor-pointer touch-none items-center rounded-sm">
                    <span className="relative h-1 w-full overflow-hidden rounded-full" style={{ background: 'var(--border-strong)' }}>
                        <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${progress * 100}%`, background: 'var(--text-primary)' }} />
                    </span>
                    <span className={`absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full transition-opacity ${dragging || playing ? 'opacity-100' : 'opacity-0 group-hover/track:opacity-100 group-focus-visible/track:opacity-100'}`}
                        style={{ left: `${progress * 100}%`, background: 'var(--text-primary)', boxShadow: '0 0 0 2px var(--surface-sunken)' }} aria-hidden="true" />
                </div>

                <span className="hidden w-10 shrink-0 text-xs font-medium text-tertiary tabular-nums @sm:inline">{total ? clock(total) : '--:--'}</span>
                <span className="shrink-0 text-xs font-medium text-tertiary tabular-nums @sm:hidden"><span className="text-secondary">{clock(time)}</span> / {total ? clock(total) : '--:--'}</span>

                <button type="button" onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length])}
                    aria-label={`Playback speed ${speed}x. Change speed`} title="Playback speed"
                    className="h-7 w-11 shrink-0 rounded-sm text-xs font-semibold text-secondary tabular-nums transition-colors hover:bg-surface-hover hover:text-primary"
                    style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
                    {speed}×
                </button>
            </div>
            </div>
        );
    },
);

export default RecordingPlayer;
