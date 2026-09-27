import { Head, Link, router, useForm } from '@inertiajs/react';
import {
    ChevronDown, ChevronRight, FileText, FileUp, Folder as FolderIcon, FolderInput, FolderPlus, Globe, Library, MoreHorizontal,
    PenLine, Pencil, Plus, Search, SearchX, Sparkles, Trash2, UploadCloud, X,
} from 'lucide-react';
import { useMemo, useRef, useState, type DragEvent as ReactDragEvent, type FormEvent, type ReactNode } from 'react';

import { Menu, MenuItem, MenuLabel, MenuSeparator } from '../../components/shell/menu';
import { Field } from '../../components/studio/form';
import { ACCEPT_ATTR, DropOverlay, isAccepted, useWindowFileDrop } from '../../components/studio-knowledge/file-drop';
import { formatBytes, plural, searchTerms, splitHits } from '../../components/studio-knowledge/format';
import Dialog from '../../components/ui/dialog';
import { Callout, Card, IconTile, Meter, SearchField, StatTile, Toolbar } from '../../components/ui/kit';
import { PageHeader } from '../../components/ui/page';
import { Badge, EmptyState, RelativeTime, UserText, type Tone } from '../../components/ui/primitives';
import { toast } from '../../components/ui/toaster';

interface Doc { id: number; name: string; source_type: string; mime: string; size_bytes: number; status: string; error: string | null; chunk_count: number; retrievable: boolean; updated_at: string | null }
interface Props {
    folder: { id: number; name: string; parent_id: number | null } | null;
    breadcrumbs: { id: number; name: string }[];
    folders: { id: number; name: string; documents_count: number }[];
    all_folders: { id: number; name: string; parent_id: number | null }[];
    documents: Doc[];
    totals: { documents: number; retrievable: number; processing: number; failed?: number };
    search: { query: string; results: { document_id: number; document: string; position: number; score: number; excerpt: string }[] } | null;
}

type DialogKind = 'doc' | 'upload' | 'scrape' | 'folder';

/** Finder's column layout: select, name, source, status, size, updated, menu. Middle columns fold away on a phone. */
const COLUMNS = 'grid grid-cols-[20px_minmax(0,1fr)_32px] md:grid-cols-[20px_minmax(0,1fr)_104px_132px_76px_80px_32px] items-center gap-x-4';

const SOURCE: Record<string, { label: string; icon: ReactNode }> = {
    created: { label: 'Written', icon: <PenLine size={16} strokeWidth={1.8} /> },
    upload: { label: 'Uploaded', icon: <FileUp size={16} strokeWidth={1.8} /> },
    scrape: { label: 'Web page', icon: <Globe size={16} strokeWidth={1.8} /> },
};

function docStatus(d: Doc): { tone: Tone; label: string } {
    if (d.retrievable) return { tone: 'success', label: plural(d.chunk_count, 'chunk') };
    if (d.status === 'error') return { tone: 'danger', label: 'Failed' };
    if (d.status === 'processing') return { tone: 'warning', label: 'Processing' };
    return { tone: 'muted', label: 'Not searchable' };
}

export default function Knowledge({ folder, breadcrumbs, folders, all_folders, documents, totals, search }: Props) {
    const [dialog, setDialog] = useState<DialogKind | null>(null);
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [q, setQ] = useState(search?.query ?? '');
    const [filter, setFilter] = useState('');
    const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null);
    const [uploading, setUploading] = useState<{ count: number; progress: number } | null>(null);

    const here = folder?.name ?? 'All documents';
    const failed = totals.failed ?? Math.max(0, totals.documents - totals.retrievable - totals.processing);
    const waiting = totals.processing + failed;

    const needle = filter.trim().toLowerCase();
    const shownFolders = needle ? folders.filter((f) => f.name.toLowerCase().includes(needle)) : folders;
    const shownDocs = needle ? documents.filter((d) => d.name.toLowerCase().includes(needle)) : documents;
    const allShownSelected = shownDocs.length > 0 && shownDocs.every((d) => selected.has(d.id));
    const someShownSelected = shownDocs.some((d) => selected.has(d.id));

    // Drag files anywhere on the page. The dialog is the fallback, and while
    // it is open it owns drops so a file cannot land twice.
    const uploadFiles = (files: File[]) => {
        const accepted = files.filter(isAccepted);
        const skipped = files.length - accepted.length;
        if (skipped > 0) toast(`${plural(skipped, 'file')} skipped: only TXT, MD, CSV, HTML, PDF and DOCX can be indexed.`, 'warning');
        if (accepted.length === 0) return;
        setUploading({ count: accepted.length, progress: 0 });
        router.post('/studio/knowledge/upload', { files: accepted, ...(folder ? { folder_id: folder.id } : {}) }, {
            forceFormData: true,
            preserveScroll: true,
            onProgress: (p) => setUploading((u) => (u ? { ...u, progress: p?.percentage ?? u.progress } : u)),
            onError: (errors) => toast(Object.values(errors)[0] ?? 'Upload failed.', 'error'),
            onFinish: () => setUploading(null),
        });
    };
    const dragging = useWindowFileDrop(uploadFiles, dialog === null && uploading === null);

    const toggle = (id: number) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    const toggleAll = () => setSelected((s) => {
        const n = new Set(s);
        if (allShownSelected) shownDocs.forEach((d) => n.delete(d.id)); else shownDocs.forEach((d) => n.add(d.id));
        return n;
    });
    const clearSelection = () => setSelected(new Set());

    const moveSelected = (folderId: number | null) =>
        router.post('/studio/knowledge/move', { document_ids: [...selected], folder_id: folderId }, { preserveScroll: true, onSuccess: clearSelection });
    const deleteSelected = () =>
        confirm(`Delete ${plural(selected.size, 'document')}? The agent stops finding them on the next call.`)
        && router.post('/studio/knowledge/bulk-delete', { document_ids: [...selected] }, { preserveScroll: true, onSuccess: clearSelection });

    const submitRename = () => {
        if (!renaming) return;
        const original = folders.find((f) => f.id === renaming.id)?.name;
        const name = renaming.name.trim();
        if (name && name !== original) router.patch(`/studio/knowledge/folders/${renaming.id}`, { name }, { preserveScroll: true });
        setRenaming(null);
    };

    const runSearch = (e: FormEvent) => {
        e.preventDefault();
        router.get('/studio/knowledge', { search: q || undefined, folder: folder?.id }, { preserveState: true, preserveScroll: true });
    };
    const clearSearch = () => {
        setQ('');
        router.get('/studio/knowledge', { folder: folder?.id }, { preserveState: true, preserveScroll: true });
    };

    const empty = folders.length === 0 && documents.length === 0;

    return (
        <>
            <Head title="Knowledge" />

            <PageHeader
                title="Knowledge"
                description="What the agent can look up on a call: prices, policies, service areas. It searches every document, whatever folder it sits in."
                actions={
                    <Menu align="right" width={280} trigger={(open, t) => (
                        <button type="button" className="v-btn v-btn--primary" onClick={t} aria-expanded={open} aria-haspopup="menu">
                            <Plus size={15} strokeWidth={2} />Add<ChevronDown size={14} strokeWidth={2} className="-mr-1 opacity-70" />
                        </button>
                    )}>
                        {(close) => (
                            <>
                                <MenuLabel>Add to {here}</MenuLabel>
                                <MenuItem icon={<PenLine size={15} strokeWidth={1.8} />} onSelect={() => { close(); setDialog('doc'); }}>Write a document</MenuItem>
                                <MenuItem icon={<UploadCloud size={15} strokeWidth={1.8} />} onSelect={() => { close(); setDialog('upload'); }}>Upload files</MenuItem>
                                <MenuItem icon={<Globe size={15} strokeWidth={1.8} />} onSelect={() => { close(); setDialog('scrape'); }}>Import a web page</MenuItem>
                                <MenuSeparator />
                                <MenuItem icon={<FolderPlus size={15} strokeWidth={1.8} />} onSelect={() => { close(); setDialog('folder'); }}>New folder</MenuItem>
                            </>
                        )}
                    </Menu>
                }
            />

            <div className="mb-6 grid gap-4 sm:grid-cols-3">
                <StatTile label="Documents" icon={<FileText size={15} strokeWidth={1.8} />} value={totals.documents.toLocaleString()} hint="Across every folder" />
                <StatTile
                    label="Searchable"
                    icon={<Search size={15} strokeWidth={1.8} />}
                    value={totals.retrievable.toLocaleString()}
                    tone={totals.retrievable > 0 ? 'success' : undefined}
                    hint={totals.documents === 0 ? 'Nothing indexed yet' : `${Math.round((totals.retrievable / totals.documents) * 100)}% of documents the agent can quote`}
                />
                <StatTile
                    label="Processing or failed"
                    value={waiting.toLocaleString()}
                    tone={failed > 0 ? 'danger' : totals.processing > 0 ? 'warning' : undefined}
                    hint={failed > 0
                        ? `${failed} failed: listed here, invisible to the agent${totals.processing ? ` · ${totals.processing} processing` : ''}`
                        : totals.processing > 0 ? `${totals.processing} waiting for their text to be extracted` : 'Everything is indexed'}
                />
            </div>

            {/* The retrieval test: what a caller's question would actually surface. */}
            <Card className="mb-8">
                <div className="px-5 pt-5 pb-5 sm:px-6">
                    <div className="mb-4 flex items-start gap-3">
                        <IconTile tone="accent"><Sparkles size={16} strokeWidth={1.8} /></IconTile>
                        <div className="min-w-0">
                            <h2 className="text-md font-semibold text-primary">Ask what the agent would find</h2>
                            <p className="mt-0.5 text-sm text-secondary">Type what a caller might say. This runs the exact search the agent runs mid-call, across every folder, and shows the passages it would read from.</p>
                        </div>
                    </div>
                    <form className="flex flex-col gap-2 sm:flex-row" onSubmit={runSearch}>
                        <div className="relative flex-1">
                            <Search size={16} strokeWidth={2} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-tertiary" />
                            <input
                                type="search"
                                className="v-field h-11 rounded-full pr-4 pl-11 text-md"
                                placeholder="e.g. Do you service Evanston on weekends?"
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                aria-label="Test question"
                                dir="auto"
                            />
                        </div>
                        <button type="submit" className="v-btn v-btn--quiet h-11 px-5" disabled={!q.trim()}>Test retrieval</button>
                    </form>
                </div>

                {search && <SearchResults search={search} onClear={clearSearch} />}
            </Card>

            <Toolbar trailing={!empty && <SearchField value={filter} onChange={setFilter} placeholder={`Filter ${folder ? 'this folder' : 'documents'}`} className="w-full sm:w-60" />}>
                <nav className="flex min-w-0 flex-wrap items-center gap-1 text-base" aria-label="Folder path">
                    {folder ? (
                        <Link href="/studio/knowledge" className="flex items-center gap-1.5 rounded-md px-1 text-secondary transition-colors hover:text-primary">
                            <Library size={15} strokeWidth={1.8} />All documents
                        </Link>
                    ) : (
                        <span className="flex items-center gap-1.5 px-1 font-semibold text-primary"><Library size={15} strokeWidth={1.8} />All documents</span>
                    )}
                    {breadcrumbs.map((b, i) => (
                        <span key={b.id} className="flex min-w-0 items-center gap-1">
                            <ChevronRight size={14} strokeWidth={2} className="shrink-0 text-tertiary" />
                            {i === breadcrumbs.length - 1
                                ? <span className="truncate px-1 font-semibold text-primary" aria-current="page">{b.name}</span>
                                : <Link href={`/studio/knowledge?folder=${b.id}`} className="truncate rounded-md px-1 text-secondary transition-colors hover:text-primary">{b.name}</Link>}
                        </span>
                    ))}
                </nav>
            </Toolbar>

            {uploading && (
                <div className="mb-4">
                    <Callout tone="info" icon={<UploadCloud size={16} strokeWidth={1.8} />} title={`Uploading ${plural(uploading.count, 'file')} to ${here}`}>
                        <div className="mt-2 flex items-center gap-3">
                            <Meter value={uploading.progress} tone="info" label="Upload progress" />
                            <span className="text-xs text-tertiary tabular-nums">{Math.round(uploading.progress)}%</span>
                        </div>
                    </Callout>
                </div>
            )}

            {empty ? (
                <Card>
                    <EmptyState
                        icon={folder ? <FolderIcon size={22} strokeWidth={1.6} /> : <FileText size={22} strokeWidth={1.6} />}
                        title={folder ? `${folder.name} is empty` : 'Teach the agent what your business knows'}
                        action={
                            <div className="flex flex-wrap justify-center gap-2">
                                <button type="button" className="v-btn v-btn--quiet" onClick={() => setDialog('upload')}><UploadCloud size={15} strokeWidth={1.8} />Upload files</button>
                                <button type="button" className="v-btn v-btn--ghost" onClick={() => setDialog('doc')}><PenLine size={15} strokeWidth={1.8} />Write a document</button>
                            </div>
                        }
                    >
                        {folder
                            ? 'Drop files anywhere on this page, or write a document here. Folders are for you; the agent searches everything regardless.'
                            : 'Add what callers ask about: pricing, policies, service areas, hours. Drop files anywhere on this page, or write one from scratch.'}
                    </EmptyState>
                </Card>
            ) : (
                <Card className="overflow-hidden">
                    <div className={`${COLUMNS} h-10 px-5 text-xs font-medium text-tertiary`} style={{ borderBottom: '1px solid var(--separator)' }}>
                        <input
                            type="checkbox"
                            aria-label="Select all documents"
                            checked={allShownSelected}
                            ref={(el) => { if (el) el.indeterminate = someShownSelected && !allShownSelected; }}
                            onChange={toggleAll}
                            disabled={shownDocs.length === 0}
                        />
                        <span>Name</span>
                        <span className="hidden md:block">Source</span>
                        <span className="hidden md:block">Status</span>
                        <span className="hidden text-right md:block">Size</span>
                        <span className="hidden text-right md:block">Updated</span>
                        <span />
                    </div>

                    <div className="divide-y" style={{ ['--tw-divide-color' as string]: 'var(--separator)' }}>
                        {shownFolders.map((f) => (
                            <div key={`f${f.id}`} className={`${COLUMNS} px-5 py-3 transition-colors hover:bg-surface-hover`}>
                                <span />
                                {renaming?.id === f.id ? (
                                    <div className="flex min-w-0 items-center gap-3">
                                        <IconTile tone="info"><FolderIcon size={16} strokeWidth={1.8} /></IconTile>
                                        <input
                                            className="v-field h-8 max-w-[320px]"
                                            value={renaming.name}
                                            autoFocus
                                            onFocus={(e) => e.currentTarget.select()}
                                            onChange={(e) => setRenaming({ id: f.id, name: e.target.value })}
                                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitRename(); } if (e.key === 'Escape') setRenaming(null); }}
                                            onBlur={submitRename}
                                            aria-label="Folder name"
                                        />
                                    </div>
                                ) : (
                                    <Link href={`/studio/knowledge?folder=${f.id}`} className="flex min-w-0 items-center gap-3">
                                        <IconTile tone="info"><FolderIcon size={16} strokeWidth={1.8} /></IconTile>
                                        <span className="min-w-0">
                                            <span className="block truncate text-base font-medium text-primary">{f.name}</span>
                                            <span className="block text-sm text-secondary md:hidden">{plural(f.documents_count, 'document')}</span>
                                        </span>
                                    </Link>
                                )}
                                <span className="hidden text-sm text-secondary md:block">Folder</span>
                                <span className="hidden text-sm text-secondary md:block">{plural(f.documents_count, 'document')}</span>
                                <span className="hidden text-right text-sm text-tertiary md:block">—</span>
                                <span className="hidden md:block" />
                                <RowMenu label={`Actions for ${f.name}`}>
                                    {(close) => (
                                        <>
                                            <MenuItem icon={<Pencil size={14} strokeWidth={1.8} />} onSelect={() => { close(); setRenaming({ id: f.id, name: f.name }); }}>Rename</MenuItem>
                                            <MenuSeparator />
                                            <MenuItem danger icon={<Trash2 size={14} strokeWidth={1.8} />} onSelect={() => {
                                                close();
                                                if (confirm(`Delete folder "${f.name}"? Its documents move up a level; nothing is deleted.`)) router.delete(`/studio/knowledge/folders/${f.id}`, { preserveScroll: true });
                                            }}>Delete folder</MenuItem>
                                        </>
                                    )}
                                </RowMenu>
                            </div>
                        ))}

                        {shownDocs.map((d) => {
                            const status = docStatus(d);
                            const source = SOURCE[d.source_type] ?? { label: d.source_type, icon: <FileText size={16} strokeWidth={1.8} /> };
                            const isSelected = selected.has(d.id);

                            return (
                                <div key={`d${d.id}`} className={`${COLUMNS} px-5 py-3 transition-colors ${isSelected ? '' : 'hover:bg-surface-hover'}`} style={{ background: isSelected ? 'var(--accent-subtle)' : undefined }}>
                                    <input type="checkbox" checked={isSelected} onChange={() => toggle(d.id)} aria-label={`Select ${d.name}`} />
                                    <Link href={`/studio/knowledge/documents/${d.id}`} className="flex min-w-0 items-center gap-3">
                                        <IconTile tone={d.status === 'error' ? 'danger' : 'muted'}>{source.icon}</IconTile>
                                        <span className="min-w-0">
                                            <UserText className="block truncate text-base font-medium text-primary">{d.name}</UserText>
                                            {d.error
                                                ? <span className="block truncate text-sm text-danger" title={d.error}>{d.error}</span>
                                                : <span className="block truncate text-sm text-secondary md:hidden">{status.label} · {formatBytes(d.size_bytes)}</span>}
                                        </span>
                                    </Link>
                                    <span className="hidden md:block"><Badge>{source.label}</Badge></span>
                                    <span className="hidden md:block"><Badge tone={status.tone} dot>{status.label}</Badge></span>
                                    <span className="hidden text-right text-sm text-secondary tabular-nums md:block">{formatBytes(d.size_bytes)}</span>
                                    <span className="hidden text-right md:block"><RelativeTime at={d.updated_at} /></span>
                                    <RowMenu label={`Actions for ${d.name}`}>
                                        {(close) => (
                                            <>
                                                <MenuItem icon={<PenLine size={14} strokeWidth={1.8} />} onSelect={() => { close(); router.visit(`/studio/knowledge/documents/${d.id}`); }}>Open</MenuItem>
                                                <MenuItem icon={<FolderInput size={14} strokeWidth={1.8} />} onSelect={() => { close(); setSelected(new Set([d.id])); }}>Select to move</MenuItem>
                                                <MenuSeparator />
                                                <MenuItem danger icon={<Trash2 size={14} strokeWidth={1.8} />} onSelect={() => {
                                                    close();
                                                    if (confirm(`Delete "${d.name}"? The agent stops finding it on the next call.`)) router.delete(`/studio/knowledge/documents/${d.id}`, { preserveScroll: true });
                                                }}>Delete</MenuItem>
                                            </>
                                        )}
                                    </RowMenu>
                                </div>
                            );
                        })}

                        {shownFolders.length === 0 && shownDocs.length === 0 && (
                            <div className="px-5 py-10 text-center">
                                <p className="text-base font-medium text-primary">Nothing here matches “{filter}”</p>
                                <p className="mt-1 text-sm text-secondary">This filters names in {here} only. To check what the agent would find, use the retrieval test above.</p>
                            </div>
                        )}
                    </div>

                    <div className="px-5 py-2.5 text-xs text-tertiary" style={{ borderTop: '1px solid var(--separator)', background: 'var(--bg-subtle)' }}>
                        {plural(folders.length, 'folder')} · {plural(documents.length, 'document')} in {here}. Drag files onto the page to upload here.
                    </div>
                </Card>
            )}

            <SelectionBar
                count={selected.size}
                folders={all_folders}
                currentFolderId={folder?.id ?? null}
                onMove={moveSelected}
                onDelete={deleteSelected}
                onClear={clearSelection}
            />

            <DropOverlay visible={dragging} destination={here} />

            <WriteDialog open={dialog === 'doc'} onClose={() => setDialog(null)} folderId={folder?.id ?? null} here={here} />
            <UploadDialog open={dialog === 'upload'} onClose={() => setDialog(null)} folderId={folder?.id ?? null} here={here} />
            <ScrapeDialog open={dialog === 'scrape'} onClose={() => setDialog(null)} folderId={folder?.id ?? null} here={here} />
            <FolderDialog open={dialog === 'folder'} onClose={() => setDialog(null)} parentId={folder?.id ?? null} here={here} />
        </>
    );
}

// ── retrieval results ────────────────────────────────────────────────────

function SearchResults({ search, onClear }: { search: NonNullable<Props['search']>; onClear: () => void }) {
    const terms = useMemo(() => searchTerms(search.query), [search.query]);
    const top = Math.max(1, ...search.results.map((r) => r.score));

    return (
        <div style={{ borderTop: '1px solid var(--separator)' }}>
            <div className="flex items-center gap-3 px-5 py-3 sm:px-6" style={{ background: 'var(--bg-subtle)' }}>
                <p className="min-w-0 flex-1 truncate text-sm text-secondary">
                    {search.results.length === 0
                        ? <>No passages for <span className="font-medium text-primary">“{search.query}”</span></>
                        : <>{plural(search.results.length, 'passage')} for <UserText className="font-medium text-primary">“{search.query}”</UserText>, best first</>}
                </p>
                <button type="button" className="v-btn v-btn--ghost v-btn--sm" onClick={onClear}><X size={14} strokeWidth={2} />Clear</button>
            </div>

            {search.results.length === 0 ? (
                <EmptyState icon={<SearchX size={22} strokeWidth={1.6} />} title="Nothing matched">
                    On a call the agent would say it does not know, which is the right answer when the knowledge is not here. If it should know, write it down in a document.
                </EmptyState>
            ) : (
                <ol className="divide-y" style={{ ['--tw-divide-color' as string]: 'var(--separator)' }}>
                    {search.results.map((r, i) => {
                        const pct = (r.score / top) * 100;

                        return (
                            <li key={`${r.document_id}-${r.position}`} className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-3 px-5 py-4 sm:grid-cols-[28px_minmax(0,1fr)_140px] sm:gap-x-4 sm:px-6">
                                <span className="mt-0.5 flex size-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums"
                                    style={i === 0 ? { background: 'var(--accent-subtle)', color: 'var(--accent-text)' } : { background: 'var(--surface-sunken)', color: 'var(--text-secondary)' }}>
                                    {i + 1}
                                </span>
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-baseline gap-x-2">
                                        <Link href={`/studio/knowledge/documents/${r.document_id}`} className="truncate text-base font-medium text-primary hover:text-accent-text">{r.document}</Link>
                                        <span className="text-xs text-tertiary">Chunk {r.position + 1}</span>
                                    </div>
                                    <p className="mt-1 text-sm text-secondary" dir="auto">
                                        {splitHits(r.excerpt, terms).map((part, j) => part.hit
                                            ? <mark key={j} className="rounded-[4px] px-0.5 text-primary" style={{ background: 'var(--accent-subtle-hover)' }}>{part.text}</mark>
                                            : <span key={j}>{part.text}</span>)}
                                    </p>
                                </div>
                                <div className="col-start-2 mt-3 sm:col-start-3 sm:mt-1">
                                    <Meter value={pct} tone={i === 0 ? 'accent' : 'muted'} label={`Relevance of result ${i + 1}`} />
                                    <p className="mt-1.5 text-xs text-tertiary tabular-nums">{plural(r.score, 'term match', 'term matches')}</p>
                                </div>
                            </li>
                        );
                    })}
                </ol>
            )}
        </div>
    );
}

// ── rows and bars ────────────────────────────────────────────────────────

function RowMenu({ label, children }: { label: string; children: (close: () => void) => ReactNode }) {
    return (
        <div className="flex justify-end">
            <Menu align="right" width={220} trigger={(open, t) => (
                <button type="button" className="v-btn v-btn--ghost v-btn--icon size-8" onClick={t} aria-label={label} aria-expanded={open} aria-haspopup="menu">
                    <MoreHorizontal size={16} strokeWidth={2} />
                </button>
            )}>
                {children}
            </Menu>
        </div>
    );
}

function SelectionBar({ count, folders, currentFolderId, onMove, onDelete, onClear }: {
    count: number;
    folders: Props['all_folders'];
    currentFolderId: number | null;
    onMove: (folderId: number | null) => void;
    onDelete: () => void;
    onClear: () => void;
}) {
    const visible = count > 0;

    return (
        <div aria-live="polite" className="pointer-events-none sticky bottom-5 z-30 mt-4 flex justify-center transition-all duration-300"
            style={{ opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(12px)', transitionTimingFunction: 'var(--ease-entrance)' }}>
            {visible && (
                <div className="v-glass pointer-events-auto flex items-center gap-1.5 rounded-full py-1.5 pr-1.5 pl-4" style={{ border: '1px solid var(--border)', boxShadow: 'var(--shadow-overlay)' }}>
                    <span className="mr-2 text-sm font-medium text-primary tabular-nums">{plural(count, 'document')} selected</span>
                    <Menu side="top" align="right" width={260} trigger={(open, t) => (
                        <button type="button" className="v-btn v-btn--quiet v-btn--sm" onClick={t} aria-expanded={open} aria-haspopup="menu">
                            <FolderInput size={14} strokeWidth={1.8} />Move to…
                        </button>
                    )}>
                        {(close) => (
                            <div className="max-h-[280px] overflow-y-auto">
                                <MenuLabel>Move to</MenuLabel>
                                <MenuItem icon={<Library size={14} strokeWidth={1.8} />} active={currentFolderId === null} onSelect={() => { close(); onMove(null); }}>All documents (top level)</MenuItem>
                                {folders.map((f) => (
                                    <MenuItem key={f.id} icon={<FolderIcon size={14} strokeWidth={1.8} />} active={currentFolderId === f.id} onSelect={() => { close(); onMove(f.id); }}>{f.name}</MenuItem>
                                ))}
                            </div>
                        )}
                    </Menu>
                    <button type="button" className="v-btn v-btn--danger v-btn--sm" onClick={onDelete}><Trash2 size={14} strokeWidth={1.8} />Delete</button>
                    <button type="button" className="v-btn v-btn--ghost v-btn--icon size-7 rounded-full" onClick={onClear} aria-label="Clear selection"><X size={14} strokeWidth={2} /></button>
                </div>
            )}
        </div>
    );
}

// ── dialogs ──────────────────────────────────────────────────────────────

function Footer({ onClose, processing, label, disabled = false }: { onClose: () => void; processing: boolean; label: string; disabled?: boolean }) {
    return (
        <div className="mt-6 flex justify-end gap-2">
            <button type="button" className="v-btn v-btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="v-btn v-btn--primary" disabled={processing || disabled}>{processing ? 'Working…' : label}</button>
        </div>
    );
}

function WriteDialog({ open, onClose, folderId, here }: { open: boolean; onClose: () => void; folderId: number | null; here: string }) {
    const { data, setData, post, processing, errors, reset } = useForm({ name: '', content: '', folder_id: folderId });
    const submit = (e: FormEvent) => { e.preventDefault(); post('/studio/knowledge/documents', { onSuccess: () => { reset(); onClose(); } }); };
    const words = data.content.trim() ? data.content.trim().split(/\s+/).length : 0;

    return (
        <Dialog open={open} onClose={onClose} title="Write a document" description={`Saved to ${here} and searchable by the agent as soon as you create it.`} width={720}>
            <form onSubmit={submit}>
                <Field label="Title" error={errors.name}>
                    <input className="v-field" value={data.name} onChange={(e) => setData('name', e.target.value)} placeholder="e.g. Service area and call-out fees" autoFocus dir="auto" />
                </Field>
                <Field label="Content" error={errors.content} hint="Write it the way you would explain it to a new hire. Keep one topic per paragraph: paragraphs are what the agent retrieves.">
                    <textarea className="v-field h-auto text-base leading-relaxed" rows={12} value={data.content} onChange={(e) => setData('content', e.target.value)} dir="auto" placeholder="Plain text or Markdown." />
                </Field>
                <p className="-mt-2 text-xs text-tertiary tabular-nums">{plural(words, 'word')}</p>
                <Footer onClose={onClose} processing={processing} label="Create" disabled={!data.name.trim() || !data.content.trim()} />
            </form>
        </Dialog>
    );
}

function UploadDialog({ open, onClose, folderId, here }: { open: boolean; onClose: () => void; folderId: number | null; here: string }) {
    const { data, setData, post, processing, errors, reset } = useForm<{ files: File[]; folder_id: number | null }>({ files: [], folder_id: folderId });
    const [over, setOver] = useState(false);
    const input = useRef<HTMLInputElement>(null);
    const submit = (e: FormEvent) => { e.preventDefault(); post('/studio/knowledge/upload', { forceFormData: true, onSuccess: () => { reset(); onClose(); } }); };
    const add = (files: File[]) => {
        const accepted = files.filter(isAccepted);
        if (accepted.length < files.length) toast(`${plural(files.length - accepted.length, 'file')} skipped: that type cannot be indexed.`, 'warning');
        setData('files', [...data.files, ...accepted].slice(0, 20));
    };
    const onDrop = (e: ReactDragEvent) => { e.preventDefault(); setOver(false); add(Array.from(e.dataTransfer.files)); };
    const fileError = Object.entries(errors as Record<string, string>).find(([k]) => k.startsWith('files'))?.[1];

    return (
        <Dialog open={open} onClose={onClose} title="Upload files" description={`Into ${here}. Text, Markdown, CSV and HTML are searchable immediately; PDF and Word show as processing until their text is extracted.`}>
            <form onSubmit={submit}>
                <button
                    type="button"
                    onClick={() => input.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setOver(true); }}
                    onDragLeave={() => setOver(false)}
                    onDrop={onDrop}
                    className="flex w-full flex-col items-center rounded-lg px-6 py-8 text-center transition-colors"
                    style={{ border: `1.5px dashed ${over ? 'var(--accent)' : 'var(--border-strong)'}`, background: over ? 'var(--accent-subtle)' : 'var(--surface-sunken)' }}
                >
                    <UploadCloud size={24} strokeWidth={1.6} className="mb-2 text-tertiary" />
                    <span className="text-base font-medium text-primary">Drop files here, or choose</span>
                    <span className="mt-0.5 text-xs text-tertiary">TXT, MD, CSV, HTML, PDF, DOCX · up to 20 files, 20 MB each</span>
                </button>
                <input ref={input} type="file" multiple accept={ACCEPT_ATTR} className="hidden" onChange={(e) => { add(Array.from(e.target.files ?? [])); e.target.value = ''; }} />

                {data.files.length > 0 && (
                    <ul className="mt-3 divide-y rounded-md" style={{ border: '1px solid var(--border)', ['--tw-divide-color' as string]: 'var(--separator)' }}>
                        {data.files.map((f, i) => (
                            <li key={`${f.name}-${i}`} className="flex items-center gap-3 px-3 py-2">
                                <FileText size={15} strokeWidth={1.8} className="shrink-0 text-tertiary" />
                                <span className="min-w-0 flex-1 truncate text-sm text-primary">{f.name}</span>
                                <span className="text-xs text-tertiary tabular-nums">{formatBytes(f.size)}</span>
                                <button type="button" className="v-btn v-btn--ghost v-btn--icon size-6" aria-label={`Remove ${f.name}`} onClick={() => setData('files', data.files.filter((_, j) => j !== i))}><X size={13} strokeWidth={2} /></button>
                            </li>
                        ))}
                    </ul>
                )}
                {fileError && <p className="mt-2 text-sm text-danger">{fileError}</p>}
                {data.files.length > 0 && <p className="mt-2 text-xs text-tertiary tabular-nums">{plural(data.files.length, 'file')} · {formatBytes(data.files.reduce((a, f) => a + f.size, 0))}</p>}
                <Footer onClose={onClose} processing={processing} label={data.files.length ? `Upload ${plural(data.files.length, 'file')}` : 'Upload'} disabled={data.files.length === 0} />
            </form>
        </Dialog>
    );
}

function ScrapeDialog({ open, onClose, folderId, here }: { open: boolean; onClose: () => void; folderId: number | null; here: string }) {
    const { data, setData, post, processing, errors, reset } = useForm({ url: '', folder_id: folderId });
    const submit = (e: FormEvent) => { e.preventDefault(); post('/studio/knowledge/scrape', { onSuccess: () => { reset(); onClose(); } }); };

    return (
        <Dialog open={open} onClose={onClose} title="Import a web page" description={`Fetched once and its text indexed into ${here}. One page only: links are not followed, and later changes to the page are not picked up.`}>
            <form onSubmit={submit}>
                <Field label="URL" error={errors.url} hint="Navigation, headers and footers are stripped; the page title becomes the document name.">
                    <input className="v-field" type="url" value={data.url} onChange={(e) => setData('url', e.target.value)} placeholder="https://northwind.example/services" autoFocus />
                </Field>
                <Footer onClose={onClose} processing={processing} label="Import" disabled={!data.url.trim()} />
            </form>
        </Dialog>
    );
}

function FolderDialog({ open, onClose, parentId, here }: { open: boolean; onClose: () => void; parentId: number | null; here: string }) {
    const { data, setData, post, processing, errors, reset } = useForm({ name: '', parent_id: parentId });
    const submit = (e: FormEvent) => { e.preventDefault(); post('/studio/knowledge/folders', { onSuccess: () => { reset(); onClose(); } }); };

    return (
        <Dialog open={open} onClose={onClose} title="New folder" description={`Inside ${here}. Folders organise things for you; the agent searches every folder.`}>
            <form onSubmit={submit}>
                <Field label="Name" error={errors.name}>
                    <input className="v-field" value={data.name} onChange={(e) => setData('name', e.target.value)} placeholder="e.g. Pricing" autoFocus />
                </Field>
                <Footer onClose={onClose} processing={processing} label="Create folder" disabled={!data.name.trim()} />
            </form>
        </Dialog>
    );
}
