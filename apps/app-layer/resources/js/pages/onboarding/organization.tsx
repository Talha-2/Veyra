import { useForm } from '@inertiajs/react';
import type { FormEvent } from 'react';

import AuthLayout, { Field } from '../../layouts/auth-layout';

export default function CreateOrganization({ timezones }: { timezones: string[] }) {
    const { data, setData, post, processing, errors } = useForm({
        name: '',
        // Guess from the browser. It is right almost always, and the field is
        // right there when it is not.
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    });

    const submit = (event: FormEvent) => {
        event.preventDefault();
        post('/onboarding/organization');
    };

    return (
        <AuthLayout title="Create organization" lead="Everything you build lives inside one of these.">
            <form onSubmit={submit}>
                <Field label="Organization name" error={errors.name}>
                    <input
                        className="v-field"
                        value={data.name}
                        onChange={(e) => setData('name', e.target.value)}
                        autoFocus
                        required
                    />
                </Field>

                <Field label="Timezone" error={errors.timezone}>
                    <select
                        className="v-field"
                        value={data.timezone}
                        onChange={(e) => setData('timezone', e.target.value)}
                    >
                        {timezones.map((zone) => (
                            <option key={zone} value={zone}>
                                {zone}
                            </option>
                        ))}
                    </select>
                </Field>

                <p className="mb-5 text-xs text-tertiary">
                    Used for business hours and when the agent may place calls.
                </p>

                <button type="submit" className="v-btn v-btn--primary h-11 w-full text-md" disabled={processing}>
                    {processing ? 'Creating…' : 'Create organization'}
                </button>
            </form>
        </AuthLayout>
    );
}
