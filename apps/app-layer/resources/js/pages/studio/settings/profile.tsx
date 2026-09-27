import { useForm, usePage } from '@inertiajs/react';
import { KeyRound } from 'lucide-react';
import type { FormEvent } from 'react';

import { Field, SaveBar, Section } from '../../../components/studio/form';
import SettingsShell from '../../../components/studio/settings-shell';
import { Card } from '../../../components/ui/kit';
import { Avatar, Badge } from '../../../components/ui/primitives';
import type { SharedProps } from '../../../types';

const initials = (name: string) => name.split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase() || '?';

export default function ProfileSettings({ user }: { user: { name: string; email: string } }) {
    const { tenant, surfaces } = usePage<SharedProps>().props;
    const profile = useForm({ name: user.name, email: user.email });
    const password = useForm({ current_password: '', password: '', password_confirmation: '' });

    const saveProfile = (e: FormEvent) => { e.preventDefault(); profile.put('/studio/settings/profile', { preserveScroll: true }); };
    const savePassword = (e: FormEvent) => { e.preventDefault(); password.put('/studio/settings/password', { preserveScroll: true, onSuccess: () => password.reset() }); };

    const mismatch = password.data.password_confirmation !== '' && password.data.password !== password.data.password_confirmation;

    return (
        <SettingsShell title="Profile" description="How you appear to your team, and how you sign in.">
            <Card className="mb-5 flex flex-wrap items-center gap-5 px-6 py-6">
                <Avatar initials={initials(profile.data.name || user.name)} name={user.email} size={64} />
                <div className="min-w-0 flex-1">
                    <div className="truncate text-xl font-semibold tracking-tight text-primary">{profile.data.name || user.name}</div>
                    <div className="mt-0.5 truncate text-sm text-secondary">{profile.data.email || user.email}</div>
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                        {tenant?.current && <Badge>{tenant.current.name}</Badge>}
                        {surfaces.map((s) => <Badge key={s.key} tone="accent">{s.label}</Badge>)}
                    </div>
                </div>
            </Card>

            <form onSubmit={saveProfile}>
                <Section title="Your details" description="Your name shows on conversations you handle and notes you leave.">
                    <Field inline label="Name" hint="Teammates and, in some replies, customers see this." error={profile.errors.name}>
                        <input className="v-field max-w-95" autoComplete="name" value={profile.data.name} onChange={(e) => profile.setData('name', e.target.value)} />
                    </Field>
                    <Field inline label="Email" hint="You sign in with this, and notifications go here." error={profile.errors.email}>
                        <input className="v-field max-w-95" type="email" autoComplete="email" value={profile.data.email} onChange={(e) => profile.setData('email', e.target.value)} />
                    </Field>
                </Section>
                <SaveBar processing={profile.processing} dirty={profile.isDirty} onDiscard={() => profile.reset()} />
            </form>

            <form onSubmit={savePassword}>
                <Section title="Password" description="Enter your current password to set a new one. To sign out your other devices as well, use Sessions.">
                    <Field inline label="Current password" error={password.errors.current_password}>
                        <input className="v-field max-w-95" type="password" autoComplete="current-password" value={password.data.current_password} onChange={(e) => password.setData('current_password', e.target.value)} />
                    </Field>
                    <Field inline label="New password" hint="At least 8 characters. A passphrase is easier to remember." error={password.errors.password}>
                        <input className="v-field max-w-95" type="password" autoComplete="new-password" value={password.data.password} onChange={(e) => password.setData('password', e.target.value)} />
                    </Field>
                    <Field inline label="Confirm new password" error={mismatch ? 'Does not match the new password yet.' : undefined}>
                        <input className="v-field max-w-95" type="password" autoComplete="new-password" value={password.data.password_confirmation} onChange={(e) => password.setData('password_confirmation', e.target.value)} />
                    </Field>
                    <div className="mt-5 flex justify-end">
                        <button type="submit" className="v-btn v-btn--quiet" disabled={password.processing || !password.data.current_password || !password.data.password || mismatch}>
                            <KeyRound size={14} strokeWidth={2} />{password.processing ? 'Changing…' : 'Change password'}
                        </button>
                    </div>
                </Section>
            </form>
        </SettingsShell>
    );
}
