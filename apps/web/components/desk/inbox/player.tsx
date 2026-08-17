"use client";

/* Call-recording player, replacing the browser's native <audio controls>.

   The native control strip is the one element in the thread no design system
   can reach — a different look in every browser and both themes. This player
   is drawn from Veyra's own grammar: a pill play control, a hairline seek
   track with an Ember played-fill, mono timestamps, and a rate toggle.
   Everything is keyboard-operable: the scrubber is a real slider (arrow keys
   seek ±5s), and the buttons are buttons. */

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

const RATES = [1, 1.5, 2];

function clock(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function RecordingPlayer({ src, label }: { src: string; label?: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState(1);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setTime(a.currentTime);
    const onMeta = () => setDuration(a.duration || 0);
    const onEnd = () => setPlaying(false);
    const onErr = () => setFailed(true);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("durationchange", onMeta);
    a.addEventListener("ended", onEnd);
    a.addEventListener("error", onErr);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("durationchange", onMeta);
      a.removeEventListener("ended", onEnd);
      a.removeEventListener("error", onErr);
    };
  }, []);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      a.play().then(() => setPlaying(true)).catch(() => setFailed(true));
    } else {
      a.pause();
      setPlaying(false);
    }
  };

  const seek = (v: number) => {
    const a = audioRef.current;
    if (!a || !Number.isFinite(a.duration)) return;
    a.currentTime = v;
    setTime(v);
  };

  const cycleRate = () => {
    const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
    setRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  if (failed) {
    return <p className="msg-card__none">Recording could not be loaded</p>;
  }

  const pct = duration > 0 ? (time / duration) * 100 : 0;

  return (
    <div className="rplay" aria-label={label || "Call recording"}>
      <audio ref={audioRef} preload="metadata" src={src} />
      <button
        type="button"
        className="rplay__toggle"
        onClick={toggle}
        aria-label={playing ? "Pause recording" : "Play recording"}
      >
        {playing ? <Pause size={13} /> : <Play size={13} style={{ marginLeft: 1 }} />}
      </button>
      <span className="rplay__time mono">{clock(time)}</span>
      <input
        type="range"
        className="rplay__seek"
        min={0}
        max={Math.max(duration, 0.01)}
        step={0.25}
        value={Math.min(time, duration || 0)}
        onChange={(e) => seek(Number(e.target.value))}
        aria-label="Seek"
        style={{ ["--rplay-pct" as string]: `${pct}%` }}
      />
      <span className="rplay__time mono">{duration > 0 ? clock(duration) : "–:––"}</span>
      <button
        type="button"
        className="rplay__rate mono"
        onClick={cycleRate}
        aria-label={`Playback speed ${rate}x — click to change`}
        title="Playback speed"
      >
        {rate}x
      </button>
    </div>
  );
}
