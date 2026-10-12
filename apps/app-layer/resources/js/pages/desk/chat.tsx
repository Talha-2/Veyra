import { Head } from '@inertiajs/react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, Hash, MessageCircle, Plus, Search, Send, Users, RefreshCw } from 'lucide-react';
import { WorkspacePage } from '../../components/desk-pages/workspace';
import DeskLayout from '../../layouts/desk-layout';
import type { ReactNode } from 'react';
import { PageHeader } from '../../components/ui/page';
import Sidebar from '../../components/ui/sidebar';
import { controlClass } from '../../components/healthcare/patient-form';

interface Person { id: number; name: string }
interface Message { id: number; body: string; created_at: string; author: { id: number | null; name: string } }
interface Room { id: number; kind: 'channel' | 'direct'; name: string; members: Person[]; unread_count: number; latest_message: Message | null }
interface Feed { messages: Message[]; has_older?: boolean; has_newer?: boolean }
async function chatRequest<T>(url: string, data?: unknown, signal?: AbortSignal): Promise<T> {
    const xsrf = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
    const response = await fetch(url, { method: data === undefined ? 'GET' : 'POST', credentials: 'same-origin', signal,
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'X-XSRF-TOKEN': xsrf ? decodeURIComponent(xsrf[1]) : '' }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Your session or access has changed. Reload this page to continue.');
    const result = await response.json();
    if (!response.ok) throw new Error(result.errors ? Object.values(result.errors).flat().join(' ') : result.message || 'Could not connect. Please retry.');
    return result as T;
}
const initials = (name: string) => name.split(' ').slice(0, 2).map(part => part[0]).join('').toUpperCase();
const time = (instant: string) => new Date(instant).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' });
const day = (instant: string) => new Date(instant).toLocaleDateString('en', { weekday: 'short', day: 'numeric', month: 'short' });
export default function StaffChat({ rooms: initialRooms, team, current_user_id }: { rooms: Room[]; team: Person[]; current_user_id: number }) {
    const [rooms, setRooms] = useState(initialRooms);
    const [activeId, setActiveId] = useState<number | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(false);
    const [older, setOlder] = useState(false);
    const [loadingOlder, setLoadingOlder] = useState(false);
    const [syncError, setSyncError] = useState('');
    const [sendError, setSendError] = useState('');
    const [sending, setSending] = useState(false);
    const [query, setQuery] = useState('');
    const [drafts, setDrafts] = useState<Record<number, { body: string; client_id: string }>>({});
    const [panel, setPanel] = useState<'channel' | 'direct' | 'members' | null>(null);
    const [name, setName] = useState('');
    const [memberIds, setMemberIds] = useState<number[]>([]);
    const [createError, setCreateError] = useState('');
    const [creating, setCreating] = useState(false);
    const [refresh, setRefresh] = useState(0);
    const [newBelow, setNewBelow] = useState(false);
    const scroll = useRef<HTMLDivElement>(null);
    const latest = useRef(0); const atBottom = useRef(true); const readThrough = useRef(0); const selectedRef = useRef(activeId);
    selectedRef.current = activeId;
    const selected = rooms.find(room => room.id === activeId);
    const draft = activeId ? drafts[activeId]?.body ?? '' : '';
    const markRead = async (roomId: number, id: number) => {
        if (!id || id <= readThrough.current || document.visibilityState !== 'visible' || !atBottom.current || selectedRef.current !== roomId) return;
        try { await chatRequest(`/desk/chat/rooms/${roomId}/read`, { message_id: id }); if (selectedRef.current === roomId) { readThrough.current = Math.max(readThrough.current, id); } }
        catch { /* The next update retries the same read marker. */ }
    };
    useLayoutEffect(() => {
        if (atBottom.current && scroll.current && activeId && messages.length) {
            scroll.current.scrollTop = scroll.current.scrollHeight;
            void markRead(activeId, latest.current);
        }
    }, [messages]);
    useEffect(() => {
        const controller = new AbortController(); let running = false;
        latest.current = 0; readThrough.current = 0; atBottom.current = true; setNewBelow(false); setMessages([]); setOlder(false); setSendError(''); setSyncError(''); setLoading(Boolean(activeId));
        async function update() {
            if (running || document.visibilityState !== 'visible') return; running = true;
            try {
                if (activeId) {
                    const first = latest.current === 0;
                    const feed = await chatRequest<Feed>(`/desk/chat/rooms/${activeId}/feed${first ? '' : '?after=' + latest.current}`, undefined, controller.signal);
                    if (controller.signal.aborted) return;
                    if (first) setOlder(Boolean(feed.has_older));
                    if (feed.messages.length) {
                        latest.current = Math.max(latest.current, ...feed.messages.map(m => m.id));
                        setMessages(previous => [...new Map([...previous, ...feed.messages].map(m => [m.id, m])).values()].sort((a, b) => a.id - b.id));
                        if (!atBottom.current) setNewBelow(true);
                    } else await markRead(activeId, latest.current);
                }
                const list = await chatRequest<{ rooms: Room[] }>('/desk/chat/rooms', undefined, controller.signal);
                if (!controller.signal.aborted) { setRooms(list.rooms); setSyncError(''); }
            } catch (error) { if (!controller.signal.aborted) setSyncError((error as Error).message); }
            finally { running = false; if (!controller.signal.aborted) setLoading(false); }
        }
        void update(); const timer = setInterval(() => void update(), 5000);
        const onVisible = () => { if (document.visibilityState === 'visible') void update(); };
        document.addEventListener('visibilitychange', onVisible);
        return () => { controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
    }, [activeId, refresh]);
    async function loadOlder() {
        if (!activeId || !messages.length) return; const roomId = activeId; setLoadingOlder(true);
        const oldHeight = scroll.current?.scrollHeight ?? 0; const oldTop = scroll.current?.scrollTop ?? 0;
        try { const feed = await chatRequest<Feed>(`/desk/chat/rooms/${roomId}/feed?before=${messages[0].id}`);
            if (selectedRef.current !== roomId) return;
            atBottom.current = false; setOlder(Boolean(feed.has_older));
            setMessages(previous => [...new Map([...feed.messages, ...previous].map(m => [m.id, m])).values()].sort((a, b) => a.id - b.id));
            requestAnimationFrame(() => { if (selectedRef.current === roomId && scroll.current) scroll.current.scrollTop = oldTop + scroll.current.scrollHeight - oldHeight; });
        } catch (error) { setSyncError((error as Error).message); } finally { setLoadingOlder(false); }
    }
    async function send() {
        if (!activeId || !draft.trim() || sending) return;
        const roomId = activeId; const payload = drafts[roomId]; setSending(true); setSendError('');
        try { const result = await chatRequest<{ message: Message }>(`/desk/chat/rooms/${roomId}/messages`, payload);
            setDrafts(previous => ({ ...previous, [roomId]: { body: '', client_id: crypto.randomUUID() } }));
            if (selectedRef.current === roomId) {
                setMessages(previous => [...new Map([...previous, result.message].map(m => [m.id, m])).values()].sort((a, b) => a.id - b.id));
                atBottom.current = true; requestAnimationFrame(() => { if (scroll.current && selectedRef.current === roomId) scroll.current.scrollTop = scroll.current.scrollHeight; });
            }
            try { const list = await chatRequest<{ rooms: Room[] }>('/desk/chat/rooms'); setRooms(list.rooms); }
            catch (error) { setSyncError((error as Error).message); }
        } catch (error) { setSendError('Could not confirm this send. Your message is kept here; retry to check it safely. ' + (error as Error).message); }
        finally { setSending(false); }
    }
    async function create() {
        if (!panel || panel === 'members') return; setCreating(true); setCreateError('');
        try { const result = await chatRequest<{ room_id: number }>('/desk/chat/rooms', { kind: panel, name, member_ids: memberIds });
            const list = await chatRequest<{ rooms: Room[] }>('/desk/chat/rooms'); setRooms(list.rooms); setActiveId(result.room_id); setPanel(null);
        } catch (error) { setCreateError((error as Error).message); } finally { setCreating(false); }
    }
    const open = (kind: 'channel' | 'direct') => { setName(''); setMemberIds([]); setCreateError(''); setPanel(kind); };
    const matching = rooms.filter(room => room.name.toLowerCase().includes(query.toLowerCase()));
    return <><Head title="Team chat" /><WorkspacePage className="chat-workspace" header={<PageHeader title="Team chat" description="A shared space for your clinic’s internal conversations." actions={<><button className="v-btn v-btn--secondary" onClick={() => open('direct')}><MessageCircle size={15} />New message</button><button className="v-btn v-btn--primary" onClick={() => open('channel')}><Plus size={15} />Create channel</button></>} />}>
        <section className={'staff-chat ' + (activeId ? 'staff-chat-has-selection' : '')} aria-label="Internal team chat">
            <aside className="staff-chat-list"><label className="relative mx-4 my-4 block"><span className="sr-only">Search conversations</span><Search size={15} className="absolute left-3 top-3 text-secondary" /><input className={controlClass + ' !pl-9'} placeholder="Find a conversation" value={query} onChange={e => setQuery(e.target.value)} /></label>
                <div className="overflow-auto px-2 pb-4">{(['channel', 'direct'] as const).map(kind => <section key={kind}><h2 className="px-3 pb-2 pt-3 text-xs font-semibold text-secondary">{kind === 'channel' ? 'Channels' : 'Direct messages'}</h2>{matching.filter(room => room.kind === kind).map(room => <button key={room.id} className={'staff-chat-room ' + (room.id === activeId ? 'staff-chat-room-selected' : '')} onClick={() => { if (!sending) setActiveId(room.id); }} aria-pressed={room.id === activeId}><span className="staff-chat-avatar">{kind === 'channel' ? <Hash size={18} /> : initials(room.name)}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{room.name}</span><span className="mt-1 block truncate text-xs text-secondary">{room.latest_message?.body || 'Start the conversation'}</span></span>{room.unread_count > 0 && <span className="staff-chat-unread" aria-label={`${room.unread_count} unread messages`}>{room.unread_count > 99 ? '99+' : room.unread_count}</span>}</button>)}{!matching.some(room => room.kind === kind) && <p className="px-3 pb-4 text-xs text-secondary">{query ? 'No matches.' : kind === 'channel' ? 'No channels yet.' : 'No direct messages yet.'}</p>}</section>)}</div>
            </aside>
            <div className="staff-chat-thread">{selected ? <><header className="staff-chat-thread-header"><button className="v-btn v-btn--ghost md:!hidden" aria-label="Back to conversations" disabled={sending} onClick={() => setActiveId(null)}><ArrowLeft size={16} /></button><span className="staff-chat-avatar">{selected.kind === 'channel' ? <Hash size={20} /> : initials(selected.name)}</span><div className="min-w-0 flex-1"><h2 className="truncate font-semibold">{selected.name}</h2><p className="mt-1 text-xs text-secondary">{selected.kind === 'channel' ? `${selected.members.length} invited team members` : 'Direct conversation'} · Updates automatically</p></div><button className="v-btn v-btn--ghost" aria-label="View conversation members" onClick={() => setPanel('members')}><Users size={17} /></button></header>
                {syncError && <div role="alert" className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3 text-xs text-danger">{syncError}<button className="v-btn v-btn--ghost" onClick={() => setRefresh(v => v + 1)}><RefreshCw size={13} />Reconnect</button></div>}
                <div className="staff-chat-history" ref={scroll} aria-label="Message history" onScroll={() => { if (!scroll.current) return; atBottom.current = scroll.current.scrollHeight - scroll.current.scrollTop - scroll.current.clientHeight < 60; if (atBottom.current && activeId) { setNewBelow(false); void markRead(activeId, latest.current); } }}>
                    {older && <button className="mx-auto mb-6 block text-xs text-accent" disabled={loadingOlder} onClick={() => void loadOlder()}>{loadingOlder ? 'Loading…' : 'Load earlier messages'}</button>}
                    {loading && !messages.length ? <p role="status" className="py-12 text-center text-sm text-secondary">Loading conversation…</p> : !messages.length && <div className="py-14 text-center"><MessageCircle size={28} className="mx-auto text-secondary" /><h3 className="mt-4 font-semibold">Start the conversation</h3><p className="mt-2 text-sm text-secondary">Share an update with {selected.kind === 'channel' ? 'this team' : selected.name}.</p></div>}
                    {messages.map((message, index) => <div key={message.id}>{(!index || day(messages[index - 1].created_at) !== day(message.created_at)) && <p className="my-6 text-center text-xs text-secondary">{day(message.created_at)}</p>}<article className="staff-chat-message"><span className="staff-chat-avatar">{initials(message.author.name)}</span><div className="min-w-0"><div className="flex items-baseline gap-3"><p className="text-sm font-semibold">{message.author.name}{message.author.id === current_user_id && <span className="ml-1 font-normal text-secondary">(you)</span>}</p><time dateTime={message.created_at} className="text-xs text-secondary">{time(message.created_at)}</time></div><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{message.body}</p></div></article></div>)}
                </div>{newBelow && <button className="border-t border-border py-2 text-xs text-accent" onClick={() => { atBottom.current = true; setNewBelow(false); if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; if (activeId) void markRead(activeId, latest.current); }}>New messages · Jump to latest</button>}
                <form className="staff-chat-composer" onSubmit={e => { e.preventDefault(); void send(); }}>{sendError && <p role="alert" className="mb-3 text-xs text-danger">{sendError}</p>}<label className="sr-only" htmlFor="staff-chat-body">Message {selected.name}</label><textarea id="staff-chat-body" className={controlClass + ' min-h-20 resize-none !bg-transparent'} rows={3} maxLength={5000} placeholder={'Message ' + selected.name} disabled={sending} value={draft} onChange={e => { const value = e.target.value; setDrafts(previous => ({ ...previous, [selected.id]: { body: value, client_id: crypto.randomUUID() } })); }} onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); void send(); } }} /><div className="mt-3 flex items-center justify-between gap-3"><p className="text-xs text-secondary">Internal team only · Ctrl/⌘ + Enter to send</p><button className="v-btn v-btn--primary" disabled={sending || !draft.trim()}><Send size={15} />{sending ? 'Sending…' : 'Send'}</button></div></form>
            </> : <div className="flex flex-1 flex-col items-center justify-center px-8 py-20 text-center"><MessageCircle size={34} className="text-secondary" /><h2 className="mt-5 text-xl font-semibold">Keep your team connected</h2><p className="mt-3 max-w-sm text-sm leading-6 text-secondary">Choose a conversation, start a direct message or create a channel for your clinic team.</p><button className="v-btn v-btn--secondary mt-6" onClick={() => open('direct')}>Start a conversation</button>{syncError && <p role="alert" className="mt-4 text-xs text-danger">{syncError}</p>}</div>}</div>
        </section>
    </WorkspacePage><Sidebar open={panel !== null} onClose={() => !creating && setPanel(null)} title={panel === 'channel' ? 'Create a channel' : panel === 'direct' ? 'New direct message' : 'Conversation members'} description={panel === 'members' ? selected?.name : 'Choose people from your clinic’s Desk team.'} width={560}>
        {panel === 'members' ? <ul className="divide-y divide-border">{selected?.members.map(person => <li key={person.id} className="flex items-center gap-3 py-4"><span className="staff-chat-avatar">{initials(person.name)}</span><span className="text-sm font-medium">{person.name}{person.id === current_user_id ? ' (you)' : ''}</span></li>)}</ul> : <form onSubmit={e => { e.preventDefault(); void create(); }}><fieldset disabled={creating} className="space-y-6">{panel === 'channel' && <label className="block text-sm">Channel name<input className={controlClass + ' mt-2'} maxLength={80} required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Clinic handover" /></label>}<fieldset><legend className="mb-3 text-sm font-medium">{panel === 'channel' ? 'Invite team members' : 'Message a colleague'}</legend><p className="mb-4 text-xs text-secondary">{panel === 'channel' ? 'Only you and the selected people can read this channel.' : 'Only you and your colleague can read this conversation.'}</p><div className="divide-y divide-border">{team.filter(person => person.id !== current_user_id).map(person => <label key={person.id} className="flex cursor-pointer items-center gap-3 py-4"><input type={panel === 'channel' ? 'checkbox' : 'radio'} name="chat-person" checked={memberIds.includes(person.id)} onChange={() => setMemberIds(panel === 'direct' ? [person.id] : memberIds.includes(person.id) ? memberIds.filter(id => id !== person.id) : [...memberIds, person.id])} /><span className="staff-chat-avatar">{initials(person.name)}</span><span className="text-sm">{person.name}</span></label>)}</div>{team.length < 2 && <p className="py-4 text-sm text-secondary">Add another colleague to your clinic’s Desk team to start chatting.</p>}</fieldset>{createError && <p role="alert" className="text-sm text-danger">{createError}</p>}<button className="v-btn v-btn--primary" disabled={creating || !memberIds.length || (panel === 'channel' && !name.trim())}>{creating ? 'Opening…' : panel === 'channel' ? 'Create channel' : 'Open conversation'}</button></fieldset></form>}
    </Sidebar></>;
}


StaffChat.layout = (page: ReactNode) => <DeskLayout rail>{page}</DeskLayout>;
