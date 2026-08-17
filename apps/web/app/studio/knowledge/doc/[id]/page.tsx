"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ChevronRight, Home } from "lucide-react";
import { api, Doc } from "@/lib/api";
import { Spinner } from "@/components/ui";
import RichEditor, { type RichEditorHandle } from "@/components/RichEditor";

type Crumb = { id: string; name: string };

function DocEditorPage() {
  const router = useRouter();
  const routeParams = useParams();
  const search = useSearchParams();
  const id = String(routeParams.id);
  const isNew = id === "new";
  const folderParam = search.get("folder");

  const editorRef = useRef<RichEditorHandle>(null);
  const [name, setName] = useState("Untitled document");
  const [initialHTML, setInitialHTML] = useState<string | null>(isNew ? "<p></p>" : null);
  const [folderId, setFolderId] = useState<string | null>(folderParam);
  const [crumbs, setCrumbs] = useState<Crumb[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // build the folder breadcrumb from the flat folder list
  const loadCrumbs = async (fid: string | null) => {
    if (!fid) {
      setCrumbs([]);
      return;
    }
    try {
      const all: { id: string; name: string; parent_id: string | null }[] = await api.get(
        "/api/knowledge/folders"
      );
      const byId = new Map(all.map((f) => [f.id, f]));
      const trail: Crumb[] = [];
      let cur: string | null = fid;
      const seen = new Set<string>();
      while (cur && !seen.has(cur)) {
        seen.add(cur);
        const f = byId.get(cur);
        if (!f) break;
        trail.unshift({ id: f.id, name: f.name });
        cur = f.parent_id;
      }
      setCrumbs(trail);
    } catch {
      /* breadcrumb is non-critical */
    }
  };

  useEffect(() => {
    if (isNew) {
      loadCrumbs(folderParam);
      return;
    }
    api
      .get(`/api/knowledge/${id}`)
      .then((doc: Doc) => {
        setName(doc.name);
        setInitialHTML(doc.content_rich || "<p></p>");
        setFolderId(doc.folder_id ?? null);
        loadCrumbs(doc.folder_id ?? null);
      })
      .catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const save = async () => {
    const html = editorRef.current?.getHTML() ?? "";
    if (editorRef.current?.isEmpty()) {
      setError("Document is empty. Add some content before saving.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (isNew) {
        const created: Doc = await api.post("/api/knowledge", {
          name: name.trim() || "Untitled document",
          content_html: html,
          folder_id: folderId,
        });
        setDirty(false);
        router.replace(`/studio/knowledge/doc/${created.id}`);
      } else {
        await api.put(`/api/knowledge/${id}`, {
          name: name.trim() || "Untitled document",
          content_html: html,
        });
        setDirty(false);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const back = () => router.push(folderId ? `/studio/knowledge?folder=${folderId}` : "/studio/knowledge");

  return (
    <div className="mx-auto max-w-4xl">
      {/* breadcrumb + actions */}
      <div className="mb-4 flex items-center gap-3">
        <nav className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px]" aria-label="Breadcrumb">
          <button className="inline-flex items-center gap-1.5 hover:underline" onClick={back}>
            <Home size={14} strokeWidth={1.5} /> Root
          </button>
          {crumbs.map((c) => (
            <span key={c.id} className="inline-flex min-w-0 items-center gap-1.5">
              <ChevronRight size={14} strokeWidth={1.5} style={{ color: "var(--text-tertiary)" }} />
              <button
                className="text-secondary truncate hover:underline"
                onClick={() => router.push(`/studio/knowledge?folder=${c.id}`)}
              >
                {c.name}
              </button>
            </span>
          ))}
          <ChevronRight size={14} strokeWidth={1.5} style={{ color: "var(--text-tertiary)" }} />
          <span className="truncate font-medium">{name || "Untitled"}</span>
        </nav>
        <button className="btn btn-ghost btn-sm" onClick={back}>
          <ArrowLeft /> Back
        </button>
        <button className="btn btn-primary btn-sm" onClick={save} disabled={saving || (!dirty && !isNew)}>
          {saving && <Spinner size={16} />} Save
        </button>
      </div>

      {error && (
        <div
          className="card mb-4 p-3 text-[13px]"
          style={{ borderColor: "var(--danger-border)", color: "var(--danger)" }}
        >
          {error}
        </div>
      )}

      {/* title */}
      <input
        className="input mb-4"
        style={{ height: 52, fontSize: 22, fontWeight: 600, borderColor: "var(--border)" }}
        value={name}
        placeholder="Document title"
        onChange={(e) => {
          setName(e.target.value);
          setDirty(true);
        }}
      />

      {/* editor */}
      {initialHTML === null ? (
        <div className="skeleton h-[480px] w-full" />
      ) : (
        <RichEditor ref={editorRef} initialHTML={initialHTML} onDirty={() => setDirty(true)} />
      )}

      <p className="hint mt-3">
        Saved content is chunked on its headings, embedded, and made searchable to the voice agent. Use
        headings and tables to keep retrieval crisp.
      </p>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="skeleton mx-auto h-[560px] max-w-4xl" />}>
      <DocEditorPage />
    </Suspense>
  );
}
