import { Head, Link, usePage } from '@inertiajs/react';

import ApiReference from '../../components/studio-developer/api-reference';
import type { OpenApiDoc } from '../../components/studio-developer/types';
import type { SharedProps } from '../../types';

/**
 * /docs/api — the public API reference. No sign-in: a partner evaluating an
 * integration reads exactly what a customer reads in Studio › Developer.
 * Its own minimal chrome, deliberately neither Desk nor Studio.
 */
export default function ApiDocs({ spec, base_url }: { spec: OpenApiDoc; base_url: string }) {
    const { auth } = usePage<SharedProps>().props;

    return (
        <div className="min-h-screen overflow-x-clip bg-bg">
            <Head title="API reference" />
            <header className="sticky top-0 z-20 v-glass" style={{ borderBottom: '1px solid var(--separator)' }}>
                <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-4 px-6 md:px-10 lg:px-14">
                    <span className="text-lg font-semibold tracking-tight text-primary">Veyra</span>
                    <span className="hidden text-sm text-tertiary sm:inline">API reference</span>
                    <span className="flex-1" />
                    <a className="v-btn v-btn--ghost v-btn--sm hidden sm:inline-flex" href={`${base_url}/openapi.json`}>OpenAPI JSON</a>
                    {auth.user
                        ? <Link className="v-btn v-btn--quiet v-btn--sm" href="/studio/developer">Open Studio</Link>
                        : <Link className="v-btn v-btn--quiet v-btn--sm" href="/login">Sign in</Link>}
                </div>
            </header>

            <main className="mx-auto w-full max-w-[1200px] px-6 pt-12 pb-28 md:px-10 lg:px-14">
                <div className="mb-12 animate-rise">
                    <h1 className="text-4xl font-semibold tracking-tight text-primary">Build on Veyra</h1>
                    <p className="mt-3 max-w-[64ch] text-md text-secondary">
                        A REST API over the contacts, conversations, tickets, leads, calls and knowledge behind Veyra Desk — and webhooks that tell your systems when any of it changes. Keys are created in Studio › Developer once you have an account.
                    </p>
                </div>
                <ApiReference spec={spec} baseUrl={base_url} />
            </main>
        </div>
    );
}
