import { Link, useForm } from '@inertiajs/react';
import type { FormEvent } from 'react';

import AuthLayout, { Field } from '../../layouts/auth-layout';

export default function Login() {
    const { data, setData, post, processing, errors } = useForm({
        email: '',
        password: '',
        remember: false,
    });

    const submit = (event: FormEvent) => {
        event.preventDefault();
        post('/login', { onFinish: () => setData('password', '') });
    };

    return (
        <AuthLayout title="Sign in" lead="Continue to your workspace.">
            <form onSubmit={submit}>
                <Field label="Email" error={errors.email}>
                    <input
                        type="email"
                        className="v-field"
                        value={data.email}
                        onChange={(e) => setData('email', e.target.value)}
                        autoComplete="username"
                        autoFocus
                        required
                    />
                </Field>

                <Field label="Password" error={errors.password}>
                    <input
                        type="password"
                        className="v-field"
                        value={data.password}
                        onChange={(e) => setData('password', e.target.value)}
                        autoComplete="current-password"
                        required
                    />
                </Field>

                <label className="mb-6 flex items-center gap-2 text-sm text-secondary">
                    <input
                        type="checkbox"
                        checked={data.remember}
                        onChange={(e) => setData('remember', e.target.checked)}
                        style={{ accentColor: 'var(--accent)' }}
                    />
                    Stay signed in
                </label>

                <button type="submit" className="v-btn v-btn--primary h-11 w-full text-md" disabled={processing}>
                    {processing ? 'Signing in…' : 'Sign in'}
                </button>
            </form>

            <p className="mt-8 text-sm text-tertiary">
                No account?{' '}
                <Link href="/register" className="font-medium text-accent-text hover:underline">
                    Create one
                </Link>
            </p>
        </AuthLayout>
    );
}
