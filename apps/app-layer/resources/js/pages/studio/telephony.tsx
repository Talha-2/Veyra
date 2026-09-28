import { Head, useForm } from '@inertiajs/react';
import { AlertTriangle, Bot, ChevronRight, Phone, PhoneIncoming, PhoneOff, UserRound } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';

import { Field, SaveBar, Toggle } from '../../components/studio/form';
import { plural } from '../../components/studio-knowledge/format';
import { DialogActions, PageSection, SettingRow, SettingsGroup, StatRow } from '../../components/studio-ops/page-parts';
import Dialog from '../../components/ui/dialog';
import { Callout, Card, IconTile, SegmentedControl } from '../../components/ui/kit';
import { PageHeader } from '../../components/ui/page';
import { Avatar, Badge, EmptyState, UserText } from '../../components/ui/primitives';

interface NumberRow {
    id: number; e164: string; friendly_name: string | null; country: string; capabilities: Record<string, boolean>;
    assigned_user_id: number | null; assigned_user: string | null; language: string | null; effective_language: string;
    language_degraded: boolean; status: string; calls_count: number;
    sms_autoreply?: boolean; monthly_cost?: string | null;
}
interface Language { label: string; native: string; rtl?: boolean; stt_multi?: boolean; tts_low_latency?: boolean; semantic_turns?: boolean; caveats?: string[] }
interface Props {
    provider: string | null; configured: boolean; numbers: NumberRow[];
    credential_keys?: string[];
    sip_trunk?: boolean;
    team: { id: number; name: string }[];
    languages: Record<string, Language>;
    default_language: string;
}

type Provider = 'twilio' | 'telnyx';

/** What each carrier needs, in the key names the agent layer reads. */
const CREDENTIALS: Record<Provider, { key: string; label: string; hint: string; secret?: boolean; required?: boolean; placeholder: string }[]> = {
    twilio: [
        { key: 'account_sid', label: 'Account SID', hint: 'From the Twilio console home page. Starts with AC.', required: true, placeholder: 'AC…' },
        { key: 'auth_token', label: 'Auth token', hint: 'Lets Veyra place calls and verify that webhooks really came from Twilio.', secret: true, required: true, placeholder: 'Auth token' },
        { key: 'messaging_service_sid', label: 'Messaging service SID', hint: 'Optional. Needed only to send texts through a messaging service.', placeholder: 'MG…' },
    ],
    telnyx: [
        { key: 'api_key', label: 'API key', hint: 'From Telnyx Mission Control, under API keys.', secret: true, required: true, placeholder: 'KEY…' },
        { key: 'connection_id', label: 'Connection ID', hint: 'Optional. The voice connection your numbers are attached to.', placeholder: 'Connection ID' },
        { key: 'messaging_profile_id', label: 'Messaging profile ID', hint: 'Optional. Needed only to send texts.', placeholder: 'Messaging profile ID' },
    ],
};

const PROVIDER_LABEL: Record<Provider, string> = { twilio: 'Twilio', telnyx: 'Telnyx' };
const CAPABILITY_LABEL: Record<string, string> = { voice: 'Voice', sms: 'SMS', mms: 'MMS', fax: 'Fax' };

/** +14155550123 → +1 (415) 555-0123. Other countries keep their E.164 form, which is unambiguous. */
function formatNumber(e164: string): string {
    const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
    return m ? `+1 (${m[1]}) ${m[2]}-${m[3]}` : e164;
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase() || '?';

export default function Telephony({ provider, configured, numbers, credential_keys = [], sip_trunk = false, team, languages, default_language }: Props) {
    const [editing, setEditing] = useState<NumberRow | null>(null);
    const byAgent = numbers.filter((n) => n.assigned_user_id === null).length;
    const active = numbers.filter((n) => n.status === 'active').length;
    const calls = numbers.reduce((sum, n) => sum + n.calls_count, 0);
    const langLabel = (code: string) => languages[code]?.label ?? code;

    return (
        <>
            <Head title="Telephony" />
            <PageHeader
                title="Telephony"
                description="Your phone numbers, who answers each one, and the carrier account they run on."
                meta={
                    <>
                        <Badge tone={configured ? 'success' : 'warning'} dot>{configured ? `${PROVIDER_LABEL[provider as Provider] ?? provider} connected` : 'No carrier connected'}</Badge>
                        <Badge tone={sip_trunk ? 'success' : 'warning'} dot>{sip_trunk ? 'Inbound ready' : 'Inbound not set up'}</Badge>
                    </>
                }
            />

            <div className="mt-3">
                {(!sip_trunk || numbers.length > 0) && (
                    <div className="flex flex-col gap-8">
                        {!sip_trunk && (
                            <Callout tone="warning" icon={<PhoneOff size={16} strokeWidth={2} />} title="Inbound calls cannot reach the agent yet">
                                Calls to your numbers reach the agent through a SIP trunk on LiveKit, and this workspace's LiveKit project does not have one yet.
                                You can set up numbers, languages and who answers now; callers start getting through once the trunk exists.
                            </Callout>
                        )}
                        {numbers.length > 0 && (
                            <StatRow items={[
                                { label: 'Phone numbers', icon: <Phone size={15} strokeWidth={2} />, value: numbers.length, hint: active === numbers.length ? 'All active' : `${active} active, ${numbers.length - active} inactive` },
                                { label: 'Answered by the agent', icon: <Bot size={15} strokeWidth={2} />, value: `${byAgent} of ${numbers.length}`, hint: byAgent === numbers.length ? 'No line rings a person first' : `${numbers.length - byAgent} ring a person, with the agent screening` },
                                { label: 'Calls handled', icon: <PhoneIncoming size={15} strokeWidth={2} />, value: calls.toLocaleString(), hint: 'Across every line, since each was added' },
                            ]} />
                        )}
                    </div>
                )}

                <PageSection
                    title="Phone numbers"
                    description="Choose who answers each line and the language it runs in. Language is set per line because Urdu speech recognition cannot share a line with other languages."
                >
                    <Card>
                        {numbers.length === 0 ? (
                            <EmptyState icon={<Phone size={20} strokeWidth={1.8} />} title="No phone numbers yet">
                                {configured
                                    ? 'Provision a number through your carrier to give the agent a line. It shows up here with who answers it and in which language.'
                                    : 'Connect your carrier account below first, then provision a number through it to give the agent a line.'}
                            </EmptyState>
                        ) : (
                            <>
                                <div className={`hidden h-11 items-center gap-5 px-6 text-xs font-medium text-tertiary md:grid ${NUMBER_COLS}`} style={{ borderBottom: '1px solid var(--separator)' }}>
                                    <span>Number</span><span>Answered by</span><span>Language</span><span className="text-right">Calls</span><span />
                                </div>
                                <div className="divide-y" style={{ ['--tw-divide-color' as string]: 'var(--separator)' }}>
                                    {numbers.map((n) => (
                                        <NumberLine key={n.id} n={n} language={languages[n.effective_language]} fallbackLabel={langLabel(n.effective_language)} inherited={n.language === null} onOpen={() => setEditing(n)} />
                                    ))}
                                </div>
                            </>
                        )}
                    </Card>
                </PageSection>

                <ProviderForm provider={provider} configured={configured} storedKeys={credential_keys} />
            </div>

            {editing && (
                <NumberDialog key={editing.id} n={editing} team={team} languages={languages} defaultLanguage={default_language} onClose={() => setEditing(null)} />
            )}
        </>
    );
}

const NUMBER_COLS = 'md:grid-cols-[minmax(0,1fr)_190px_160px_64px_16px]';

function NumberLine({ n, language, fallbackLabel, inherited, onOpen }: { n: NumberRow; language?: Language; fallbackLabel: string; inherited: boolean; onOpen: () => void }) {
    const caps = Object.entries(n.capabilities).filter(([, v]) => v).map(([k]) => CAPABILITY_LABEL[k] ?? k);
    const isActive = n.status === 'active';

    return (
        <button type="button" onClick={onOpen} aria-label={`Edit ${n.e164}`}
            className={`grid min-h-16 w-full items-center gap-x-5 gap-y-2 px-6 py-3 text-left transition-colors hover:bg-surface-hover ${NUMBER_COLS}`}>
            <div className="flex min-w-0 items-center gap-3.5">
                <IconTile tone={isActive ? 'success' : 'muted'} size={36}><Phone size={16} strokeWidth={1.9} /></IconTile>
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-base font-medium text-primary tabular-nums">{formatNumber(n.e164)}</span>
                        {!isActive && <Badge>{n.status}</Badge>}
                    </div>
                    <div className="mt-0.5 truncate text-sm text-secondary">
                        {n.friendly_name ? <UserText>{n.friendly_name}</UserText> : <span className="text-tertiary">No name</span>}
                        <span className="text-tertiary"> · {n.country}{caps.length > 0 && ` · ${caps.join(', ')}`}</span>
                    </div>
                </div>
            </div>

            <div className="flex min-w-0 items-center gap-2">
                {n.assigned_user_id === null ? (
                    <>
                        <IconTile tone="accent" size={28}><Bot size={14} strokeWidth={2} /></IconTile>
                        <span className="text-base text-primary">The agent</span>
                    </>
                ) : (
                    <>
                        <Avatar initials={initials(n.assigned_user ?? '?')} name={n.assigned_user ?? undefined} size={28} />
                        <div className="min-w-0">
                            <div className="truncate text-base text-primary">{n.assigned_user ?? 'A teammate'}</div>
                            <div className="text-xs text-tertiary">Agent screens first</div>
                        </div>
                    </>
                )}
            </div>

            <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                    <span className="truncate text-base text-primary">{language?.label ?? fallbackLabel}</span>
                    {n.language_degraded && <span title="Reduced support on this line" className="text-warning"><AlertTriangle size={13} strokeWidth={2.2} /></span>}
                </div>
                <div className="text-xs text-tertiary">{inherited ? 'Workspace default' : n.language_degraded ? 'Reduced support' : 'Set for this line'}</div>
            </div>

            <div className="text-base text-secondary tabular-nums md:text-right">{n.calls_count.toLocaleString()}<span className="md:hidden"> calls</span></div>
            <ChevronRight size={15} strokeWidth={2} className="hidden text-tertiary md:block" />
        </button>
    );
}

function Choice({ on, onClick, icon, title, hint }: { on: boolean; onClick: () => void; icon: ReactNode; title: string; hint: string }) {
    return (
        <button type="button" role="radio" aria-checked={on} onClick={onClick}
            className="flex items-start gap-3.5 rounded-lg p-4 text-left transition-colors"
            style={{ background: on ? 'var(--accent-subtle)' : 'var(--surface)', boxShadow: `inset 0 0 0 1px ${on ? 'var(--border-accent)' : 'var(--border-strong)'}` }}>
            <IconTile tone={on ? 'accent' : 'muted'} size={32}>{icon}</IconTile>
            <span className="min-w-0">
                <span className="block text-base font-medium text-primary">{title}</span>
                <span className="mt-0.5 block text-sm text-secondary">{hint}</span>
            </span>
        </button>
    );
}

function NumberDialog({ n, team, languages, defaultLanguage, onClose }: { n: NumberRow; team: Props['team']; languages: Props['languages']; defaultLanguage: string; onClose: () => void }) {
    const { data, setData, patch, processing, errors } = useForm({
        friendly_name: n.friendly_name ?? '',
        assigned_user_id: n.assigned_user_id,
        language: n.language ?? '',
        sms_autoreply: n.sms_autoreply ?? false,
    });
    const [person, setPerson] = useState(n.assigned_user_id !== null);
    const submit = (e: FormEvent) => { e.preventDefault(); patch(`/studio/telephony/numbers/${n.id}`, { preserveScroll: true, onSuccess: onClose }); };

    const effective = data.language || defaultLanguage;
    const lang = languages[effective];
    const caveats = lang?.caveats ?? [];

    return (
        <Dialog open onClose={onClose} title={formatNumber(n.e164)} description="Changes apply from the next call on this line." width={600}>
            <form onSubmit={submit}>
                <Field label="Name" hint="Only your team sees this, for example Front desk or Urdu line." error={errors.friendly_name}>
                    <input className="v-field" value={data.friendly_name} onChange={(e) => setData('friendly_name', e.target.value)} placeholder="Front desk" autoFocus />
                </Field>

                <Field label="Who answers" error={errors.assigned_user_id}>
                    <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Who answers">
                        <Choice on={!person} onClick={() => { setPerson(false); setData('assigned_user_id', null); }} icon={<Bot size={15} strokeWidth={2} />} title="The agent" hint="Answers every call itself." />
                        <Choice on={person} onClick={() => { setPerson(true); if (data.assigned_user_id === null && team[0]) setData('assigned_user_id', team[0].id); }} icon={<UserRound size={15} strokeWidth={2} />} title="A person" hint="The agent screens, then transfers." />
                    </div>
                    {person && (
                        <select className="v-field mt-3" value={data.assigned_user_id ?? ''} aria-label="Person who answers" onChange={(e) => setData('assigned_user_id', e.target.value ? Number(e.target.value) : null)}>
                            {team.length === 0 && <option value="">No one on the team yet</option>}
                            {team.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                    )}
                </Field>

                <Field label="Language" hint="Only languages the agent is configured to speak are listed." error={errors.language}>
                    {/* Per number, because the STT model for Urdu is monolingual: a
                        tenant can own an Urdu line and an English one, and they
                        cannot share a setting. */}
                    <select className="v-field" value={data.language} onChange={(e) => setData('language', e.target.value)}>
                        <option value="">Workspace default ({languages[defaultLanguage]?.label ?? defaultLanguage})</option>
                        {Object.entries(languages).map(([code, l]) => <option key={code} value={code}>{l.label}{l.native && l.native !== l.label ? ` · ${l.native}` : ''}</option>)}
                    </select>
                    {caveats.length > 0 ? (
                        <div className="mt-2.5">
                            <Callout tone="warning" title={`${lang?.label ?? effective} has reduced support on a phone line`}>
                                <ul className="mt-1 flex list-disc flex-col gap-1 pl-4">{caveats.map((c) => <li key={c}>{c}</li>)}</ul>
                            </Callout>
                        </div>
                    ) : lang && (
                        <p className="mt-1.5 text-sm text-tertiary">Full support: recognition that follows callers across languages, low-latency voice, and end-of-thought turn detection.</p>
                    )}
                </Field>

                {n.capabilities.sms && (
                    <div className="mt-6 pt-5" style={{ borderTop: '1px solid var(--separator)' }}>
                        <Toggle checked={data.sms_autoreply} onChange={(v) => setData('sms_autoreply', v)} label="Reply to texts automatically" hint="Incoming text messages to this number get an automatic reply." />
                    </div>
                )}

                <DialogActions>
                    <button type="button" className="v-btn v-btn--ghost" onClick={onClose}>Cancel</button>
                    <button type="submit" className="v-btn v-btn--primary" disabled={processing || (person && data.assigned_user_id === null)}>{processing ? 'Saving…' : 'Save'}</button>
                </DialogActions>
            </form>
        </Dialog>
    );
}

function ProviderForm({ provider, configured, storedKeys }: { provider: string | null; configured: boolean; storedKeys: string[] }) {
    const initial: Provider = provider === 'telnyx' ? 'telnyx' : 'twilio';
    const { data, setData, put, processing, errors, isDirty, reset, transform } = useForm({ provider: initial, credentials: {} as Record<string, string> });
    const [missing, setMissing] = useState<string[]>([]);
    // Once saved, the carrier is a fact on this page, not a form: it opens only to change it.
    const [changing, setChanging] = useState(!configured);
    const fields = CREDENTIALS[data.provider];
    const serverErrors = errors as Record<string, string | undefined>;
    // Stored values only count for the provider they were saved under.
    const stored = (key: string) => configured && data.provider === initial && storedKeys.includes(key);

    const submit = (e: FormEvent) => {
        e.preventDefault();
        // The server replaces the whole credential set, so every required
        // field has to be entered again, even ones already saved.
        const gaps = fields.filter((f) => f.required && !data.credentials[f.key]?.trim()).map((f) => f.key);
        setMissing(gaps);
        if (gaps.length) return;
        transform((d) => ({ ...d, credentials: Object.fromEntries(Object.entries(d.credentials).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v)) }));
        put('/studio/telephony/provider', { preserveScroll: true, onSuccess: () => { reset(); setMissing([]); setChanging(false); } });
    };

    const providerName = PROVIDER_LABEL[initial];
    const cancelChange = () => { reset(); setMissing([]); setChanging(false); };

    return (
        <PageSection
            title="Carrier account"
            description="The account your numbers are bought through and your calls are billed to. Credentials are encrypted at rest and never shown again after saving."
            actions={<Badge tone={configured ? 'success' : 'warning'} dot>{configured ? `${providerName} saved` : 'Not set'}</Badge>}
        >
            {!changing ? (
                <div className="v-panel flex flex-col gap-4 px-7 py-6 sm:flex-row sm:items-center">
                    <IconTile tone="success" size={40}><Phone size={17} strokeWidth={1.9} /></IconTile>
                    <div className="min-w-0 flex-1">
                        <p className="text-md font-semibold text-primary">{providerName}</p>
                        <p className="mt-0.5 text-sm text-secondary">{plural(storedKeys.length, 'credential')} saved. Saving new ones replaces all of them.</p>
                    </div>
                    <button type="button" className="v-btn v-btn--quiet" onClick={() => setChanging(true)}>Change credentials</button>
                </div>
            ) : (
                <form onSubmit={submit}>
                    <SettingsGroup>
                        <SettingRow label="Provider" hint="Switching carriers means entering that carrier's credentials." error={serverErrors.provider}>
                            <SegmentedControl<Provider>
                                value={data.provider}
                                onChange={(v) => { setData({ provider: v, credentials: {} }); setMissing([]); }}
                                options={[{ value: 'twilio', label: 'Twilio' }, { value: 'telnyx', label: 'Telnyx' }]}
                            />
                        </SettingRow>
                        {fields.map((f) => (
                            <SettingRow
                                key={`${data.provider}-${f.key}`}
                                label={f.label}
                                hint={f.hint}
                                error={missing.includes(f.key) ? (stored(f.key) ? 'Enter it again: saving replaces every credential.' : 'Required.') : serverErrors[`credentials.${f.key}`]}
                            >
                                <input
                                    className="v-field max-w-105 font-mono"
                                    type={f.secret ? 'password' : 'text'}
                                    autoComplete="off"
                                    spellCheck={false}
                                    value={data.credentials[f.key] ?? ''}
                                    onChange={(e) => setData('credentials', { ...data.credentials, [f.key]: e.target.value })}
                                    placeholder={stored(f.key) ? 'Saved. Enter a new value to replace it' : f.placeholder}
                                    aria-label={f.label}
                                />
                            </SettingRow>
                        ))}
                    </SettingsGroup>
                    {configured && !isDirty && (
                        <div className="-mt-2 flex justify-end">
                            <button type="button" className="v-btn v-btn--ghost" onClick={cancelChange}>Keep current credentials</button>
                        </div>
                    )}
                    <SaveBar processing={processing} dirty={isDirty} label="Save credentials" onDiscard={cancelChange} />
                </form>
            )}
        </PageSection>
    );
}
