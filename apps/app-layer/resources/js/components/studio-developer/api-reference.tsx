import { ChevronRight, Lock, MessagesSquare, Radio } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { Card, CopyButton } from '../ui/kit';
import { Badge, EmptyState, Eyebrow } from '../ui/primitives';
import { CodeBlock, CodeTabs, pretty } from './code-block';
import { resources as toResources, webhookEvents, type Endpoint, type Field, type Resource } from './openapi';
import { InlineProse, MethodBadge, Prose } from './prose';
import { LANGS, snippet, VERIFY } from './snippets';
import type { OpenApiDoc } from './types';

/**
 * The API reference, rendered from the OpenAPI document. Used by Studio ›
 * Developer and by the public /docs/api page, so what a partner reads before
 * signing up is what a customer reads after.
 *
 * One resource at a time, chosen from the sub-nav and kept in the URL hash
 * (`#api-tickets`), so a link to a section survives being pasted in a chat.
 */

const OVERVIEW = 'overview';
const EVENTS = 'webhook-events';
const HASH = 'api-';

function currentHash(valid: string[]): string {
    const h = typeof window === 'undefined' ? '' : window.location.hash.replace('#', '');
    const slug = h.startsWith(HASH) ? h.slice(HASH.length).split('--')[0] : '';
    return valid.includes(slug) ? slug : OVERVIEW;
}

export default function ApiReference({ spec, baseUrl }: { spec: OpenApiDoc; baseUrl: string }) {
    const resources = useMemo(() => toResources(spec), [spec]);
    const valid = [OVERVIEW, EVENTS, ...resources.map((r) => r.slug)];
    const [active, setActive] = useState(() => currentHash(valid));
    const top = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const onHash = () => setActive(currentHash(valid));
        window.addEventListener('hashchange', onHash);
        // Deep link to an endpoint: scroll to it once rendered.
        const endpoint = window.location.hash.split('--')[1];
        if (endpoint) window.setTimeout(() => document.getElementById(`ep-${endpoint}`)?.scrollIntoView({ block: 'start' }), 50);
        return () => window.removeEventListener('hashchange', onHash);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const go = (slug: string) => {
        setActive(slug);
        history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${HASH}${slug}`);
        const y = (top.current?.getBoundingClientRect().top ?? 0) + window.scrollY - 24;
        if (window.scrollY > y) window.scrollTo({ top: y, behavior: 'smooth' });
    };

    const resource = resources.find((r) => r.slug === active);

    const nav: { group: string; items: { slug: string; label: string; count?: number; soon?: boolean }[] }[] = [
        { group: 'Start', items: [{ slug: OVERVIEW, label: 'Overview' }] },
        { group: 'Resources', items: resources.map((r) => ({ slug: r.slug, label: r.name, count: r.endpoints.length || undefined, soon: r.comingSoon })) },
        { group: 'Events', items: [{ slug: EVENTS, label: 'Webhook events', count: Object.keys(spec.webhooks ?? {}).length }] },
    ];

    return (
        <div ref={top} className="grid scroll-mt-6 gap-10 xl:grid-cols-[220px_minmax(0,1fr)]">
            <nav aria-label="API reference" className="xl:sticky xl:top-8 xl:max-h-[calc(100vh-64px)] xl:self-start xl:overflow-y-auto">
                {/* Below xl the sub-nav is a wrapped row of pills above the content. */}
                <div className="flex flex-wrap gap-2 xl:hidden">
                    {nav.flatMap((g) => g.items).map((item) => (
                        <button key={item.slug} type="button" onClick={() => go(item.slug)} aria-current={active === item.slug ? 'page' : undefined}
                            className="h-8 rounded-full px-3.5 text-sm font-medium transition-colors"
                            style={active === item.slug ? { background: 'var(--accent-subtle)', color: 'var(--accent-text)', boxShadow: 'inset 0 0 0 1px var(--border-accent)' } : { color: 'var(--text-secondary)', boxShadow: 'inset 0 0 0 1px var(--border-strong)' }}>
                            {item.label}
                        </button>
                    ))}
                </div>
                <div className="hidden flex-col gap-7 xl:flex">
                    {nav.map((g) => (
                        <div key={g.group}>
                            <Eyebrow className="mb-2 block px-3">{g.group}</Eyebrow>
                            <ul className="flex flex-col gap-0.5">
                                {g.items.map((item) => {
                                    const on = active === item.slug;
                                    return (
                                        <li key={item.slug}>
                                            <button type="button" onClick={() => go(item.slug)} aria-current={on ? 'page' : undefined}
                                                className="flex h-9 w-full items-center gap-2 rounded-md px-3 text-left text-sm transition-colors hover:bg-surface-hover"
                                                style={on ? { background: 'var(--accent-subtle)', color: 'var(--accent-text)', fontWeight: 600 } : { color: 'var(--text-secondary)' }}>
                                                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                                                {item.soon ? <span className="text-2xs text-tertiary">Soon</span> : item.count ? <span className="text-2xs text-tertiary tabular-nums">{item.count}</span> : null}
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    ))}
                </div>
            </nav>

            <div className="min-w-0">
                {active === OVERVIEW && <Overview spec={spec} baseUrl={baseUrl} resources={resources} go={go} />}
                {active === EVENTS && <Events spec={spec} />}
                {resource && (resource.comingSoon ? <ComingSoon resource={resource} /> : <ResourceDoc resource={resource} baseUrl={baseUrl} spec={spec} />)}
            </div>
        </div>
    );
}

// ── overview ───────────────────────────────────────────────────────────────

function Heading({ title, children }: { title: string; children?: ReactNode }) {
    return (
        <header className="mb-8">
            <h2 className="text-2xl font-semibold tracking-tight text-primary">{title}</h2>
            {children && <div className="mt-2">{children}</div>}
        </header>
    );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="mb-12 last:mb-0">
            <h3 className="mb-4 text-lg font-semibold tracking-tight text-primary">{title}</h3>
            {children}
        </section>
    );
}

function Overview({ spec, baseUrl, resources, go }: { spec: OpenApiDoc; baseUrl: string; resources: Resource[]; go: (slug: string) => void }) {
    const me = resources.flatMap((r) => r.endpoints).find((e) => e.id === 'getMe');
    const limit = spec['x-rate-limit'] ?? 120;

    return (
        <>
            <Heading title={`${spec.info.title} ${spec.info.version.split('.')[0] === '1' ? 'v1' : spec.info.version}`}>
                <Prose text={spec.info.summary ?? ''} />
            </Heading>

            <Block title="Base URL">
                <div className="flex items-center gap-3 rounded-md px-4 py-3" style={{ background: 'var(--surface-sunken)', boxShadow: 'inset 0 0 0 1px var(--border)' }}>
                    <code className="min-w-0 flex-1 truncate font-mono text-base text-primary" style={{ background: 'none', border: 'none', padding: 0 }}>{baseUrl}</code>
                    <CopyButton value={baseUrl} />
                </div>
            </Block>

            <Block title="Authentication">
                <Prose text={'Send a server key in the `Authorization` header on every request. Keys are created in Studio › Developer, belong to one organization, and carry scopes — a route that needs a scope the key lacks answers 403 `insufficient_scope`. Keep server keys (`vy_sk_…`) on your servers.\n\nPublishable keys (`vy_pk_…`) are safe to put in a web page. They can only call routes marked **Publishable** in this reference — `GET /me`, `POST /knowledge/search` and the Agent chat routes — and can only hold the `knowledge:read` and `chat:write` scopes. Chat calls from a browser also send the session\'s `session_token`.'} />
                {me && <div className="mt-5"><CodeTabs samples={LANGS.map((l) => ({ value: l.value, label: l.label, code: snippet(l.value, me, baseUrl) }))} /></div>}
            </Block>

            <Block title="Objects and lists">
                <Prose text={'Every object has a numeric `id`, an `object` naming its type, and `created_at` / `updated_at` in ISO 8601 UTC. Lists return `{"object": "list", "data": [...], "has_more": true, "next_cursor": "…"}`, newest first. Pass `next_cursor` back as `?cursor=` for the next page; `?limit=` takes 1–100 (default 25). Most lists also take `?updated_since=` to fetch only what changed — the simplest way to keep a copy in sync.'} />
            </Block>

            <Block title="Errors">
                <Prose text={'Errors share one shape, `{"error": {"type", "message", "fields"}}`. Branch on `type`; show or log `message`.'} />
                <Card className="mt-5 overflow-hidden">
                    {[
                        ['401', 'authentication_error', 'No key, an unknown key, or a revoked one.'],
                        ['403', 'insufficient_scope', 'The key lacks the route\'s scope (`required_scope` names it), or a publishable key called a server-only route (`permission_error`).'],
                        ['404', 'not_found', 'No such record in this key\'s organization — records of other organizations are invisible, not forbidden.'],
                        ['422', 'validation_error', '`fields` lists what is wrong with each field. Also `not_permitted` (blocked address) and `channel_not_supported`.'],
                        ['429', 'rate_limited', `Over ${limit} requests a minute for this key. Wait for \`Retry-After\` seconds.`],
                        ['500', 'api_error', 'Our fault. Safe to retry reads; retry writes only after checking they did not land.'],
                    ].map(([status, type, meaning]) => (
                        <div key={status} className="grid gap-x-6 gap-y-1 px-5 py-4 sm:grid-cols-[56px_190px_1fr]" style={{ borderTop: status === '401' ? undefined : '1px solid var(--separator)' }}>
                            <span className="font-mono text-sm font-semibold text-primary tabular-nums">{status}</span>
                            <span className="font-mono text-sm text-secondary">{type}</span>
                            <span className="text-sm text-secondary"><InlineProse text={meaning} /></span>
                        </div>
                    ))}
                </Card>
            </Block>

            <Block title="Rate limits">
                <Prose text={`${limit} requests a minute per key. Every response carries \`X-RateLimit-Limit\`, \`X-RateLimit-Remaining\` and \`X-RateLimit-Reset\` (Unix seconds); a 429 adds \`Retry-After\`. Need more? Split work across keys per system, not per request.`} />
            </Block>

            <Block title="What you can reach">
                <div className="grid gap-4 sm:grid-cols-2">
                    {resources.filter((r) => r.name !== 'Authentication').map((r) => (
                        <button key={r.slug} type="button" onClick={() => go(r.slug)}
                            className="v-panel v-card-hover flex items-start gap-3 p-5 text-left">
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 text-md font-semibold text-primary">
                                    {r.name}
                                    {r.comingSoon && <Badge tone="info">Coming</Badge>}
                                </div>
                                <p className="mt-1 line-clamp-2 text-sm text-secondary"><InlineProse text={r.description} /></p>
                            </div>
                            <ChevronRight size={16} className="mt-1 shrink-0 text-tertiary" />
                        </button>
                    ))}
                </div>
            </Block>
        </>
    );
}

// ── one resource ───────────────────────────────────────────────────────────

function ResourceDoc({ resource, baseUrl, spec }: { resource: Resource; baseUrl: string; spec: OpenApiDoc }) {
    return (
        <>
            <Heading title={resource.name}><Prose text={resource.description} /></Heading>

            <Card className="mb-12 overflow-hidden">
                {resource.endpoints.map((ep, i) => (
                    <a key={ep.id} href={`#${HASH}${resource.slug}--${ep.id}`}
                        onClick={(e) => { e.preventDefault(); history.replaceState(null, '', `#${HASH}${resource.slug}--${ep.id}`); document.getElementById(`ep-${ep.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
                        className="flex min-h-13 items-center gap-4 px-5 py-3 transition-colors hover:bg-surface-hover"
                        style={{ borderTop: i ? '1px solid var(--separator)' : undefined }}>
                        <MethodBadge method={ep.method} size="sm" />
                        <span className="min-w-0 flex-1 truncate font-mono text-sm text-primary">{ep.path}</span>
                        <span className="hidden truncate text-sm text-secondary md:block">{ep.summary}</span>
                    </a>
                ))}
            </Card>

            <div className="flex flex-col gap-10">
                {resource.endpoints.map((ep) => <EndpointDoc key={ep.id} ep={ep} baseUrl={baseUrl} spec={spec} />)}
            </div>
        </>
    );
}

/** The spec repeats the scope in prose for other readers; here it is a badge. */
const stripScope = (d: string) => d.replace(/\s*(Requires the `[^`]+` scope\.|Any valid key\.)\s*(Publishable keys allowed\.)?\s*$/, '').trim();

function EndpointDoc({ ep, baseUrl }: { ep: Endpoint; baseUrl: string; spec: OpenApiDoc }) {
    const description = stripScope(ep.description);

    return (
        <Card as="article" className="scroll-mt-6 overflow-hidden">
            <div id={`ep-${ep.id}`} className="scroll-mt-8 px-7 pt-7 pb-6">
                <h3 className="text-lg font-semibold tracking-tight text-primary">{ep.summary}</h3>
                <div className="mt-3 flex min-w-0 items-center gap-3">
                    <MethodBadge method={ep.method} />
                    <code className="min-w-0 truncate font-mono text-md text-primary" style={{ background: 'none', border: 'none', padding: 0 }}>{ep.path}</code>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                    {ep.isPublic ? <Badge tone="success">No key needed</Badge>
                        : ep.scope ? <Badge tone={ep.scope.endsWith(':write') ? 'warning' : 'muted'}><Lock size={11} strokeWidth={2.2} className="mr-1" /><span className="font-mono">{ep.scope}</span></Badge>
                            : <Badge>Any key</Badge>}
                    {ep.publishable && <Badge tone="info">Publishable</Badge>}
                </div>
                {description && <Prose text={description} className="mt-5" />}
            </div>

            <div className="flex flex-col gap-8 px-7 pb-7">
                {ep.pathParams.length > 0 && <Fields title="Path parameters" fields={ep.pathParams} />}
                {ep.queryParams.length > 0 && <Fields title="Query parameters" fields={ep.queryParams} />}
                {ep.body && <Fields title="Body" fields={ep.body.fields} />}

                <div>
                    <SubTitle>Request</SubTitle>
                    <CodeTabs samples={LANGS.map((l) => ({ value: l.value, label: l.label, code: snippet(l.value, ep, baseUrl) }))} />
                </div>

                {ep.response && (
                    <div>
                        <SubTitle>Response <span className="ml-1 font-mono text-sm font-medium text-success">{ep.response.status}</span></SubTitle>
                        <CodeBlock code={pretty(ep.response.example)} title="application/json" maxHeight={360} />
                    </div>
                )}

                {ep.errors.length > 0 && (
                    <div>
                        <SubTitle>Errors</SubTitle>
                        <div className="flex flex-wrap gap-2">
                            {ep.errors.map((e) => (
                                <span key={e.status} title={e.description} className="inline-flex h-7 items-center gap-2 rounded-full px-3 text-xs text-secondary" style={{ boxShadow: 'inset 0 0 0 1px var(--border-strong)' }}>
                                    <span className="font-mono font-semibold text-primary">{e.status}</span>
                                    {(e.example as { error?: { type?: string } } | undefined)?.error?.type}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </Card>
    );
}

function SubTitle({ children }: { children: ReactNode }) {
    return <h4 className="mb-3 text-sm font-semibold text-primary">{children}</h4>;
}

function Fields({ title, fields }: { title: string; fields: Field[] }) {
    return (
        <div>
            <SubTitle>{title}</SubTitle>
            <div className="rounded-md" style={{ boxShadow: 'inset 0 0 0 1px var(--border)' }}>
                {fields.map((f, i) => (
                    <div key={f.name} className="px-4 py-3.5" style={{ borderTop: i ? '1px solid var(--separator)' : undefined }}>
                        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                            <span className="font-mono text-sm font-semibold text-primary">{f.name}</span>
                            <span className="font-mono text-xs text-tertiary">{f.type}</span>
                            {f.required && <span className="text-xs font-medium text-warning">required</span>}
                        </div>
                        {(f.description || f.enumValues) && (
                            <p className="mt-1 text-sm text-secondary">
                                {f.description && <InlineProse text={f.description} />}
                                {f.enumValues && f.enumValues.length <= 20 && (
                                    <span className="mt-1.5 flex flex-wrap gap-1.5">
                                        {f.enumValues.map((v) => <code key={String(v)} className="rounded px-1.5 py-px font-mono text-xs text-secondary" style={{ background: 'var(--surface-sunken)' }}>{String(v)}</code>)}
                                    </span>
                                )}
                            </p>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── events, coming soon ────────────────────────────────────────────────────

function Events({ spec }: { spec: OpenApiDoc }) {
    const events = webhookEvents(spec);

    return (
        <>
            <Heading title="Webhook events">
                <Prose text={'Register an endpoint (in Studio › Developer or with `POST /webhook-endpoints`) and Veyra POSTs each subscribed event to it as JSON, a moment after the change happens — whether an operator, the agent or the API made it. `data.object` has the same shape the API returns. Answer with any 2xx within 5 seconds; anything else counts as a failure, and an endpoint that fails 10 times in a row is turned off until you turn it back on.'} />
            </Heading>

            <Block title="Verify the signature">
                <Prose text={'Each delivery carries `X-Veyra-Signature: sha256=<hex>`, the HMAC-SHA256 of the **raw** request body keyed with the endpoint\'s signing secret, plus `X-Veyra-Event` (the type) and `X-Veyra-Delivery` (unique per attempt — use it to ignore a retry you already handled).'} />
                <div className="mt-5"><CodeTabs samples={VERIFY} fallback="node" /></div>
            </Block>

            <Block title="Catalog">
                <Card className="overflow-hidden">
                    {events.map((ev, i) => (
                        <details key={ev.name} className="group" style={{ borderTop: i ? '1px solid var(--separator)' : undefined }}>
                            <summary className="flex min-h-14 cursor-pointer list-none items-center gap-4 px-5 py-3 transition-colors hover:bg-surface-hover">
                                <Radio size={15} strokeWidth={2} className="shrink-0 text-tertiary" />
                                <span className="w-44 shrink-0 font-mono text-sm font-semibold text-primary">{ev.name}</span>
                                <span className="min-w-0 flex-1 truncate text-sm text-secondary">{ev.description.split(' `data.object`')[0]}</span>
                                <ChevronRight size={15} className="shrink-0 text-tertiary transition-transform group-open:rotate-90" />
                            </summary>
                            <div className="px-5 pb-5">
                                <CodeBlock code={pretty(ev.example)} title="Example payload" maxHeight={340} />
                            </div>
                        </details>
                    ))}
                </Card>
            </Block>
        </>
    );
}

function ComingSoon({ resource }: { resource: Resource }) {
    return (
        <>
            <Heading title={resource.name}><Prose text={resource.description} /></Heading>
            <Card>
                <EmptyState icon={<MessagesSquare size={20} strokeWidth={1.8} />} title="Agent chat is on its way">
                    Endpoints under /chat will let your own site or backend hold a conversation with your agent — the same one that answers your phones. They are not available yet; this section fills in when they ship.
                </EmptyState>
            </Card>
        </>
    );
}
