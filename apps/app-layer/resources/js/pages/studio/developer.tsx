import { Head, router, usePage } from '@inertiajs/react';
import { CheckCircle2, Plus, Webhook } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

import ApiReference from '../../components/studio-developer/api-reference';
import { KeyDialog, KeyList } from '../../components/studio-developer/api-keys';
import GetStarted from '../../components/studio-developer/get-started';
import type { ApiKeyRow, OpenApiDoc, WebhookRow } from '../../components/studio-developer/types';
import { EventCatalog, HookDialog, SignatureHelp, WebhookList } from '../../components/studio-developer/webhooks';
import { Callout, CopyButton, SegmentedControl, Skeleton } from '../../components/ui/kit';
import { PageHeader } from '../../components/ui/page';
import { Badge } from '../../components/ui/primitives';
import type { SharedProps } from '../../types';

interface Props {
    keys: ApiKeyRow[];
    scopes: string[];
    scope_descriptions: Record<string, string>;
    publishable_scopes: string[];
    webhooks: WebhookRow[];
    events: string[];
    event_descriptions: Record<string, string>;
    disable_after: number;
    base_url: string;
    spec?: OpenApiDoc;
}

type Tab = 'start' | 'keys' | 'webhooks' | 'reference';
const TABS: Tab[] = ['start', 'keys', 'webhooks', 'reference'];

function initialTab(): Tab {
    const t = new URLSearchParams(window.location.search).get('tab') as Tab | null;
    return t && TABS.includes(t) ? t : 'start';
}

export default function Developer(props: Props) {
    const { keys, scopes, scope_descriptions, publishable_scopes, webhooks, events, event_descriptions, disable_after, base_url, spec } = props;
    const { flash } = usePage<SharedProps>().props;
    const [tab, setTabState] = useState<Tab>(initialTab);
    const [creatingKey, setCreatingKey] = useState(false);
    const [creatingHook, setCreatingHook] = useState(false);
    const activeKeys = keys.filter((k) => k.active).length;
    const docsUrl = `${window.location.origin}/docs/api`;

    const setTab = (t: Tab) => {
        setTabState(t);
        const url = new URL(window.location.href);
        if (t === 'start') url.searchParams.delete('tab'); else url.searchParams.set('tab', t);
        if (t !== 'reference') url.hash = '';
        history.replaceState(history.state, '', url);
    };

    // A secret was just minted: show it where it belongs.
    useEffect(() => { if (flash.new_key) setTab('keys'); }, [flash.new_key]);
    useEffect(() => { if (flash.new_webhook_secret) setTab('webhooks'); }, [flash.new_webhook_secret]);
    // The spec is the page's largest prop, so it is only fetched for the reference.
    useEffect(() => { if (tab === 'reference' && !spec) router.reload({ only: ['spec'] }); }, [tab, spec]);

    const action = tab === 'webhooks'
        ? <button type="button" className="v-btn v-btn--primary" onClick={() => setCreatingHook(true)}><Webhook size={15} strokeWidth={2} />Add endpoint</button>
        : tab === 'reference' ? null
            : <button type="button" className="v-btn v-btn--primary" onClick={() => setCreatingKey(true)}><Plus size={15} strokeWidth={2} />New API key</button>;

    return (
        <>
            <Head title="Developer" />
            <PageHeader
                title="Developer"
                description="Run Veyra behind your own platform: a REST API over your contacts, conversations, tickets, leads, calls and knowledge, and webhooks that tell your systems the moment something changes."
                meta={<><Badge>{activeKeys} active {activeKeys === 1 ? 'key' : 'keys'}</Badge><Badge>{webhooks.length} {webhooks.length === 1 ? 'endpoint' : 'endpoints'}</Badge><Badge>API v1</Badge></>}
                actions={action}
            />

            <div className="-mx-1 mb-10 max-w-[calc(100%+8px)] overflow-x-auto px-1 pb-1">
                <SegmentedControl<Tab> value={tab} onChange={setTab} options={[
                    { value: 'start', label: 'Get started' },
                    { value: 'keys', label: <>API keys{activeKeys > 0 && <span className="text-2xs text-tertiary tabular-nums">{activeKeys}</span>}</> },
                    { value: 'webhooks', label: <>Webhooks{webhooks.length > 0 && <span className="text-2xs text-tertiary tabular-nums">{webhooks.length}</span>}</> },
                    { value: 'reference', label: 'API reference' },
                ]} />
            </div>

            {flash.new_key && (
                <Secret title="Copy your new API key now" value={flash.new_key}>
                    It will not be shown again. Only a hash is stored, so a lost key cannot be recovered; revoke it and create another.
                </Secret>
            )}
            {flash.new_webhook_secret && (
                <Secret title="Copy the signing secret for this endpoint" value={flash.new_webhook_secret}>
                    Shown once. Verify each delivery by computing HMAC-SHA256 of the raw body with this secret and comparing it to the <span className="font-mono">X-Veyra-Signature</span> header.
                </Secret>
            )}

            {tab === 'start' && (
                <GetStarted baseUrl={base_url} docsUrl={docsUrl} hasKey={activeKeys > 0}
                    onCreateKey={() => setCreatingKey(true)} onWebhooks={() => setTab('webhooks')} onReference={() => setTab('reference')} />
            )}

            {tab === 'keys' && (
                <Section title="API keys" description="A server key can do whatever its scopes allow — keep it on your servers. A publishable key is safe in a web page and can only search knowledge. Revoking a key stops it at once.">
                    <KeyList keys={keys} onCreate={() => setCreatingKey(true)} />
                </Section>
            )}

            {tab === 'webhooks' && (
                <div className="flex flex-col gap-12">
                    <Section title="Endpoints" description={`Signed JSON POSTs, sent a moment after the change. An endpoint that fails ${disable_after} times in a row is turned off so it stops costing requests; switch it back on once it is fixed.`}>
                        <WebhookList webhooks={webhooks} onCreate={() => setCreatingHook(true)} disableAfter={disable_after} />
                    </Section>
                    <Section title="Verifying deliveries" description="Check the signature before trusting a payload.">
                        <SignatureHelp />
                    </Section>
                    <Section title="Event catalog" description="What an endpoint can subscribe to. Choose All events to also receive ones added later. Click a name to copy it.">
                        <EventCatalog events={events} descriptions={event_descriptions} />
                    </Section>
                </div>
            )}

            {tab === 'reference' && (spec ? <ApiReference spec={spec} baseUrl={base_url} /> : (
                <div className="grid gap-10 xl:grid-cols-[220px_minmax(0,1fr)]" aria-busy="true">
                    <div className="hidden flex-col gap-2 xl:flex">{Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
                    <div className="flex flex-col gap-4"><Skeleton className="h-9 w-72" /><Skeleton className="h-5 w-full max-w-xl" /><Skeleton className="mt-6 h-64" /></div>
                </div>
            ))}

            <KeyDialog open={creatingKey} onClose={() => setCreatingKey(false)} scopes={scopes} descriptions={scope_descriptions} publishableScopes={publishable_scopes} />
            <HookDialog open={creatingHook} onClose={() => setCreatingHook(false)} events={events} />
        </>
    );
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
    return (
        <section>
            <h2 className="text-xl font-semibold tracking-tight text-primary">{title}</h2>
            {description && <p className="mt-1.5 mb-6 max-w-[72ch] text-base text-secondary">{description}</p>}
            {children}
        </section>
    );
}

function Secret({ title, value, children }: { title: string; value: string; children: ReactNode }) {
    return (
        <div className="mb-10 animate-rise">
            <Callout tone="success" icon={<CheckCircle2 size={16} strokeWidth={2} />} title={title}>
                <p>{children}</p>
                <div className="mt-3 flex items-center gap-2 rounded-md px-3 py-2" style={{ background: 'var(--surface)', boxShadow: 'inset 0 0 0 1px var(--border-strong)' }}>
                    <code className="min-w-0 flex-1 font-mono text-sm break-all text-primary select-all" style={{ background: 'none', border: 'none', padding: 0 }}>{value}</code>
                    <CopyButton value={value} />
                </div>
            </Callout>
        </div>
    );
}
