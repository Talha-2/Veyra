import { useEffect, useRef } from 'react';

import type { AgentState } from './use-voice-session';

/**
 * The voice orb: the agent's presence, drawn in CSS so it is sharp at any
 * size, animated from live audio levels without re-rendering React.
 *
 * Listening, it breathes and leans toward your voice; thinking, its light
 * swirls; speaking, it swells with the agent's own audio. Idle and ended, it
 * rests. The palette is the brand orb's (DESIGN.md, "The company site").
 */
export default function VoiceOrb({ state, agentLevel, userLevel, size = 280 }: {
    state: AgentState;
    agentLevel: React.MutableRefObject<number>;
    userLevel: React.MutableRefObject<number>;
    size?: number;
}) {
    const body = useRef<HTMLDivElement>(null);
    const glow = useRef<HTMLDivElement>(null);
    const ring = useRef<HTMLDivElement>(null);
    const stateRef = useRef(state);
    stateRef.current = state;

    useEffect(() => {
        let raf = 0;
        let t = 0;
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const frame = () => {
            t += 1 / 60;
            const s = stateRef.current;
            const a = Math.min(1, agentLevel.current * 2.2);
            const u = Math.min(1, userLevel.current * 2.6);
            let scale = 1;
            let glowScale = 1;
            let glowOpacity = 0.55;
            if (!reduced) {
                if (s === 'speaking') {
                    scale = 1 + a * 0.16;
                    glowScale = 1.05 + a * 0.35;
                    glowOpacity = 0.6 + a * 0.4;
                } else if (s === 'listening') {
                    scale = 1 + Math.sin(t * 1.6) * 0.012 + u * 0.06;
                    glowScale = 1 + u * 0.18;
                    glowOpacity = 0.45 + u * 0.3;
                } else if (s === 'thinking' || s === 'initializing' || s === 'connecting') {
                    scale = 1 + Math.sin(t * 3) * 0.02;
                    glowOpacity = 0.5 + Math.sin(t * 3) * 0.12;
                } else {
                    scale = 1 + Math.sin(t * 0.8) * 0.01;
                    glowOpacity = 0.35;
                }
            }
            if (body.current) body.current.style.transform = `scale(${scale.toFixed(4)})`;
            if (glow.current) {
                glow.current.style.transform = `scale(${glowScale.toFixed(4)})`;
                glow.current.style.opacity = glowOpacity.toFixed(3);
            }
            if (ring.current) ring.current.style.transform = `rotate(${(t * (s === 'thinking' ? 90 : 12)).toFixed(2)}deg)`;
            raf = requestAnimationFrame(frame);
        };
        raf = requestAnimationFrame(frame);
        return () => cancelAnimationFrame(raf);
    }, [agentLevel, userLevel]);

    const listening = state === 'listening';
    return (
        <div className="relative" style={{ width: size, height: size }} aria-hidden="true">
            <div ref={glow} className="absolute inset-[-22%] rounded-full" style={{
                background: listening
                    ? 'radial-gradient(50% 50% at 50% 50%, rgba(139,108,255,0.38), rgba(77,181,255,0.14) 50%, transparent 72%)'
                    : 'radial-gradient(50% 50% at 50% 50%, rgba(233,107,52,0.45), rgba(255,95,126,0.18) 48%, transparent 72%)',
                filter: 'blur(18px)', transition: 'background 600ms ease',
            }} />
            <div ref={ring} className="absolute inset-[-6%]">
                <svg viewBox="0 0 400 400" className="h-full w-full">
                    <circle cx="200" cy="200" r="196" fill="none" stroke="#ffb08a" strokeOpacity="0.55" strokeWidth="1" strokeDasharray="2 7" />
                    <circle cx="200" cy="200" r="182" fill="none" stroke="#e96b34" strokeOpacity="0.3" strokeWidth="1.2" strokeDasharray="44 16 4 16" />
                </svg>
            </div>
            <div ref={body} className="absolute inset-[8%] rounded-full" style={{
                background:
                    'radial-gradient(38% 34% at 34% 28%, rgba(255,255,255,0.92), rgba(255,255,255,0) 60%),' +
                    'radial-gradient(70% 70% at 70% 78%, rgba(139,108,255,0.85), rgba(139,108,255,0) 62%),' +
                    'radial-gradient(80% 80% at 28% 70%, rgba(255,95,126,0.9), rgba(255,95,126,0) 60%),' +
                    'radial-gradient(100% 100% at 50% 40%, #ff9a62 0%, #e96b34 38%, #b33b1c 78%, #5a1a0c 100%)',
                boxShadow: 'inset 0 -30px 60px rgba(40,8,30,0.45), inset 0 20px 40px rgba(255,255,255,0.22), 0 40px 120px -20px rgba(233,107,52,0.55)',
                willChange: 'transform',
            }} />
        </div>
    );
}
