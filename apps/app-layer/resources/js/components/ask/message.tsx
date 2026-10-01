import { AlertCircle, Check, ChevronRight, Copy, Loader2, RotateCcw, Square } from 'lucide-react';
import { useState } from 'react';

import { VeyraMark } from '../shell/sidebar';
import { UserText } from '../ui/primitives';
import { Markdown } from './markdown';
import { partsOf, type ChatMessage, type ToolPart } from './stream';

/** The person's turn: a quiet bubble on the right, as in every good chat. */
export function UserMessage({ message }: { message: ChatMessage }) {
    return (
        <div className="group flex justify-end animate-fade-in">
            <div className="max-w-[85%] rounded-xl rounded-br-sm bg-surface-sunken px-4 py-2.5 text-md leading-relaxed text-primary whitespace-pre-wrap" dir="auto">
                <UserText>{message.content}</UserText>
            </div>
        </div>
    );
}

/**
 * The agent's turn: full-width prose with the tool steps it took inline, in
 * the order it took them — the reader sees what it looked at before it spoke.
 */
export function AssistantMessage({ message, onRetry, isLast }: { message: ChatMessage; onRetry?: () => void; isLast: boolean }) {
    const parts = partsOf(message);
    const hasText = parts.some((p) => p.type === 'text' && p.text.trim());
    const waiting = message.streaming && parts.length === 0;
    const lastIsText = parts[parts.length - 1]?.type === 'text';

    return (
        <div className="group flex gap-3.5 animate-fade-in">
            <div className="pt-0.5"><VeyraMark size={26} /></div>
            <div className="min-w-0 flex-1">
                {waiting && (
                    <div className="flex h-7 items-center">
                        <span className="v-shimmer text-md font-medium">{message.status ?? 'Thinking'}</span>
                    </div>
                )}

                <div className="flex flex-col gap-2">
                    {parts.map((part, i) => part.type === 'tool'
                        ? <ToolStep key={part.id ?? i} step={part} />
                        : part.text.trim() && (
                            <div key={i} className="relative">
                                <Markdown text={part.text} />
                                {message.streaming && i === parts.length - 1 && <span className="ml-0.5 inline-block size-2 translate-y-[-2px] rounded-full bg-ink align-middle animate-[pulse-dot_1s_ease-in-out_infinite]" aria-hidden="true" />}
                            </div>
                        ))}
                    {message.streaming && parts.length > 0 && !lastIsText && (
                        <span className="v-shimmer text-sm font-medium">Working</span>
                    )}
                </div>

                {message.pending && !hasText && (
                    <p className="text-md text-tertiary">Waiting for the agent to pick this up.</p>
                )}

                {message.error && (
                    <div className="mt-2 flex items-start gap-2 rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger">
                        <AlertCircle size={15} className="mt-0.5 shrink-0" />
                        <span className="flex-1">{message.error}</span>
                        {onRetry && isLast && <button type="button" className="shrink-0 font-medium underline-offset-2 hover:underline" onClick={onRetry}>Try again</button>}
                    </div>
                )}

                {message.stopped && (
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-tertiary"><Square size={10} fill="currentColor" /> Stopped</p>
                )}

                {!message.streaming && hasText && <Actions message={message} onRetry={isLast ? onRetry : undefined} />}
            </div>
        </div>
    );
}

function Actions({ message, onRetry }: { message: ChatMessage; onRetry?: () => void }) {
    const [copied, setCopied] = useState(false);
    const text = partsOf(message).filter((p) => p.type === 'text').map((p) => (p as { text: string }).text).join('').trim();
    return (
        <div className={`mt-2 flex items-center gap-0.5 transition-opacity ${onRetry ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'}`}>
            <IconAction label={copied ? 'Copied' : 'Copy'} onClick={() => { void navigator.clipboard.writeText(text); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
            </IconAction>
            {onRetry && <IconAction label="Retry" onClick={onRetry}><RotateCcw size={14} /></IconAction>}
            {message.model && <span className="ml-2 text-2xs text-disabled">{message.model}</span>}
        </div>
    );
}

function IconAction({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
    return (
        <button type="button" aria-label={label} title={label} onClick={onClick}
            className="flex size-7 items-center justify-center rounded-sm text-tertiary transition-colors hover:bg-surface-hover hover:text-primary">
            {children}
        </button>
    );
}

/**
 * One tool call as a quiet line: a spinner and a shimmering verb while it
 * runs, a check and the past tense when it is done. What came back is one
 * click away, not in the way.
 */
function ToolStep({ step }: { step: ToolPart }) {
    const [open, setOpen] = useState(false);
    const running = step.status === 'running';
    const failed = step.status === 'error';
    const expandable = !running && !!step.summary;

    return (
        <div className="text-sm">
            <button type="button" disabled={!expandable} onClick={() => setOpen((o) => !o)}
                className="group/step flex max-w-full items-center gap-2 rounded-sm py-0.5 text-left disabled:cursor-default">
                <span className="flex size-4 shrink-0 items-center justify-center">
                    {running ? <Loader2 size={13} className="animate-spin text-tertiary" />
                        : failed ? <AlertCircle size={13} className="text-danger" />
                        : <Check size={13} className="text-tertiary" />}
                </span>
                <span className={running ? 'v-shimmer font-medium' : failed ? 'font-medium text-danger' : 'font-medium text-secondary'}>{step.label ?? step.name}</span>
                {step.detail && <span className="truncate text-tertiary">{step.detail}</span>}
                {step.expert_name && step.name !== 'switch_expert' && <span className="shrink-0 rounded-sm bg-surface-sunken px-1.5 text-2xs font-medium text-tertiary" title="The expert that ran this step">{step.expert_name}</span>}
                {!running && typeof step.ms === 'number' && <span className="shrink-0 text-2xs text-disabled tabular-nums">{step.ms < 1000 ? `${step.ms} ms` : `${(step.ms / 1000).toFixed(1)} s`}</span>}
                {expandable && <ChevronRight size={13} className={`shrink-0 text-disabled transition-transform group-hover/step:text-tertiary ${open ? 'rotate-90' : ''}`} />}
            </button>
            {open && step.summary && (
                <div className="mt-1 mb-1 ml-6 max-h-60 overflow-y-auto rounded-md border border-border bg-surface-sunken px-3 py-2 text-xs leading-relaxed text-secondary whitespace-pre-wrap animate-fade-in" dir="auto">
                    {step.summary}
                </div>
            )}
        </div>
    );
}
