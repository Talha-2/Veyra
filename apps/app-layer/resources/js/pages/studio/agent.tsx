import { Head, Link, useForm } from '@inertiajs/react';
import { AlertTriangle, AudioLines, Info } from 'lucide-react';
import { Fragment, type FormEvent, type ReactNode } from 'react';

import { SectionNav } from '../../components/studio-agent/section-nav';
import { EditorWell } from '../../components/studio-capability/editor-well';
import { Cap, SaveBar, Toggle } from '../../components/studio/form';
import { Disclosure, PageStack, Panel, Stacked } from '../../components/studio/space';
import { COMING_SOON, ComingSoon } from '../../components/ui/coming-soon';
import { Callout } from '../../components/ui/kit';
import { PageHeader } from '../../components/ui/page';
import { Badge, Mono, StatusDot } from '../../components/ui/primitives';

interface Language {
    label: string; native: string; rtl: boolean;
    stt_multi: boolean; tts_low_latency: boolean; semantic_turns: boolean; caveats: string[];
}

interface ModelOption { ref: string; label: string; role: string }
interface Provider { id: string; label: string; configured: boolean; key_present?: boolean; error?: string | null; models: ModelOption[] }
interface Props {
    config: {
        display_name: string; persona: string | null; greeting: string | null;
        primary_language: string; additional_languages: string[] | null;
        voice_provider: string | null; voice_id: string | null;
        min_endpointing_ms: number; min_interruption_ms: number;
        allow_interruptions: boolean; semantic_turn_detection: boolean;
        max_call_seconds: number; record_calls: boolean;
        talker_model: string; worker_model: string;
    };
    profile: { name: string | null; description: string | null; industry: string | null; timezone: string; website: string | null; address: string | null };
    languages: Record<string, Language>;
    models: { providers: Provider[]; defaults: { talker: string; worker: string } };
}

const SECTIONS = [
    { id: 'identity', label: 'Identity' },
    { id: 'languages', label: 'Languages' },
    { id: 'models', label: 'Models' },
    { id: 'timing', label: 'Conversation timing' },
    { id: 'calls', label: 'Calls' },
    { id: 'business', label: 'Business profile' },
] as const;

function duration(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds <= 0) return '—';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m === 0) return `${s} sec`;
    if (m >= 60) {
        const h = Math.floor(m / 60);
        const rest = m % 60;
        return rest ? `${h} h ${rest} min` : `${h} h`;
    }
    return s ? `${m} min ${s} sec` : `${m} min`;
}

/**
 * Who the agent is and how it behaves on every call. A long settings form,
 * so a table of contents follows the scroll on wide screens, and each
 * section is its own roomy card with labels above the fields.
 */
export default function Agent({ config, profile, languages, models }: Props) {
    const form = useForm({
        ...config,
        additional_languages: config.additional_languages ?? [],
        profile,
    });
    const { data, setData, put, processing, errors, isDirty, reset } = form;
    const err = (key: string) => (errors as Record<string, string | undefined>)[key];

    const submit = (e: FormEvent) => {
        e.preventDefault();
        put('/studio/agent', { preserveScroll: true });
    };

    const toggleLanguage = (code: string) => {
        if (code === data.primary_language) return;
        setData('additional_languages',
            data.additional_languages.includes(code)
                ? data.additional_languages.filter((c) => c !== code)
                : [...data.additional_languages, code]);
    };

    const selected = [data.primary_language, ...data.additional_languages];
    const primary = languages[data.primary_language];
    const working = models.providers.filter((p) => p.configured);
    const rejected = models.providers.filter((p) => !p.configured && p.key_present);
    const endpointingRisky = !data.semantic_turn_detection && data.min_endpointing_ms <= 400;
    const setProfile = (key: keyof Props['profile'], value: string) => setData('profile', { ...data.profile, [key]: value });

    return (
        <form onSubmit={submit}>
            <Head title="Identity" />

            <PageHeader
                title="Identity"
                description="Who the agent is, what it speaks, which models it runs on and how it paces a conversation. Everything here applies to every call."
                meta={
                    <>
                        <Badge tone="accent">{primary?.label ?? data.primary_language} primary</Badge>
                        <Mono>{selected.length === 1 ? '1 language' : `${selected.length} languages`}</Mono>
                    </>
                }
                actions={
                    <Link href="/studio/voice" className="v-btn v-btn--quiet">
                        <AudioLines size={15} strokeWidth={1.9} />
                        Voice
                    </Link>
                }
            />

            <div className="@container">
                <div className="grid gap-12 @min-[1000px]:grid-cols-[180px_minmax(0,1fr)]">
                    <aside className="hidden pt-3 @min-[1000px]:block">
                        <SectionNav items={SECTIONS.map((s) => ({ ...s, meta: s.id === 'languages' ? selected.length : undefined }))} />
                    </aside>

                    <PageStack className="min-w-0">
                        <Panel id="identity" title="Identity" description="Injected into every call. The persona is read on every turn, so every sentence in it costs time.">
                            <Stacked label="Name" htmlFor="agent-name" hint="How it introduces itself, and the name callers use back." error={errors.display_name}>
                                <input id="agent-name" className="v-field max-w-sm" value={data.display_name} maxLength={60} onChange={(e) => setData('display_name', e.target.value)} />
                            </Stacked>
                            <Stacked label="Greeting" htmlFor="agent-greeting" hint="The first thing a caller hears. It is said before anything else has loaded, so it must not depend on who is calling.">
                                <EditorWell id="agent-greeting" value={data.greeting ?? ''} onChange={(v) => setData('greeting', v)} max={500} minRows={2} error={errors.greeting}
                                    placeholder="Thanks for calling. How can I help?" />
                            </Stacked>
                            <Stacked label="Persona" htmlFor="agent-persona" hint="Tone, boundaries, what it never does. A few sentences; procedures belong in skills.">
                                <EditorWell id="agent-persona" value={data.persona ?? ''} onChange={(v) => setData('persona', v)} max={2000} minRows={5} error={errors.persona}
                                    placeholder="Warm, brief, and never oversells. Confirms details back before booking anything." />
                            </Stacked>
                        </Panel>

                        <Panel
                            id="languages"
                            flush
                            title="Languages"
                            description="Tick the languages the agent speaks. They are not served equally, and this table says so before the first call does."
                            aside={<Badge tone="muted">{selected.length} of {Object.keys(languages).length} on</Badge>}
                        >
                            <div className="overflow-x-auto" style={{ borderTop: '1px solid var(--separator)' }}>
                                <table className="w-full min-w-160 border-collapse text-left">
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--separator)' }}>
                                            <HeadCell>Language</HeadCell>
                                            <HeadCell>Mixed speech</HeadCell>
                                            <HeadCell>Fast voice</HeadCell>
                                            <HeadCell>Semantic turns</HeadCell>
                                            <HeadCell align="right">Role</HeadCell>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {Object.entries(languages).map(([code, lang]) => {
                                            const isPrimary = code === data.primary_language;
                                            const on = selected.includes(code);
                                            const caveats = on && lang.caveats.length > 0;
                                            return (
                                                <Fragment key={code}>
                                                    <tr className="transition-colors hover:bg-surface-hover" style={{ borderTop: '1px solid var(--separator)', background: on ? 'color-mix(in srgb, var(--accent) 2.5%, transparent)' : undefined }}>
                                                        <Cell>
                                                            <label className={`flex items-center gap-3 ${isPrimary ? '' : 'cursor-pointer'}`}>
                                                                <input type="checkbox" checked={on} disabled={isPrimary} onChange={() => toggleLanguage(code)} aria-label={`Speak ${lang.label}`} />
                                                                <span className="text-base font-medium" style={{ color: on ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{lang.label}</span>
                                                                <span dir="auto" lang={lang.rtl ? code : undefined} className="text-sm text-tertiary">{lang.native}</span>
                                                            </label>
                                                        </Cell>
                                                        <Cell><Cap ok={lang.stt_multi} /></Cell>
                                                        <Cell><Cap ok={lang.tts_low_latency} /></Cell>
                                                        <Cell><Cap ok={lang.semantic_turns} /></Cell>
                                                        <Cell align="right">
                                                            {isPrimary ? (
                                                                <Badge tone="accent">Primary</Badge>
                                                            ) : on ? (
                                                                <button type="button" className="v-btn v-btn--ghost v-btn--sm"
                                                                    onClick={() => {
                                                                        setData((d) => ({
                                                                            ...d,
                                                                            primary_language: code,
                                                                            additional_languages: [...d.additional_languages.filter((c) => c !== code), d.primary_language],
                                                                        }));
                                                                    }}>
                                                                    Make primary
                                                                </button>
                                                            ) : (
                                                                <span className="text-sm text-tertiary">Off</span>
                                                            )}
                                                        </Cell>
                                                    </tr>
                                                    {caveats && (
                                                        <tr style={{ background: 'color-mix(in srgb, var(--accent) 2.5%, transparent)' }}>
                                                            <td colSpan={5} className="px-7 pb-4">
                                                                <ul className="ml-7 flex max-w-[72ch] flex-col gap-2 rounded-md px-4 py-3" style={{ background: 'var(--warning-subtle)' }}>
                                                                    {lang.caveats.map((c) => (
                                                                        <li key={c} className="flex gap-2 text-sm text-warning">
                                                                            <AlertTriangle size={14} strokeWidth={2} className="mt-0.75 shrink-0" aria-hidden="true" />
                                                                            <span>{c}</span>
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                            </td>
                                                        </tr>
                                                    )}
                                                </Fragment>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            <div className="px-7 pt-3 pb-5" style={{ borderTop: '1px solid var(--separator)' }}>
                                <Disclosure inset title="What the columns mean">
                                    <dl className="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-3">
                                        <Legend term="Mixed speech">Understands callers who switch languages mid-sentence, as people do with numbers and names.</Legend>
                                        <Legend term="Fast voice">Speaks on the realtime, low-latency voice tier. Without it the language runs on a slower engine.</Legend>
                                        <Legend term="Semantic turns">Waits for the end of a thought, not just for silence, before replying.</Legend>
                                    </dl>
                                </Disclosure>
                            </div>
                        </Panel>

                        <Panel
                            id="models"
                            title="Models"
                            description="Two models per call. The talker owns every word the caller hears and must answer in under a second; the worker runs skills and tools, never speaks, and can afford a bigger model."
                        >
                            {models.providers.length === 0 ? (
                                <Callout tone="info" icon={<Info size={16} strokeWidth={1.9} />} title="The agent layer is not connected">
                                    The models it can run are unknown until it is. Choices saved earlier still apply when it reconnects.
                                </Callout>
                            ) : (
                                <>
                                    <div className="grid gap-5 @min-[760px]:grid-cols-2">
                                        <Stacked label="Talker" htmlFor="talker-model" hint="Latency-critical. Small and fast wins." error={errors.talker_model}>
                                            <ModelPicker id="talker-model" value={data.talker_model} fallback={models.defaults.talker} role="talker" providers={models.providers} onChange={(v) => setData('talker_model', v)} />
                                        </Stacked>
                                        <Stacked label="Worker" htmlFor="worker-model" hint={<>Quality-critical. An expert can override it on <Link href="/studio/experts" className="text-accent-text hover:underline">its own page</Link>.</>} error={errors.worker_model}>
                                            <ModelPicker id="worker-model" value={data.worker_model} fallback={models.defaults.worker} role="worker" providers={models.providers} onChange={(v) => setData('worker_model', v)} />
                                        </Stacked>
                                    </div>
                                    <div className="border-t pt-3" style={{ borderColor: 'var(--separator)' }}>
                                        <Disclosure
                                            inset
                                            title="Providers"
                                            summary={
                                                <>
                                                    {working.length} of {models.providers.length} working
                                                    {rejected.length > 0 && <span className="text-danger"> · {rejected.length === 1 ? '1 key rejected' : `${rejected.length} keys rejected`}</span>}
                                                </>
                                            }
                                        >
                                            <p className="text-sm text-secondary">Keys live in the agent layer. A rejected key shows here instead of as a model that silently fails.</p>
                                            <ul className="flex flex-col">
                                                {models.providers.map((p) => (
                                                    <li key={p.id} className="flex min-h-12 items-center gap-3 border-t text-sm first:border-t-0" style={{ borderColor: 'var(--separator)' }}>
                                                        <StatusDot tone={p.configured ? 'success' : p.key_present ? 'danger' : 'muted'} />
                                                        <span className="w-32 shrink-0 font-medium text-primary">{p.label}</span>
                                                        <span className={`min-w-0 ${p.configured ? 'text-secondary' : p.key_present ? 'text-danger' : 'text-tertiary'}`}>
                                                            {p.configured ? `Working · ${p.models.length} models` : p.key_present ? `Key rejected${p.error ? `: ${p.error}` : ''}` : 'No key'}
                                                        </span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </Disclosure>
                                    </div>
                                </>
                            )}
                        </Panel>

                        <Panel id="timing" title="Conversation timing" description="The two numbers that decide whether the agent cuts people off or feels slow.">
                            <div className="grid gap-5 @min-[760px]:grid-cols-2">
                                <Stacked label="Endpointing wait" htmlFor="endpointing" hint="How long it waits after the caller stops before it speaks." error={errors.min_endpointing_ms}>
                                    <UnitInput id="endpointing" min={200} max={1500} step={50} unit="ms" value={data.min_endpointing_ms} onChange={(v) => setData('min_endpointing_ms', v)} />
                                </Stacked>
                                <Stacked label="Interruption threshold" htmlFor="interruption" hint="A barge-in shorter than this is a cough or an “mm-hm”." error={errors.min_interruption_ms}>
                                    <UnitInput id="interruption" min={200} max={2000} step={50} unit="ms" value={data.min_interruption_ms} onChange={(v) => setData('min_interruption_ms', v)} />
                                </Stacked>
                            </div>
                            {endpointingRisky && (
                                <Callout tone="warning" icon={<AlertTriangle size={16} strokeWidth={1.9} />}>
                                    Without semantic turn detection, a wait of {data.min_endpointing_ms}ms will cut callers off mid-thought. 400ms is the floor a semantic turn detector makes safe.
                                </Callout>
                            )}
                            <div className="border-t pt-5" style={{ borderColor: 'var(--separator)' }}>
                                <Toggle checked={data.semantic_turn_detection} onChange={(v) => setData('semantic_turn_detection', v)}
                                    label="Semantic turn detection"
                                    hint="Extends the wait only when the sentence sounds unfinished. Languages without it fall back to silence timing."
                                />
                                <Toggle checked={data.allow_interruptions} onChange={(v) => setData('allow_interruptions', v)}
                                    label="Allow interruptions"
                                    hint="Callers can talk over the agent to stop it, as they would a person."
                                    caution={!data.allow_interruptions ? 'Callers will be unable to stop the agent mid-sentence. Only disable this per skill for disclosures, never globally.' : undefined}
                                />
                            </div>
                        </Panel>

                        <Panel id="calls" title="Calls" description="Limits and records that apply to every call on every number.">
                            {/* The voice worker does not read max_call_seconds or record_calls yet: nothing enforces a limit or records audio. */}
                            <Stacked label={<span className="inline-flex items-center gap-2">Maximum length<ComingSoon /></span>} htmlFor="max-call" hint="The agent starts wrapping up as this approaches, then ends the call." error={errors.max_call_seconds}>
                                <div className="flex flex-wrap items-center gap-4">
                                    <UnitInput id="max-call" min={60} max={7200} step={60} unit="sec" value={data.max_call_seconds} onChange={(v) => setData('max_call_seconds', v)} disabled />
                                    <span className="text-sm text-secondary tabular-nums">{duration(data.max_call_seconds)}</span>
                                </div>
                            </Stacked>
                            <div className="border-t pt-5" style={{ borderColor: 'var(--separator)' }}>
                                <Toggle checked={data.record_calls} onChange={(v) => setData('record_calls', v)} label="Record calls" hint="Recordings appear on the conversation in Desk. Some regions require telling the caller." soon />
                            </div>
                        </Panel>

                        <Panel id="business" title="Business profile" description="Facts the agent must always have to hand. Anything longer belongs in Knowledge, which is looked up only when needed.">
                            <div className="grid gap-5 @min-[760px]:grid-cols-2">
                                <Stacked label="Business name" htmlFor="biz-name" error={err('profile.name')}>
                                    <input id="biz-name" className="v-field" value={data.profile.name ?? ''} onChange={(e) => setProfile('name', e.target.value)} />
                                </Stacked>
                                <Stacked label="Industry" htmlFor="biz-industry" error={err('profile.industry')}>
                                    <input id="biz-industry" className="v-field" value={data.profile.industry ?? ''} onChange={(e) => setProfile('industry', e.target.value)} />
                                </Stacked>
                                <Stacked label="Timezone" htmlFor="biz-tz" error={err('profile.timezone')}>
                                    <input id="biz-tz" className="v-field" value={data.profile.timezone} onChange={(e) => setProfile('timezone', e.target.value)} placeholder="Asia/Karachi" />
                                </Stacked>
                                <Stacked label="Website" htmlFor="biz-web" error={err('profile.website')}>
                                    <input id="biz-web" type="url" className="v-field" value={data.profile.website ?? ''} onChange={(e) => setProfile('website', e.target.value)} placeholder="https://" />
                                </Stacked>
                            </div>
                            <Stacked label="Address" htmlFor="biz-address" hint="Read out when a caller asks where you are." error={err('profile.address')}>
                                <textarea id="biz-address" className="v-field text-md" rows={2} value={data.profile.address ?? ''} onChange={(e) => setProfile('address', e.target.value)} dir="auto" />
                            </Stacked>
                            <Stacked label="Description" htmlFor="biz-description" hint="One paragraph. It is in the prompt on every call.">
                                <EditorWell id="biz-description" value={data.profile.description ?? ''} onChange={(v) => setProfile('description', v)} max={2000} minRows={3} error={err('profile.description')} />
                            </Stacked>
                        </Panel>
                    </PageStack>
                </div>
            </div>

            <SaveBar processing={processing} dirty={isDirty} onDiscard={() => reset()} />
        </form>
    );
}

function HeadCell({ children, align = 'left' }: { children: ReactNode; align?: 'left' | 'right' }) {
    return (
        <th scope="col" className="h-11 px-4 text-xs font-medium whitespace-nowrap text-tertiary first:pl-7 last:pr-7" style={{ textAlign: align }}>
            {children}
        </th>
    );
}

function Cell({ children, align = 'left' }: { children: ReactNode; align?: 'left' | 'right' }) {
    return (
        <td className="h-14 px-4 text-sm first:pl-7 last:pr-7" style={{ textAlign: align }}>
            {children}
        </td>
    );
}

function Legend({ term, children }: { term: string; children: ReactNode }) {
    return (
        <div>
            <dt className="font-medium text-primary">{term}</dt>
            <dd className="mt-1 text-secondary">{children}</dd>
        </div>
    );
}

/** A number field with its unit inside the well, so the value never floats unitless. */
function UnitInput({ id, value, onChange, unit, min, max, step, disabled = false }: { id?: string; value: number; onChange: (v: number) => void; unit: string; min: number; max: number; step: number; disabled?: boolean }) {
    return (
        <div className="relative w-40" title={disabled ? COMING_SOON : undefined}>
            <input id={id} type="number" min={min} max={max} step={step} className="v-field pr-12 tabular-nums disabled:cursor-not-allowed disabled:opacity-55" value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} />
            <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-sm text-tertiary">{unit}</span>
        </div>
    );
}

function ModelPicker({ id, value, fallback, role, providers, onChange }: { id: string; value: string; fallback: string; role: string; providers: Provider[]; onChange: (v: string) => void }) {
    return (
        <select id={id} className="v-field" value={value} onChange={(e) => onChange(e.target.value)}>
            <option value="">Agent layer default ({fallback || 'unset'})</option>
            {providers.map((p) => (
                <optgroup key={p.id} label={`${p.label}${p.configured ? '' : p.key_present ? ' — key rejected' : ' — no key'}`}>
                    {p.models.filter((m) => m.role === role || m.role === 'both').map((m) => <option key={m.ref} value={m.ref} disabled={!p.configured}>{m.label}</option>)}
                </optgroup>
            ))}
        </select>
    );
}
