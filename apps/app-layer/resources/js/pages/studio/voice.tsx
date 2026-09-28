import { Head, useForm } from '@inertiajs/react';
import { AlertTriangle, AudioLines, Check, Gauge, Loader2, Pause, Play, Sparkles, Zap, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import { languageLabel, sayList } from '../../components/studio-agent/languages';
import { SaveBar } from '../../components/studio/form';
import { Disclosure, Group, PageStack } from '../../components/studio/space';
import { Callout, Card, IconTile, SearchField, SegmentedControl, Toolbar } from '../../components/ui/kit';
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

/** Voices shown per page of the catalog. */
const PAGE = 12;

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

    // A catalog of hundreds is a wall; show a page at a time.
    const [limit, setLimit] = useState(PAGE);
    useEffect(() => { setLimit(PAGE); }, [filterLang, filterProvider, q]);
    const page = shown.slice(0, limit);
    const unreachable = providers.filter((p) => p.configured && !p.ok);

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

            <PageStack>
                {!live && (
                    <Callout tone="warning" icon={<AlertTriangle size={16} strokeWidth={1.9} />} title="Previews are off">
                        No voice engine is reachable, so the voices below are an illustrative list. Add a Cartesia or ElevenLabs key to the deployment to see and hear the real catalog.
                    </Callout>
                )}

                {/* Current voice. */}
                <Card className="overflow-hidden">
                    {current ? (
                        <div className="flex flex-wrap items-center gap-6 p-7" style={{ background: 'color-mix(in srgb, var(--accent) 3%, var(--surface))' }}>
                            {current.provider !== 'curated'
                                ? <PreviewButton size="lg" provider={current.provider} voice={current.id} lang={current.languages.includes(primary) ? primary : current.languages[0]} name={current.name} />
                                : <PreviewButton size="lg" disabled provider={current.provider} voice={current.id} lang={primary} name={current.name} />}
                            <div className="min-w-0 flex-1">
                                <Eyebrow className="mb-1.5 block">Current voice</Eyebrow>
                                <div className="flex flex-wrap items-center gap-2.5">
                                    <h2 className="text-2xl font-semibold tracking-tight text-primary">{current.name}</h2>
                                    {voiceChanged && <Badge tone="warning" dot>Not saved yet</Badge>}
                                </div>
                                <p className="mt-1 text-sm text-secondary">
                                    {[current.gender, current.accent, current.style].filter(Boolean).join(' · ')}
                                </p>
                                <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
                                    <Badge tone={current.provider === 'curated' ? 'muted' : 'info'}>{current.provider}</Badge>
                                    {current.languages.map((l) => <Badge key={l} tone={languages.includes(l) ? 'success' : 'muted'}>{languageLabel(l)}</Badge>)}
                                </div>
                            </div>
                            <GapNote voice={current} languages={languages} />
                        </div>
                    ) : (
                        <div className="flex items-center gap-6 p-7">
                            <span className="flex size-14 shrink-0 items-center justify-center rounded-full text-tertiary" style={{ background: 'var(--surface-sunken)' }}>
                                <AudioLines size={20} strokeWidth={1.8} />
                            </span>
                            <div className="min-w-0">
                                <Eyebrow className="mb-1.5 block">Current voice</Eyebrow>
                                <h2 className="text-xl font-semibold tracking-tight text-primary">{data.voice_id ? 'Saved voice is no longer offered' : 'No voice chosen yet'}</h2>
                                <p className="mt-1 text-sm text-secondary">
                                    {data.voice_id
                                        ? `“${data.voice_id}” is not in the catalog any more. Pick another below and save.`
                                        : `Press play on any voice below to hear it say a line in ${languageLabel(primary)}, then pick one and save.`}
                                </p>
                            </div>
                        </div>
                    )}
                </Card>

                {errors.voice_id && <Callout tone="danger" icon={<AlertTriangle size={16} strokeWidth={1.9} />}>{errors.voice_id}</Callout>}

                {/* The catalog. */}
                <Group title="Voices" description="Press play to hear a voice, then pick it." aside={<Mono>{shown.length} of {voices.length}</Mono>}>
                    <div className="mb-2">
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
                    </div>

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
                        <>
                            <div role="radiogroup" aria-label="Voice" className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                                {page.map((v) => {
                                    const selected = data.voice_id === v.id && data.voice_provider === v.provider;
                                    const previewLang = v.languages.includes(primary) ? primary : v.languages[0];
                                    return (
                                        <label
                                            key={`${v.provider}:${v.id}`}
                                            className="v-panel v-card-hover flex cursor-pointer flex-col p-6 has-focus-visible:[box-shadow:var(--ring)]"
                                            style={{
                                                borderColor: selected ? 'var(--accent)' : undefined,
                                                background: selected ? 'color-mix(in srgb, var(--accent) 4%, var(--surface))' : undefined,
                                                opacity: v.covers.length === 0 ? 0.6 : 1,
                                            }}
                                        >
                                            <input type="radio" name="voice" className="sr-only" checked={selected} onChange={() => pick(v)} />
                                            <div className="flex items-center gap-3.5">
                                                <Avatar initials={initials(v.name)} name={v.name} size={40} />
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="truncate text-md font-semibold text-primary">{v.name}</span>
                                                        {selected && (
                                                            <span className="flex size-4 shrink-0 items-center justify-center rounded-full" style={{ background: 'var(--accent)', color: 'var(--text-on-accent)' }}>
                                                                <Check size={10} strokeWidth={3} aria-hidden="true" /><span className="sr-only">Selected</span>
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="truncate text-sm text-tertiary">{[v.gender, v.accent].filter(Boolean).join(' · ')}</div>
                                                </div>
                                                {v.provider !== 'curated'
                                                    ? <PreviewButton provider={v.provider} voice={v.id} lang={previewLang} name={v.name} />
                                                    : <PreviewButton disabled provider={v.provider} voice={v.id} lang={previewLang} name={v.name} />}
                                            </div>
                                            {v.style && <p className="mt-4 line-clamp-2 text-sm text-secondary">{v.style}</p>}
                                            <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-4">
                                                {v.languages.map((l) => <Badge key={l} tone={languages.includes(l) ? 'success' : 'muted'}>{languageLabel(l)}</Badge>)}
                                                {v.provider !== 'curated' && <Badge tone="info">{v.provider}</Badge>}
                                                {v.own && <Badge tone="accent">Yours</Badge>}
                                            </div>
                                            <GapNote voice={v} languages={languages} compact />
                                        </label>
                                    );
                                })}
                            </div>
                            {shown.length > limit && (
                                <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                                    <button type="button" className="v-btn v-btn--quiet" onClick={() => setLimit((n) => n + PAGE)}>
                                        Show {Math.min(PAGE, shown.length - limit)} more
                                    </button>
                                    <button type="button" className="v-btn v-btn--ghost" onClick={() => setLimit(shown.length)}>
                                        Show all {shown.length}
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </Group>

                {/* Speed tier. */}
                <Group title="Speed tier" description="How quickly the first sound reaches the caller. Latency figures are the vendors’, not our measurements.">
                    <div role="radiogroup" aria-label="Speed tier" className="grid gap-6 md:grid-cols-3">
                        {models.map((m) => {
                            const on = data.tts_model === m.id;
                            const Icon = TIER_ICONS[m.id] ?? Gauge;
                            return (
                                <label key={m.id} className="v-panel v-card-hover relative flex cursor-pointer flex-col p-6 has-focus-visible:[box-shadow:var(--ring)]"
                                    style={{ borderColor: on ? 'var(--accent)' : undefined, background: on ? 'color-mix(in srgb, var(--accent) 4%, var(--surface))' : undefined }}>
                                    <input type="radio" name="tts_model" className="sr-only" checked={on} onChange={() => setData('tts_model', m.id)} />
                                    <div className="flex items-center gap-3">
                                        <IconTile tone={on ? 'accent' : 'muted'} size={32}><Icon size={15} strokeWidth={1.9} /></IconTile>
                                        <span className="text-md font-semibold text-primary">{m.label}</span>
                                        {m.id === 'flash' && <Badge tone="success">Recommended</Badge>}
                                        <span className="ml-auto flex size-5 items-center justify-center rounded-full transition-colors"
                                            style={{ background: on ? 'var(--accent)' : 'transparent', border: on ? 'none' : '1.5px solid var(--border-strong)', color: 'var(--text-on-accent)' }} aria-hidden="true">
                                            {on && <Check size={12} strokeWidth={2.6} />}
                                        </span>
                                    </div>
                                    <div className="mt-4 flex items-baseline gap-1.5">
                                        <span className="text-2xl font-semibold tracking-tight text-primary tabular-nums">~{m.latency_ms}</span>
                                        <span className="text-sm text-tertiary">ms to first sound</span>
                                    </div>
                                    <p className="mt-1.5 text-sm text-secondary">{m.note}</p>
                                </label>
                            );
                        })}
                    </div>
                    {engine_overrides.length > 0 && (
                        <div className="mt-6">
                            <Callout tone="warning" icon={<AlertTriangle size={16} strokeWidth={1.9} />}>
                                {sayList(engine_overrides)} cannot use this tier and will run on a different engine whatever you choose here.
                            </Callout>
                        </div>
                    )}
                </Group>

                {/* Engines: which providers this deployment can reach. */}
                <Disclosure
                    title="Engines"
                    summary={
                        <>
                            {liveProviders.length} of {providers.length} reachable
                            {unreachable.length > 0 && <span className="text-danger"> · {unreachable.map((p) => p.label).join(', ')} failing</span>}
                        </>
                    }
                    defaultOpen={unreachable.length > 0}
                >
                    <p className="text-sm text-secondary">A rejected key shows here, not as a short list of voices.</p>
                    <ul className="flex flex-col">
                        {providers.map((p) => (
                            <li key={p.id} className="flex min-h-12 items-center gap-3 border-t text-sm first:border-t-0" style={{ borderColor: 'var(--separator)' }}>
                                <StatusDot tone={!p.configured ? 'muted' : p.ok ? 'success' : 'danger'} live={p.ok} />
                                <span className="w-32 shrink-0 font-medium text-primary">{p.label}</span>
                                <span className={!p.configured ? 'text-tertiary' : p.ok ? 'text-secondary' : 'text-danger'}>
                                    {!p.configured ? 'No key' : p.ok ? 'Live' : p.error ?? 'Error'}
                                </span>
                            </li>
                        ))}
                    </ul>
                </Disclosure>
            </PageStack>

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
