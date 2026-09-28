import { Link } from '@inertiajs/react';
import { ArrowDown, MessageSquareText, SquarePen } from 'lucide-react';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';

import Composer, { type ComposerHandle } from '../ask/composer';
import { AssistantMessage, UserMessage } from '../ask/message';
import { applyEvent, streamTurn, type ChatMessage, type StreamEvent } from '../ask/stream';
import { VeyraMark } from '../shell/sidebar';

const CUSTOMER_QUESTIONS = [
    'Do you come out to Evanston?',
    'How much is a diagnostic visit?',
    'I need to move my Thursday appointment.',
    'Can I talk to a person, please?',
];

/**
 * Live chat as a customer would have it: the same worker that answers the
 * phone, writing instead of speaking. Every turn is a real web-chat message
 * pair in Desk, so the team sees exactly what a customer would see.
 */
export default function ChatMode({ agentName, initial, available, onVoice }: {
    agentName: string;
    initial: { id: number; messages: ChatMessage[] } | null;
    available: boolean;
    /** Opens voice mode over the chat (the mic button in the composer). */
    onVoice?: () => void;
}) {
    const [conversationId, setConversationId] = useState<number | null>(initial?.id ?? null);
    const [messages, setMessages] = useState<ChatMessage[]>(initial?.messages ?? []);
    const [streaming, setStreaming] = useState(false);
    const [atBottom, setAtBottom] = useState(true);
    const abort = useRef<AbortController | null>(null);
    const scroller = useRef<HTMLDivElement>(null);
    const composer = useRef<ComposerHandle>(null);
    const stick = useRef(true);

    useLayoutEffect(() => {
        const el = scroller.current;
        if (el && stick.current) el.scrollTop = el.scrollHeight;
    }, [messages]);

    const send = useCallback(async (text: string) => {
        if (streaming) return;
        const now = new Date().toISOString();
        setMessages((m) => [...m, { role: 'user', content: text, at: now }, { role: 'assistant', content: '', parts: [], at: now, streaming: true, status: 'Thinking' }]);
        setStreaming(true);
        stick.current = true;
        const controller = new AbortController();
        abort.current = controller;

        const onEvent = (event: StreamEvent) => {
            if (event.type === 'conversation') {
                setConversationId(event.id);
                window.history.replaceState(window.history.state, '', `/studio/talk?mode=chat&conversation=${event.id}`);
                return;
            }
            if (event.type === 'thread') return;
            setMessages((m) => {
                const last = m[m.length - 1];
                return last?.role === 'assistant' ? [...m.slice(0, -1), applyEvent(last, event)] : m;
            });
        };

        try {
            await streamTurn({ message: text, conversation_id: conversationId }, onEvent, controller.signal, '/studio/talk/chat');
        } catch {
            const stopped = controller.signal.aborted;
            setMessages((m) => {
                const last = m[m.length - 1];
                if (last?.role !== 'assistant') return m;
                return [...m.slice(0, -1), stopped ? { ...last, streaming: false, status: undefined, stopped: true } : { ...last, streaming: false, status: undefined, error: 'The connection dropped before the reply finished.' }];
            });
        } finally {
            setMessages((m) => {
                const last = m[m.length - 1];
                return last?.streaming ? [...m.slice(0, -1), { ...last, streaming: false, status: undefined }] : m;
            });
            setStreaming(false);
            abort.current = null;
            composer.current?.focus();
        }
    }, [streaming, conversationId]);

    const newChat = () => {
        abort.current?.abort();
        setConversationId(null);
        setMessages([]);
        window.history.replaceState(window.history.state, '', '/studio/talk?mode=chat');
        composer.current?.focus();
    };

    const onScroll = () => {
        const el = scroller.current;
        if (!el) return;
        const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        stick.current = near;
        setAtBottom(near);
    };

    if (messages.length === 0) {
        return (
            <div className="flex h-full min-h-0 flex-col items-center justify-center overflow-y-auto px-6 pb-[10vh]">
                <div className="w-full max-w-[640px] animate-rise">
                    <div className="mb-8 flex flex-col items-center text-center">
                        <VeyraMark size={40} />
                        <h2 className="mt-5 text-3xl font-semibold tracking-tight text-primary">Chat with {agentName}</h2>
                        <p className="mt-2 max-w-[46ch] text-md text-secondary">Write as a customer would, or press the voice button to talk out loud. {agentName} looks things up and acts with the same tools it uses on the phone.</p>
                    </div>
                    <Composer ref={composer} onSend={send} onStop={() => abort.current?.abort()} streaming={streaming} placeholder="Write a message as a customer" autoFocus onVoice={onVoice} />
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                        {CUSTOMER_QUESTIONS.map((q) => (
                            <button key={q} type="button" onClick={() => void send(q)} disabled={!available}
                                className="rounded-full border border-border bg-surface px-4 py-2 text-sm text-secondary transition-colors hover:border-border-strong hover:text-primary disabled:opacity-40">
                                {q}
                            </button>
                        ))}
                    </div>
                    {!available && <p className="mt-6 text-center text-sm text-tertiary">The agent layer is not answering right now.</p>}
                </div>
            </div>
        );
    }

    return (
        <div className="relative flex h-full min-h-0 flex-col">
            <div className="flex shrink-0 items-center justify-between gap-3 px-6 py-3">
                <span className="flex items-center gap-2 text-sm text-tertiary"><MessageSquareText size={15} /> Web chat as a customer</span>
                <div className="flex items-center gap-2">
                    {conversationId && <Link href={`/desk/inbox/${conversationId}`} className="v-btn v-btn--ghost v-btn--sm">Open in Desk</Link>}
                    <button type="button" onClick={newChat} className="v-btn v-btn--quiet v-btn--sm"><SquarePen size={14} /> New chat</button>
                </div>
            </div>
            <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto">
                <div className="mx-auto flex w-full max-w-[720px] flex-col gap-7 px-6 pt-4 pb-10">
                    {messages.map((m, i) => m.role === 'user'
                        ? <UserMessage key={i} message={m} />
                        : <AssistantMessage key={i} message={m} isLast={i === messages.length - 1} />)}
                </div>
            </div>
            <div className="relative shrink-0 px-6 pb-6">
                {!atBottom && (
                    <button type="button" onClick={() => { stick.current = true; scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' }); }} aria-label="Scroll to latest"
                        className="v-glass absolute -top-12 left-1/2 flex size-9 -translate-x-1/2 items-center justify-center rounded-full text-secondary shadow-raised">
                        <ArrowDown size={16} />
                    </button>
                )}
                <div className="mx-auto w-full max-w-[720px]">
                    <Composer ref={composer} onSend={send} onStop={() => abort.current?.abort()} streaming={streaming} placeholder="Reply as the customer" onVoice={onVoice} />
                </div>
            </div>
        </div>
    );
}
