import { Link, router } from '@inertiajs/react';
import { MoreHorizontal, Pencil, Search, SquarePen, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Menu, MenuItem, MenuSeparator } from '../shell/menu';
import Dialog from '../ui/dialog';
import { UserText } from '../ui/primitives';

export interface ThreadSummary {
    id: number;
    title: string;
    updated_at: string | null;
    preview?: string;
}

const GROUPS = ['Today', 'Yesterday', 'Previous 7 days', 'Previous 30 days', 'Older'] as const;

function groupOf(at: string | null): (typeof GROUPS)[number] {
    if (!at) return 'Older';
    const day = 86_400_000;
    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
    const t = new Date(at).getTime();
    if (t >= startOfToday.getTime()) return 'Today';
    if (t >= startOfToday.getTime() - day) return 'Yesterday';
    if (t >= startOfToday.getTime() - 7 * day) return 'Previous 7 days';
    if (t >= startOfToday.getTime() - 30 * day) return 'Previous 30 days';
    return 'Older';
}

/**
 * The conversation list: new chat at the top, a filter, then threads grouped
 * by recency the way people remember them — today, yesterday, last week.
 */
export default function ThreadList({ threads, activeId, onNew, onRenamed, onDeleted }: {
    threads: ThreadSummary[];
    activeId: number | null;
    onNew: () => void;
    onRenamed: (id: number, title: string) => void;
    onDeleted: (id: number) => void;
}) {
    const [query, setQuery] = useState('');
    const [editing, setEditing] = useState<number | null>(null);
    const [deleting, setDeleting] = useState<ThreadSummary | null>(null);

    const groups = useMemo(() => {
        const q = query.trim().toLowerCase();
        const visible = q ? threads.filter((t) => t.title.toLowerCase().includes(q) || t.preview?.toLowerCase().includes(q)) : threads;
        return GROUPS.map((label) => ({ label, items: visible.filter((t) => groupOf(t.updated_at) === label) })).filter((g) => g.items.length);
    }, [threads, query]);

    const rename = (id: number, title: string) => {
        setEditing(null);
        const clean = title.trim();
        if (!clean || clean === threads.find((t) => t.id === id)?.title) return;
        onRenamed(id, clean);
        router.patch(`/studio/ask/${id}`, { title: clean }, { preserveScroll: true, preserveState: true, only: [] });
    };

    return (
        <aside className="flex h-full w-[264px] shrink-0 flex-col border-r border-border bg-bg">
            <div className="flex flex-col gap-2 px-3 pt-4 pb-2">
                <button type="button" onClick={onNew}
                    className="flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium text-primary transition-colors hover:bg-surface-hover">
                    <SquarePen size={16} className="text-secondary" /> New chat
                </button>
                <label className="flex h-9 items-center gap-2 rounded-md bg-surface-sunken px-2.5 text-sm transition-shadow focus-within:shadow-[var(--ring)]">
                    <Search size={14} className="shrink-0 text-tertiary" />
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search chats" aria-label="Search chats"
                        className="v-bare min-w-0 flex-1 bg-transparent text-sm text-primary outline-none placeholder:text-tertiary" />
                </label>
            </div>

            <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-4" aria-label="Chats">
                {threads.length === 0 && <p className="px-2.5 py-6 text-sm text-tertiary">Your chats will appear here.</p>}
                {threads.length > 0 && groups.length === 0 && <p className="px-2.5 py-6 text-sm text-tertiary">No chats match “{query}”.</p>}
                {groups.map((group) => (
                    <div key={group.label} className="mt-3 first:mt-1">
                        <div className="px-2.5 pb-1 text-2xs font-medium text-tertiary">{group.label}</div>
                        {group.items.map((t) => {
                            const active = t.id === activeId;
                            if (editing === t.id) {
                                return (
                                    <input key={t.id} autoFocus defaultValue={t.title} aria-label="Chat title"
                                        onBlur={(e) => rename(t.id, e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') rename(t.id, e.currentTarget.value); if (e.key === 'Escape') setEditing(null); }}
                                        className="h-8 w-full rounded-sm bg-surface px-2.5 text-sm text-primary shadow-[var(--ring)] outline-none" />
                                );
                            }
                            return (
                                <div key={t.id} className={`group relative flex h-8 items-center rounded-sm transition-colors ${active ? 'bg-surface-active' : 'hover:bg-surface-hover'}`}>
                                    <Link href={`/studio/ask/${t.id}`} preserveScroll className={`min-w-0 flex-1 truncate px-2.5 text-sm ${active ? 'font-medium text-primary' : 'text-secondary'}`} title={t.title}>
                                        <UserText>{t.title}</UserText>
                                    </Link>
                                    <Menu align="left" width={180} trigger={(open, toggle) => (
                                        <button type="button" onClick={toggle} aria-label="Chat options"
                                            className={`mr-1 flex size-6 items-center justify-center rounded-xs text-tertiary hover:text-primary ${open || active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'}`}>
                                            <MoreHorizontal size={15} />
                                        </button>
                                    )}>
                                        {(close) => (
                                            <>
                                                <MenuItem icon={<Pencil size={14} />} onSelect={() => { close(); setEditing(t.id); }}>Rename</MenuItem>
                                                <MenuSeparator />
                                                <MenuItem danger icon={<Trash2 size={14} />} onSelect={() => { close(); setDeleting(t); }}>Delete</MenuItem>
                                            </>
                                        )}
                                    </Menu>
                                </div>
                            );
                        })}
                    </div>
                ))}
            </nav>

            <Dialog open={!!deleting} onClose={() => setDeleting(null)} title="Delete chat?" description="This removes the conversation for good." width={400}>
                <p className="text-sm text-secondary">“<UserText>{deleting?.title}</UserText>” will be deleted.</p>
                <div className="mt-5 flex justify-end gap-2">
                    <button type="button" className="v-btn v-btn--quiet" onClick={() => setDeleting(null)}>Cancel</button>
                    <button type="button" className="v-btn v-btn--danger" onClick={() => {
                        const id = deleting!.id;
                        setDeleting(null);
                        onDeleted(id);
                        router.delete(`/studio/ask/${id}`, { preserveScroll: true });
                    }}>Delete</button>
                </div>
            </Dialog>
        </aside>
    );
}
