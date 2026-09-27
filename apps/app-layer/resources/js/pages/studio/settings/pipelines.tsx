import { router, useForm } from '@inertiajs/react';
import { ChevronDown, ChevronUp, GitBranch, Plus, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { StageStrip, SwatchInput } from '../../../components/studio-ops/color-swatch';
import { Field, SaveBar } from '../../../components/studio/form';
import SettingsShell from '../../../components/studio/settings-shell';
import Dialog from '../../../components/ui/dialog';
import { Card, CardBody } from '../../../components/ui/kit';
import { Badge, EmptyState, Eyebrow } from '../../../components/ui/primitives';

interface Pipeline { id: number; name: string; is_default: boolean; leads_count: number; stages: { id: number; name: string; color: string; position: number }[] }

export default function PipelineSettings({ pipelines }: { pipelines: Pipeline[] }) {
    const [creating, setCreating] = useState(false);

    return (
        <SettingsShell
            title="Lead pipelines"
            description="The stages a lead moves through on the Desk board, left to right."
            actions={<button type="button" className="v-btn v-btn--primary" onClick={() => setCreating(true)}><Plus size={15} strokeWidth={2} />New pipeline</button>}
        >
            {pipelines.length === 0 ? (
                <Card>
                    <EmptyState icon={<GitBranch size={20} strokeWidth={1.8} />} title="No pipelines yet">
                        A pipeline is the row of stages leads move through, from New to Won or Lost. Create one and it starts with four stages you can rename.
                    </EmptyState>
                </Card>
            ) : (
                pipelines.map((p) => <PipelineEditor key={p.id} pipeline={p} />)
            )}
            <NewPipelineDialog open={creating} onClose={() => setCreating(false)} />
        </SettingsShell>
    );
}

function NewPipelineDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const [name, setName] = useState('');
    const [processing, setProcessing] = useState(false);
    const submit = (e: FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;
        router.post('/studio/settings/pipelines', { name }, { preserveScroll: true, onStart: () => setProcessing(true), onFinish: () => setProcessing(false), onSuccess: () => { setName(''); onClose(); } });
    };

    return (
        <Dialog open={open} onClose={onClose} title="New pipeline" description="It starts with New, Contacted, Won and Lost. Rename, recolour or reorder them after.">
            <form onSubmit={submit}>
                <Field label="Name">
                    <input className="v-field" placeholder="Enterprise sales" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
                </Field>
                <div className="mt-6 flex justify-end gap-2">
                    <button type="button" className="v-btn v-btn--ghost" onClick={onClose}>Cancel</button>
                    <button type="submit" className="v-btn v-btn--primary" disabled={processing || !name.trim()}>{processing ? 'Creating…' : 'Create pipeline'}</button>
                </div>
            </form>
        </Dialog>
    );
}

function PipelineEditor({ pipeline }: { pipeline: Pipeline }) {
    const { data, setData, patch, processing, isDirty, reset } = useForm({ name: pipeline.name, stages: pipeline.stages.map((s) => ({ id: s.id as number | null, name: s.name, color: s.color })) });
    const submit = (e: FormEvent) => { e.preventDefault(); patch(`/studio/settings/pipelines/${pipeline.id}`, { preserveScroll: true }); };
    const setStage = (i: number, p: Partial<{ name: string; color: string }>) => setData('stages', data.stages.map((s, j) => j === i ? { ...s, ...p } : s));
    const move = (i: number, dir: -1 | 1) => { const s = [...data.stages]; const j = i + dir; if (j < 0 || j >= s.length) return; [s[i], s[j]] = [s[j], s[i]]; setData('stages', s); };
    const removed = pipeline.stages.filter((s) => !data.stages.some((d) => d.id === s.id));

    return (
        <form onSubmit={submit} className="mb-6">
            <Card>
                <header className="flex flex-wrap items-center gap-3 px-5 pt-4 pb-3.5" style={{ borderBottom: '1px solid var(--separator)' }}>
                    <input
                        className="-ml-2 h-9 min-w-0 flex-1 rounded-md bg-transparent px-2 text-md font-semibold text-primary transition-colors hover:bg-surface-hover focus:bg-surface focus:outline-none"
                        value={data.name}
                        onChange={(e) => setData('name', e.target.value)}
                        aria-label="Pipeline name"
                    />
                    {pipeline.is_default && <Badge tone="accent">Default</Badge>}
                    <Badge>{pipeline.leads_count} {pipeline.leads_count === 1 ? 'lead' : 'leads'}</Badge>
                </header>

                <CardBody className="pt-5">
                    <Eyebrow className="mb-2.5 block">Preview</Eyebrow>
                    <StageStrip stages={data.stages} />
                </CardBody>

                <div style={{ borderTop: '1px solid var(--separator)' }}>
                    <div className="flex items-center justify-between px-5 pt-4 pb-2">
                        <Eyebrow>Stages</Eyebrow>
                        <span className="text-xs text-tertiary tabular-nums">{data.stages.length} of 12</span>
                    </div>
                    <ol className="px-3 pb-2">
                        {data.stages.map((s, i) => (
                            <li key={s.id ?? `new-${i}`} className="group flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-surface-hover">
                                <span className="w-5 shrink-0 text-center text-xs text-tertiary tabular-nums">{i + 1}</span>
                                <SwatchInput value={s.color} onChange={(c) => setStage(i, { color: c })} label={`Colour of ${s.name || 'stage'}`} size={24} />
                                <input className="v-field h-8 max-w-75 flex-1 text-sm" value={s.name} onChange={(e) => setStage(i, { name: e.target.value })} aria-label={`Stage ${i + 1} name`} />
                                {s.id === null && <Badge tone="info">New</Badge>}
                                <div className="flex-1" />
                                <div className="flex items-center gap-0.5 opacity-60 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                                    <button type="button" className="v-btn v-btn--ghost v-btn--icon size-7" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up"><ChevronUp size={15} strokeWidth={2} /></button>
                                    <button type="button" className="v-btn v-btn--ghost v-btn--icon size-7" onClick={() => move(i, 1)} disabled={i === data.stages.length - 1} aria-label="Move down"><ChevronDown size={15} strokeWidth={2} /></button>
                                    <button type="button" className="v-btn v-btn--ghost v-btn--icon size-7" onClick={() => data.stages.length > 1 && setData('stages', data.stages.filter((_, j) => j !== i))} disabled={data.stages.length <= 1} aria-label="Remove stage"><X size={15} strokeWidth={2} /></button>
                                </div>
                            </li>
                        ))}
                    </ol>
                    <div className="flex flex-wrap items-center gap-3 px-5 pb-4">
                        <button type="button" className="v-btn v-btn--ghost v-btn--sm -ml-2" disabled={data.stages.length >= 12} onClick={() => setData('stages', [...data.stages, { id: null, name: 'New stage', color: '#71717a' }])}>
                            <Plus size={14} strokeWidth={2} />Add stage
                        </button>
                        {removed.length > 0 && (
                            <span className="text-xs text-warning">
                                Removing {removed.map((s) => s.name).join(', ')}. Leads there move to {data.stages[0]?.name || 'the first stage'} when you save.
                            </span>
                        )}
                    </div>
                </div>
            </Card>
            {/* Mounted only while needed: with several pipelines on the page, a
                hidden bar per card would leave a gap under each one. */}
            {(isDirty || processing) && <SaveBar processing={processing} dirty={isDirty} label="Save pipeline" onDiscard={() => reset()} />}
        </form>
    );
}
