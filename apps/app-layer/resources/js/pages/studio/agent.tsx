import { Head, Link, useForm } from '@inertiajs/react';
import { AlertTriangle, AudioLines, Info } from 'lucide-react';
import type { FormEvent, ReactNode } from 'react';

import { SectionNav } from '../../components/studio-agent/section-nav';
import { Cap, Field, SaveBar, Section, Toggle } from '../../components/studio/form';
import { Callout } from '../../components/ui/kit';
import { PageHeader, Th, Td } from '../../components/ui/page';
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
 * so it reads like System Settings: a table of contents on the left that
 * follows the scroll, and sections of label-left, control-right rows.
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
    const endpointingRisky = !data.semantic_turn_detection && data.min_endpointing_ms <= 400;

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
                        <Mono>·</Mono>
                        <Mono>{models.providers.length === 0 ? 'Agent layer offline' : `${working.length} of ${models.providers.length} model providers working`}</Mono>
                    </>
                }
                actions={
                    <Link href="/studio/voice" className="v-btn v-btn--quiet">
                        <AudioLines size={15} strokeWidth={1.9} />
                        Voice
                    </Link>
                }
            />

            <div className="grid gap-8 lg:grid-cols-[168px_minmax(0,1fr)]">
                <aside className="hidden lg:block">
                    <SectionNav
                        items={SECTIONS.map((s) => ({ ...s, meta: s.id === 'languages' ? selected.length : undefined }))}
                    />
                </aside>

                <div className="min-w-0">
                    <Section id="identity" title="Identity" description="Injected into every call. The persona is read on every turn, so every sentence in it costs time.">
                        <Field inline label="Name" hint="How it introduces itself, and the name callers use back." error={errors.display_name}>
                            <input className="v-field max-w-[320px]" value={data.display_name} maxLength={60} onChange={(e) => setData('display_name', e.target.value)} />
                        </Field>
                        <Field inline label="Greeting" hint="The first thing a caller hears. It is said before anything else has loaded, so it must not depend on who is calling." error={errors.greeting}>
                            <textarea className="v-field h-auto" rows={2} maxLength={500} value={data.greeting ?? ''} onChange={(e) => setData('greeting', e.target.value)} dir="auto" placeholder="Thanks for calling. How can I help?" />
                            <Counter value={data.greeting?.length ?? 0} max={500} />
                        </Field>
                        <Field inline label="Persona" hint="Tone, boundaries, what it never does. A few sentences; procedures belong in skills." error={errors.persona}>
                            <textarea className="v-field h-auto" rows={5} maxLength={2000} value={data.persona ?? ''} onChange={(e) => setData('persona', e.target.value)} dir="auto" />
                            <Counter value={data.persona?.length ?? 0} max={2000} />
                        </Field>
                    </Section>

                    <Section
                        id="languages"
                        flush
                        title="Languages"
                        description="What each language actually gets. They are not served equally, and this table says so before the first call does."
                        aside={<Badge tone="muted">{selected.length} of {Object.keys(languages).length} on</Badge>}
                    >
                        <div className="overflow-x-auto" style={{ borderTop: '1px solid var(--separator)' }}>
                            <table className="w-full min-w-160 border-collapse text-left">
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--separator)' }}>
                                        <Th>Language</Th>
                                        <Th>Mixed-language speech</Th>
                                        <Th>Low-latency voice</Th>
                                        <Th>Semantic turns</Th>
                                        <Th align="right">Role</Th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {Object.entries(languages).map(([code, lang]) => {
                                        const isPrimary = code === data.primary_language;
                                        const on = selected.includes(code);
                                        return (
                                            <tr key={code} className="align-top transition-colors first:border-t-0 hover:bg-surface-hover" style={{ borderTop: '1px solid var(--separator)' }}>
                                                <Td>
                                                    <label className={`flex items-center gap-2.5 ${isPrimary ? '' : 'cursor-pointer'}`}>
                                                        <input type="checkbox" checked={on} disabled={isPrimary} onChange={() => toggleLanguage(code)} aria-label={`Speak ${lang.label}`} />
                                                        <span className="font-medium" style={{ color: on ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{lang.label}</span>
                                                        <span dir="auto" lang={lang.rtl ? code : undefined} className="text-tertiary">{lang.native}</span>
                                                    </label>
                                                    {lang.caveats.length > 0 && on && (
                                                        <ul className="mt-2 ml-6.25 flex max-w-[52ch] flex-col gap-1.5">
                                                            {lang.caveats.map((c) => (
                                                                <li key={c} className="flex gap-1.5 text-xs text-warning">
                                                                    <AlertTriangle size={12} strokeWidth={2} className="mt-0.75 shrink-0" aria-hidden="true" />
                                                                    <span>{c}</span>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    )}
                                                </Td>
                                                <Td><Cap ok={lang.stt_multi} /></Td>
                                                <Td><Cap ok={lang.tts_low_latency} /></Td>
                                                <Td><Cap ok={lang.semantic_turns} /></Td>
                                                <Td align="right">
                                                    {isPrimary ? (
                                                        <Badge tone="accent">Primary</Badge>
                                                    ) : on ? (
                                                        <button type="button" className="v-btn v-btn--ghost v-btn--sm -my-1"
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
                                                </Td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <dl className="grid gap-x-6 gap-y-3 px-6 py-4 text-xs sm:grid-cols-3" style={{ borderTop: '1px solid var(--separator)', background: 'var(--bg-subtle)', borderBottomLeftRadius: 'var(--radius-lg)', borderBottomRightRadius: 'var(--radius-lg)' }}>
                            <Legend term="Mixed-language speech">Understands callers who switch languages mid-sentence, as people do with numbers and names.</Legend>
                            <Legend term="Low-latency voice">Speaks on the realtime voice tier. Without it the language runs on a slower engine.</Legend>
                            <Legend term="Semantic turns">Waits for the end of a thought, not just for silence, before replying.</Legend>
                        </dl>
                    </Section>

                    <Section
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
                                <Field inline label="Talker" hint="Latency-critical. Small and fast wins: this is time to the caller’s first word." error={errors.talker_model}>
                                    <ModelPicker label="Talker model" value={data.talker_model} fallback={models.defaults.talker} role="talker" providers={models.providers} onChange={(v) => setData('talker_model', v)} />
                                </Field>
                                <Field inline label="Worker" hint={<>Quality-critical: tool use and long instructions. An expert can override it on <Link href="/studio/experts" className="text-accent-text hover:underline">its own page</Link>.</>} error={errors.worker_model}>
                                    <ModelPicker label="Worker model" value={data.worker_model} fallback={models.defaults.worker} role="worker" providers={models.providers} onChange={(v) => setData('worker_model', v)} />
                                </Field>
                                <Field inline label="Providers" hint="Keys live in the agent layer. A rejected key shows here instead of as a model that silently fails.">
                                    <ul className="flex flex-col gap-2">
                                        {models.providers.map((p) => (
                                            <li key={p.id} className="flex items-center gap-2.5 text-sm">
                                                <StatusDot tone={p.configured ? 'success' : p.key_present ? 'danger' : 'muted'} />
                                                <span className="font-medium text-primary">{p.label}</span>
                                                <span className={p.configured ? 'text-tertiary' : p.key_present ? 'text-danger' : 'text-tertiary'}>
                                                    {p.configured ? `Working · ${p.models.length} models` : p.key_present ? `Key rejected${p.error ? `: ${p.error}` : ''}` : 'No key'}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </Field>
                            </>
                        )}
                    </Section>

                    <Section
                        id="timing"
                        title="Conversation timing"
                        description="The two numbers that decide whether the agent cuts people off or feels slow."
                    >
                        <Field inline label="Endpointing wait" hint="How long the agent waits after the caller stops before it speaks. 400ms is the floor a semantic turn detector makes safe; without one, go higher." error={errors.min_endpointing_ms}>
                            <UnitInput min={200} max={1500} step={50} unit="ms" value={data.min_endpointing_ms} onChange={(v) => setData('min_endpointing_ms', v)} />
                            {endpointingRisky && (
                                <p className="mt-2 flex gap-1.5 text-sm text-warning">
                                    <AlertTriangle size={14} strokeWidth={2} className="mt-0.75 shrink-0" aria-hidden="true" />
                                    Without semantic turn detection, a wait this short will cut callers off mid-thought.
                                </p>
                            )}
                        </Field>
                        <Field inline label="Interruption threshold" hint="A barge-in shorter than this is treated as a cough or an “mm-hm”, and the agent keeps talking." error={errors.min_interruption_ms}>
                            <UnitInput min={200} max={2000} step={50} unit="ms" value={data.min_interruption_ms} onChange={(v) => setData('min_interruption_ms', v)} />
                        </Field>
                        <Toggle checked={data.semantic_turn_detection} onChange={(v) => setData('semantic_turn_detection', v)}
                            label="Semantic turn detection"
                            hint="Extends the wait only when the sentence sounds unfinished. Languages without it (see Languages) fall back to silence timing regardless."
                        />
                        <Toggle checked={data.allow_interruptions} onChange={(v) => setData('allow_interruptions', v)}
                            label="Allow interruptions"
                            hint="Callers can talk over the agent to stop it, as they would a person."
                            caution={!data.allow_interruptions ? 'Callers will be unable to stop the agent mid-sentence. Only disable this per skill for disclosures, never globally.' : undefined}
                        />
                    </Section>

                    <Section id="calls" title="Calls" description="Limits and records that apply to every call on every number.">
                        <Field inline label="Maximum length" hint="The agent starts wrapping up as this approaches, then ends the call." error={errors.max_call_seconds}>
                            <div className="flex flex-wrap items-center gap-3">
                                <UnitInput min={60} max={7200} step={60} unit="sec" value={data.max_call_seconds} onChange={(v) => setData('max_call_seconds', v)} />
                                <span className="text-sm text-secondary tabular-nums">{duration(data.max_call_seconds)}</span>
                            </div>
                        </Field>
                        <Toggle checked={data.record_calls} onChange={(v) => setData('record_calls', v)} label="Record calls" hint="Recordings appear on the conversation in Desk. Some regions require telling the caller." />
                    </Section>

                    <Section id="business" title="Business profile" description="Facts the agent must always have to hand. Anything longer belongs in Knowledge, which is looked up only when needed.">
                        <Field inline label="Business name" error={err('profile.name')}>
                            <input className="v-field" value={data.profile.name ?? ''} onChange={(e) => setData('profile', { ...data.profile, name: e.target.value })} />
                        </Field>
                        <Field inline label="Industry" hint="Helps the agent pick the right words for your trade." error={err('profile.industry')}>
                            <input className="v-field max-w-[320px]" value={data.profile.industry ?? ''} onChange={(e) => setData('profile', { ...data.profile, industry: e.target.value })} />
                        </Field>
                        <Field inline label="Timezone" hint="Used for opening hours and whenever the agent says “today” or “tomorrow”." error={err('profile.timezone')}>
                            <input className="v-field max-w-[320px]" value={data.profile.timezone} onChange={(e) => setData('profile', { ...data.profile, timezone: e.target.value })} placeholder="Asia/Karachi" />
                        </Field>
                        <Field inline label="Website" error={err('profile.website')}>
                            <input type="url" className="v-field" value={data.profile.website ?? ''} onChange={(e) => setData('profile', { ...data.profile, website: e.target.value })} placeholder="https://" />
                        </Field>
                        <Field inline label="Address" hint="Read out when a caller asks where you are." error={err('profile.address')}>
                            <textarea className="v-field h-auto" rows={2} value={data.profile.address ?? ''} onChange={(e) => setData('profile', { ...data.profile, address: e.target.value })} dir="auto" />
                        </Field>
                        <Field inline label="Description" hint="One paragraph. It is in the prompt on every call." error={err('profile.description')}>
                            <textarea className="v-field h-auto" rows={4} maxLength={2000} value={data.profile.description ?? ''} onChange={(e) => setData('profile', { ...data.profile, description: e.target.value })} dir="auto" />
                            <Counter value={data.profile.description?.length ?? 0} max={2000} />
                        </Field>
                    </Section>

                    <SaveBar processing={processing} dirty={isDirty} onDiscard={() => reset()} />
                </div>
            </div>
        </form>
    );
}

function Counter({ value, max }: { value: number; max: number }) {
    return (
        <div className="mt-1.5 text-right text-2xs tabular-nums" style={{ color: value > max * 0.9 ? 'var(--warning)' : 'var(--text-tertiary)' }}>
            {value}/{max}
        </div>
    );
}

function Legend({ term, children }: { term: string; children: ReactNode }) {
    return (
        <div>
            <dt className="font-medium text-secondary">{term}</dt>
            <dd className="mt-0.5 text-tertiary">{children}</dd>
        </div>
    );
}

/** A number field with its unit inside the well, so the value never floats unitless. */
function UnitInput({ value, onChange, unit, min, max, step }: { value: number; onChange: (v: number) => void; unit: string; min: number; max: number; step: number }) {
    return (
        <div className="relative w-37">
            <input type="number" min={min} max={max} step={step} className="v-field pr-11 tabular-nums" value={value} onChange={(e) => onChange(Number(e.target.value))} />
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-tertiary">{unit}</span>
        </div>
    );
}

function ModelPicker({ label, value, fallback, role, providers, onChange }: { label: string; value: string; fallback: string; role: string; providers: Provider[]; onChange: (v: string) => void }) {
    return (
        <select className="v-field max-w-105" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
            <option value="">Agent layer default ({fallback || 'unset'})</option>
            {providers.map((p) => (
                <optgroup key={p.id} label={`${p.label}${p.configured ? '' : p.key_present ? ' — key rejected' : ' — no key'}`}>
                    {p.models.filter((m) => m.role === role || m.role === 'both').map((m) => <option key={m.ref} value={m.ref} disabled={!p.configured}>{m.label}</option>)}
                </optgroup>
            ))}
        </select>
    );
}
