"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CalendarCheck, LifeBuoy, Package, PhoneCall, Plus, Target, Workflow,
} from "lucide-react";
import { api, AbilityRow } from "@/lib/api";
import { PageHeader, EmptyState, Modal, Spinner } from "@/components/ui";

type Template = {
  key: string; name: string; description: string; icon: string;
  category: string; steps: number; phrases: string[];
};

const TPL_ICON: Record<string, any> = {
  Plus, CalendarCheck, LifeBuoy, Target, Package, PhoneCall,
};

export default function WorkflowsPage() {
  const [items, setItems] = useState<AbilityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gallery, setGallery] = useState(false);
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const router = useRouter();

  useEffect(() => {
    api.get("/api/abilities").then(setItems).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, []);

  const openGallery = () => {
    setGallery(true);
    if (!templates) {
      api.get("/api/abilities/templates")
        .then((r) => setTemplates(r.templates))
        .catch((e) => setError(e.message));
    }
  };

  const create = async (key: string, name: string) => {
    setCreating(key);
    try {
      const w = await api.post("/api/abilities/from-template", { key, name });
      router.push(`/studio/workflows/${w.id}`);
    } catch (e: any) {
      setError(e.message);
      setCreating(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Workflows"
        description="Visual conversation flows. Chain Ask, Act, Speak, and Condition nodes into a workflow, then attach it to the voice agent so it follows the flow on calls."
        actions={
          <button className="btn btn-primary" onClick={openGallery}>
            <Plus size={16} /> Create workflow
          </button>
        }
      />
      {error && <div className="card mb-6 p-3 text-[13px]" style={{ borderColor: "var(--danger-border)", color: "var(--danger)" }}>{error}</div>}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-36 w-full rounded-[var(--radius-md)]" />)}</div>
      ) : items.length === 0 ? (
        <div className="card">
          <EmptyState icon={Workflow} title="No workflows yet" body="Start from a template built around what actually works on calls, or from a blank flow and wire it yourself." action={<button className="btn btn-primary" onClick={openGallery}><Plus size={16} /> Create workflow</button>} />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {items.map((w) => (
            <Link key={w.id} href={`/studio/workflows/${w.id}`} className="card card-hover flex flex-col p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)]" style={{ background: "var(--accent-subtle)", color: "var(--accent-text)" }}>
                  <Workflow size={18} strokeWidth={1.75} />
                </div>
                <span className={`badge ${w.enabled ? "badge-success" : ""}`}>{w.enabled ? "enabled" : "disabled"}</span>
              </div>
              <h3 className="text-[15px] font-semibold">{w.name}</h3>
              <p className="text-secondary mt-1 line-clamp-2 min-h-[40px] text-[13px] leading-relaxed">{w.description || "No description yet."}</p>
              <span className="badge badge-mono mt-3 w-fit">{w.nodes.length} nodes</span>
            </Link>
          ))}
        </div>
      )}

      {gallery && (
        <Modal wide title="Start a workflow" onClose={() => setGallery(false)}>
          <p className="hint mb-4">
            Templates are complete flows: they collect one thing per turn, look answers up before speaking, and always
            have a path for when the agent cannot help. Edit anything after you pick one.
          </p>
          {!templates ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-[104px] w-full rounded-[var(--radius-md)]" />)}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {templates.map((t) => {
                const Icon = TPL_ICON[t.icon] || Workflow;
                const busy = creating === t.key;
                return (
                  <button
                    key={t.key}
                    className="tpl-card"
                    onClick={() => create(t.key, t.key === "blank" ? "Untitled workflow" : t.name)}
                    disabled={!!creating}
                  >
                    <div className="flex items-start gap-3">
                      <span className="tpl-card__icon">
                        {busy ? <Spinner size={16} /> : <Icon size={17} strokeWidth={1.75} />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[14px] font-semibold">{t.name}</span>
                          <span className="badge badge-mono">{t.steps} steps</span>
                        </div>
                        <p className="tpl-card__desc">{t.description}</p>
                        {t.phrases.length > 0 && (
                          <p className="tpl-card__trigger">Starts on: “{t.phrases[0]}”</p>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
