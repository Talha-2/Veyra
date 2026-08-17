"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Bot,
  CheckSquare,
  ChevronRight,
  FilePlus2,
  FileText,
  FolderPlus,
  Globe,
  FolderInput,
  Home,
  Pencil,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  Check,
  FolderClosed,
  FileType,
} from "lucide-react";
import { api, BrowseResponse, Doc, KbFolder } from "@/lib/api";
import { EmptyState, Modal, PageHeader, Spinner, StatusBadge } from "@/components/ui";
import CardMenu from "@/components/CardMenu";

function fmtSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
function fmtWhen(iso: string) {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString();
}

type Modal =
  | { kind: "upload" }
  | { kind: "scrape" }
  | { kind: "newFolder" }
  | { kind: "renameFolder"; folder: KbFolder }
  | { kind: "renameDoc"; doc: Doc }
  | { kind: "move"; docIds: string[]; folderIds: string[] }
  | { kind: "retrieval" }
  | null;

function KnowledgePage() {
  const router = useRouter();
  const params = useSearchParams();
  const folderId = params.get("folder");

  const [data, setData] = useState<BrowseResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [bulk, setBulk] = useState(false);
  const [selDocs, setSelDocs] = useState<Set<string>>(new Set());
  const [selFolders, setSelFolders] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<Modal>(null);
  const [syncing, setSyncing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const q = folderId ? `?folder_id=${encodeURIComponent(folderId)}` : "";
      setData(await api.get(`/api/knowledge/browse${q}`));
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  }, [folderId]);

  useEffect(() => {
    setSelDocs(new Set());
    setSelFolders(new Set());
    refresh();
    const t = setInterval(refresh, 4000); // pick up async ingestion status
    return () => clearInterval(t);
  }, [refresh]);

  const go = (id: string | null) =>
    router.push(id ? `/studio/knowledge?folder=${id}` : "/studio/knowledge");

  const toggleDoc = (id: string) =>
    setSelDocs((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const toggleFolder = (id: string) =>
    setSelFolders((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const selectionCount = selDocs.size + selFolders.size;

  const syncAll = async () => {
    setSyncing(true);
    try {
      await api.post("/api/knowledge/reindex");
      refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSyncing(false);
    }
  };

  const bulkDelete = async () => {
    if (!confirm(`Delete ${selectionCount} item(s)? Folders delete everything inside them.`)) return;
    await api.post("/api/knowledge/bulk/delete", {
      doc_ids: [...selDocs],
      folder_ids: [...selFolders],
    });
    setSelDocs(new Set());
    setSelFolders(new Set());
    setBulk(false);
    refresh();
  };

  const folders = (data?.folders ?? []).filter((f) =>
    f.name.toLowerCase().includes(filter.toLowerCase())
  );
  const files = (data?.files ?? []).filter((f) =>
    f.name.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Knowledge Base"
        description="Organize sources into folders. Everything is chunked, embedded, and searchable by the voice agent regardless of where it lives."
        actions={
          <>
            <button className="btn btn-ghost" onClick={() => setModal({ kind: "retrieval" })}>
              <Search /> Test retrieval
            </button>
            <button className="btn btn-secondary" onClick={() => setModal({ kind: "scrape" })}>
              <Globe /> Scrape Website
            </button>
            <button className="btn btn-primary" onClick={syncAll} disabled={syncing}>
              {syncing ? <Spinner size={16} /> : <RefreshCw />} Sync All
            </button>
          </>
        }
      />

      {error && (
        <div
          className="card mb-4 p-3 text-[13px]"
          style={{ borderColor: "var(--danger-border)", color: "var(--danger)" }}
        >
          {error}
        </div>
      )}

      {/* toolbar: bulk toggle + breadcrumb + search */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <button
          className={`btn btn-sm ${bulk ? "btn-primary" : "btn-secondary"}`}
          onClick={() => {
            setBulk((b) => !b);
            setSelDocs(new Set());
            setSelFolders(new Set());
          }}
        >
          <CheckSquare /> {bulk ? "Done" : "Bulk Select"}
        </button>

        <nav className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px]" aria-label="Breadcrumb">
          <button className="inline-flex items-center gap-1.5 hover:underline" onClick={() => go(null)}>
            <Home size={14} strokeWidth={1.5} /> Root
          </button>
          {(data?.breadcrumb ?? []).map((b, i, arr) => (
            <span key={b.id} className="inline-flex min-w-0 items-center gap-1.5">
              <ChevronRight size={14} strokeWidth={1.5} style={{ color: "var(--text-tertiary)" }} />
              {i === arr.length - 1 ? (
                <span className="truncate font-medium">{b.name}</span>
              ) : (
                <button className="truncate hover:underline text-secondary" onClick={() => go(b.id)}>
                  {b.name}
                </button>
              )}
            </span>
          ))}
        </nav>

        <div className="relative w-full max-w-xs">
          <Search
            size={15}
            strokeWidth={1.5}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: "var(--text-tertiary)" }}
          />
          <input
            className="input"
            style={{ paddingLeft: 34 }}
            placeholder="Search this folder…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      </div>

      {/* bulk action bar */}
      {bulk && selectionCount > 0 && (
        <div className="card mb-5 flex items-center gap-3 p-3">
          <span className="text-[13px] font-medium">{selectionCount} selected</span>
          <div className="ml-auto flex gap-2">
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setModal({ kind: "move", docIds: [...selDocs], folderIds: [...selFolders] })}
            >
              <FolderInput /> Move
            </button>
            <button className="btn btn-danger btn-sm" onClick={bulkDelete}>
              <Trash2 /> Delete
            </button>
          </div>
        </div>
      )}

      {!data ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-[72px]" />
          ))}
        </div>
      ) : folders.length === 0 && files.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={FolderClosed}
            title={filter ? "Nothing matches" : "This folder is empty"}
            body={
              filter
                ? "Try a different search term."
                : "Add a document, upload files, scrape a website, or create a subfolder to get started."
            }
            action={
              !filter ? (
                <>
                  <button className="btn btn-primary" onClick={() => setModal({ kind: "upload" })}>
                    <Upload /> Upload files
                  </button>
                  <button className="btn btn-secondary" onClick={() => setModal({ kind: "newFolder" })}>
                    <FolderPlus /> New folder
                  </button>
                </>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="space-y-8">
          {/* Files */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <span className="eyebrow">Files</span>
              <div className="relative">
                <button className="btn btn-secondary btn-sm" onClick={() => setAddOpen((o) => !o)}>
                  <FilePlus2 /> Add File
                </button>
                {addOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setAddOpen(false)} />
                    <div className="menu" style={{ right: 0, marginTop: 4 }} role="menu">
                      <button
                        className="menu-item"
                        onClick={() => {
                          setAddOpen(false);
                          router.push(`/studio/knowledge/doc/new${folderId ? `?folder=${folderId}` : ""}`);
                        }}
                      >
                        <FilePlus2 /> New document
                      </button>
                      <button
                        className="menu-item"
                        onClick={() => {
                          setAddOpen(false);
                          setModal({ kind: "upload" });
                        }}
                      >
                        <Upload /> Upload file
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
            {files.length === 0 ? (
              <p className="hint">No files here yet.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {files.map((d) => (
                  <FileCard
                    key={d.id}
                    doc={d}
                    bulk={bulk}
                    selected={selDocs.has(d.id)}
                    onToggle={() => toggleDoc(d.id)}
                    onOpen={() => router.push(`/studio/knowledge/doc/${d.id}`)}
                    onRename={() => setModal({ kind: "renameDoc", doc: d })}
                    onMove={() => setModal({ kind: "move", docIds: [d.id], folderIds: [] })}
                    onDelete={async () => {
                      if (!confirm(`Delete "${d.name}"? The agent loses this knowledge.`)) return;
                      await api.del(`/api/knowledge/${d.id}`);
                      refresh();
                    }}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Folders */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <span className="eyebrow">Folders</span>
              <button className="btn btn-secondary btn-sm" onClick={() => setModal({ kind: "newFolder" })}>
                <FolderPlus /> Add Folder
              </button>
            </div>
            {folders.length === 0 ? (
              <p className="hint">No subfolders here.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {folders.map((f) => (
                  <FolderCard
                    key={f.id}
                    folder={f}
                    bulk={bulk}
                    selected={selFolders.has(f.id)}
                    onToggle={() => toggleFolder(f.id)}
                    onOpen={() => go(f.id)}
                    onRename={() => setModal({ kind: "renameFolder", folder: f })}
                    onMove={() => setModal({ kind: "move", docIds: [], folderIds: [f.id] })}
                    onDelete={async () => {
                      if (!confirm(`Delete folder "${f.name}" and everything inside it?`)) return;
                      await api.del(`/api/knowledge/folders/${f.id}`);
                      refresh();
                    }}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {modal?.kind === "upload" && (
        <UploadModal folderId={folderId} onClose={() => setModal(null)} onDone={refresh} />
      )}
      {modal?.kind === "scrape" && (
        <ScrapeModal folderId={folderId} onClose={() => setModal(null)} onDone={refresh} />
      )}
      {modal?.kind === "newFolder" && (
        <FolderModal
          title="New folder"
          onClose={() => setModal(null)}
          onSubmit={async (name) => {
            await api.post("/api/knowledge/folders", { name, parent_id: folderId });
            refresh();
          }}
        />
      )}
      {modal?.kind === "renameFolder" && (
        <FolderModal
          title="Rename folder"
          initial={modal.folder.name}
          onClose={() => setModal(null)}
          onSubmit={async (name) => {
            await api.put(`/api/knowledge/folders/${modal.folder.id}`, { name });
            refresh();
          }}
        />
      )}
      {modal?.kind === "renameDoc" && (
        <FolderModal
          title="Rename document"
          initial={modal.doc.name}
          onClose={() => setModal(null)}
          onSubmit={async (name) => {
            await api.post(`/api/knowledge/${modal.doc.id}/rename`, { name });
            refresh();
          }}
        />
      )}
      {modal?.kind === "move" && (
        <MoveModal
          docIds={modal.docIds}
          folderIds={modal.folderIds}
          onClose={() => setModal(null)}
          onDone={() => {
            setSelDocs(new Set());
            setSelFolders(new Set());
            setBulk(false);
            refresh();
          }}
        />
      )}
      {modal?.kind === "retrieval" && <RetrievalModal onClose={() => setModal(null)} />}
    </div>
  );
}

function FileCard({
  doc,
  bulk,
  selected,
  onToggle,
  onOpen,
  onRename,
  onMove,
  onDelete,
}: {
  doc: Doc;
  bulk: boolean;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onRename: () => void;
  onMove: () => void;
  onDelete: () => void;
}) {
  const Icon = doc.mime.includes("pdf") ? FileType : doc.source_type === "agent" ? Bot : FileText;
  return (
    <div
      className={`kb-card ${selected ? "selected" : ""}`}
      onClick={() => (bulk ? onToggle() : onOpen())}
      role="button"
      tabIndex={0}
    >
      {bulk ? (
        <span className={`checkbox ${selected ? "checked" : ""}`}>{selected && <Check />}</span>
      ) : (
        <span className="kb-icon file">
          <Icon size={20} strokeWidth={1.5} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-medium">{doc.name}</div>
        <div className="mt-1 flex items-center gap-2 text-[12px]" style={{ color: "var(--text-tertiary)" }}>
          <StatusBadgeMini status={doc.status} error={doc.error} />
          <span>·</span>
          <span>{doc.n_chunks} chunks</span>
          <span>·</span>
          <span>{fmtWhen(doc.updated_at)}</span>
        </div>
      </div>
      {!bulk && (
        <div onClick={(e) => e.stopPropagation()}>
          <CardMenu
            items={[
              { label: "Open", icon: Pencil, onClick: onOpen },
              { label: "Rename", icon: Pencil, onClick: onRename },
              { label: "Move to…", icon: FolderInput, onClick: onMove },
              { label: "Delete", icon: Trash2, onClick: onDelete, danger: true, separatorBefore: true },
            ]}
          />
        </div>
      )}
    </div>
  );
}

function StatusBadgeMini({ status, error }: { status: string; error?: string | null }) {
  const label = status === "ready" ? "Synced" : status === "processing" ? "Syncing" : "Error";
  return (
    <span title={error ?? ""}>
      <StatusBadge status={status === "ready" ? "done" : status} />
      <span className="sr-only">{label}</span>
    </span>
  );
}

function FolderCard({
  folder,
  bulk,
  selected,
  onToggle,
  onOpen,
  onRename,
  onMove,
  onDelete,
}: {
  folder: KbFolder;
  bulk: boolean;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onRename: () => void;
  onMove: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`kb-card ${selected ? "selected" : ""}`}
      onClick={() => (bulk ? onToggle() : onOpen())}
      role="button"
      tabIndex={0}
    >
      {bulk ? (
        <span className={`checkbox ${selected ? "checked" : ""}`}>{selected && <Check />}</span>
      ) : (
        <span className="kb-icon folder">
          <FolderClosed size={20} strokeWidth={1.5} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-medium">{folder.name}</div>
        <div className="mt-1 text-[12px]" style={{ color: "var(--text-tertiary)" }}>
          {folder.n_folders} folders, {folder.n_files} files
        </div>
      </div>
      {!bulk && (
        <div onClick={(e) => e.stopPropagation()}>
          <CardMenu
            items={[
              { label: "Open", icon: FolderClosed, onClick: onOpen },
              { label: "Rename", icon: Pencil, onClick: onRename },
              { label: "Move to…", icon: FolderInput, onClick: onMove },
              { label: "Delete", icon: Trash2, onClick: onDelete, danger: true, separatorBefore: true },
            ]}
          />
        </div>
      )}
    </div>
  );
}

/* ── modals ──────────────────────────────────────────────────────────── */

function UploadModal({
  folderId,
  onClose,
  onDone,
}: {
  folderId: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!file) return;
    setBusy(true);
    setErr(null);
    try {
      await api.upload("/api/knowledge/upload", file, folderId ? { folder_id: folderId } : {});
      onDone();
      onClose();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Upload file" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="label">Select file</label>
          <input
            type="file"
            className="input"
            style={{ height: "auto", padding: 8 }}
            accept=".txt,.md,.pdf,.doc,.docx"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <p className="hint mt-1.5">Supported: TXT, MD, PDF, DOC, DOCX (max 25 MB). Converted to text and indexed.</p>
        </div>
        {err && <p className="text-[13px]" style={{ color: "var(--danger)" }}>{err}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={!file || busy}>
            {busy && <Spinner size={16} />} Upload &amp; Convert
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ScrapeModal({
  folderId,
  onClose,
  onDone,
}: {
  folderId: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!url.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await api.post("/api/knowledge/scrape", { url: url.trim(), folder_id: folderId });
      onDone();
      onClose();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Scrape a website" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="label">Page URL</label>
          <input
            className="input"
            placeholder="https://example.com/pricing"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
          <p className="hint mt-1.5">
            The page is fetched, stripped to its main text, converted to markdown, and indexed as a document.
          </p>
        </div>
        {err && <p className="text-[13px]" style={{ color: "var(--danger)" }}>{err}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={!url.trim() || busy}>
            {busy && <Spinner size={16} />} Scrape &amp; Convert
          </button>
        </div>
      </div>
    </Modal>
  );
}

function FolderModal({
  title,
  initial = "",
  onClose,
  onSubmit,
}: {
  title: string;
  initial?: string;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await onSubmit(name.trim());
      onClose();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="label">Name</label>
          <input
            className="input"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </div>
        {err && <p className="text-[13px]" style={{ color: "var(--danger)" }}>{err}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={!name.trim() || busy}>
            {busy && <Spinner size={16} />} Save
          </button>
        </div>
      </div>
    </Modal>
  );
}

function MoveModal({
  docIds,
  folderIds,
  onClose,
  onDone,
}: {
  docIds: string[];
  folderIds: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [all, setAll] = useState<{ id: string; name: string; parent_id: string | null }[] | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.get("/api/knowledge/folders").then(setAll).catch((e) => setErr(e.message));
  }, []);

  // indent by depth for a tree-ish picker
  const depth = (id: string | null): number => {
    let d = 0;
    let cur = id;
    const byId = new Map((all ?? []).map((f) => [f.id, f]));
    while (cur) {
      const f = byId.get(cur);
      if (!f) break;
      cur = f.parent_id;
      d++;
    }
    return d;
  };
  const moving = new Set(folderIds);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api.post("/api/knowledge/bulk/move", {
        doc_ids: docIds,
        folder_ids: folderIds,
        target_folder_id: target,
      });
      onDone();
      onClose();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Move ${docIds.length + folderIds.length} item(s)`} onClose={onClose}>
      <div className="space-y-3">
        <label className="label">Destination</label>
        <div className="card max-h-72 overflow-y-auto p-1.5">
          <button
            className={`menu-item ${target === null ? "active" : ""}`}
            style={target === null ? { background: "var(--accent-subtle)", color: "var(--accent-text)" } : undefined}
            onClick={() => setTarget(null)}
          >
            <Home /> Root
          </button>
          {!all ? (
            <div className="p-3">
              <Spinner />
            </div>
          ) : (
            all
              .filter((f) => !moving.has(f.id)) // can't move a folder into itself
              .map((f) => (
                <button
                  key={f.id}
                  className="menu-item"
                  style={{
                    paddingLeft: 10 + depth(f.parent_id) * 16,
                    ...(target === f.id
                      ? { background: "var(--accent-subtle)", color: "var(--accent-text)" }
                      : {}),
                  }}
                  onClick={() => setTarget(f.id)}
                >
                  <FolderClosed /> {f.name}
                </button>
              ))
          )}
        </div>
        {err && <p className="text-[13px]" style={{ color: "var(--danger)" }}>{err}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>
            {busy && <Spinner size={16} />} Move here
          </button>
        </div>
      </div>
    </Modal>
  );
}

function RetrievalModal({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    if (!q.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api.post("/api/knowledge/search", { query: q, top_k: 5 });
      setResults(r.results);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal wide title="Test retrieval" onClose={onClose}>
      <p className="hint mb-3">See exactly what the voice agent would retrieve for a caller's question.</p>
      <div className="flex gap-2">
        <input
          className="input"
          autoFocus
          placeholder='e.g. "how much does the premium plan cost"'
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
        />
        <button className="btn btn-primary" onClick={run} disabled={busy}>
          {busy ? <Spinner size={16} /> : <Search />} Search
        </button>
      </div>
      {err && <p className="mt-3 text-[13px]" style={{ color: "var(--danger)" }}>{err}</p>}
      {results && (
        <div className="mt-4 space-y-2">
          {results.length === 0 && (
            <p className="hint" style={{ color: "var(--warning)" }}>
              No hits. The agent would say it doesn&apos;t have that information and offer a transfer.
            </p>
          )}
          {results.map((r) => (
            <div key={r.chunk_id} className="rounded-[var(--radius-sm)] p-3" style={{ background: "var(--surface-sunken)" }}>
              <div className="mb-1 flex justify-between text-[12px]" style={{ color: "var(--text-tertiary)" }}>
                <span className="truncate">
                  {r.doc_name}
                  {r.heading ? ` › ${r.heading}` : ""}
                </span>
                <span className="mono">score {r.score}</span>
              </div>
              <p className="line-clamp-3 whitespace-pre-wrap text-[13px]">{r.text}</p>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="skeleton mx-auto h-64 max-w-6xl" />}>
      <KnowledgePage />
    </Suspense>
  );
}
