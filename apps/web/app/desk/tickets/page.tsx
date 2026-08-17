"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { PageHeader, EmptyState, Spinner, Modal, TableSkeleton } from "@/components/ui";
import {
  Avatar,
  AssigneePicker,
  PillSelect,
  STATUS_OPTIONS,
  PRIORITY_OPTIONS,
  timeAgo,
  type Member,
} from "@/components/desk/kit";
import { toast } from "@/components/Toasts";
import {
  Plus,
  Filter,
  Search,
  Ticket,
  User,
  Phone,
  MessageSquare,
  Mail,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Clipboard,
  Pill,
  DollarSign,
  List,
  LayoutGrid,
  ArrowUpRight,
} from "lucide-react";

// ── types ──────────────────────────────────────────────────────────────────

type TicketRow = {
  id: string;
  subject: string;
  body: string;
  status: string;
  priority: string;
  type: string;
  contact_id: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  channel: string;
  assignees: Member[];
  creator: string;
  created_at: string;
  updated_at: string;
};

type ListResponse = {
  rows: TicketRow[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
  status_counts: Record<string, number>;
};

type Meta = {
  ticket_statuses: string[];
  ticket_types: string[];
  lead_sources: string[];
  contact_stages: string[];
};

type View = "list" | "board";

const PER_PAGE = 12;
const CHANNELS = ["call", "sms", "email", "form", "manual"] as const;

// ── little helpers ──────────────────────────────────────────────────────────

// a tiny glyph per ticket type, so a card or row scans quickly
function typeIcon(type: string) {
  if (type === "Appointment Update") return Calendar;
  if (type === "Billing Question") return DollarSign;
  if (type === "Medication") return Pill;
  if (type === "New Appointment") return Clipboard;
  return Ticket;
}

// the channel someone reached out on, shown next to their number or name
function channelIcon(channel: string) {
  if (channel === "sms") return MessageSquare;
  if (channel === "email") return Mail;
  return Phone;
}

// first page, a window around the current page, an ellipsis, and the last page
function pageList(current: number, pages: number): (number | "gap")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const out: (number | "gap")[] = [1];
  const window = [current - 1, current, current + 1].filter((p) => p > 1 && p < pages);
  if (window.length && (window[0] as number) > 2) out.push("gap");
  out.push(...window);
  const last = window[window.length - 1] as number | undefined;
  if (last !== undefined && last < pages - 1) out.push("gap");
  out.push(pages);
  return out;
}

function statusLabel(value: string): string {
  return STATUS_OPTIONS.find((o) => o.value === value)?.label || value;
}

// the type tag shown on rows and cards
function TypeTag({ type }: { type: string }) {
  if (!type) return null;
  const Icon = typeIcon(type);
  return (
    <span
      className="badge"
      style={{ height: 20, padding: "0 8px", fontSize: 11, textTransform: "none" }}
    >
      <Icon size={11} /> {type}
    </span>
  );
}

// ── page ────────────────────────────────────────────────────────────────────

export default function TicketsPage() {
  const router = useRouter();

  const [view, setView] = useState<View>("list");

  // list data (paginated)
  const [rows, setRows] = useState<TicketRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});

  // board data (all tickets, grouped client side)
  const [boardRows, setBoardRows] = useState<TicketRow[]>([]);

  const [loading, setLoading] = useState(true);

  const [status, setStatus] = useState(""); // "" == All
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);

  const [team, setTeam] = useState<Member[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);

  const [showCreate, setShowCreate] = useState(false);

  // drag and drop state for the board
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null);

  // pickers load once
  useEffect(() => {
    api
      .get("/api/desk/team")
      .then((t: Member[]) => setTeam(t || []))
      .catch(() => {});
    api
      .get("/api/desk/meta")
      .then((m: Meta) => setMeta(m))
      .catch(() => {});
  }, []);

  // list refetches on filter, search, page, or an explicit bump
  useEffect(() => {
    if (view !== "list") return;
    let alive = true;
    setLoading(true);
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (q.trim()) params.set("q", q.trim());
    params.set("page", String(page));
    params.set("per_page", String(PER_PAGE));
    const timer = setTimeout(() => {
      api
        .get(`/api/desk/tickets?${params.toString()}`)
        .then((data: ListResponse) => {
          if (!alive) return;
          setRows(data.rows || []);
          setTotal(data.total || 0);
          setPages(Math.max(1, data.pages || 1));
          setStatusCounts(data.status_counts || {});
        })
        .catch((e: any) => {
          if (alive) toast.error(e?.message || "We could not load your tickets just now.");
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    }, 160);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [view, status, q, page, reloadKey]);

  // board pulls every ticket (paged at 100) and groups by status client side
  useEffect(() => {
    if (view !== "board") return;
    let alive = true;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const base = new URLSearchParams();
        if (q.trim()) base.set("q", q.trim());
        base.set("per_page", "100");
        base.set("page", "1");
        const first: ListResponse = await api.get(`/api/desk/tickets?${base.toString()}`);
        let all = first.rows || [];
        const pageCount = Math.min(Math.max(1, first.pages || 1), 5); // guard: up to 500
        for (let p = 2; p <= pageCount; p++) {
          const more = new URLSearchParams(base);
          more.set("page", String(p));
          const res: ListResponse = await api.get(`/api/desk/tickets?${more.toString()}`);
          all = all.concat(res.rows || []);
        }
        if (!alive) return;
        setBoardRows(all);
        setTotal(first.total || all.length);
        setStatusCounts(first.status_counts || {});
      } catch (e: any) {
        if (alive) toast.error(e?.message || "We could not load your tickets just now.");
      } finally {
        if (alive) setLoading(false);
      }
    }, 160);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [view, q, reloadKey]);

  const pickStatus = (next: string) => {
    setStatus(next);
    setPage(1);
  };

  const goToConversation = (t: TicketRow) => {
    if (!t.contact_phone) return;
    router.push("/desk/inbox?peer=" + encodeURIComponent(t.contact_phone));
  };

  // one optimistic patch, applied across both the list and the board
  const patchTicket = async (
    id: string,
    patch: { status?: string; priority?: string; assignee_ids?: string[] },
    successMsg?: string
  ) => {
    const snapRows = rows;
    const snapBoard = boardRows;
    const snapCounts = statusCounts;
    const target = rows.find((x) => x.id === id) || boardRows.find((x) => x.id === id);

    const apply = (x: TicketRow): TicketRow => {
      const next = { ...x };
      if (patch.status !== undefined) next.status = patch.status;
      if (patch.priority !== undefined) next.priority = patch.priority;
      if (patch.assignee_ids !== undefined)
        next.assignees = team.filter((m) => patch.assignee_ids!.includes(m.id));
      return next;
    };

    setRows((list) => list.map((x) => (x.id === id ? apply(x) : x)));
    setBoardRows((list) => list.map((x) => (x.id === id ? apply(x) : x)));

    if (patch.status !== undefined && target && patch.status !== target.status) {
      const prev = target.status;
      const next = patch.status;
      setStatusCounts((c) => ({
        ...c,
        [prev]: Math.max(0, (c[prev] ?? 1) - 1),
        [next]: (c[next] ?? 0) + 1,
      }));
    }

    try {
      const updated: TicketRow = await api.patch(`/api/desk/tickets/${id}`, patch);
      setRows((list) => list.map((x) => (x.id === id ? updated : x)));
      setBoardRows((list) => list.map((x) => (x.id === id ? updated : x)));
      if (successMsg) toast.success(successMsg);
    } catch (e: any) {
      setRows(snapRows);
      setBoardRows(snapBoard);
      setStatusCounts(snapCounts);
      toast.error(e?.message || "We could not update that ticket.");
    }
  };

  const afterCreate = () => {
    setPage(1);
    setReloadKey((k) => k + 1);
  };

  const addButton = (
    <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
      <Plus size={15} /> Add ticket
    </button>
  );

  const allCount =
    Object.values(statusCounts).reduce((a, b) => a + (b || 0), 0) || total;

  const tabs = [
    { value: "", label: "All", count: allCount, color: undefined as string | undefined },
    ...STATUS_OPTIONS.map((o) => ({
      value: o.value,
      label: o.label,
      count: statusCounts[o.value] ?? 0,
      color: o.color,
    })),
  ];

  const from = total === 0 ? 0 : (page - 1) * PER_PAGE + 1;
  const to = Math.min(page * PER_PAGE, total);

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div>
      <PageHeader
        title="Tickets"
        description="Requests and follow ups, each linked to its conversation."
        actions={addButton}
      />

      {/* view toggle + search */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="seg">
          <button
            type="button"
            className={`inline-flex items-center gap-1.5 ${view === "list" ? "active" : ""}`}
            onClick={() => setView("list")}
          >
            <List size={15} /> List
          </button>
          <button
            type="button"
            className={`inline-flex items-center gap-1.5 ${view === "board" ? "active" : ""}`}
            onClick={() => setView("board")}
          >
            <LayoutGrid size={15} /> Board
          </button>
        </div>

        <div className="relative ml-auto">
          <Search
            size={15}
            className="text-tertiary"
            style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)" }}
          />
          <input
            className="input"
            style={{ paddingLeft: 34, width: 260 }}
            placeholder="Search tickets"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      {/* status filter tabs (list only — on the board the columns are the statuses) */}
      {view === "list" && (
        <div className="mb-4 flex flex-wrap items-center gap-1">
          {tabs.map((tab) => {
            const active = status === tab.value;
            return (
              <button
                key={tab.value || "all"}
                onClick={() => pickStatus(tab.value)}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors"
                style={
                  active
                    ? { background: "var(--surface-sunken)", color: "var(--text-primary)" }
                    : { color: "var(--text-secondary)" }
                }
              >
                {tab.color && (
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: tab.color }} />
                )}
                {tab.label}
                <span
                  className="text-[11px]"
                  style={{
                    fontVariantNumeric: "tabular-nums",
                    color: active ? "var(--text-secondary)" : "var(--text-tertiary)",
                  }}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── list view ─────────────────────────────────────────────────────── */}
      {view === "list" &&
        (loading && rows.length === 0 ? (
          <div className="card" aria-busy>
            <TableSkeleton rows={9} columns={[30, 20, 13, 12, 15, 12]} />
          </div>
        ) : rows.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={Ticket}
              title="No tickets"
              body="Open a ticket to track a follow up, or create one from a conversation."
              action={addButton}
            />
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Contact</th>
                    <th>Status</th>
                    <th>Priority</th>
                    <th>Assigned</th>
                    <th>Creator</th>
                    <th>Created</th>
                    <th aria-hidden />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => {
                    const CIcon = channelIcon(t.channel);
                    return (
                      <tr
                        key={t.id}
                        className="crm-row group"
                        style={{ cursor: t.contact_phone ? "pointer" : "default" }}
                        onClick={() => goToConversation(t)}
                      >
                        {/* title + type tag */}
                        <td>
                          <div className="font-medium">{t.subject}</div>
                          {t.type && <div className="mt-1"><TypeTag type={t.type} /></div>}
                        </td>

                        {/* contact */}
                        <td>
                          {t.contact_name ? (
                            <div className="flex items-center gap-2.5">
                              <Avatar name={t.contact_name} size={30} />
                              <div className="min-w-0">
                                <div className="truncate text-[13px] font-semibold">
                                  {t.contact_name}
                                </div>
                                {t.contact_phone && (
                                  <div className="mono text-tertiary flex items-center gap-1 text-[11px]">
                                    <CIcon size={11} /> {t.contact_phone}
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2.5">
                              <span
                                className="inline-flex items-center justify-center rounded-full"
                                style={{
                                  width: 30,
                                  height: 30,
                                  background: "var(--surface-sunken)",
                                  border: "1px solid var(--border)",
                                }}
                              >
                                <User size={15} className="text-tertiary" />
                              </span>
                              {t.contact_phone ? (
                                <span className="mono text-secondary text-[12px]">
                                  {t.contact_phone}
                                </span>
                              ) : (
                                <span className="text-tertiary">No contact</span>
                              )}
                            </div>
                          )}
                        </td>

                        {/* status */}
                        <td onClick={stop}>
                          <PillSelect
                            value={t.status}
                            options={STATUS_OPTIONS}
                            onChange={(v) =>
                              v !== t.status && patchTicket(t.id, { status: v }, "Status updated")
                            }
                          />
                        </td>

                        {/* priority */}
                        <td onClick={stop}>
                          <PillSelect
                            value={t.priority}
                            options={PRIORITY_OPTIONS}
                            onChange={(v) =>
                              v !== t.priority &&
                              patchTicket(t.id, { priority: v }, "Priority updated")
                            }
                            minWidth={84}
                          />
                        </td>

                        {/* assigned */}
                        <td onClick={stop}>
                          <AssigneePicker
                            value={(t.assignees || []).map((a) => a.id)}
                            members={team}
                            onChange={(ids) => patchTicket(t.id, { assignee_ids: ids })}
                          />
                        </td>

                        {/* creator */}
                        <td>
                          {t.creator ? (
                            <div className="flex items-center gap-2">
                              <Avatar name={t.creator} size={22} />
                              <span className="text-secondary text-[13px]">{t.creator}</span>
                            </div>
                          ) : (
                            <span className="text-tertiary">—</span>
                          )}
                        </td>

                        {/* created */}
                        <td>
                          <span className="text-tertiary text-[13px]">{timeAgo(t.created_at)}</span>
                        </td>

                        {/* hover: open the conversation */}
                        <td style={{ width: 34 }}>
                          {t.contact_phone && (
                            <ArrowUpRight
                              size={16}
                              className="opacity-0 transition-opacity group-hover:opacity-60"
                              style={{ color: "var(--text-secondary)" }}
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* pagination */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="text-tertiary text-[12.5px]">
                Showing {from} to {to} of {total} tickets
              </div>
              {pages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    aria-label="Previous page"
                  >
                    <ChevronLeft size={15} />
                  </button>
                  {pageList(page, pages).map((p, i) =>
                    p === "gap" ? (
                      <span key={`gap-${i}`} className="text-tertiary px-1.5 text-[13px]">
                        …
                      </span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className="btn btn-ghost btn-sm"
                        style={{
                          minWidth: 34,
                          ...(p === page
                            ? { background: "var(--surface-sunken)", color: "var(--text-primary)" }
                            : { color: "var(--text-secondary)" }),
                        }}
                      >
                        {p}
                      </button>
                    )
                  )}
                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={page >= pages}
                    onClick={() => setPage((p) => Math.min(pages, p + 1))}
                    aria-label="Next page"
                  >
                    <ChevronRight size={15} />
                  </button>
                </div>
              )}
            </div>
          </>
        ))}

      {/* ── board view ────────────────────────────────────────────────────── */}
      {view === "board" &&
        (loading && boardRows.length === 0 ? (
          <div className="flex items-center justify-center py-24">
            <Spinner size={20} />
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-2">
            {STATUS_OPTIONS.map((col) => {
              const cards = boardRows.filter((t) => t.status === col.value);
              const over = dragOverStatus === col.value;
              return (
                <section
                  key={col.value}
                  className="flex shrink-0 flex-col"
                  style={{ width: 292 }}
                >
                  {/* column header */}
                  <div className="mb-2 flex items-center gap-2 px-1">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: col.color }}
                    />
                    <span className="text-[13px] font-semibold">{col.label}</span>
                    <span
                      className="text-tertiary text-[12px]"
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {cards.length}
                    </span>
                  </div>

                  {/* drop target */}
                  <div
                    className="flex flex-1 flex-col gap-2 rounded-[12px] p-2 transition-colors"
                    style={{
                      minHeight: 140,
                      maxHeight: "calc(100vh - 340px)",
                      overflowY: "auto",
                      background: over ? "var(--accent-subtle)" : "var(--surface-sunken)",
                      boxShadow: over ? "inset 0 0 0 1px var(--border-accent)" : "none",
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      if (dragOverStatus !== col.value) setDragOverStatus(col.value);
                    }}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node))
                        setDragOverStatus((s) => (s === col.value ? null : s));
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const id = e.dataTransfer.getData("text/plain") || dragId;
                      setDragOverStatus(null);
                      setDragId(null);
                      if (!id) return;
                      const t = boardRows.find((x) => x.id === id);
                      if (t && t.status !== col.value)
                        patchTicket(id, { status: col.value }, `Moved to ${col.label}`);
                    }}
                  >
                    {cards.length === 0 ? (
                      <div
                        className="flex flex-1 items-center justify-center py-8 text-[12.5px]"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        Nothing here
                      </div>
                    ) : (
                      cards.map((t) => {
                        const CIcon = channelIcon(t.channel);
                        return (
                          <div
                            key={t.id}
                            className="card group relative"
                            style={{
                              padding: 12,
                              cursor: "pointer",
                              opacity: dragId === t.id ? 0.5 : 1,
                            }}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData("text/plain", t.id);
                              e.dataTransfer.effectAllowed = "move";
                              setDragId(t.id);
                            }}
                            onDragEnd={() => {
                              setDragId(null);
                              setDragOverStatus(null);
                            }}
                            onClick={() => goToConversation(t)}
                          >
                            {t.contact_phone && (
                              <ArrowUpRight
                                size={15}
                                className="absolute opacity-0 transition-opacity group-hover:opacity-60"
                                style={{ top: 10, right: 10, color: "var(--text-secondary)" }}
                              />
                            )}

                            <div
                              className="pr-4 text-[13px] font-medium leading-snug"
                              style={{
                                display: "-webkit-box",
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden",
                              }}
                            >
                              {t.subject}
                            </div>

                            {t.type && (
                              <div className="mt-2">
                                <TypeTag type={t.type} />
                              </div>
                            )}

                            <div className="text-tertiary mt-2 flex items-center gap-1.5 text-[12px]">
                              <CIcon size={12} />
                              <span className="truncate">
                                {t.contact_name || t.contact_phone || "No contact"}
                              </span>
                            </div>

                            <div className="mt-3 flex items-center justify-between gap-2">
                              <span onClick={stop}>
                                <PillSelect
                                  value={t.priority}
                                  options={PRIORITY_OPTIONS}
                                  onChange={(v) =>
                                    v !== t.priority &&
                                    patchTicket(t.id, { priority: v }, "Priority updated")
                                  }
                                  minWidth={78}
                                />
                              </span>
                              <span onClick={stop}>
                                <AssigneePicker
                                  value={(t.assignees || []).map((a) => a.id)}
                                  members={team}
                                  onChange={(ids) => patchTicket(t.id, { assignee_ids: ids })}
                                  align="right"
                                  size={24}
                                />
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        ))}

      {showCreate && (
        <CreateTicketModal
          team={team}
          meta={meta}
          onClose={() => setShowCreate(false)}
          onSaved={afterCreate}
        />
      )}
    </div>
  );
}

// ── create modal ────────────────────────────────────────────────────────────

function CreateTicketModal({
  team,
  meta,
  onClose,
  onSaved,
}: {
  team: Member[];
  meta: Meta | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [subject, setSubject] = useState("");
  const [type, setType] = useState("");
  const [priority, setPriority] = useState("normal");
  const [channel, setChannel] = useState("manual");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!subject.trim()) {
      toast.error("Give this ticket a subject first.");
      return;
    }
    setSaving(true);
    try {
      await api.post("/api/desk/tickets", {
        subject: subject.trim(),
        body: body.trim(),
        priority,
        type,
        channel,
        assignee_ids: assigneeIds,
      });
      onClose();
      toast.success("Ticket created");
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || "We could not create that ticket.");
      setSaving(false);
    }
  };

  return (
    <Modal title="Add ticket" onClose={onClose}>
      <div className="flex flex-col gap-3.5">
        <div>
          <label className="label">Subject</label>
          <input
            className="input"
            autoFocus
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="What is this about?"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Type</label>
            <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">No type</option>
              {(meta?.ticket_types || []).map((tt) => (
                <option key={tt} value={tt}>
                  {tt}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Priority</label>
            <select
              className="input"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            >
              {PRIORITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="label">Channel</label>
          <select
            className="input capitalize"
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
          >
            {CHANNELS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Assignees</label>
          {team.length === 0 ? (
            <p className="hint">No teammates to assign yet.</p>
          ) : (
            <div className="mt-1">
              <AssigneePicker value={assigneeIds} members={team} onChange={setAssigneeIds} />
            </div>
          )}
        </div>

        <div>
          <label className="label">Details</label>
          <textarea
            className="input"
            rows={4}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add any context that will help your team pick this up."
          />
        </div>

        <div className="mt-1 flex justify-end gap-2">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save} disabled={saving || !subject.trim()}>
            {saving ? <Spinner size={16} /> : <Plus size={16} />} Add ticket
          </button>
        </div>
      </div>
    </Modal>
  );
}
