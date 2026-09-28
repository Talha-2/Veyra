import { ArrowUp, AudioLines, Square } from 'lucide-react';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

/** "openai:gpt-4.1-mini" reads as "GPT-4.1 mini". */
export function modelName(ref: string): string {
    const id = ref.includes(':') ? ref.slice(ref.indexOf(':') + 1) : ref;
    return id.replace(/^gpt-/i, 'GPT-').replace(/-(mini|nano|turbo)$/i, ' $1').replace(/^claude-/i, 'Claude ').replace(/^grok-/i, 'Grok ');
}

export interface ComposerHandle {
    focus: () => void;
}

/**
 * The composer: a rounded field that grows with what is typed, Enter to send
 * and Shift+Enter for a new line. While a reply streams, the send button
 * becomes Stop — the one control that matters in that moment.
 */
const Composer = forwardRef<ComposerHandle, {
    onSend: (text: string) => void;
    onStop: () => void;
    streaming: boolean;
    model?: string | null;
    placeholder?: string;
    autoFocus?: boolean;
    /** When set, a voice button beside Send switches this conversation to voice mode, as in Claude. */
    onVoice?: () => void;
}>(function Composer({ onSend, onStop, streaming, model, placeholder = 'Ask anything', autoFocus = false, onVoice }, ref) {
    const [text, setText] = useState('');
    const area = useRef<HTMLTextAreaElement>(null);

    useImperativeHandle(ref, () => ({ focus: () => area.current?.focus() }));

    useEffect(() => {
        const el = area.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
    }, [text]);

    useEffect(() => { if (autoFocus) area.current?.focus(); }, [autoFocus]);

    const send = () => {
        const value = text.trim();
        if (!value || streaming) return;
        onSend(value);
        setText('');
    };

    return (
        <div className="rounded-xl border border-border bg-surface shadow-card transition-shadow focus-within:border-border-strong focus-within:shadow-raised">
            <textarea
                ref={area}
                rows={1}
                value={text}
                dir="auto"
                aria-label="Message"
                placeholder={placeholder}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        send();
                    }
                }}
                className="v-bare block max-h-[240px] w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-md leading-relaxed text-primary outline-none placeholder:text-disabled"
            />
            <div className="flex items-center justify-between gap-3 px-3 pt-1 pb-2.5">
                <span className="truncate pl-1 text-2xs text-disabled">{model ? modelName(model) : 'Veyra agent'}</span>
                <div className="flex shrink-0 items-center gap-2">
                {onVoice && !streaming && (
                    <button type="button" onClick={onVoice} aria-label="Talk with voice" title="Talk with voice"
                        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-primary transition-colors hover:bg-surface-active active:scale-95">
                        <AudioLines size={16} />
                    </button>
                )}
                {streaming ? (
                    <button type="button" onClick={onStop} aria-label="Stop"
                        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink text-ink-text transition-transform active:scale-95">
                        <Square size={11} fill="currentColor" />
                    </button>
                ) : (
                    <button type="button" onClick={send} aria-label="Send" disabled={!text.trim()}
                        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink text-ink-text transition-all active:scale-95 disabled:bg-surface-active disabled:text-disabled">
                        <ArrowUp size={16} strokeWidth={2.25} />
                    </button>
                )}
                </div>
            </div>
        </div>
    );
});

export default Composer;
