import { Head, Link, router, useForm } from '@inertiajs/react';
import { Brain, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';

import { Field } from '../../components/studio/form';
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
                <>
                    <Toolbar trailing={<SearchField value={query} onChange={setQuery} placeholder="Search memory" className="w-full sm:w-70" />}>
                        <SegmentedControl<Sort> value={sort} onChange={setSort} options={[{ value: 'recent', label: 'Recently edited' }, { value: 'name', label: 'A–Z' }]} />
                        <span className="text-sm text-tertiary tabular-nums">
                            {query.trim() ? `${visible.length} of ${memories.length}` : `${memories.length} ${memories.length === 1 ? 'note' : 'notes'}`}
                        </span>
                    </Toolbar>

                    {visible.length === 0 ? (
                        <Card>
                            <EmptyState icon={<Brain size={22} strokeWidth={1.6} />} title={`Nothing remembered about “${query.trim()}”`}
                                action={<button type="button" className="v-btn v-btn--ghost" onClick={() => setQuery('')}>Clear search</button>}>
                                Search looks at each note's title and text. If the agent should know this, add it as a new memory.
                            </EmptyState>
                        </Card>
                    ) : (
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                            {!query.trim() && (
                                <button type="button" onClick={() => setAdding(true)}
                                    className="group flex min-h-44 flex-col items-center justify-center gap-2 rounded-lg p-5 text-center transition-colors hover:bg-surface-hover"
                                    style={{ border: '1.5px dashed var(--border-strong)' }}>
                                    <span className="flex size-10 items-center justify-center rounded-full text-secondary transition-colors group-hover:text-primary" style={{ background: 'var(--surface-sunken)' }}>
                                        <Plus size={16} strokeWidth={2} />
                                    </span>
                                    <span className="text-base font-medium text-primary">Add a memory</span>
                                    <span className="max-w-[28ch] text-sm text-tertiary">A rule or fact the agent should carry into every call.</span>
                                </button>
                            )}
                            {visible.map((m) => <MemoryCard key={m.id} memory={m} onOpen={() => setEditing(m)} />)}
                        </div>
                    )}
                </>
            )}

            <Dialog open={adding} onClose={() => setAdding(false)} title="Add a memory" description="The agent reads it from the next call on." width={600}>
                <MemoryForm onClose={() => setAdding(false)} />
            </Dialog>
            <Dialog open={!!editing} onClose={() => setEditing(null)} title={editing?.name ?? ''} description="Changes reach the agent on its next call." width={600}>
                {editing && <MemoryForm key={editing.id} memory={editing} onClose={() => setEditing(null)} />}
            </Dialog>
        </>
    );
}

function MemoryCard({ memory: m, onOpen }: { memory: Memory; onOpen: () => void }) {
    const words = wordCount(m.content);

    return (
        <button type="button" onClick={onOpen} className="v-panel v-card-hover flex min-h-44 flex-col p-5 text-left">
            <h3 className="line-clamp-2 text-md font-semibold text-primary"><UserText>{m.name}</UserText></h3>
            <p className="mt-1.5 line-clamp-5 flex-1 text-sm leading-relaxed whitespace-pre-line text-secondary" dir="auto">
                {m.content || <span className="text-tertiary">Empty</span>}
            </p>
            <div className="mt-4 flex items-center gap-2 border-t pt-3 text-xs text-tertiary" style={{ borderColor: 'var(--separator)' }}>
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
        <form onSubmit={submit}>
            {!memory && (
                <Field label="Title" error={errors.name} hint="A few words, so you can find it again.">
                    <input className="v-field" value={data.name} maxLength={120} onChange={(e) => setData('name', e.target.value)} placeholder="Scheduling rules" autoFocus />
                </Field>
            )}
            <Field label="What to remember" error={errors.content}
                hint={`${data.content.length.toLocaleString()} / ${MAX_CONTENT.toLocaleString()} characters. Write it the way you would tell a new hire.`}>
                <textarea className="v-field h-auto text-base leading-relaxed" rows={9} maxLength={MAX_CONTENT} value={data.content} dir="auto" autoFocus={!!memory}
                    onChange={(e) => setData('content', e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); }}
                    placeholder="We never book installs on Fridays. If a caller insists, offer the Thursday before or the Monday after." />
            </Field>
            <div className="mt-6 flex items-center gap-2">
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
