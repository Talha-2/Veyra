import { ArrowRight, BookOpen, Info, Key, Webhook } from 'lucide-react';
import type { ReactNode } from 'react';

import { Callout, Card, CopyButton } from '../ui/kit';
import { CodeTabs } from './code-block';
import type { Endpoint } from './openapi';
import { LANGS, snippet } from './snippets';

/** The first request anyone should make: it proves the key, the URL and the scopes in one go. */
const ME: Endpoint = {
    id: 'getMe', method: 'get', path: '/me', summary: 'Get the current key', description: '', scope: null, publishable: true, isPublic: false,
    pathParams: [], queryParams: [], body: null, response: null, errors: [],
};

function Step({ n, title, children, action }: { n: number; title: string; children: ReactNode; action?: ReactNode }) {
    return (
        <li className="grid gap-x-5 gap-y-3 px-7 py-7 sm:grid-cols-[32px_1fr]" style={{ borderTop: n > 1 ? '1px solid var(--separator)' : undefined }}>
            <span className="flex size-8 items-center justify-center rounded-full text-sm font-semibold text-primary tabular-nums" style={{ background: 'var(--surface-sunken)', boxShadow: 'inset 0 0 0 1px var(--border)' }}>{n}</span>
            <div className="min-w-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <h3 className="pt-1 text-md font-semibold text-primary">{title}</h3>
                    {action}
                </div>
                <div className="mt-2 text-base text-secondary">{children}</div>
            </div>
        </li>
    );
}

function Row({ label, value, copy }: { label: string; value: string; copy?: string }) {
    return (
        <div className="grid items-center gap-x-6 gap-y-1 px-7 py-4 sm:grid-cols-[160px_1fr_auto]" style={{ borderTop: '1px solid var(--separator)' }}>
            <span className="text-sm text-tertiary">{label}</span>
            <span className="min-w-0 truncate font-mono text-sm text-primary">{value}</span>
            {copy !== undefined ? <CopyButton value={copy} /> : <span />}
        </div>
    );
}

export default function GetStarted({ baseUrl, docsUrl, hasKey, onCreateKey, onWebhooks, onReference }: {
    baseUrl: string; docsUrl: string; hasKey: boolean; onCreateKey: () => void; onWebhooks: () => void; onReference: () => void;
}) {
    return (
        <div className="flex flex-col gap-12">
            <section>
                <h2 className="mb-5 text-xl font-semibold tracking-tight text-primary">Connect in three steps</h2>
                <Card className="overflow-hidden">
                    <ol>
                        <Step n={1} title="Create a server key"
                            action={<button type="button" className="v-btn v-btn--quiet v-btn--sm" onClick={onCreateKey}><Key size={13} strokeWidth={2} />{hasKey ? 'Create another' : 'Create a key'}</button>}>
                            One per system that calls Veyra, with only the scopes it needs. The key is shown once; store it as <code className="font-mono text-sm">VEYRA_API_KEY</code> on your server.
                        </Step>
                        <Step n={2} title="Make your first request">
                            <p className="mb-4"><code className="font-mono text-sm">GET /me</code> returns the key's organization and scopes — proof the key, the URL and the header are right.</p>
                            <CodeTabs samples={LANGS.map((l) => ({ value: l.value, label: l.label, code: snippet(l.value, ME, baseUrl) }))} />
                        </Step>
                        <Step n={3} title="Hear about changes as they happen"
                            action={<button type="button" className="v-btn v-btn--quiet v-btn--sm" onClick={onWebhooks}><Webhook size={13} strokeWidth={2} />Add an endpoint</button>}>
                            Instead of polling, add a webhook endpoint. Veyra POSTs a signed event when a ticket is raised, a call ends, a lead changes stage and more — whether it happened in Desk, on a call or through the API.
                        </Step>
                    </ol>
                </Card>
            </section>

            <section>
                <h2 className="mb-5 text-xl font-semibold tracking-tight text-primary">Connection details</h2>
                <Card className="overflow-hidden">
                    <div className="px-7 pt-6 pb-5 text-base text-secondary">Everything your integration needs. Share the reference with a partner before they have an account — it needs no sign-in.</div>
                    <Row label="Base URL" value={baseUrl} copy={baseUrl} />
                    <Row label="Authentication" value="Authorization: Bearer vy_sk_…" />
                    <Row label="Webhook signature" value="X-Veyra-Signature: sha256=<hmac>" />
                    <Row label="OpenAPI 3.1" value={`${baseUrl}/openapi.json`} copy={`${baseUrl}/openapi.json`} />
                    <Row label="Public reference" value={docsUrl} copy={docsUrl} />
                </Card>
                <div className="mt-5 flex flex-wrap gap-2">
                    <button type="button" className="v-btn v-btn--quiet" onClick={onReference}><BookOpen size={14} strokeWidth={2} />Browse the reference<ArrowRight size={14} strokeWidth={2} /></button>
                    <a className="v-btn v-btn--ghost" href={docsUrl} target="_blank" rel="noreferrer">Open public docs</a>
                </div>
            </section>

            <section>
                <h2 className="mb-5 text-xl font-semibold tracking-tight text-primary">Good to know</h2>
                <div className="flex flex-col gap-4">
                    <Callout tone="info" icon={<Info size={16} strokeWidth={2} />} title="Outbound messages are recorded, not sent — yet">
                        Sending SMS and email is not connected. A message created through the API appears in the Desk thread with status <code className="font-mono text-sm">queued</code> and stays queued until it is.
                    </Callout>
                    <Callout tone="info" icon={<Info size={16} strokeWidth={2} />} title="Agent chat is coming">
                        Endpoints for chatting with your agent from your own site or backend will appear under <code className="font-mono text-sm">/chat</code>. Until then the API covers the records: contacts, conversations, tickets, leads, calls and knowledge.
                    </Callout>
                </div>
            </section>
        </div>
    );
}
