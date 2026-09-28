import { AlertCircle, Check, ChevronRight, Wrench } from 'lucide-react';
import { useState } from 'react';

import type { AgentStep } from '../../types/desk';

function duration(ms: number): string {
    return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

/**
 * "What the agent did": one quiet line above an agent reply that opens to
 * the tools it ran, in order, the same way the Ask page draws them. What a
 * tool returned is one more click away.
 */
export default function AgentSteps({ steps, align = 'start' }: { steps: AgentStep[]; align?: 'start' | 'end' }) {
    const [open, setOpen] = useState(false);
    if (steps.length === 0) return null;

    const failed = steps.filter((s) => s.status === 'error').length;
    const names = [...new Set(steps.map((s) => s.label ?? s.name))];

    return (
        <div className={`mb-1.5 flex w-full flex-col ${align === 'end' ? 'items-end' : 'items-start'}`}>
            <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
                className="group/steps flex max-w-full items-center gap-1.5 rounded-sm px-1 py-0.5 text-xs whitespace-nowrap text-tertiary transition-colors hover:text-secondary">
                <Wrench size={12} strokeWidth={2} className="shrink-0" aria-hidden="true" />
                <span className="shrink-0 font-medium text-secondary">What the agent did</span>
                <span className="shrink-0" aria-hidden="true">·</span>
                <span className="min-w-0 truncate">{names.join(', ')}</span>
                <span className="shrink-0 tabular-nums">· {steps.length} {steps.length === 1 ? 'step' : 'steps'}</span>
                {failed > 0 && <span className="shrink-0 text-danger">· {failed} failed</span>}
                <ChevronRight size={12} strokeWidth={2.2} className={`shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden="true" />
            </button>

            {open && (
                <ol className="mt-1 w-full max-w-[520px] animate-fade-in rounded-md px-3 py-2" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
                    {steps.map((step, i) => <Step key={step.id || i} step={step} />)}
                </ol>
            )}
        </div>
    );
}

function Step({ step }: { step: AgentStep }) {
    const [open, setOpen] = useState(false);
    const failed = step.status === 'error';
    const expandable = !!step.summary;

    return (
        <li className="text-sm">
            <button type="button" disabled={!expandable} onClick={() => setOpen((v) => !v)} aria-expanded={expandable ? open : undefined}
                className="group/step flex w-full min-w-0 items-center gap-2 rounded-sm py-1 text-left disabled:cursor-default">
                <span className="flex size-4 shrink-0 items-center justify-center">
                    {failed ? <AlertCircle size={13} className="text-danger" /> : <Check size={13} className="text-tertiary" />}
                </span>
                <span className={`shrink-0 font-medium ${failed ? 'text-danger' : 'text-secondary'}`}>{step.label ?? step.name}</span>
                {step.detail && <span className="min-w-0 truncate text-tertiary" dir="auto">{step.detail}</span>}
                <span className="flex-1" />
                {step.ms != null && <span className="shrink-0 text-2xs text-tertiary tabular-nums">{duration(step.ms)}</span>}
                {expandable && <ChevronRight size={13} className={`shrink-0 text-tertiary transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden="true" />}
            </button>
            {open && step.summary && (
                <div className="mt-0.5 mb-1.5 ml-6 max-h-56 animate-fade-in overflow-y-auto rounded-sm px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap text-secondary"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} dir="auto">
                    {step.summary}
                </div>
            )}
        </li>
    );
}
