import { useForm } from '@inertiajs/react';
import { useMemo, type FormEvent } from 'react';

import { SaveBar } from '../../../components/studio/form';
import SettingsShell from '../../../components/studio/settings-shell';
import { SettingRow, SettingsGroup } from '../../../components/studio-ops/page-parts';
import { CopyButton } from '../../../components/ui/kit';
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
            <div className="v-panel mb-6 flex flex-wrap items-center gap-5 px-7 py-6">
                <Avatar initials={initials(data.name || organization.name)} name={organization.slug} size={56} />
                <div className="min-w-0 flex-1">
                    <div className="truncate text-xl font-semibold tracking-tight text-primary">{data.name || organization.name}</div>
                    <div className="mt-0.5 truncate text-sm text-secondary">
                        <span className="font-mono">{organization.slug}</span>
                        <span className="text-tertiary"> · {organization.timezone.replace(/_/g, ' ')}</span>
                    </div>
                </div>
                <CopyButton value={organization.slug} label="Copy identifier" />
            </div>

            <form onSubmit={submit}>
                <SettingsGroup title="Details" description="Shown to your team in Desk and Studio, and in emails the platform sends on your behalf.">
                    <SettingRow label="Name" hint="What your team and invitees see." error={errors.name} htmlFor="org-name">
                        <input id="org-name" className="v-field max-w-105" value={data.name} onChange={(e) => setData('name', e.target.value)} />
                    </SettingRow>
                    <SettingRow label="Identifier" hint="Follows the name: renaming the organization updates it." htmlFor="org-slug">
                        <input id="org-slug" className="v-field max-w-105 font-mono" value={organization.slug} disabled />
                    </SettingRow>
                    <SettingRow label="Timezone" hint="Business hours, reports and scheduled automations run on this clock." error={errors.timezone} htmlFor="org-timezone">
                        <input id="org-timezone" className="v-field max-w-105" list="org-timezones" value={data.timezone} onChange={(e) => setData('timezone', e.target.value)} spellCheck={false} />
                        <datalist id="org-timezones">{zones.map((z) => <option key={z} value={z} />)}</datalist>
                        <p className="mt-2 text-sm text-tertiary">
                            {now ? <>It is <span className="font-medium text-secondary">{now}</span> there now.</> : 'Not a recognised timezone. Try a region name such as Asia/Karachi.'}
                        </p>
                    </SettingRow>
                </SettingsGroup>
                <SaveBar processing={processing} dirty={isDirty} onDiscard={() => reset()} />
            </form>
        </SettingsShell>
    );
}
