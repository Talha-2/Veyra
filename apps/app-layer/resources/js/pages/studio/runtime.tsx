import { Head, Link, useForm } from '@inertiajs/react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { EditorWell } from '../../components/studio-capability/editor-well';
import { SaveBar } from '../../components/studio/form';
import { Group, PageStack, Panel, Stacked } from '../../components/studio/space';
import { Callout, SearchField } from '../../components/ui/kit';
import { PageHeader } from '../../components/ui/page';
import { Badge } from '../../components/ui/primitives';
import StudioLayout from '../../layouts/studio-layout';

type Effort = 'low' | 'medium' | 'high' | null;
interface Props {
    runtime: { taker_prompt: string | null; worker_prompt: string | null; taker_model: string | null; worker_model: string | null; worker_reasoning_effort: Effort; action_ids: number[] };
    all_actions: { id: number; name: string; description: string; kind: string; durable: boolean }[];
    legacy_profiles: { id: number; name: string; runtime: string }[];
}

export default function Runtime({ runtime, all_actions, legacy_profiles }: Props) {
    const { data, setData, patch, errors, processing, isDirty, reset, recentlySuccessful } = useForm({
        taker_prompt: runtime.taker_prompt ?? '', worker_prompt: runtime.worker_prompt ?? '',
        taker_model: runtime.taker_model ?? '', worker_model: runtime.worker_model ?? '',
        worker_reasoning_effort: runtime.worker_reasoning_effort, action_ids: runtime.action_ids,
    });
    const [query, setQuery] = useState('');
    const actions = all_actions.filter(action => [action.name, action.description, action.kind].some(value => (value ?? '').toLowerCase().includes(query.trim().toLowerCase())));
    const submit = (event: FormEvent) => { event.preventDefault(); patch('/studio/runtime', { preserveScroll: true }); };
    return <form onSubmit={submit}>
        <Head title="Core runtime" />
        <PageHeader title="Core runtime" description="The taker handles the conversation. The worker follows shared skills and carries out permitted actions. Both work with zero experts." actions={<Link href="/studio/experts" className="v-btn v-btn--quiet">Optional experts</Link>} />
        <PageStack>
            {recentlySuccessful && <div role="status"><Callout tone="success">Core runtime saved. New conversations use these settings.</Callout></div>}
            <div className="@container">
                <div className="grid items-start gap-6 @min-[1180px]:grid-cols-2">
                    <Panel title="Taker" description="Owns the customer conversation, gathers missing information and reports verified results from the worker. It has no durable action grants.">
                        <Stacked label="Conversation instructions" htmlFor="taker-prompt" error={errors.taker_prompt}><EditorWell id="taker-prompt" value={data.taker_prompt} onChange={value => setData('taker_prompt', value)} max={20000} minRows={6} /></Stacked>
                        <Stacked label="Taker model" htmlFor="taker-model" error={errors.taker_model} hint="Use provider:model. Leave blank to use the configured default."><input id="taker-model" className="v-field" value={data.taker_model} onChange={event => setData('taker_model', event.target.value)} maxLength={120} placeholder="provider:model" /></Stacked>
                    </Panel>
                    <Panel title="Worker" description="Executes enabled shared skills in its own context. It can delegate focused tasks to enabled experts when their specialty fits.">
                        <Stacked label="Operational instructions" htmlFor="worker-prompt" error={errors.worker_prompt}><EditorWell id="worker-prompt" value={data.worker_prompt} onChange={value => setData('worker_prompt', value)} max={20000} minRows={6} /></Stacked>
                        <div className="grid gap-5 @min-[560px]:grid-cols-2">
                            <Stacked label="Worker model" htmlFor="worker-model" error={errors.worker_model} hint="Use provider:model. Leave blank to use the configured default."><input id="worker-model" className="v-field" value={data.worker_model} onChange={event => setData('worker_model', event.target.value)} maxLength={120} placeholder="provider:model" /></Stacked>
                            <Stacked label="Reasoning effort" htmlFor="worker-effort" error={errors.worker_reasoning_effort} hint="Higher effort gives supported models more time to reason."><select id="worker-effort" className="v-field" value={data.worker_reasoning_effort ?? ''} onChange={event => setData('worker_reasoning_effort', (event.target.value || null) as Effort)}><option value="">Model default</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></Stacked>
                        </div>
                        <p className="text-base leading-relaxed text-secondary">Shared skills are discovered automatically. Reading a skill does not grant an action. <Link href="/studio/skills" className="text-accent-text hover:underline">Manage the shared library</Link>.</p>
                    </Panel>
                </div>
            </div>
            <Panel title="Worker action permissions" description="Choose the actions the core worker may use. Approval rules, customer scoping and disabled action settings still apply." aside={<Badge>{data.action_ids.length} granted</Badge>}>
                <SearchField value={query} onChange={setQuery} placeholder="Find an action" className="w-full sm:max-w-xl" />
                {errors.action_ids && <Callout tone="danger">{errors.action_ids}</Callout>}
                {actions.length === 0 ? <p className="py-5 text-base text-secondary">{all_actions.length === 0 ? 'No actions available. Connect an integration to add actions.' : 'No actions match your search.'}</p> : <ul className="divide-y divide-border">{actions.map(action => <li key={action.id}><label className="flex cursor-pointer items-start gap-4 py-5">
                    <input type="checkbox" className="mt-1 shrink-0" checked={data.action_ids.includes(action.id)} disabled={processing} onChange={() => setData('action_ids', data.action_ids.includes(action.id) ? data.action_ids.filter(id => id !== action.id) : [...data.action_ids, action.id])} />
                    <span className="min-w-0 flex-1"><span className="block break-words text-base font-medium text-primary">{action.name}</span><span className="mt-1 block max-w-[75ch] break-words text-base leading-relaxed text-secondary">{action.description || action.kind}</span></span><Badge tone={action.durable ? 'warning' : 'muted'}>{action.durable ? 'Writes' : 'Reads'}</Badge>
                </label></li>)}</ul>}
            </Panel>
            {legacy_profiles.length > 0 && <Group title="Preserved legacy profiles" description="Old profile settings remain recoverable here. Core runtime settings above determine the current conversation and worker behavior."><ul className="divide-y divide-border">{legacy_profiles.map(profile => <li key={profile.id}><Link href={`/studio/experts/${profile.id}`} className="flex flex-wrap justify-between gap-3 py-5 hover:text-accent-text"><span className="break-words font-medium">{profile.name}</span><span className="text-sm text-secondary">{profile.runtime} · View profile</span></Link></li>)}</ul></Group>}
        </PageStack>
        <SaveBar dirty={isDirty} processing={processing} onDiscard={() => reset()} label="Save core runtime" />
    </form>;
}
Runtime.layout = (page: ReactNode) => <StudioLayout width="wide">{page}</StudioLayout>;
