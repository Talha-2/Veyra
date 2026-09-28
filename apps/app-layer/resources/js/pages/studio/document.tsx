import { Head, Link, router, useForm } from '@inertiajs/react';
import { ExternalLink, FileClock, Folder as FolderIcon, Layers, RefreshCw, Trash2 } from 'lucide-react';
import { useState, type CSSProperties, type FormEvent } from 'react';

import { SaveBar } from '../../components/studio/form';
import { formatBytes, plural } from '../../components/studio-knowledge/format';
import { PanelHeader } from '../../components/studio-ops/page-parts';
import { Callout, Card, KeyValues } from '../../components/ui/kit';
import { PageHeader } from '../../components/ui/page';
import { Badge, EmptyState, RelativeTime, type Tone } from '../../components/ui/primitives';

interface Props {
    document: {
        id: number; name: string; source_type: string; mime: string; size_bytes: number; status: string; error: string | null;
        chunk_count: number; retrievable: boolean; updated_at: string | null; content: string | null; source_url: string | null;
        folder: { id: number; name: string } | null; chunks: { id: number; position: number; content: string }[];
    };
}

const SOURCE_LABEL: Record<string, string> = { created: 'Written here', upload: 'Uploaded file', scrape: 'Imported web page', agent: 'Agent memory' };
const TYPE_LABEL: Record<string, string> = {
    'text/markdown': 'Markdown', 'text/plain': 'Plain text', 'text/csv': 'CSV', 'text/html': 'HTML', 'application/pdf': 'PDF',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word document',
};

/** Roughly what the chunker packs: paragraphs into ~1,200-character chunks. */
const CHUNK_TARGET = 1200;

function statusOf(d: Props['document']): { tone: Tone; label: string } {
    if (d.retrievable) return { tone: 'success', label: `Searchable · ${plural(d.chunk_count, 'chunk')}` };
    if (d.status === 'error') return { tone: 'danger', label: 'Indexing failed' };
    if (d.status === 'processing') return { tone: 'warning', label: 'Processing' };
    return { tone: 'muted', label: 'Not searchable' };
}

/**
 * The document editor, with the chunks the agent actually retrieves shown
 * alongside. Reading your own chunks is the fastest way to learn why the
 * agent answered from the wrong paragraph.
 */
export default function DocumentPage({ document: d }: Props) {
    const { data, setData, patch, processing, errors, isDirty, reset } = useForm({ name: d.name, content: d.content ?? '' });
    const submit = (e: FormEvent) => { e.preventDefault(); patch(`/studio/knowledge/documents/${d.id}`, { preserveScroll: true }); };
    const [reindexing, setReindexing] = useState(false);

    const status = statusOf(d);
    const text = data.content.trim();
    const words = text ? text.split(/\s+/).length : 0;
    const paragraphs = text ? text.split(/\n\s*\n/).filter((p) => p.trim()).length : 0;
    const contentChanged = data.content !== (d.content ?? '');
    const back = d.folder ? { href: `/studio/knowledge?folder=${d.folder.id}`, label: d.folder.name } : { href: '/studio/knowledge', label: 'Knowledge' };

    const reindex = () => router.post(`/studio/knowledge/documents/${d.id}/reindex`, {}, { preserveScroll: true, onStart: () => setReindexing(true), onFinish: () => setReindexing(false) });
    const destroy = () => confirm(`Delete "${d.name}"? Its ${plural(d.chunk_count, 'chunk')} go with it, and the agent stops finding it on the next call.`) && router.delete(`/studio/knowledge/documents/${d.id}`);

    return (
        <form onSubmit={submit}>
            <Head title={data.name || d.name} />

            <PageHeader
                back={back}
                title={
                    <input
                        className="-mx-2 w-full max-w-160 rounded-md border border-transparent bg-transparent px-2 text-3xl font-semibold tracking-tight text-primary transition-colors hover:border-border focus:border-accent focus:outline-none"
                        value={data.name}
                        onChange={(e) => setData('name', e.target.value)}
                        aria-label="Document title"
                        dir="auto"
                    />
                }
                meta={
                    <>
                        <Badge tone={status.tone} dot>{status.label}</Badge>
                        <span className="text-xs text-tertiary">Updated <RelativeTime at={d.updated_at} /></span>
                    </>
                }
                actions={d.source_url ? <a href={d.source_url} target="_blank" rel="noreferrer" className="v-btn v-btn--ghost"><ExternalLink size={15} strokeWidth={1.8} />Open source page</a> : undefined}
            />
            {errors.name && <p className="-mt-5 mb-5 text-sm text-danger">{errors.name}</p>}

            {d.error && (
                <div className="mb-5">
                    <Callout tone="danger" title="The agent cannot see this document" icon={<FileClock size={16} strokeWidth={1.8} />}>
                        {d.error}
                    </Callout>
                </div>
            )}

            <div className="mt-3 grid gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
                {/* The writing well: the full main column, never a side panel. */}
                <div className="min-w-0">
                    {d.content === null ? (
                        <Card>
                            <EmptyState icon={<FileClock size={22} strokeWidth={1.6} />} title="Text not extracted yet">
                                The agent layer pulls the text out of PDFs and Word documents. Until it does, this file is listed but the agent cannot search it.
                            </EmptyState>
                        </Card>
                    ) : (
                        <Card className="transition-colors focus-within:border-(--border-accent)">
                            <textarea
                                className="block min-h-[64vh] w-full resize-none rounded-t-lg bg-transparent px-7 py-7 text-md text-primary outline-none placeholder:text-tertiary sm:px-12 sm:py-10"
                                style={{ fieldSizing: 'content', boxShadow: 'none', lineHeight: 1.6 } as CSSProperties}
                                value={data.content}
                                onChange={(e) => setData('content', e.target.value)}
                                placeholder="Write it the way you would explain it to a new hire."
                                aria-label="Document content"
                                dir="auto"
                            />
                            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-b-lg px-7 py-3 text-xs text-tertiary tabular-nums sm:px-12" style={{ borderTop: '1px solid var(--separator)', background: 'var(--bg-subtle)' }}>
                                <span>{plural(words, 'word')}</span>
                                <span>{plural(paragraphs, 'paragraph')}</span>
                                <span>≈ {plural(Math.max(text ? 1 : 0, Math.ceil(data.content.length / CHUNK_TARGET)), 'chunk')} after saving</span>
                                <span className="flex-1" />
                                <span>Markdown supported · one topic per paragraph</span>
                            </div>
                        </Card>
                    )}
                    {errors.content && <p className="mt-2 text-sm text-danger">{errors.content}</p>}
                </div>

                {/* The inspector: beside the editor from 1280px, under it below that. */}
                <aside className="flex min-w-0 flex-col gap-6">
                    <Card>
                        <PanelHeader
                            title="What the agent retrieves"
                            description={`Paragraphs packed into chunks of about ${CHUNK_TARGET.toLocaleString()} characters, never split mid-paragraph. Each is matched and quoted on its own.`}
                        />
                        {contentChanged && (
                            <p className="px-7 pt-4 text-sm text-warning">These are the saved chunks. Save to re-chunk your edits.</p>
                        )}
                        <div className="px-5 py-5">
                            {d.chunks.length === 0 ? (
                                <p className="px-1 py-4 text-center text-sm text-tertiary">No chunks yet. {d.content === null ? 'They appear once the text is extracted.' : 'Save or re-index to build them.'}</p>
                            ) : (
                                <ol className="flex flex-col gap-3">
                                    {d.chunks.map((c) => <ChunkCard key={c.id} position={c.position} content={c.content} />)}
                                </ol>
                            )}
                        </div>
                    </Card>

                    <Card>
                        <PanelHeader title="Details" />
                        <div className="px-7 py-5">
                            <KeyValues items={[
                                { label: 'Source', value: d.source_url
                                    ? <a href={d.source_url} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1 text-accent-text hover:underline"><span className="truncate">{SOURCE_LABEL[d.source_type] ?? d.source_type}</span><ExternalLink size={12} strokeWidth={2} className="shrink-0" /></a>
                                    : SOURCE_LABEL[d.source_type] ?? d.source_type },
                                { label: 'Type', value: TYPE_LABEL[d.mime] ?? d.mime },
                                { label: 'Size', value: <span className="tabular-nums">{formatBytes(d.size_bytes)}</span> },
                                { label: 'Chunks', value: <span className="tabular-nums">{d.chunk_count.toLocaleString()}</span> },
                                { label: 'Updated', value: <RelativeTime at={d.updated_at} className="text-sm text-primary" /> },
                                { label: 'Folder', value: d.folder
                                    ? <Link href={`/studio/knowledge?folder=${d.folder.id}`} className="inline-flex items-center gap-1.5 text-accent-text hover:underline"><FolderIcon size={13} strokeWidth={1.8} />{d.folder.name}</Link>
                                    : <span className="text-secondary">Top level</span> },
                            ]} />
                        </div>
                        <div className="px-7 pb-6">
                            <button type="button" className="v-btn v-btn--quiet w-full" onClick={reindex} disabled={reindexing || d.content === null}>
                                <RefreshCw size={14} strokeWidth={1.9} className={reindexing ? 'animate-spin' : ''} />{reindexing ? 'Re-indexing…' : 'Re-index'}
                            </button>
                            <p className="mt-2.5 text-xs text-tertiary">Rebuilds the chunks from the saved text. Saving already does this; use it after a failed or stale index.</p>
                        </div>
                        <div className="px-7 py-5" style={{ borderTop: '1px solid var(--separator)' }}>
                            <button type="button" className="v-btn v-btn--danger w-full" onClick={destroy}><Trash2 size={14} strokeWidth={1.8} />Delete document</button>
                            <p className="mt-2.5 text-xs text-tertiary">Removes the document and its chunks. The agent stops finding it on the next call.</p>
                        </div>
                    </Card>
                </aside>
            </div>

            <SaveBar processing={processing} dirty={isDirty} label="Save and re-index" onDiscard={() => reset()} />
        </form>
    );
}

function ChunkCard({ position, content }: { position: number; content: string }) {
    const [open, setOpen] = useState(false);
    const long = content.length > 260;

    return (
        <li className="rounded-md px-4 py-3.5" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
            <div className="mb-1.5 flex items-center gap-2">
                <span className="flex size-5 items-center justify-center rounded-full text-2xs font-semibold tabular-nums" style={{ background: 'var(--surface)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>{position + 1}</span>
                <span className="flex items-center gap-1 text-xs text-tertiary tabular-nums"><Layers size={12} strokeWidth={1.8} />{plural(content.length, 'character')}</span>
                <span className="flex-1" />
                {long && (
                    <button type="button" className="text-xs font-medium text-accent-text hover:underline" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
                        {open ? 'Less' : 'More'}
                    </button>
                )}
            </div>
            <p className={`text-sm leading-relaxed whitespace-pre-line text-secondary ${open ? '' : 'line-clamp-4'}`} dir="auto">{content}</p>
        </li>
    );
}
