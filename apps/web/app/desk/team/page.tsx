"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { PageHeader, SectionCard, EmptyState, Modal, Spinner, TableSkeleton } from "@/components/ui";
import { Avatar } from "@/components/desk/kit";
import { toast } from "@/components/Toasts";
import {
  Users,
  Ticket,
  Inbox,
  TrendingUp,
  AlertCircle,
  ArrowUpRight,
  Crown,
  Pencil,
  Phone,
  Plus,
  Trash2,
} from "lucide-react";

/* ── data shape ───────────────────────────────────────────────────────────── */

type WorkloadMember = {
  id: string;
  name: string;
  initials: string;
  color: string;
  role: string;
  open_tickets: number;
  total_tickets: number;
  conversations: number;
  load: number;
};

type Workload = {
  members: WorkloadMember[]; // sorted by load desc from the API
  unassigned: { tickets: number; conversations: number };
  totals: { open_tickets: number; open_conversations: number };
};

/* ── small helpers ────────────────────────────────────────────────────────── */

// How the role reads under a member's name. The AI worker gets a friendly label,
// everyone else is shown capitalized (via the .capitalize class at the call site).
function roleText(role: string): { label: string; isAi: boolean; isAdmin: boolean } {
  const r = (role || "").toLowerCase();
  if (r === "ai") return { label: "AI agent", isAi: true, isAdmin: false };
  if (!r) return { label: "Member", isAi: false, isAdmin: false };
  return { label: r, isAi: false, isAdmin: r === "admin" || r === "owner" };
}

/* ── page ─────────────────────────────────────────────────────────────────── */

type Member = {
  id: string;
  name: string;
  initials: string;
  color: string;
  role: string;
  phone?: string;
  extension?: string;
};

export default function TeamWorkloadPage() {
  const [data, setData] = useState<Workload | null>(null);
  const [roster, setRoster] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Member | "new" | null>(null);

  const load = useCallback(async () => {
    try {
      const [w, t] = await Promise.all([
        api.get("/api/desk/workload"),
        api.get("/api/desk/team"),
      ]);
      setData(w as Workload);
      setRoster(t as Member[]);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (m: Member) => {
    try {
      const r = await api.del(`/api/desk/team/${m.id}`);
      toast.success(
        `${m.name} removed`,
        r.unassigned
          ? { description: `${r.unassigned} item${r.unassigned === 1 ? "" : "s"} returned to the unassigned queue.` }
          : undefined,
      );
      load();
    } catch (e: any) {
      toast.error("Could not remove", { description: e.message });
    }
  };

  const members = data?.members ?? [];
  const detailOf = (id: string) => roster.find((r) => r.id === id);
  const unassignedSum = data ? data.unassigned.tickets + data.unassigned.conversations : 0;
  // the busiest bar spans the full track; everyone else is measured against it
  const maxLoad = Math.max(1, ...members.map((m) => m.load));
  const busiestId = members.length && members[0].load > 0 ? members[0].id : null;

  return (
    <div>
      <PageHeader
        title="Team"
        description="See who is handling what, and balance the load across the team."
        actions={
          <button className="btn btn-primary btn-sm" onClick={() => setEditing("new")}>
            <Plus /> Add member
          </button>
        }
      />

      {loading ? (
        <div className="card" aria-busy>
          <TableSkeleton rows={6} columns={[32, 20, 16, 14]} />
        </div>
      ) : !data ? (
        <div className="card">
          <EmptyState
            icon={Users}
            title="No team members yet"
            body="Team members show up here once they are added."
          />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {/* ── headline counters ───────────────────────────────────────── */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="kpi">
              <span className="kpi__label">
                <Ticket size={14} strokeWidth={1.9} />
                Open tickets
              </span>
              <div className="kpi__value">{data.totals.open_tickets.toLocaleString()}</div>
              <div className="kpi__sub">Across the team</div>
            </div>

            <div className="kpi">
              <span className="kpi__label">
                <Inbox size={14} strokeWidth={1.9} />
                Open conversations
              </span>
              <div className="kpi__value">{data.totals.open_conversations.toLocaleString()}</div>
              <div className="kpi__sub">Active across your channels</div>
            </div>

            <div className="kpi">
              <span className="kpi__label">
                <AlertCircle size={14} strokeWidth={1.9} />
                Unassigned
              </span>
              <div
                className="kpi__value"
                style={unassignedSum > 0 ? { color: "var(--warning)" } : undefined}
              >
                {unassignedSum.toLocaleString()}
              </div>
              <div className="kpi__sub">
                {data.unassigned.tickets} tickets · {data.unassigned.conversations} conversations
              </div>
            </div>
          </div>

          {/* ── unassigned callout ──────────────────────────────────────── */}
          {unassignedSum > 0 && (
            <div
              className="card flex flex-wrap items-center gap-4 p-4"
              style={{ borderColor: "var(--warning-border)" }}
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                style={{ background: "var(--warning-subtle)", color: "var(--warning)" }}
              >
                <AlertCircle size={18} strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">
                  {unassignedSum} {unassignedSum === 1 ? "item is" : "items are"} waiting to be picked up
                </div>
                <p className="text-secondary mt-0.5 text-[13px] leading-relaxed">
                  Some work is not assigned yet. Open the inbox or tickets to pick it up.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Link href="/desk/inbox" className="btn btn-secondary btn-sm">
                  <Inbox size={15} strokeWidth={1.9} /> Inbox
                  <ArrowUpRight size={14} strokeWidth={2} />
                </Link>
                <Link href="/desk/tickets" className="btn btn-secondary btn-sm">
                  <Ticket size={15} strokeWidth={1.9} /> Tickets
                  <ArrowUpRight size={14} strokeWidth={2} />
                </Link>
              </div>
            </div>
          )}

          {/* ── workload by member ──────────────────────────────────────── */}
          <SectionCard
            title="Workload by member"
            description="Open tickets and active conversations per person."
          >
            {members.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No team members yet"
                body="Team members show up here once they are added."
              />
            ) : (
              <div className="flex flex-col gap-2">
                {members.map((m) => {
                  const role = roleText(m.role);
                  const isBusiest = m.id === busiestId;
                  const fill = `${(m.load / maxLoad) * 100}%`;
                  return (
                    <div
                      key={m.id}
                      className="crm-row flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl px-3.5 py-3"
                      style={{ border: "1px solid var(--border)" }}
                    >
                      {/* identity */}
                      <div
                        className="flex min-w-0 items-center gap-3"
                        style={{ flex: "1 1 210px" }}
                      >
                        <Avatar name={m.name} color={m.color} initials={m.initials} size={38} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate font-medium">{m.name}</span>
                            {role.isAdmin && (
                              <Crown
                                size={13}
                                strokeWidth={2}
                                style={{ color: "var(--warning)", flexShrink: 0 }}
                                aria-label="Admin"
                              />
                            )}
                            {isBusiest && (
                              <span
                                className="badge badge-accent"
                                style={{ height: 20, padding: "0 8px", fontSize: 11 }}
                              >
                                <TrendingUp size={11} strokeWidth={2.2} /> Busiest
                              </span>
                            )}
                          </div>
                          <div
                            className={`text-tertiary text-[12px] ${role.isAi ? "" : "capitalize"}`}
                          >
                            {role.label}
                          </div>
                        </div>
                      </div>

                      {/* counts */}
                      <div className="flex shrink-0 items-center gap-5">
                        <div
                          className="flex items-center gap-1.5"
                          title={`${m.open_tickets} open tickets`}
                        >
                          <Ticket
                            size={15}
                            strokeWidth={1.9}
                            style={{ color: "var(--text-tertiary)" }}
                          />
                          <span className="tabular text-sm font-semibold">{m.open_tickets}</span>
                          <span className="text-tertiary hidden text-[12px] sm:inline">open</span>
                        </div>
                        <div
                          className="flex items-center gap-1.5"
                          title={`${m.conversations} active conversations`}
                        >
                          <Inbox
                            size={15}
                            strokeWidth={1.9}
                            style={{ color: "var(--text-tertiary)" }}
                          />
                          <span className="tabular text-sm font-semibold">{m.conversations}</span>
                          <span className="text-tertiary hidden text-[12px] sm:inline">chats</span>
                        </div>
                      </div>

                      {/* load bar */}
                      <div
                        className="flex items-center gap-3"
                        style={{ flex: "1 1 200px", minWidth: 150 }}
                      >
                        <div className="bar flex-1" title={`Load ${m.load}`}>
                          <span style={{ width: fill }} />
                        </div>
                        <span
                          className="mono tabular shrink-0 text-[13px] font-semibold"
                          style={{ minWidth: 28, textAlign: "right" }}
                        >
                          {m.load}
                        </span>
                      </div>

                      {/* per-member controls */}
                      <div className="flex shrink-0 items-center gap-1">
                        {detailOf(m.id)?.extension && (
                          <span
                            className="mono text-tertiary mr-1 hidden text-[11.5px] md:inline"
                            title="Internal extension — call transfers reach this"
                          >
                            x{detailOf(m.id)?.extension}
                          </span>
                        )}
                        <button
                          className="btn btn-ghost btn-icon btn-sm"
                          onClick={() => {
                            const d = detailOf(m.id);
                            if (d) setEditing(d);
                          }}
                          aria-label={`Edit ${m.name}`}
                          title="Edit member"
                        >
                          <Pencil />
                        </button>
                        <button
                          className="btn btn-danger-ghost btn-icon btn-sm"
                          onClick={() => {
                            const d = detailOf(m.id);
                            if (d) remove(d);
                          }}
                          aria-label={`Remove ${m.name}`}
                          title="Remove member"
                        >
                          <Trash2 />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </div>
      )}

      {editing && (
        <MemberEditor
          member={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

/* ── add / edit a teammate ────────────────────────────────────────────────── */

const ROLES: { value: string; label: string; hint: string }[] = [
  { value: "admin", label: "Admin", hint: "Full access, and can manage the team" },
  { value: "agent", label: "Agent", hint: "Handles conversations and tickets" },
  { value: "ai", label: "AI agent", hint: "Veyra itself — work it handles alone" },
];

function MemberEditor({
  member,
  onClose,
  onSaved,
}: {
  member: Member | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(member?.name ?? "");
  const [role, setRole] = useState(member?.role ?? "agent");
  const [phone, setPhone] = useState(member?.phone ?? "");
  const [extension, setExtension] = useState(member?.extension ?? "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const body = { name: name.trim(), role, phone: phone.trim(), extension: extension.trim() };
      if (member) {
        await api.patch(`/api/desk/team/${member.id}`, body);
        toast.success("Member updated");
      } else {
        await api.post("/api/desk/team", body);
        toast.success(`${body.name} added to the team`);
      }
      onSaved();
    } catch (e: any) {
      toast.error("Could not save", { description: e.message });
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} title={member ? "Edit team member" : "Add team member"}>
      <div className="mb-5">
        <label className="label" htmlFor="tm-name">Name</label>
        <input
          id="tm-name"
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Jordan Rivera"
          autoFocus
        />
      </div>

      <div className="mb-5">
        <label className="label">Role</label>
        <div className="flex flex-col gap-2">
          {ROLES.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setRole(r.value)}
              className="flex items-center gap-3 rounded-[var(--radius-md)] border p-3 text-left transition-colors"
              style={{
                borderColor: role === r.value ? "var(--accent)" : "var(--border)",
                background: role === r.value ? "var(--accent-subtle)" : "transparent",
              }}
            >
              <span
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border"
                style={{
                  borderColor: role === r.value ? "var(--accent)" : "var(--border-strong)",
                  background: role === r.value ? "var(--accent)" : "transparent",
                }}
              >
                {role === r.value && <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#fff" }} />}
              </span>
              <span className="min-w-0">
                <span className="block text-[13.5px] font-medium">{r.label}</span>
                <span className="text-tertiary block text-[12px]">{r.hint}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="tm-phone">
            <span className="inline-flex items-center gap-1.5"><Phone size={13} /> Direct line</span>
          </label>
          <input
            id="tm-phone"
            className="input mono"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+1 415 555 0142"
          />
          <p className="hint mt-1.5">Warm transfers ring this number.</p>
        </div>
        <div>
          <label className="label" htmlFor="tm-ext">Extension</label>
          <input
            id="tm-ext"
            className="input mono"
            value={extension}
            onChange={(e) => setExtension(e.target.value)}
            placeholder="101"
          />
          <p className="hint mt-1.5">Reachable from the IVR menu.</p>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={busy || !name.trim()}>
          {busy ? <Spinner size={15} /> : null} {member ? "Save changes" : "Add member"}
        </button>
      </div>
    </Modal>
  );
}
