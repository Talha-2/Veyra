import { Head, Link, router, useForm } from '@inertiajs/react';
import { Brain, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';

import { EditorWell } from '../../components/studio-capability/editor-well';
import { Stacked } from '../../components/studio/space';
import Dialog from '../../components/ui/dialog';
import { Card, SearchField, SegmentedControl, Toolbar } from '../../components/ui/kit';
import { PageHeader } from '../../components/ui/page';
import { EmptyState, Kbd, RelativeTime, UserText } from '../../components/ui/primitives';

interface Memory { id: number; name: string; content: string | null; updated_at: string | null }
type Sort = 'recent' | 'name';

const MAX_CONTENT = 20000;
const wordCount = (text: string | null) => (text?.trim() ? text.trim().split(/\s+/).length : 0);

export default function MemoryPage({ memories, contacts_with_history }: { memories: Memory[]; contacts_with_history: number }) {
    const [adding, setAdding] = useState(false);
    const [editing, setEditing] = useState<Memory | null>(null);
    const [query, setQuery] = useState('');
    const [sort, setSort] = useState<Sort>('recent');

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        const list = q ? memories.filter((m) => m.name.toLowerCase().includes(q) || (m.content ?? '').toLowerCase().includes(q)) : [...memories];
        // The server sends most recently updated first; only A–Z needs sorting here.
        if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
        return list;
    }, [memories, query, sort]);

    return (
        <>
            <Head title="Memory" />

            <PageHeader
                title="Memory"
                description="What the agent carries into every call: how this business works, in facts no document states. “We never book installs on Fridays.” “The owner handles complaints himself.” The agent adds to it after calls, too."
                actions={
                    <button type="button" className="v-btn v-btn--primary" onClick={() => setAdding(true)}>
                        <Plus size={15} strokeWidth={2} />
                        Add a memory
                    </button>
                }
                meta={
                    <span className="text-sm text-tertiary">
                        What one customer said lives on their contact instead:{' '}
                        <Link href="/desk/contacts" className="text-accent-text hover:underline">
                            {contacts_with_history.toLocaleString()} {contacts_with_history === 1 ? 'contact has' : 'contacts have'} history
                        </Link>
                        .
                    </span>
                }
            />

            {memories.length === 0 ? (
                <Card>
                    <EmptyState
                        icon={<Brain size={22} strokeWidth={1.6} />}
                        title="Nothing remembered yet"
                        action={<button type="button" className="v-btn v-btn--quiet" onClick={() => setAdding(true)}>Add the first memory</button>}
                    >
                        Add what a new hire would need to be told on day one: opening rules, who handles what, the exceptions everyone knows.
                    </EmptyState>
                </Card>
            ) : (
                <div className="pt-3">
                    <div className="mb-2">
                    <Toolbar trailing={<SearchField value={query} onChange={setQuery} placeholder="Search memory" className="w-full sm:w-70" />}>
                        <SegmentedControl<Sort> value={sort} onChange={setSort} options={[{ value: 'recent', label: 'Recently edited' }, { value: 'name', label: 'A–Z' }]} />
                        <span className="text-sm text-tertiary tabular-nums">
                            {query.trim() ? `${visible.length} of ${memories.length}` : `${memories.length} ${memories.length === 1 ? 'note' : 'notes'}`}
                        </span>
                    </Toolbar>
                    </div>

                    {visible.length === 0 ? (
                        <Card>
                            <EmptyState icon={<Brain size={22} strokeWidth={1.6} />} title={`Nothing remembered about “${query.trim()}”`}
                                action={<button type="button" className="v-btn v-btn--ghost" onClick={() => setQuery('')}>Clear search</button>}>
                                Search looks at each note's title and text. If the agent should know this, add it as a new memory.
                            </EmptyState>
                        </Card>
                    ) : (
                        <div className="grid gap-6 md:grid-cols-2">
                            {visible.map((m) => <MemoryCard key={m.id} memory={m} onOpen={() => setEditing(m)} />)}
                        </div>
                    )}
                </div>
            )}

            <Dialog open={adding} onClose={() => setAdding(false)} title="Add a memory" description="The agent reads it from the next call on." width={760}>
                <MemoryForm onClose={() => setAdding(false)} />
            </Dialog>
            <Dialog open={!!editing} onClose={() => setEditing(null)} title={editing?.name ?? ''} description="Changes reach the agent on its next call." width={760}>
                {editing && <MemoryForm key={editing.id} memory={editing} onClose={() => setEditing(null)} />}
            </Dialog>
        </>
    );
}

function MemoryCard({ memory: m, onOpen }: { memory: Memory; onOpen: () => void }) {
    const words = wordCount(m.content);

    return (
        <button type="button" onClick={onOpen} className="v-panel v-card-hover flex min-h-52 flex-col p-7 text-left">
            <h3 className="line-clamp-2 text-md font-semibold text-primary"><UserText>{m.name}</UserText></h3>
            <p className="mt-2 line-clamp-4 flex-1 text-base leading-relaxed whitespace-pre-line text-secondary" dir="auto">
                {m.content || <span className="text-tertiary">Empty</span>}
            </p>
            <div className="mt-5 flex items-center gap-2 border-t pt-4 text-xs text-tertiary" style={{ borderColor: 'var(--separator)' }}>
                <span>Edited</span>
                <RelativeTime at={m.updated_at} />
                <span className="flex-1" />
                <span className="tabular-nums">{words.toLocaleString()} {words === 1 ? 'word' : 'words'}</span>
            </div>
        </button>
    );
}

function MemoryForm({ onClose, memory }: { onClose: () => void; memory?: Memory }) {
    const { data, setData, post, patch, processing, errors, reset } = useForm({ name: memory?.name ?? '', content: memory?.content ?? '' });
    const submit = (e?: FormEvent) => {
        e?.preventDefault();
        if (memory) patch(`/studio/memory/${memory.id}`, { onSuccess: onClose });
        else post('/studio/memory', { onSuccess: () => { reset(); onClose(); } });
    };
    const forget = () => {
        if (!memory) return;
        if (confirm(`Forget “${memory.name}”? The agent stops knowing it from the next call.`)) router.delete(`/studio/memory/${memory.id}`, { onSuccess: onClose });
    };

    return (
        <form onSubmit={submit} className="flex flex-col gap-5 pt-1">
            {!memory && (
                <Stacked label="Title" htmlFor="memory-title" error={errors.name}>
                    <input id="memory-title" className="v-field max-w-md" value={data.name} maxLength={120} onChange={(e) => setData('name', e.target.value)} placeholder="Scheduling rules" autoFocus />
                </Stacked>
            )}
            <Stacked label="What to remember" htmlFor="memory-content" hint="Write it the way you would tell a new hire.">
                <EditorWell id="memory-content" value={data.content} onChange={(v) => setData('content', v)} max={MAX_CONTENT} minRows={8} error={errors.content} autoFocus={!!memory}
                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); }}
                    placeholder="We never book installs on Fridays. If a caller insists, offer the Thursday before or the Monday after." />
            </Stacked>
            <div className="mt-2 flex items-center gap-2 border-t pt-5" style={{ borderColor: 'var(--separator)' }}>
                {memory && (
                    <button type="button" className="v-btn v-btn--danger v-btn--sm" onClick={forget}>
                        <Trash2 size={14} strokeWidth={1.9} />
                        Forget
                    </button>
                )}
                <span className="hidden flex-1 items-center gap-1 text-xs text-tertiary sm:flex sm:justify-end"><Kbd>Ctrl</Kbd><Kbd>Enter</Kbd> saves</span>
                <span className="flex-1 sm:hidden" />
                <button type="button" className="v-btn v-btn--ghost" onClick={onClose}>Cancel</button>
                <button type="submit" className="v-btn v-btn--primary" disabled={processing || !data.content.trim() || (!memory && !data.name.trim())}>
                    {processing ? 'Saving…' : 'Save'}
                </button>
            </div>
        </form>
    );
}
