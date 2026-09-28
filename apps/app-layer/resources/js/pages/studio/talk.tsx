import { Head, Link } from '@inertiajs/react';
import { History, MessageSquareText, Phone } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import type { ChatMessage } from '../../components/ask/stream';
import { Menu } from '../../components/shell/menu';
import ChatMode from '../../components/talk/chat-mode';
import VoiceMode from '../../components/talk/voice-mode';
import { RelativeTime } from '../../components/ui/primitives';
import StudioLayout from '../../layouts/studio-layout';

interface Props {
    agent: { name: string; greeting: string | null };
    voice_available: boolean;
    agent_available: boolean;
    chat: { id: number; messages: ChatMessage[] } | null;
    recent: { kind: 'voice' | 'chat'; id: number; at: string | null; status: string; duration: string | null; href: string }[];
}

/**
 * Talk — the agent your customers reach, tried from Studio.
 *
 * One conversation, as in Claude: type to it, or press the voice button in
 * the message box and it opens voice mode over the page. Chat runs on the
 * same worker as a text agent; voice on the same LiveKit voice worker as
 * phone calls. Both are real sessions recorded in Desk.
 *
 * (Ask, next door, is a different agent: the Studio assistant that builds
 * and explains your agent. Customers never reach it.)
 */
export default function Talk({ agent, voice_available, agent_available, chat, recent }: Props) {
    const [voiceOpen, setVoiceOpen] = useState(() => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('mode') === 'voice');

    return (
        <>
            <Head title={`Talk to ${agent.name}`} />
            <div className="relative flex h-full min-h-0 flex-col bg-surface">
                <header className="flex h-16 shrink-0 items-center gap-4 border-b border-separator px-6">
                    <div className="min-w-0 flex-1">
                        <h1 className="text-md font-semibold text-primary">Talk to {agent.name}</h1>
                        <p className="truncate text-xs text-tertiary">The agent your customers reach on the phone and in chat, with its skills, knowledge, memory and tools</p>
                    </div>
                    <Menu align="right" width={320} trigger={(open, toggle) => (
                        <button type="button" onClick={toggle} className={`v-btn v-btn--ghost v-btn--sm ${open ? 'bg-surface-hover' : ''}`}><History size={15} /> Recent</button>
                    )}>
                        {() => (
                            <div className="py-1">
                                {recent.length === 0 && <p className="px-3 py-4 text-sm text-tertiary">Your test calls and chats will appear here.</p>}
                                {recent.map((r) => (
                                    <Link key={`${r.kind}-${r.id}`} href={r.href} className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-surface-hover">
                                        <span className="flex size-8 items-center justify-center rounded-full bg-surface-sunken text-secondary">{r.kind === 'voice' ? <Phone size={14} /> : <MessageSquareText size={14} />}</span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-sm font-medium text-primary">{r.kind === 'voice' ? 'Voice call' : 'Chat'}{r.duration ? ` · ${r.duration}` : ''}</span>
                                            <RelativeTime at={r.at} className="text-xs" />
                                        </span>
                                        <span className="text-xs text-tertiary">{r.kind === 'voice' ? 'In Desk' : 'Open'}</span>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </Menu>
                </header>
                <div className="min-h-0 flex-1">
                    <ChatMode agentName={agent.name} initial={chat} available={agent_available} onVoice={voice_available ? () => setVoiceOpen(true) : undefined} />
                </div>

                {voiceOpen && (
                    <div className="absolute inset-0 z-20 bg-surface animate-fade-in" role="dialog" aria-modal="true" aria-label={`Voice call with ${agent.name}`}>
                        <VoiceMode agentName={agent.name} available={voice_available} onClose={() => setVoiceOpen(false)} />
                    </div>
                )}
            </div>
        </>
    );
}

// The page owns the viewport: chat scrolls inside, voice is a full stage over it.
Talk.layout = (page: ReactNode) => <StudioLayout flush>{page}</StudioLayout>;
