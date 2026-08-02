"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { PageHeader, SectionCard, EmptyState, Spinner } from "@/components/ui";
import { Avatar } from "@/components/desk/kit";
import {
  Users,
  Ticket,
  Inbox,
  TrendingUp,
  AlertCircle,
  ArrowUpRight,
  Crown,
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

export default function TeamWorkloadPage() {
  const [data, setData] = useState<Workload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api
      .get("/api/desk/workload")
      .then((d) => {
        if (alive) setData(d as Workload);
      })
      .catch(() => {
        if (alive) setData(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const members = data?.members ?? [];
  const unassignedSum = data ? data.unassigned.tickets + data.unassigned.conversations : 0;
  // the busiest bar spans the full track; everyone else is measured against it
  const maxLoad = Math.max(1, ...members.map((m) => m.load));
  const busiestId = members.length && members[0].load > 0 ? members[0].id : null;

  return (
    <div>
      <PageHeader
        title="Team"
        description="See who is handling what, and balance the load across the team."
      />

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Spinner size={20} />
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
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </div>
      )}
    </div>
  );
}
