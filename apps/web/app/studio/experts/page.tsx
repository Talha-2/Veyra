"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Calendar, MessageSquare, Plus, Sparkles, Webhook } from "lucide-react";
import { api, ExpertRow } from "@/lib/api";
import { PageHeader, EmptyState, Spinner } from "@/components/ui";

const TRIGGER_ICON: Record<string, any> = { chat: MessageSquare, schedule: Calendar, external: Webhook };

export default function ExpertsPage() {
  const [experts, setExperts] = useState<ExpertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    api.get("/api/experts").then(setExperts).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, []);

  const create = async () => {
    setCreating(true);
    setError(null);
    try {
      const e = await api.post("/api/experts", { name: "Untitled expert", triggers: ["chat"] });
      router.push(`/studio/experts/${e.id}`);
    } catch (e: any) {
      setError(e.message);
      setCreating(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Experts"
        description="Autonomous agents that run on chat, a schedule, or an external trigger, using your connected tools to do real work."
        actions={
          <button className="btn btn-primary" onClick={create} disabled={creating}>
            {creating ? <Spinner size={16} /> : <Plus size={16} />} Add expert
          </button>
        }
      />

      {error && (
        <div className="card mb-6 p-3 text-[13px]" style={{ borderColor: "var(--danger-border)", color: "var(--danger)" }}>
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => <div key={i} className="skeleton h-40 w-full rounded-[var(--radius-md)]" />)}
        </div>
      ) : experts.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Sparkles}
            title="No experts yet"
            body="Create an expert to automate a recurring task such as a morning digest, a lead qualifier, or a report generator, powered by your integrations."
            action={<button className="btn btn-primary" onClick={create}><Plus size={16} /> Add expert</button>}
          />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {experts.map((e) => (
            <Link key={e.id} href={`/studio/experts/${e.id}`} className="card card-hover flex flex-col p-5">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)]" style={{ background: "var(--accent-subtle)", color: "var(--accent-text)" }}>
                  <Sparkles size={18} strokeWidth={1.75} />
                </div>
                <span className={`badge ${e.status === "active" ? "badge-success" : ""}`}>
                  {e.status === "active" && <span className="dot dot-pulse" />}
                  {e.status}
                </span>
              </div>
              <h3 className="text-[15px] font-semibold">{e.name}</h3>
              <p className="text-secondary mt-1 line-clamp-2 min-h-[40px] text-[13px] leading-relaxed">
                {e.description || "No description yet."}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {e.triggers.map((t) => {
                  const Icon = TRIGGER_ICON[t] || MessageSquare;
                  return (
                    <span key={t} className="badge badge-mono">
                      <Icon size={11} /> {t}
                    </span>
                  );
                })}
                {e.triggers.includes("schedule") && e.status === "active" && (
                  <span className="badge badge-accent">{e.schedule_label}</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
