import { useForm } from '@inertiajs/react';
import { LogOut, Monitor, Smartphone, Tablet } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import SettingsShell from '../../../components/studio/settings-shell';
import { PanelHeader, SettingRow, SettingsGroup } from '../../../components/studio-ops/page-parts';
import { Card, IconTile, List } from '../../../components/ui/kit';
import { Badge, RelativeTime } from '../../../components/ui/primitives';

interface Session { id: string; ip: string | null; agent: string; last_active: string; current: boolean }

/** "Chrome on macOS" from a user-agent string. Good enough to recognise your own laptop; not a fingerprint. */
function describe(agent: string): { label: string; kind: 'desktop' | 'phone' | 'tablet' } {
    const ua = agent.toLowerCase();
    const kind = /ipad|tablet/.test(ua) ? 'tablet' : /iphone|android.*mobile|mobile/.test(ua) ? 'phone' : 'desktop';
    const browser = /edg\//.test(ua) ? 'Edge' : /opr\/|opera/.test(ua) ? 'Opera' : /firefox\//.test(ua) ? 'Firefox' : /chrome\/|crios\//.test(ua) ? 'Chrome' : /safari\//.test(ua) ? 'Safari' : null;
    const os = /iphone|ipad/.test(ua) ? 'iOS' : /android/.test(ua) ? 'Android' : /mac os x|macintosh/.test(ua) ? 'macOS' : /windows/.test(ua) ? 'Windows' : /linux/.test(ua) ? 'Linux' : null;

    if (!browser && !os) return { label: agent ? 'Unrecognised browser' : 'Unknown browser', kind };
    return { label: [browser ?? 'Browser', os].filter(Boolean).join(' on '), kind };
}

const ICON = { desktop: Monitor, phone: Smartphone, tablet: Tablet };

export default function SessionSettings({ sessions }: { sessions: Session[] }) {
    const { data, setData, post, processing, errors, reset } = useForm({ password: '' });
    const submit = (e: FormEvent) => { e.preventDefault(); post('/studio/settings/sessions/logout-others', { preserveScroll: true, onSuccess: () => reset() }); };

    const ordered = [...sessions].sort((a, b) => Number(b.current) - Number(a.current));
    const others = sessions.length - 1;
    // A long list of old sessions buries the one decision on this page.
    const [showAll, setShowAll] = useState(false);
    const LIMIT = 8;
    const shown = showAll ? ordered : ordered.slice(0, LIMIT);

    return (
        <SettingsShell title="Sessions" description="Every browser where you are signed in to Veyra. If you do not recognise one, sign it out and change your password.">
            <Card className="mb-6">
                <PanelHeader title="Where you are signed in" description={`${sessions.length} ${sessions.length === 1 ? 'device' : 'devices'}, most recently active first.`} />
                <List>
                    {shown.map((s) => {
                        const d = describe(s.agent);
                        const Icon = ICON[d.kind];
                        return (
                            <div key={s.id} className="flex min-h-16 items-center gap-4 px-7 py-3">
                                <IconTile tone={s.current ? 'success' : 'muted'} size={36}><Icon size={16} strokeWidth={1.9} /></IconTile>
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-base font-medium text-primary">{d.label}</div>
                                    <div className="truncate text-sm text-secondary tabular-nums">{s.ip ?? 'Unknown IP address'}</div>
                                </div>
                                {s.current
                                    ? <Badge tone="success" dot>This device</Badge>
                                    : <span className="text-sm text-tertiary">Active <RelativeTime at={s.last_active} className="text-sm" /></span>}
                            </div>
                        );
                    })}
                </List>
                {ordered.length > LIMIT && (
                    <div className="px-7 py-4" style={{ borderTop: '1px solid var(--separator)' }}>
                        <button type="button" className="v-btn v-btn--ghost v-btn--sm -ml-3" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
                            {showAll ? 'Show fewer' : `Show all ${ordered.length} sessions`}
                        </button>
                    </div>
                )}
                {others === 0 && (
                    <p className="rounded-b-lg px-7 py-4 text-sm text-secondary" style={{ borderTop: '1px solid var(--separator)', background: 'var(--bg-subtle)' }}>You are only signed in here.</p>
                )}
            </Card>

            {others > 0 && (
                <form onSubmit={submit}>
                    <SettingsGroup title="Sign out everywhere else" description={`Ends the ${others} other ${others === 1 ? 'session' : 'sessions'} listed above. This device stays signed in.`}>
                        <SettingRow label="Your password" hint="Confirms it is you before anyone is signed out." error={errors.password} htmlFor="sessions-password">
                            <div className="flex max-w-120 flex-wrap gap-3">
                                <input id="sessions-password" className="v-field min-w-50 flex-1" type="password" autoComplete="current-password" value={data.password} onChange={(e) => setData('password', e.target.value)} />
                                <button type="submit" className="v-btn v-btn--danger h-10" disabled={processing || !data.password}>
                                    <LogOut size={14} strokeWidth={2} />{processing ? 'Signing out…' : `Sign out ${others} ${others === 1 ? 'other' : 'others'}`}
                                </button>
                            </div>
                        </SettingRow>
                    </SettingsGroup>
                </form>
            )}
        </SettingsShell>
    );
}
