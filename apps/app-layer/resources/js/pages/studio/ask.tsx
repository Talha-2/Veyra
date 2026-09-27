import { Head, router } from '@inertiajs/react';
import { ArrowDown, BookOpen, CalendarClock, PanelLeft, Sparkles, Workflow } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import Composer, { type ComposerHandle } from '../../components/ask/composer';
import { AssistantMessage, UserMessage } from '../../components/ask/message';
import { applyEvent, streamTurn, type ChatMessage, type StreamEvent } from '../../components/ask/stream';
import ThreadList, { type ThreadSummary } from '../../components/ask/thread-list';
import { VeyraMark } from '../../components/shell/sidebar';
import { UserText } from '../../components/ui/primitives';
import StudioLayout from '../../layouts/studio-layout';

interface Props {
    threads: ThreadSummary[];
    thread: { id: number; title: string | null; messages: ChatMessage[] } | null;
    agent_available: boolean;
    model: string | null;
    prefill: string | null;
    user_first_name: string;
}

const SUGGESTIONS = [
    { icon: Sparkles, title: 'Write a skill', prompt: 'Write a skill for rescheduling an existing appointment, including what to confirm with the caller.' },
    { icon: BookOpen, title: 'Check the knowledge', prompt: 'What does our knowledge base say about service areas and fees? Point out anything that looks out of date.' },
    { icon: Workflow, title: 'Draft an automation', prompt: 'Draft a morning digest automation that summarises yesterday’s calls and open tickets.' },
    { icon: CalendarClock, title: 'Review recent calls', prompt: 'Look at recent calls and tell me where callers got stuck or asked for a human.' },
];

function greeting(): string {
    const hour = new Date().getHours();
    return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

/**
 * Ask — the deep-agent chat, Z360's Ask Z.
 *
 * A turn streams: the reply's tokens and the tools the agent reaches for
 * arrive as they happen, so the person watches it work instead of watching a
 * spinner. The finished turn is saved on the thread by the server; this page
 * only renders what the stream says.
 */
export default function Ask({ threads: initialThreads, thread, agent_available, model, prefill, user_first_name }: Props) {
    const [threads, setThreads] = useState(initialThreads);
    const [threadId, setThreadId] = useState<number | null>(thread?.id ?? null);
    const [title, setTitle] = useState<string | null>(thread?.title ?? null);
    const [messages, setMessages] = useState<ChatMessage[]>(thread?.messages ?? []);
    const [streaming, setStreaming] = useState(false);
    const [listOpen, setListOpen] = useState(true);
    const [atBottom, setAtBottom] = useState(true);

    const abort = useRef<AbortController | null>(null);
    const scroller = useRef<HTMLDivElement>(null);
    const composer = useRef<ComposerHandle>(null);
    const stick = useRef(true);
    const prefilled = useRef(false);

    // Moving between threads through the list: take the server's copy. A
    // reload of the thread we are already on keeps the local, streamed one.
    useEffect(() => {
        setThreads(initialThreads);
        if ((thread?.id ?? null) !== threadId) {
            abort.current?.abort();
            setThreadId(thread?.id ?? null);
            setTitle(thread?.title ?? null);
            setMessages(thread?.messages ?? []);
            setStreaming(false);
            stick.current = true;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [thread?.id, initialThreads]);

    // Follow the reply as it grows, unless the reader has scrolled up to read.
    useLayoutEffect(() => {
        const el = scroller.current;
        if (el && stick.current) el.scrollTop = el.scrollHeight;
    }, [messages]);

    const onScroll = () => {
        const el = scroller.current;
        if (!el) return;
        const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        stick.current = near;
        setAtBottom(near);
    };

    const scrollToBottom = () => {
        const el = scroller.current;
        if (!el) return;
        stick.current = true;
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    };

    const send = useCallback(async (text: string) => {
        if (streaming) return;
        const now = new Date().toISOString();
        setMessages((m) => [...m, { role: 'user', content: text, at: now }, { role: 'assistant', content: '', parts: [], at: now, streaming: true, status: 'Thinking' }]);
        setStreaming(true);
        stick.current = true;

        const controller = new AbortController();
        abort.current = controller;
        let currentId = threadId;

        const onEvent = (event: StreamEvent) => {
            if (event.type === 'thread') {
                currentId = event.id;
                if (event.id !== threadId) {
                    setThreadId(event.id);
                    setTitle(event.title);
                    // Move the address now, so a refresh mid-reply lands on this thread.
                    window.history.replaceState(window.history.state, '', `/studio/ask/${event.id}`);
                }
                setThreads((list) => [{ id: event.id, title: event.title, updated_at: new Date().toISOString() }, ...list.filter((t) => t.id !== event.id)]);
                return;
            }
            setMessages((m) => {
                const last = m[m.length - 1];
                return last?.role === 'assistant' ? [...m.slice(0, -1), applyEvent(last, event)] : m;
            });
        };

        try {
            await streamTurn({ message: text, thread_id: threadId }, onEvent, controller.signal);
        } catch (error) {
            const stopped = controller.signal.aborted;
            setMessages((m) => {
                const last = m[m.length - 1];
                if (last?.role !== 'assistant') return m;
                return [...m.slice(0, -1), stopped
                    ? { ...last, streaming: false, status: undefined, stopped: true }
                    : { ...last, streaming: false, status: undefined, error: 'The connection dropped before the reply finished. Try again.' }];
            });
            if (!stopped) console.error(error);
        } finally {
            // A stream that closed without saying done or error still ends the turn.
            setMessages((m) => {
                const last = m[m.length - 1];
                return last?.streaming ? [...m.slice(0, -1), { ...last, streaming: false, status: undefined }] : m;
            });
            setStreaming(false);
            abort.current = null;
            // Bring Inertia's page object in line with the address, quietly.
            if (currentId) router.visit(`/studio/ask/${currentId}`, { replace: true, preserveState: true, preserveScroll: true, only: ['threads', 'thread'] });
            composer.current?.focus();
        }
    }, [streaming, threadId]);

    const stop = () => abort.current?.abort();

    const retry = () => {
        const lastUser = [...messages].reverse().find((m) => m.role === 'user');
        if (lastUser) void send(lastUser.content);
    };

    const newChat = () => {
        abort.current?.abort();
        if (threadId === null && messages.length === 0) { composer.current?.focus(); return; }
        router.visit('/studio/ask');
    };

    // Arriving from the command palette with a question: ask it.
    useEffect(() => {
        if (prefill && !prefilled.current && !thread) {
            prefilled.current = true;
            window.history.replaceState(window.history.state, '', '/studio/ask');
            void send(prefill);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const empty = messages.length === 0;

    return (
        <>
            <Head title={title ?? 'Ask'} />
            <div className="flex h-full min-h-0">
                {listOpen && (
                    <div className="hidden lg:block">
                        <ThreadList threads={threads} activeId={threadId} onNew={newChat}
                            onRenamed={(id, t) => { setThreads((l) => l.map((x) => x.id === id ? { ...x, title: t } : x)); if (id === threadId) setTitle(t); }}
                            onDeleted={(id) => setThreads((l) => l.filter((x) => x.id !== id))} />
                    </div>
                )}

                <div className="relative flex min-w-0 flex-1 flex-col bg-surface">
                    <header className="flex h-13 shrink-0 items-center gap-2 px-4">
                        <button type="button" onClick={() => setListOpen((o) => !o)} aria-label={listOpen ? 'Hide chats' : 'Show chats'}
                            className="hidden size-8 items-center justify-center rounded-sm text-tertiary transition-colors hover:bg-surface-hover hover:text-primary lg:flex">
                            <PanelLeft size={17} />
                        </button>
                        <h1 className="min-w-0 truncate text-sm font-medium text-primary">{title ? <UserText>{title}</UserText> : <span className="text-tertiary">New chat</span>}</h1>
                        {!agent_available && (
                            <span className="ml-auto flex shrink-0 items-center gap-1.5 rounded-pill bg-warning-subtle px-2.5 py-1 text-2xs font-medium text-warning">
                                <span className="size-1.5 rounded-full bg-warning" /> Agent layer offline
                            </span>
                        )}
                    </header>

                    {empty ? (
                        <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-6 pb-[12vh]">
                            <div className="w-full max-w-[680px] animate-rise">
                                <div className="mb-8 flex flex-col items-center text-center">
                                    <VeyraMark size={40} />
                                    <h2 className="mt-5 text-3xl font-semibold tracking-tight text-primary">{greeting()}{user_first_name ? `, ${user_first_name}` : ''}</h2>
                                    <p className="mt-2 text-md text-secondary">Ask about your agent, or tell it what to build.</p>
                                </div>
                                <Composer ref={composer} onSend={send} onStop={stop} streaming={streaming} model={model} placeholder="How can I help?" autoFocus />
                                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    {SUGGESTIONS.map((s) => (
                                        <button key={s.title} type="button" onClick={() => void send(s.prompt)}
                                            className="group flex items-start gap-3 rounded-lg border border-border bg-surface px-3.5 py-3 text-left transition-all hover:border-border-strong hover:shadow-card">
                                            <s.icon size={16} className="mt-0.5 shrink-0 text-tertiary transition-colors group-hover:text-accent" />
                                            <span className="min-w-0">
                                                <span className="block text-sm font-medium text-primary">{s.title}</span>
                                                <span className="mt-0.5 line-clamp-2 block text-xs text-tertiary">{s.prompt}</span>
                                            </span>
                                        </button>
                                    ))}
                                </div>
                                {!agent_available && (
                                    <p className="mt-6 text-center text-xs text-tertiary">The agent layer is not answering right now. Messages are saved on the thread.</p>
                                )}
                            </div>
                        </div>
                    ) : (
                        <>
                            <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto">
                                <div className="mx-auto flex w-full max-w-[720px] flex-col gap-7 px-6 pt-6 pb-10">
                                    {messages.map((m, i) => m.role === 'user'
                                        ? <UserMessage key={i} message={m} />
                                        : <AssistantMessage key={i} message={m} isLast={i === messages.length - 1} onRetry={streaming ? undefined : retry} />)}
                                </div>
                            </div>

                            <div className="relative shrink-0 px-6 pb-5">
                                {!atBottom && (
                                    <button type="button" onClick={scrollToBottom} aria-label="Scroll to latest"
                                        className="v-glass absolute -top-12 left-1/2 flex size-9 -translate-x-1/2 items-center justify-center rounded-full text-secondary shadow-raised transition-colors hover:text-primary animate-pop">
                                        <ArrowDown size={16} />
                                    </button>
                                )}
                                <div className="pointer-events-none absolute inset-x-0 -top-8 h-8 bg-linear-to-t from-surface to-transparent" />
                                <div className="mx-auto w-full max-w-[720px]">
                                    <Composer ref={composer} onSend={send} onStop={stop} streaming={streaming} model={model} placeholder="Reply to the agent" />
                                    <p className="mt-2 text-center text-2xs text-disabled">The agent can act on your workspace. Check what it changes.</p>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </>
    );
}

// Full-height, no content column: the chat owns the viewport.
Ask.layout = (page: ReactNode) => <StudioLayout flush>{page}</StudioLayout>;
