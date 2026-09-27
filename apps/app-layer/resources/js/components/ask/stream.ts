/**
 * The Ask stream client: POST a message, read server-sent events back.
 *
 * EventSource cannot POST, so this is fetch + a ReadableStream reader and a
 * small SSE frame parser. Laravel's CSRF check is satisfied the way axios
 * does it — the XSRF-TOKEN cookie echoed in a header.
 */

export type ToolStatus = 'running' | 'done' | 'error';

export interface ToolPart {
    type: 'tool';
    id: string;
    name: string;
    status: ToolStatus;
    label?: string;
    detail?: string;
    summary?: string;
    ms?: number;
}

export interface TextPart {
    type: 'text';
    text: string;
}

export type Part = TextPart | ToolPart;

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    parts?: Part[];
    at?: string;
    pending?: boolean;
    stopped?: boolean;
    error?: string;
    tokens?: number;
    model?: string;
    /** Client-only: this turn is still arriving. */
    streaming?: boolean;
    /** Client-only: what the agent says it is doing before any output. */
    status?: string;
}

export type StreamEvent =
    | { type: 'thread'; id: number; title: string }
    | { type: 'status'; text: string }
    | { type: 'delta'; text: string }
    | ({ type: 'tool' } & Omit<ToolPart, 'type'>)
    | { type: 'done'; content: string; tokens?: number; model?: string }
    | { type: 'error'; message: string };

function xsrfToken(): string {
    const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : '';
}

export async function streamTurn(body: { message: string; thread_id: number | null }, onEvent: (event: StreamEvent) => void, signal: AbortSignal): Promise<void> {
    const response = await fetch('/studio/ask/stream', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
            'X-Requested-With': 'XMLHttpRequest',
            'X-XSRF-TOKEN': xsrfToken(),
        },
        credentials: 'same-origin',
        body: JSON.stringify(body),
        signal,
    });

    if (!response.ok || !response.body) {
        const message = response.status === 419 ? 'Your session expired. Reload the page and try again.'
            : response.status === 429 ? 'That is a lot of questions at once. Wait a moment and try again.'
            : `The request failed (HTTP ${response.status}).`;
        onEvent({ type: 'error', message });
        return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let cut: number;
        while ((cut = buffer.indexOf('\n\n')) !== -1) {
            const frame = buffer.slice(0, cut);
            buffer = buffer.slice(cut + 2);
            for (const line of frame.split('\n')) {
                if (!line.startsWith('data: ')) continue;
                try {
                    onEvent(JSON.parse(line.slice(6)) as StreamEvent);
                } catch {
                    // A malformed frame is skipped, not fatal.
                }
            }
        }
    }
}

/** Fold one event into the assistant message being built. Pure, so React state stays simple. */
export function applyEvent(message: ChatMessage, event: StreamEvent): ChatMessage {
    const parts = [...(message.parts ?? [])];
    switch (event.type) {
        case 'status':
            return { ...message, status: event.text };
        case 'delta': {
            const last = parts[parts.length - 1];
            if (last?.type === 'text') parts[parts.length - 1] = { ...last, text: last.text + event.text };
            else parts.push({ type: 'text', text: event.text });
            return { ...message, parts, content: message.content + event.text, status: undefined };
        }
        case 'tool': {
            const { type: _type, ...step } = event;
            const i = parts.findIndex((p) => p.type === 'tool' && p.id === step.id);
            if (i >= 0) parts[i] = { ...(parts[i] as ToolPart), ...step };
            else parts.push({ type: 'tool', ...step });
            return { ...message, parts, status: undefined };
        }
        case 'done': {
            const hasText = parts.some((p) => p.type === 'text');
            if (!hasText && event.content) parts.push({ type: 'text', text: event.content });
            return { ...message, parts, content: hasText ? message.content : event.content, streaming: false, status: undefined, tokens: event.tokens, model: event.model };
        }
        case 'error':
            return { ...message, error: event.message, streaming: false, status: undefined };
        default:
            return message;
    }
}

/** A stored message's parts, or one text part for messages saved before parts existed. */
export function partsOf(message: ChatMessage): Part[] {
    if (message.parts?.length) return message.parts;
    return message.content ? [{ type: 'text', text: message.content }] : [];
}
