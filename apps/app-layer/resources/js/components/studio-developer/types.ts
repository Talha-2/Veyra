/** Mirrors DeveloperController::index(). Keep in step with it. */

export interface ApiKeyRow {
    id: number;
    name: string;
    prefix: string;
    scopes: string[];
    publishable: boolean;
    active: boolean;
    last_used_at: string | null;
    created_at: string;
    revoked_at: string | null;
    created_by: string | null;
}

export interface Delivery {
    id: number;
    event: string;
    status: 'delivered' | 'failed' | 'pending' | string;
    response_status: number | null;
    attempt: number;
    duration_ms: number | null;
    at: string;
    payload: unknown;
    response_body: string;
}

export interface WebhookRow {
    id: number;
    url: string;
    events: string[];
    enabled: boolean;
    disabled_reason: string | null;
    deliveries_count: number;
    consecutive_failures: number;
    last_delivered_at: string | null;
    recent: Delivery[];
}

/** The parts of an OpenAPI 3.1 document the reference reads. Loose on purpose. */
export interface OpenApiDoc {
    openapi: string;
    info: { title: string; version: string; summary?: string; description?: string };
    servers?: { url: string }[];
    tags: { name: string; description?: string; 'x-coming-soon'?: boolean }[];
    paths: Record<string, Record<string, OpenApiOperation>>;
    webhooks?: Record<string, { post: OpenApiOperation }>;
    components: { schemas: Record<string, Schema>; parameters: Record<string, OpenApiParameter>; responses: Record<string, OpenApiResponse> };
    'x-scopes'?: Record<string, string>;
    'x-publishable-scopes'?: string[];
    'x-rate-limit'?: number;
}

export interface Schema {
    $ref?: string;
    type?: string | string[];
    description?: string;
    enum?: unknown[];
    const?: unknown;
    format?: string;
    required?: string[];
    properties?: Record<string, Schema>;
    items?: Schema;
    allOf?: Schema[];
    [key: string]: unknown;
}

export interface OpenApiParameter {
    $ref?: string;
    name: string;
    in: 'path' | 'query' | 'header';
    required?: boolean;
    description?: string;
    schema?: Schema;
    example?: unknown;
}

export interface OpenApiResponse {
    $ref?: string;
    description?: string;
    content?: Record<string, { schema?: Schema; example?: unknown }>;
}

export interface OpenApiOperation {
    operationId: string;
    tags?: string[];
    summary?: string;
    description?: string;
    security?: unknown[];
    parameters?: OpenApiParameter[];
    requestBody?: { required?: boolean; content: Record<string, { schema?: Schema; example?: unknown }> };
    responses: Record<string, OpenApiResponse>;
    'x-scope'?: string | null;
    'x-publishable'?: boolean;
    'x-public'?: boolean;
}
