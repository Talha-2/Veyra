import { Link, useForm } from '@inertiajs/react';
import type { FormEvent } from 'react';

import AuthLayout, { Field } from '../../layouts/auth-layout';

export default function Register() {
    const { data, setData, post, processing, errors } = useForm({
        name: '',
        email: '',
        password: '',
        password_confirmation: '',
    });

    const submit = (event: FormEvent) => {
        event.preventDefault();
        post('/register', {
            onFinish: () => {
                setData('password', '');
                setData('password_confirmation', '');
            },
        });
    };

    return (
        <AuthLayout title="Create account" lead="You will set up your organization next.">
            <form onSubmit={submit}>
                <Field label="Name" error={errors.name}>
                    <input
                        className="v-field"
                        value={data.name}
                        onChange={(e) => setData('name', e.target.value)}
                        autoComplete="name"
                        autoFocus
                        required
                    />
                </Field>

                <Field label="Email" error={errors.email}>
                    <input
                        type="email"
                        className="v-field"
                        value={data.email}
                        onChange={(e) => setData('email', e.target.value)}
                        autoComplete="username"
                        required
                    />
                </Field>

                <Field label="Password" error={errors.password}>
                    <input
                        type="password"
                        className="v-field"
                        value={data.password}
                        onChange={(e) => setData('password', e.target.value)}
                        autoComplete="new-password"
                        required
                    />
                </Field>

                <Field label="Confirm password">
                    <input
                        type="password"
                        className="v-field"
                        value={data.password_confirmation}
                        onChange={(e) => setData('password_confirmation', e.target.value)}
                        autoComplete="new-password"
                        required
                    />
                </Field>

                <button type="submit" className="v-btn v-btn--primary mt-2 h-11 w-full text-md" disabled={processing}>
                    {processing ? 'Creating…' : 'Create account'}
                </button>
            </form>

            <p className="mt-8 text-sm text-tertiary">
                Already have one?{' '}
                <Link href="/login" className="font-medium text-accent-text hover:underline">
                    Sign in
                </Link>
            </p>
        </AuthLayout>
    );
}
