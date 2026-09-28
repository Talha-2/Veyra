import type { OpenApiDoc, OpenApiOperation, OpenApiParameter, OpenApiResponse, Schema } from './types';

/**
 * Turns the OpenAPI document into what the reference renders: resources
 * (tags) holding endpoints, each with its parameters, body fields, examples
 * and error statuses resolved. The document is the only source; nothing here
 * knows an endpoint by name.
 */

export type Method = 'get' | 'post' | 'patch' | 'put' | 'delete';

export interface Field {
    name: string;
    type: string;
    required: boolean;
    description?: string;
    enumValues?: string[];
}

export interface Endpoint {
    id: string;
    method: Method;
    path: string;
    summary: string;
    description: string;
    scope: string | null;
    publishable: boolean;
    isPublic: boolean;
    pathParams: Field[];
    queryParams: (Field & { example?: unknown })[];
    body: { fields: Field[]; example: unknown } | null;
    response: { status: string; description: string; example: unknown } | null;
    errors: { status: string; description: string; example: unknown }[];
}

export interface Resource {
    name: string;
    slug: string;
    description: string;
    comingSoon: boolean;
    endpoints: Endpoint[];
}

const METHODS: Method[] = ['get', 'post', 'patch', 'put', 'delete'];

export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function resolve<T extends { $ref?: string }>(doc: OpenApiDoc, node: T): T {
    if (!node?.$ref) return node;
    const [, , section, name] = node.$ref.split('/');
    const table = doc.components[section as keyof OpenApiDoc['components']] as Record<string, unknown> | undefined;
    return (table?.[name] as T) ?? node;
}

export function typeLabel(doc: OpenApiDoc, schema?: Schema): string {
    if (!schema) return 'any';
    const s = resolve(doc, schema);
    if (schema.$ref) return schema.$ref.split('/').pop() ?? 'object';
    const types = Array.isArray(s.type) ? s.type : s.type ? [s.type] : ['object'];
    return types
        .map((t) => (t === 'array' ? `${s.items ? typeLabel(doc, s.items) : 'any'}[]` : t === 'string' && s.format === 'date-time' ? 'datetime' : t))
        .join(' | ');
}

/** Properties of an object schema, following $ref and allOf. */
export function schemaFields(doc: OpenApiDoc, schema?: Schema): Field[] {
    if (!schema) return [];
    const s = resolve(doc, schema);
    if (s.allOf) return s.allOf.flatMap((part) => schemaFields(doc, part));
    const required = new Set(s.required ?? []);
    return Object.entries(s.properties ?? {}).map(([name, prop]) => {
        const p = resolve(doc, prop);
        return {
            name,
            type: typeLabel(doc, prop),
            required: required.has(name),
            description: p.description,
            enumValues: (p.enum ?? (p.items ? resolve(doc, p.items).enum : undefined)) as string[] | undefined,
        };
    });
}

function toField(doc: OpenApiDoc, param: OpenApiParameter): Field & { example?: unknown } {
    const p = resolve(doc, param);
    return {
        name: p.name,
        type: typeLabel(doc, p.schema),
        required: !!p.required,
        description: p.description,
        enumValues: p.schema?.enum as string[] | undefined,
        example: p.example,
    };
}

function example(doc: OpenApiDoc, response: OpenApiResponse) {
    const r = resolve(doc, response);
    return { description: r.description ?? '', example: r.content?.['application/json']?.example };
}

function toEndpoint(doc: OpenApiDoc, path: string, method: Method, op: OpenApiOperation): Endpoint {
    const params = (op.parameters ?? []).map((p) => toField(doc, p as OpenApiParameter));
    const rawParams = (op.parameters ?? []).map((p) => resolve(doc, p));
    const okStatus = Object.keys(op.responses).find((s) => s.startsWith('2'));
    const body = op.requestBody?.content['application/json'];

    return {
        id: op.operationId,
        method,
        path,
        summary: op.summary ?? `${method.toUpperCase()} ${path}`,
        description: op.description ?? '',
        scope: op['x-scope'] ?? null,
        publishable: !!op['x-publishable'],
        isPublic: !!op['x-public'],
        pathParams: params.filter((_, i) => rawParams[i].in === 'path'),
        queryParams: params.filter((_, i) => rawParams[i].in === 'query'),
        body: body ? { fields: schemaFields(doc, body.schema), example: body.example } : null,
        response: okStatus ? { status: okStatus, ...example(doc, op.responses[okStatus]) } : null,
        errors: Object.entries(op.responses)
            .filter(([status]) => !status.startsWith('2'))
            .map(([status, r]) => ({ status, ...example(doc, r) })),
    };
}

export function resources(doc: OpenApiDoc): Resource[] {
    const byTag = new Map<string, Endpoint[]>();
    for (const [path, ops] of Object.entries(doc.paths)) {
        for (const method of METHODS) {
            const op = ops[method];
            if (!op) continue;
            const tag = op.tags?.[0] ?? 'Other';
            byTag.set(tag, [...(byTag.get(tag) ?? []), toEndpoint(doc, path, method, op)]);
        }
    }

    return doc.tags.map((t) => ({
        name: t.name,
        slug: slugify(t.name),
        description: t.description ?? '',
        comingSoon: !!t['x-coming-soon'],
        endpoints: byTag.get(t.name) ?? [],
    }));
}

export interface WebhookEvent {
    name: string;
    description: string;
    example: unknown;
}

export function webhookEvents(doc: OpenApiDoc): WebhookEvent[] {
    return Object.entries(doc.webhooks ?? {}).map(([name, w]) => ({
        name,
        description: w.post.description ?? '',
        example: w.post.requestBody?.content['application/json']?.example,
    }));
}

/** A concrete path for samples: `{id}` → its example. */
export function samplePath(ep: Endpoint): string {
    return ep.path.replace(/\{(\w+)\}/g, (_, name: string) => String(ep.pathParams.find((p) => p.name === name) ? 42 : name));
}

/** A representative query string: a page size for lists, otherwise the first example filter. */
export function sampleQuery(ep: Endpoint): string {
    if (ep.method !== 'get') return '';
    if (ep.queryParams.some((p) => p.name === 'limit')) return '?limit=10';
    const first = ep.queryParams.find((p) => p.example !== undefined);
    return first ? `?${first.name}=${encodeURIComponent(String(first.example))}` : '';
}
