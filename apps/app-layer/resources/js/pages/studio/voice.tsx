import { Head, useForm } from '@inertiajs/react';
import { AlertTriangle, AudioLines, Check, Gauge, Loader2, Pause, Play, Sparkles, Zap, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import { languageLabel, sayList } from '../../components/studio-agent/languages';
import { SaveBar } from '../../components/studio/form';
import { Callout, Card, CardBody, CardHeader, IconTile, SearchField, SegmentedControl, Toolbar } from '../../components/ui/kit';
import { PageHeader } from '../../components/ui/page';
import { Avatar, Badge, EmptyState, Eyebrow, Mono, StatusDot } from '../../components/ui/primitives';

interface Voice { id: string; name: string; gender: string; accent: string; style: string; languages: string[]; provider: string; covers: string[]; own: boolean }
interface Provider { id: string; label: string; configured: boolean; ok: boolean; error: string | null }
interface Props {
    voice_id: string | null; voice_provider: string | null; tts_model: string; languages: string[]; voices: Voice[];
    providers: Provider[]; live: boolean;
    models: { id: string; label: string; latency_ms: number; note: string }[];
    engine_overrides: string[];
}

const TIER_ICONS: Record<string, LucideIcon> = { flash: Zap, turbo: Gauge, expressive: Sparkles };

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';

/**
 * Pick a voice and hear it in the agent's own language before saving.
 *
 * Voices are the providers' live lists. Previews are a real synthesis of
 * one sample sentence, cached server-side, so what you hear is what a
 * caller would hear — not a vendor demo clip in a different language.
 */
export default function VoicePage({ voice_id, voice_provider, tts_model, languages, voices, providers, live, models, engine_overrides }: Props) {
    const { data, setData, put, processing, isDirty, errors, reset } = useForm({ voice_id: voice_id ?? '', voice_provider: voice_provider ?? (voices[0]?.provider ?? 'curated'), tts_model });
    const [filterLang, setFilterLang] = useState<string>('agent');
    const [filterProvider, setFilterProvider] = useState<string>('all');
    const [query, setQuery] = useState('');
    const submit = (e: FormEvent) => { e.preventDefault(); put('/studio/voice', { preserveScroll: true }); };

    const q = query.trim().toLowerCase();
    const shown = voices.filter((v) =>
        (filterProvider === 'all' || v.provider === filterProvider)
        && (filterLang === 'all' || (filterLang === 'agent' ? v.covers.length > 0 : v.languages.includes(filterLang)))
        && (!q || `${v.name} ${v.accent} ${v.style} ${v.gender}`.toLowerCase().includes(q)));
    const languagesInCatalog = Array.from(new Set(voices.flatMap((v) => v.languages))).sort();
    const primary = languages[0] ?? 'en';
    const spoken = sayList(languages.map(languageLabel));

    const liveProviders = providers.filter((p) => p.ok);
    const current = voices.find((v) => v.id === data.voice_id && v.provider === data.voice_provider) ?? null;
    const voiceChanged = data.voice_id !== (voice_id ?? '') || (voice_provider != null && data.voice_provider !== voice_provider);
    const tier = models.find((m) => m.id === data.tts_model);
    const filtered = filterLang !== 'agent' || filterProvider !== 'all' || q !== '';

    const pick = (v: Voice) => { setData((d) => ({ ...d, voice_id: v.id, voice_provider: v.provider })); };

    return (
        <form onSubmit={submit}>
            <Head title="Voice" />

            <PageHeader
                title="Voice"
                description={`What callers hear. The agent speaks ${spoken}; every preview is a real line in that language, from the engine that would say it on a call.`}
                meta={
                    <>
                        {live
                            ? <Badge tone="success" dot>{liveProviders.length === 1 ? '1 engine live' : `${liveProviders.length} engines live`}</Badge>
                            : <Badge tone="warning" dot>No engine reachable</Badge>}
                        {tier && <Mono>{tier.label} tier · ~{tier.latency_ms}ms</Mono>}
                    </>
                }
            />

            {/* Engines: which providers this deployment can reach. */}
            <Card className="mb-6">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3.5">
                    <Eyebrow>Engines</Eyebrow>
                    {providers.map((p) => (
                        <div key={p.id} className="flex items-center gap-2 text-sm">
                            <StatusDot tone={!p.configured ? 'muted' : p.ok ? 'success' : 'danger'} live={p.ok} />
                            <span className="font-medium text-primary">{p.label}</span>
                            <span className={!p.configured ? 'text-tertiary' : p.ok ? 'text-tertiary' : 'text-danger'}>
                                {!p.configured ? 'No key' : p.ok ? 'Live' : p.error ?? 'Error'}
                            </span>
                        </div>
                    ))}
                    <span className="ml-auto text-xs text-tertiary">A rejected key shows here, not as a short list.</span>
                </div>
                {!live && (
                    <div className="px-5 pb-4">
                        <Callout tone="warning" icon={<AlertTriangle size={16} strokeWidth={1.9} />} title="Previews are off">
                            No voice engine is reachable, so the voices below are an illustrative list. Add a Cartesia or ElevenLabs key to the deployment to see and hear the real catalog.
                        </Callout>
                    </div>
                )}
            </Card>

            {/* Speed tier. */}
            <section className="mb-6">
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="text-md font-semibold text-primary">Speed tier</h2>
                    <span className="text-xs text-tertiary">Latency figures are the vendors’, not our measurements.</span>
                </div>
                <div role="radiogroup" aria-label="Speed tier" className="grid gap-3 md:grid-cols-3">
                    {models.map((m) => {
                        const on = data.tts_model === m.id;
                        const Icon = TIER_ICONS[m.id] ?? Gauge;
                        return (
                            <label key={m.id} className="v-panel v-card-hover relative flex cursor-pointer flex-col p-4 has-focus-visible:[box-shadow:var(--ring)]"
                                style={{ borderColor: on ? 'var(--accent)' : undefined, background: on ? 'color-mix(in srgb, var(--accent) 4%, var(--surface))' : undefined }}>
                                <input type="radio" name="tts_model" className="sr-only" checked={on} onChange={() => setData('tts_model', m.id)} />
                                <div className="flex items-center gap-2.5">
                                    <IconTile tone={on ? 'accent' : 'muted'} size={30}><Icon size={15} strokeWidth={1.9} /></IconTile>
                                    <span className="text-base font-semibold text-primary">{m.label}</span>
                                    {m.id === 'flash' && <Badge tone="success">Recommended</Badge>}
                                    <span className="ml-auto flex size-5 items-center justify-center rounded-full transition-colors"
                                        style={{ background: on ? 'var(--accent)' : 'transparent', border: on ? 'none' : '1.5px solid var(--border-strong)', color: 'var(--text-on-accent)' }} aria-hidden="true">
                                        {on && <Check size={12} strokeWidth={2.6} />}
                                    </span>
                                </div>
                                <div className="mt-3 flex items-baseline gap-1">
                                    <span className="text-2xl font-semibold tracking-tight text-primary tabular-nums">~{m.latency_ms}</span>
                                    <span className="text-sm text-tertiary">ms to first sound</span>
                                </div>
                                <p className="mt-1 text-sm text-secondary">{m.note}</p>
                            </label>
                        );
                    })}
                </div>
                {engine_overrides.length > 0 && (
                    <div className="mt-3">
                        <Callout tone="warning" icon={<AlertTriangle size={16} strokeWidth={1.9} />}>
                            {sayList(engine_overrides)} cannot use this tier and will run on a different engine whatever you choose here.
                        </Callout>
                    </div>
                )}
            </section>

            {/* Current voice. */}
            <Card className="mb-8 overflow-hidden">
                {current ? (
                    <div className="flex flex-wrap items-center gap-5 p-6" style={{ background: 'color-mix(in srgb, var(--accent) 3%, var(--surface))' }}>
                        {current.provider !== 'curated'
                            ? <PreviewButton size="lg" provider={current.provider} voice={current.id} lang={current.languages.includes(primary) ? primary : current.languages[0]} name={current.name} />
                            : <PreviewButton size="lg" disabled provider={current.provider} voice={current.id} lang={primary} name={current.name} />}
                        <div className="min-w-0 flex-1">
                            <Eyebrow className="mb-1 block">Current voice</Eyebrow>
                            <div className="flex flex-wrap items-center gap-2">
                                <h2 className="text-2xl font-semibold tracking-tight text-primary">{current.name}</h2>
                                {voiceChanged && <Badge tone="warning" dot>Not saved yet</Badge>}
                            </div>
                            <p className="mt-0.5 text-sm text-secondary">
                                {[current.gender, current.accent, current.style].filter(Boolean).join(' · ')}
                            </p>
                            <div className="mt-3 flex flex-wrap items-center gap-1.5">
                                <Badge tone={current.provider === 'curated' ? 'muted' : 'info'}>{current.provider}</Badge>
                                {current.languages.map((l) => <Badge key={l} tone={languages.includes(l) ? 'success' : 'muted'}>{languageLabel(l)}</Badge>)}
                            </div>
                        </div>
                        <GapNote voice={current} languages={languages} />
                    </div>
                ) : (
                    <div className="flex items-center gap-5 p-6">
                        <span className="flex size-14 shrink-0 items-center justify-center rounded-full text-tertiary" style={{ background: 'var(--surface-sunken)' }}>
                            <AudioLines size={20} strokeWidth={1.8} />
                        </span>
                        <div className="min-w-0">
                            <Eyebrow className="mb-1 block">Current voice</Eyebrow>
                            <h2 className="text-lg font-semibold text-primary">{data.voice_id ? 'Saved voice is no longer offered' : 'No voice chosen yet'}</h2>
                            <p className="mt-0.5 text-sm text-secondary">
                                {data.voice_id
                                    ? `“${data.voice_id}” is not in the catalog any more. Pick another below and save.`
                                    : `Press play on any voice below to hear it say a line in ${languageLabel(primary)}, then pick one and save.`}
                            </p>
                        </div>
                    </div>
                )}
            </Card>

            {errors.voice_id && (
                <div className="mb-4">
                    <Callout tone="danger" icon={<AlertTriangle size={16} strokeWidth={1.9} />}>{errors.voice_id}</Callout>
                </div>
            )}

            {/* The catalog. */}
            <section>
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="text-md font-semibold text-primary">Voices</h2>
                    <Mono>{shown.length} of {voices.length} shown</Mono>
                </div>
                <Toolbar
                    trailing={
                        <>
                            <select className="v-field h-[34px] w-auto rounded-full" aria-label="Language" value={filterLang} onChange={(e) => setFilterLang(e.target.value)}>
                                <option value="agent">Agent’s languages</option>
                                <option value="all">Every language</option>
                                {languagesInCatalog.map((l) => <option key={l} value={l}>{languageLabel(l)}</option>)}
                            </select>
                            <SearchField value={query} onChange={setQuery} placeholder="Search voices" className="w-full sm:w-[220px]" />
                        </>
                    }
                >
                    {liveProviders.length > 1 && (
                        <SegmentedControl
                            value={filterProvider}
                            onChange={setFilterProvider}
                            options={[{ value: 'all', label: 'All engines' }, ...liveProviders.map((p) => ({ value: p.id, label: p.label }))]}
                        />
                    )}
                </Toolbar>

                {shown.length === 0 ? (
                    <Card>
                        <EmptyState
                            icon={<AudioLines size={20} strokeWidth={1.8} />}
                            title="No voices match"
                            action={filtered ? <button type="button" className="v-btn v-btn--quiet" onClick={() => { setQuery(''); setFilterLang('agent'); setFilterProvider('all'); }}>Clear filters</button> : undefined}
                        >
                            {filtered
                                ? 'Nothing in the catalog fits these filters. Clear them to see every voice that speaks the agent’s languages.'
                                : `No voice in the catalog speaks ${spoken}. Choose “Every language” to see the rest.`}
                        </EmptyState>
                    </Card>
                ) : (
                    <div role="radiogroup" aria-label="Voice" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {shown.map((v) => {
                            const selected = data.voice_id === v.id && data.voice_provider === v.provider;
                            const previewLang = v.languages.includes(primary) ? primary : v.languages[0];
                            return (
                                <label
                                    key={`${v.provider}:${v.id}`}
                                    className="v-panel v-card-hover flex cursor-pointer flex-col p-4 has-focus-visible:[box-shadow:var(--ring)]"
                                    style={{
                                        borderColor: selected ? 'var(--accent)' : undefined,
                                        background: selected ? 'color-mix(in srgb, var(--accent) 4%, var(--surface))' : undefined,
                                        opacity: v.covers.length === 0 ? 0.6 : 1,
                                    }}
                                >
                                    <input type="radio" name="voice" className="sr-only" checked={selected} onChange={() => pick(v)} />
                                    <div className="flex items-start gap-3">
                                        <Avatar initials={initials(v.name)} name={v.name} size={36} />
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-1.5">
                                                <span className="truncate text-base font-semibold text-primary">{v.name}</span>
                                                {selected && (
                                                    <span className="flex size-4 shrink-0 items-center justify-center rounded-full" style={{ background: 'var(--accent)', color: 'var(--text-on-accent)' }}>
                                                        <Check size={10} strokeWidth={3} aria-hidden="true" /><span className="sr-only">Selected</span>
                                                    </span>
                                                )}
                                            </div>
                                            <div className="truncate text-xs text-tertiary">{[v.gender, v.accent].filter(Boolean).join(' · ')}</div>
                                        </div>
                                        {v.provider !== 'curated'
                                            ? <PreviewButton provider={v.provider} voice={v.id} lang={previewLang} name={v.name} />
                                            : <PreviewButton disabled provider={v.provider} voice={v.id} lang={previewLang} name={v.name} />}
                                    </div>
                                    {v.style && <p className="mt-2.5 line-clamp-2 text-sm text-secondary">{v.style}</p>}
                                    <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
                                        {v.languages.map((l) => <Badge key={l} tone={languages.includes(l) ? 'success' : 'muted'}>{languageLabel(l)}</Badge>)}
                                        {v.provider !== 'curated' && <Badge tone="info">{v.provider}</Badge>}
                                        {v.own && <Badge tone="accent">Yours</Badge>}
                                    </div>
                                    <GapNote voice={v} languages={languages} compact />
                                </label>
                            );
                        })}
                    </div>
                )}
            </section>

            <SaveBar processing={processing} dirty={isDirty} onDiscard={() => reset()} />
        </form>
    );
}

/** Which of the agent's languages a voice cannot speak — stated, never hidden. */
function GapNote({ voice, languages, compact = false }: { voice: Voice; languages: string[]; compact?: boolean }) {
    const gap = languages.filter((l) => !voice.languages.includes(l));
    if (gap.length === 0) return null;

    return (
        <p className={`flex items-start gap-1.5 text-xs text-warning ${compact ? 'mt-2' : 'w-full md:w-auto md:max-w-[220px]'}`}>
            <AlertTriangle size={12} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>Cannot speak {sayList(gap.map(languageLabel))}{voice.covers.length === 0 ? ', so it would not work for this agent' : ''}.</span>
        </p>
    );
}

/** One shared audio element: starting a preview stops the one playing. */
let current: HTMLAudioElement | null = null;

function PreviewButton({ provider, voice, lang, name, size = 'md', disabled = false }: { provider: string; voice: string; lang: string; name: string; size?: 'md' | 'lg'; disabled?: boolean }) {
    const [state, setState] = useState<'idle' | 'loading' | 'playing' | 'error'>('idle');
    const audio = useRef<HTMLAudioElement | null>(null);

    useEffect(() => () => { audio.current?.pause(); }, []);

    const toggle = (e: React.MouseEvent) => {
        e.preventDefault();
        if (disabled) return;
        if (state === 'playing') { audio.current?.pause(); setState('idle'); return; }
        current?.pause();
        const el = new Audio(`/studio/voice/preview?${new URLSearchParams({ provider, voice, lang })}`);
        audio.current = el; current = el;
        setState('loading');
        el.onplaying = () => setState('playing');
        el.onended = () => setState('idle');
        el.onpause = () => setState((s) => (s === 'playing' ? 'idle' : s));
        el.onerror = () => setState('error');
        el.play().catch(() => setState('error'));
    };

    const big = size === 'lg';
    const icon = big ? 20 : 15;
    const playing = state === 'playing';

    return (
        <button
            type="button"
            aria-label={`${playing ? 'Stop' : 'Preview'} ${name}`}
            title={disabled ? 'Previews need a live voice engine' : state === 'error' ? 'The provider did not return audio' : `Hear ${name} in ${languageLabel(lang)}`}
            onClick={toggle}
            disabled={disabled}
            className={`flex shrink-0 items-center justify-center rounded-full transition-all duration-200 hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100 ${big ? 'size-14' : 'size-9'}`}
            style={{
                color: state === 'error' ? 'var(--danger)' : playing ? 'var(--accent-text)' : 'var(--text-primary)',
                background: playing ? 'var(--accent-subtle)' : state === 'error' ? 'var(--danger-subtle)' : 'var(--surface-sunken)',
                border: `1px solid ${playing ? 'var(--border-accent)' : 'var(--border)'}`,
            }}
        >
            {state === 'loading'
                ? <Loader2 size={icon} strokeWidth={2} className="animate-spin" />
                : playing
                  ? <Pause size={icon} strokeWidth={2} fill="currentColor" />
                  : <Play size={icon} strokeWidth={2} fill="currentColor" className="translate-x-px" />}
        </button>
    );
}
