import { useForm } from '@inertiajs/react';
import { useMemo, type FormEvent } from 'react';

import { Field, SaveBar, Section } from '../../../components/studio/form';
import SettingsShell from '../../../components/studio/settings-shell';
import { Card, CopyButton } from '../../../components/ui/kit';
import { Avatar } from '../../../components/ui/primitives';

function initials(name: string): string {
    return name.split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase() || '?';
}

/** "3:42 PM, Tuesday" in the given zone, or null when the zone is not a real one. */
function localTime(zone: string): string | null {
    try {
        return new Date().toLocaleString(undefined, { timeZone: zone, hour: 'numeric', minute: '2-digit', weekday: 'long' });
    } catch {
        return null;
    }
}

export default function OrganizationSettings({ organization }: { organization: { name: string; slug: string; timezone: string } }) {
    const { data, setData, put, processing, errors, isDirty, reset } = useForm({ name: organization.name, timezone: organization.timezone });
    const submit = (e: FormEvent) => { e.preventDefault(); put('/studio/settings/organization', { preserveScroll: true }); };

    const zones = useMemo(() => {
        try { return Intl.supportedValuesOf('timeZone'); } catch { return []; }
    }, []);
    const now = localTime(data.timezone);

    return (
        <SettingsShell title="Organization" description="How your organization is named and which clock it runs on.">
            <Card className="mb-5 flex items-center gap-4 px-6 py-5">
                <Avatar initials={initials(data.name || organization.name)} name={organization.slug} size={52} />
                <div className="min-w-0 flex-1">
                    <div className="truncate text-lg font-semibold tracking-tight text-primary">{data.name || organization.name}</div>
                    <div className="mt-0.5 truncate text-sm text-secondary">
                        <span className="font-mono">{organization.slug}</span>
                        <span className="text-tertiary"> · {organization.timezone.replace(/_/g, ' ')}</span>
                    </div>
                </div>
                <CopyButton value={organization.slug} label="Copy identifier" />
            </Card>

            <form onSubmit={submit}>
                <Section title="Details" description="Shown to your team in Desk and Studio, and in emails the platform sends on your behalf.">
                    <Field inline label="Name" hint="What your team and invitees see." error={errors.name}>
                        <input className="v-field max-w-95" value={data.name} onChange={(e) => setData('name', e.target.value)} />
                    </Field>
                    <Field inline label="Identifier" hint="Used in URLs and by the agent layer. Fixed once the organization exists.">
                        <input className="v-field max-w-95 font-mono" value={organization.slug} disabled />
                    </Field>
                    <Field
                        inline
                        label="Timezone"
                        hint="Business hours, reports and scheduled automations run on this clock."
                        error={errors.timezone}
                    >
                        <input className="v-field max-w-95" list="org-timezones" value={data.timezone} onChange={(e) => setData('timezone', e.target.value)} spellCheck={false} />
                        <datalist id="org-timezones">{zones.map((z) => <option key={z} value={z} />)}</datalist>
                        <p className="mt-1.5 text-xs text-tertiary">
                            {now ? <>It is <span className="font-medium text-secondary">{now}</span> there now.</> : 'Not a recognised timezone. Try a region name such as Asia/Karachi.'}
                        </p>
                    </Field>
                </Section>
                <SaveBar processing={processing} dirty={isDirty} onDiscard={() => reset()} />
            </form>
        </SettingsShell>
    );
}
