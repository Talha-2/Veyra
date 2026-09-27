import { useEffect, useState } from 'react';

/**
 * Colour pieces for settings that let a person pick a colour: ticket types,
 * pipeline stages. The colours themselves are data (the person chose them),
 * which is the one place a hex value belongs on a page.
 */

const HEX = /^#[0-9a-fA-F]{6}$/;

/** A round swatch that opens the system colour picker, with an optional hex field beside it. */
export function SwatchInput({ value, onChange, label, withHex = false, size = 30 }: { value: string; onChange: (hex: string) => void; label: string; withHex?: boolean; size?: number }) {
    const [text, setText] = useState(value);
    useEffect(() => setText(value), [value]);

    return (
        <div className="flex items-center gap-2.5">
            <label
                className="relative inline-flex shrink-0 cursor-pointer rounded-full transition-transform focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--accent)] hover:scale-105"
                style={{ width: size, height: size, background: value, boxShadow: 'inset 0 0 0 1px var(--border-strong)' }}
                title={`${label}: ${value}`}
            >
                <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} className="absolute inset-0 size-full cursor-pointer opacity-0" />
            </label>
            {withHex && (
                <input
                    className="v-field w-[112px] font-mono text-sm"
                    value={text}
                    maxLength={7}
                    spellCheck={false}
                    aria-label={`${label} (hex)`}
                    onChange={(e) => {
                        const v = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`;
                        setText(v);
                        if (HEX.test(v)) onChange(v.toLowerCase());
                    }}
                    onBlur={() => setText(value)}
                />
            )}
        </div>
    );
}

/** A small square of a user-chosen colour: the leading mark of a typed row. */
export function Swatch({ color, size = 12, round = false }: { color: string; size?: number; round?: boolean }) {
    return <span aria-hidden="true" className={`inline-block shrink-0 ${round ? 'rounded-full' : 'rounded-[4px]'}`} style={{ width: size, height: size, background: color, boxShadow: 'inset 0 0 0 1px var(--border)' }} />;
}

/**
 * A pipeline drawn as it will read on the board: one coloured segment per
 * stage, left to right, with the stage names underneath.
 */
export function StageStrip({ stages, counts }: { stages: { name: string; color: string }[]; counts?: (number | null)[] }) {
    if (stages.length === 0) return null;

    return (
        <div aria-label={`Stages: ${stages.map((s) => s.name).join(', ')}`} role="img">
            <div className="flex h-2.5 gap-[3px]">
                {stages.map((s, i) => (
                    <div
                        key={i}
                        className={`flex-1 transition-colors ${i === 0 ? 'rounded-l-full' : ''} ${i === stages.length - 1 ? 'rounded-r-full' : ''}`}
                        style={{ background: s.color, boxShadow: 'inset 0 0 0 1px var(--border)' }}
                    />
                ))}
            </div>
            <div className="mt-2 flex gap-[3px]">
                {stages.map((s, i) => (
                    <div key={i} className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium text-primary">{s.name.trim() || 'Untitled'}</div>
                        <div className="text-2xs text-tertiary tabular-nums">{counts?.[i] != null ? `${counts[i]} leads` : `Stage ${i + 1}`}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}
