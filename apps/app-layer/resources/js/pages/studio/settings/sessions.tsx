import { useForm } from '@inertiajs/react';
import { LogOut, Monitor, Smartphone, Tablet } from 'lucide-react';
import type { FormEvent } from 'react';

import { Field, Section } from '../../../components/studio/form';
import SettingsShell from '../../../components/studio/settings-shell';
import { Card, CardFooter, CardHeader, IconTile, List, ListRow } from '../../../components/ui/kit';
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

    return (
        <SettingsShell title="Sessions" description="Every browser where you are signed in to Veyra. If you do not recognise one, sign it out and change your password.">
            <Card className="mb-5">
                <CardHeader title="Where you are signed in" description={`${sessions.length} ${sessions.length === 1 ? 'device' : 'devices'}, most recently active first.`} />
                <List>
                    {ordered.map((s) => {
                        const d = describe(s.agent);
                        const Icon = ICON[d.kind];
                        return (
                            <ListRow
                                key={s.id}
                                leading={<IconTile tone={s.current ? 'success' : 'muted'}><Icon size={16} strokeWidth={1.9} /></IconTile>}
                                title={d.label}
                                subtitle={<span className="tabular-nums">{s.ip ?? 'Unknown IP address'}</span>}
                                trailing={s.current
                                    ? <Badge tone="success" dot>This device</Badge>
                                    : <span className="text-xs text-tertiary">Active <RelativeTime at={s.last_active} /></span>}
                            />
                        );
                    })}
                </List>
                {others === 0 && (
                    <CardFooter><span className="mr-auto text-sm text-secondary">You are only signed in here.</span></CardFooter>
                )}
            </Card>

            {others > 0 && (
                <form onSubmit={submit}>
                    <Section title="Sign out everywhere else" description={`Ends the ${others} other ${others === 1 ? 'session' : 'sessions'} listed above. This device stays signed in.`}>
                        <Field inline label="Your password" hint="Confirms it is you before anyone is signed out." error={errors.password}>
                            <div className="flex max-w-110 flex-wrap gap-2">
                                <input className="v-field min-w-50 flex-1" type="password" autoComplete="current-password" value={data.password} onChange={(e) => setData('password', e.target.value)} />
                                <button type="submit" className="v-btn v-btn--danger" disabled={processing || !data.password}>
                                    <LogOut size={14} strokeWidth={2} />{processing ? 'Signing out…' : `Sign out ${others} ${others === 1 ? 'other' : 'others'}`}
                                </button>
                            </div>
                        </Field>
                    </Section>
                </form>
            )}
        </SettingsShell>
    );
}
