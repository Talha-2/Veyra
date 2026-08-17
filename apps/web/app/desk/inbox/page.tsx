"use client";

/* Veyra Desk — the omnichannel inbox.

   Four resizable panes: the view rail (built-in views, channels, saved
   filters), the conversation list, the thread, and the context rail. Threads
   key on the peer — a phone number or an email address — and the server
   aggregates real telephony and mailbox activity beneath it.

   The whole conversation list is fetched once and filtered in the browser, so
   switching views is instant and every view in the rail can carry a live
   count. Search and filters compose: the rail sets the base filter, the filter
   builder layers on top, and the chip strip shows exactly what is active.

   Pane widths, which panes are collapsed, and the context rail's tab all
   persist per browser — the inbox is a workbench, and its layout is the
   operator's, not ours. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, Archive, Filter as FilterIcon, Inbox as InboxIcon, Mail, MailOpen,
  MessageSquare, Moon, PanelLeft, Phone, Plus, Printer, RefreshCw, Search, Send,
  Star, UserRound, X,
} from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "@/components/Toasts";
import { Modal, Spinner } from "@/components/ui";
import { Avatar, type Member, timeAgo } from "@/components/desk/kit";
import { UnreadDot, StatusDot, OwnerChip } from "@/components/desk/notifications";
import { Popover, useAnchor } from "@/components/desk/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PaneGroup, usePaneGroup, type PaneSpec } from "@/components/desk/panels";
import { ThreadPane } from "@/components/desk/inbox/thread";
import { DetailsRail, DialpadRail } from "@/components/desk/inbox/rail";

import {
  BulkBar, BulkCheckbox, DEFAULT_SORT, SortPopover, sortRows, type SortBy, type SortDir,
} from "@/components/desk/inbox/controls";

import {
  EMPTY_FILTERS, FilterChips, FilterPanel, countFilters, loadViews, matchesFilters,
  matchesQuery, sameFilters, saveViews, type Filters, type SavedView,
} from "@/components/desk/inbox/filters";
import {
  isEmailPeer, prettyPhone, type EmailAccount, type PhoneNum, type Row, type Thread,
} from "@/components/desk/inbox/types";

// ── the view rail ────────────────────────────────────────────────────────────
type NavItem = { key: string; label: string; icon: any; filters: Filters };

const f = (patch: Partial<Filters>): Filters => ({ ...EMPTY_FILTERS, ...patch });

function buildNav(mineId: string): { title: string; items: NavItem[] }[] {
  return [
    {
      title: "Inbox",
      items: [
        ...(mineId ? [{ key: "mine", label: "Your inbox", icon: InboxIcon, filters: f({ assignees: [mineId] }) }] : []),
        { key: "all", label: "All conversations", icon: MessageSquare, filters: EMPTY_FILTERS },
        { key: "unread", label: "Unread", icon: MailOpen, filters: f({ read: "unread" }) },
        { key: "unassigned", label: "Unassigned", icon: UserRound, filters: f({ assignees: ["unassigned"] }) },
        { key: "starred", label: "Starred", icon: Star, filters: f({ favorite: "favorites" }) },
        { key: "snoozed", label: "Snoozed", icon: Moon, filters: f({ statuses: ["snoozed"] }) },
        { key: "archived", label: "Archived", icon: Archive, filters: f({ statuses: ["closed"] }) },
      ],
    },
    {
      title: "Channels",
      items: [
        { key: "email", label: "Emails", icon: Mail, filters: f({ channels: ["email"] }) },
        { key: "phone", label: "Phone & SMS", icon: Phone, filters: f({ channels: ["call", "sms"] }) },
        { key: "fax", label: "Fax", icon: Printer, filters: f({ channels: ["fax"] }) },
      ],
    },
  ];
}

/* Closed conversations stay out of every view unless a status filter asks for
   them — that is what makes "Archived" a destination rather than noise. */
const visible = (r: Row, filters: Filters) =>
  (filters.statuses.length > 0 || r.status !== "closed") && matchesFilters(r, filters);

// ── pane layout ──────────────────────────────────────────────────────────────
const PANES: PaneSpec[] = [
  { id: "views", initial: 0.15, min: 168, max: 280, collapsible: true },
  { id: "list", initial: 0.24, min: 268, max: 460 },
  { id: "thread", initial: 0.38, min: 380 },
  { id: "rail", initial: 0.23, min: 280, max: 440, collapsible: true },
];

type RailTab = "details" | "dialpad";
type RailConfig = { open: boolean; tab: RailTab };
const RAIL_KEY = "vera.desk.inbox.rail";
const VIEWS_OPEN_KEY = "vera.desk.inbox.viewsOpen";

// ─────────────────────────────────────────────────────────────────────────────
export default function InboxPage() {
  const [team, setTeam] = useState<Member[]>([]);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [openPeer, setOpenPeer] = useState<string | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);

  const [viewKey, setViewKey] = useState("all");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [views, setViews] = useState<SavedView[]>([]);
  const [q, setQ] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>(DEFAULT_SORT.by);
  const [sortDir, setSortDir] = useState<SortDir>(DEFAULT_SORT.dir);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [viewsOpen, setViewsOpen] = useState(true);
  const [railCfg, setRailCfg] = useState<RailConfig>({ open: true, tab: "details" });
  const [navSheet, setNavSheet] = useState(false);
  const [railSheet, setRailSheet] = useState(false);
  const [dialTo, setDialTo] = useState("");

  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [numbers, setNumbers] = useState<PhoneNum[]>([]);
  const [composeOpen, setComposeOpen] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const filterBtn = useAnchor<HTMLButtonElement>();

  // ── persisted chrome ───────────────────────────────────────────────────────
  useEffect(() => {
    setViews(loadViews());
    try {
      const r = localStorage.getItem(RAIL_KEY);
      if (r) setRailCfg({ open: true, tab: "details", ...JSON.parse(r) });
      const v = localStorage.getItem(VIEWS_OPEN_KEY);
      if (v !== null) setViewsOpen(v === "1");
    } catch {
      /* private mode — chrome state just won't persist */
    }
  }, []);

  const putRail = useCallback((next: RailConfig) => {
    setRailCfg(next);
    try { localStorage.setItem(RAIL_KEY, JSON.stringify(next)); } catch {}
  }, []);
  const putViewsOpen = useCallback((next: boolean) => {
    setViewsOpen(next);
    try { localStorage.setItem(VIEWS_OPEN_KEY, next ? "1" : "0"); } catch {}
  }, []);

  const collapsedPanes = useMemo(
    () => [...(viewsOpen ? [] : ["views"]), ...(railCfg.open ? [] : ["rail"])],
    [viewsOpen, railCfg.open],
  );
  const layout = usePaneGroup("vera.desk.inbox.panes", PANES, collapsedPanes);

  const mineId = useMemo(
    () => team.find((m) => m.role === "admin")?.id || team[0]?.id || "",
    [team],
  );
  const nav = useMemo(() => buildNav(mineId), [mineId]);

  // ── data ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    api.get("/api/desk/team").then(setTeam).catch(() => {});
    api.get("/api/desk/email/accounts").then((d) => setAccounts(d.accounts || [])).catch(() => {});
    api.get("/api/telephony/numbers").then(setNumbers).catch(() => {});
  }, []);

  const loadList = useCallback(async () => {
    try {
      setRows(await api.get("/api/desk/inbox"));
    } catch {
      setRows((r) => r ?? []);
    }
  }, []);

  useEffect(() => {
    loadList();
    const t = setInterval(loadList, 8000);
    return () => clearInterval(t);
  }, [loadList]);

  const loadThread = useCallback(async (peer: string, markRead = false) => {
    try {
      const d: Thread = await api.get(`/api/desk/inbox/${encodeURIComponent(peer)}`);
      setThread(d);
      if (markRead && d.timeline.some((t) => t.kind === "email" && t.unread)) {
        api.post(`/api/desk/inbox/${encodeURIComponent(peer)}/read`, {}).then(loadList).catch(() => {});
      }
    } catch {
      /* keep the last good render */
    }
  }, [loadList]);

  useEffect(() => {
    if (!openPeer) return;
    loadThread(openPeer, true);
    const t = setInterval(() => loadThread(openPeer), 8000);
    return () => clearInterval(t);
  }, [openPeer, loadThread]);

  const open = useCallback((peer: string) => {
    setOpenPeer(peer);
    setThread(null);
    setNavSheet(false);
  }, []);

  // ── filtering, sorting ─────────────────────────────────────────────────────
  const all = rows || [];
  const list = useMemo(
    () => sortRows(all.filter((r) => visible(r, filters) && matchesQuery(r, q)), sortBy, sortDir),
    [all, filters, q, sortBy, sortDir],
  );

  const countOf = useCallback((fl: Filters) => all.filter((r) => visible(r, fl)).length, [all]);
  const unreadOf = useCallback(
    (fl: Filters) => all.reduce((n, r) => n + (visible(r, fl) ? r.unread : 0), 0),
    [all],
  );

  const selectView = (key: string, next: Filters) => {
    setViewKey(key);
    setFilters(next);
    setSelected(new Set());
    setNavSheet(false);
  };

  const changeFilters = (next: Filters) => {
    setFilters(next);
    setSelected(new Set());
    const match = [
      ...nav.flatMap((g) => g.items),
      ...views.map((v) => ({ key: `view:${v.id}`, filters: v.filters })),
    ].find((i) => sameFilters(i.filters, next));
    setViewKey(match ? match.key : countFilters(next) === 0 ? "all" : "custom");
  };

  const addView = (name: string, color: string, fl: Filters) => {
    const v: SavedView = { id: `v${Date.now().toString(36)}`, name, color, filters: fl };
    const next = [...views, v];
    setViews(next);
    saveViews(next);
    setViewKey(`view:${v.id}`);
    toast.success("View saved", { description: `“${name}” is in your rail.` });
  };

  const removeView = (id: string) => {
    const next = views.filter((v) => v.id !== id);
    setViews(next);
    saveViews(next);
    if (viewKey === `view:${id}`) selectView("all", EMPTY_FILTERS);
  };

  const activeView = views.find((v) => `view:${v.id}` === viewKey);
  const activeLabel =
    activeView?.name ||
    nav.flatMap((g) => g.items).find((i) => i.key === viewKey)?.label ||
    "Filtered";

  const threadPeers = useMemo(() => {
    if (!thread?.contact?.id || !rows) return [];
    return rows.filter((r) => r.contact.id === thread.contact.id && r.peer !== thread.peer);
  }, [rows, thread]);

  const callPeer = (n: string) => {
    setDialTo(n);
    putRail({ open: true, tab: "dialpad" });
    setRailSheet(true);
  };

  const toggleSelect = (peer: string) =>
    setSelected((cur) => {
      const next = new Set(cur);
      next.has(peer) ? next.delete(peer) : next.add(peer);
      return next;
    });

  // ── keyboard: / focuses search, ↑↓ walks the list ──────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
      if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      if (list.length === 0) return;
      e.preventDefault();
      const i = list.findIndex((r) => r.peer === openPeer);
      const next = e.key === "ArrowDown"
        ? Math.min(list.length - 1, i < 0 ? 0 : i + 1)
        : Math.max(0, i < 0 ? 0 : i - 1);
      open(list[next].peer);
      listRef.current?.querySelectorAll<HTMLElement>(".ibx-row")[next]?.scrollIntoView({ block: "nearest" });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [list, openPeer, open]);

  const patchConv = async (patch: { assignee_ids?: string[]; status?: string; is_favorite?: boolean }) => {
    if (!openPeer) return;
    try {
      await api.patch(`/api/desk/conversations/${encodeURIComponent(openPeer)}`, patch);
      loadThread(openPeer);
      loadList();
    } catch (e: any) {
      toast.error("Could not update the conversation", { description: e.message });
    }
  };

  // ── pane content ───────────────────────────────────────────────────────────
  const navNode = (
    <NavRail
      nav={nav}
      views={views}
      viewKey={viewKey}
      countOf={countOf}
      unreadOf={unreadOf}
      onSelect={selectView}
      onNewView={() => { setNavSheet(false); filterBtn.setOpen(true); }}
      onDeleteView={removeView}
      accounts={accounts}
      onSynced={() => { loadList(); if (openPeer) loadThread(openPeer); }}
      onCompose={() => { setNavSheet(false); setComposeOpen(true); }}
    />
  );

  const listNode = (
    <div className="ibx-col ibx-col--list">
      <header className="ibx-lhead">
        <button
          className="ibx-icobtn ibx-viewstoggle"
          onClick={() => putViewsOpen(!viewsOpen)}
          aria-label={viewsOpen ? "Hide inbox views" : "Show inbox views"}
          aria-expanded={viewsOpen}
          title={viewsOpen ? "Hide inbox views" : "Show inbox views"}
        >
          <PanelLeft size={15} />
        </button>
        <button
          className="ibx-icobtn ibx-navsheet"
          onClick={() => setNavSheet(true)}
          aria-label="Choose a view"
        >
          <PanelLeft size={15} />
        </button>
        <h1 className="ibx-lhead__title" title={activeLabel}>{activeLabel}</h1>
        <span className="ibx-lhead__count">{list.length}</span>
        <span className="flex-1" />
        <SortPopover
          by={sortBy}
          dir={sortDir}
          onChange={(b, d) => { setSortBy(b); setSortDir(d); }}
          onReset={() => { setSortBy(DEFAULT_SORT.by); setSortDir(DEFAULT_SORT.dir); }}
        />
        <button className="btn btn-primary btn-sm btn-icon" onClick={() => setComposeOpen(true)} aria-label="New conversation" title="New conversation">
          <Plus />
        </button>
      </header>

      <div className="ibx-search">
        <Search size={14} />
        <input
          ref={searchRef}
          placeholder="Search conversations"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") { setQ(""); e.currentTarget.blur(); } }}
          aria-label="Search conversations"
        />
        {q ? (
          <button onClick={() => { setQ(""); searchRef.current?.focus(); }} aria-label="Clear search"><X size={13} /></button>
        ) : (
          <kbd>/</kbd>
        )}
        <button
          ref={filterBtn.ref}
          className={`ibx-filterbtn ${countFilters(filters) > 0 ? "on" : ""}`}
          onClick={filterBtn.toggle}
          aria-expanded={filterBtn.open}
          title="Filter conversations"
        >
          <FilterIcon size={13} />
          {countFilters(filters) > 0 && <span>{countFilters(filters)}</span>}
        </button>
      </div>

      <FilterPanel
        open={filterBtn.open}
        anchor={filterBtn.ref}
        onClose={filterBtn.close}
        filters={filters}
        onChange={changeFilters}
        team={team}
        rows={all}
        countOf={countOf}
        onSaveView={addView}
      />

      <FilterChips
        filters={filters}
        team={team}
        onChange={changeFilters}
        savedName={activeView?.name}
        onDeleteView={activeView ? () => removeView(activeView.id) : undefined}
      />

      <div className="ibx-scroll" ref={listRef}>
        {rows === null && <ListSkeleton />}
        {rows !== null && list.length === 0 && (
          <div className="ibx-listblank">
            <InboxIcon size={22} strokeWidth={1.5} />
            <h2>{q || countFilters(filters) ? "Nothing matches" : "No conversations yet"}</h2>
            <p>
              {q || countFilters(filters)
                ? "Loosen the filters or try another search — the rail counts show where the traffic is."
                : "Calls, texts, emails, and faxes land here the moment they arrive."}
            </p>
            {(q || countFilters(filters) > 0) && (
              <button className="btn btn-secondary btn-sm" onClick={() => { setQ(""); changeFilters(EMPTY_FILTERS); }}>
                Clear filters
              </button>
            )}
          </div>
        )}
        {list.map((r) => (
          <ConversationRow
            key={r.peer}
            row={r}
            active={openPeer === r.peer}
            selected={selected.has(r.peer)}
            selecting={selected.size > 0}
            onSelect={() => toggleSelect(r.peer)}
            onOpen={() => open(r.peer)}
          />
        ))}
      </div>

      <BulkBar
        selected={selected}
        rows={all}
        team={team}
        onClear={() => setSelected(new Set())}
        onDone={() => { loadList(); if (openPeer) loadThread(openPeer); }}
      />
    </div>
  );

  const threadNode = (
    <div className="ibx-col ibx-col--thread">
      {!openPeer ? (
        <div className="ibx-threadblank">
          <div className="ibx-threadblank__mark"><MessageSquare size={22} strokeWidth={1.5} /></div>
          <h2>Pick a conversation</h2>
          <p>Every call, text, email, and fax from one person lives in a single thread — with the tickets they opened alongside.</p>
          <div className="ibx-threadblank__keys">
            <span><kbd>↑</kbd><kbd>↓</kbd> move</span>
            <span><kbd>/</kbd> search</span>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => setComposeOpen(true)}>
            <Plus /> Start a conversation
          </button>
        </div>
      ) : (
        <ThreadPane
          peer={openPeer}
          thread={thread}
          team={team}
          accounts={accounts}
          railOpen={railCfg.open}
          onBack={() => setOpenPeer(null)}
          onPatch={patchConv}
          onCall={callPeer}
          onToggleRail={() => { putRail({ ...railCfg, open: !railCfg.open }); setRailSheet((s) => !s); }}
          refresh={() => { loadThread(openPeer); loadList(); }}
        />
      )}
    </div>
  );

  const railNode = (
    <div className="ibx-col ibx-col--rail">
      <div className="ibx-tabs">
        <Tabs
          value={railCfg.tab}
          onValueChange={(v) => putRail({ ...railCfg, tab: v as RailTab })}
          className="min-w-0 flex-1 gap-0"
        >
          <TabsList variant="line" className="h-11 w-full justify-start gap-1 px-2">
            <TabsTrigger value="details" className="px-2.5 text-[12.5px] font-semibold">Details</TabsTrigger>
            <TabsTrigger value="dialpad" className="px-2.5 text-[12.5px] font-semibold">Dialpad</TabsTrigger>
          </TabsList>
        </Tabs>
        <button
          className="ibx-icobtn ibx-tabs__close"
          onClick={() => { putRail({ ...railCfg, open: false }); setRailSheet(false); }}
          aria-label="Close panel"
        >
          <X size={14} />
        </button>
      </div>
      {railCfg.tab === "details" ? (
        <DetailsRail
          thread={thread}
          otherThreads={threadPeers}
          onOpenPeer={(p) => { setRailSheet(false); open(p); }}
          onCall={callPeer}
          refresh={() => { if (openPeer) loadThread(openPeer); loadList(); }}
        />
      ) : (
        <DialpadRail
          numbers={numbers}
          to={dialTo}
          setTo={setDialTo}
          recent={all.filter((r) => !isEmailPeer(r.peer)).slice(0, 5)}
          active={railCfg.tab === "dialpad"}
        />
      )}
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className={`ibx ${openPeer ? "has-thread" : ""}`} data-ready={layout.ready ? "1" : "0"}>
      <PaneGroup
        panes={PANES}
        sizes={layout.sizes}
        onResize={layout.commit}
        collapsed={layout.collapsed}
        label="Inbox panes"
        className="ibx-panes"
      >
        {[
          <div key="views" className="ibx-col ibx-col--nav">{navNode}</div>,
          listNode,
          threadNode,
          railNode,
        ]}
      </PaneGroup>

      {/* narrow screens: the rails become sheets */}
      {railSheet && (
        <>
          <div className="scrim ibx-scrim ibx-scrim--rail" onClick={() => setRailSheet(false)} />
          <aside className="ibx-sheet ibx-sheet--rail">{railNode}</aside>
        </>
      )}
      {navSheet && (
        <>
          <div className="scrim ibx-scrim ibx-scrim--nav" onClick={() => setNavSheet(false)} />
          <aside className="ibx-sheet ibx-sheet--nav">
            <button className="ibx-icobtn ibx-navclose" onClick={() => setNavSheet(false)} aria-label="Close views">
              <X size={14} />
            </button>
            <div className="ibx-col ibx-col--nav">{navNode}</div>
          </aside>
        </>
      )}

      {composeOpen && (
        <NewConversation
          accounts={accounts}
          numbers={numbers}
          onClose={() => setComposeOpen(false)}
          onSent={(peer) => { setComposeOpen(false); loadList(); open(peer); }}
        />
      )}
    </div>
  );
}

// ── view rail ────────────────────────────────────────────────────────────────
function NavRail({
  nav, views, viewKey, countOf, unreadOf, onSelect, onNewView, onDeleteView, accounts, onSynced, onCompose,
}: {
  nav: { title: string; items: NavItem[] }[];
  views: SavedView[];
  viewKey: string;
  countOf: (f: Filters) => number;
  unreadOf: (f: Filters) => number;
  onSelect: (key: string, f: Filters) => void;
  onNewView: () => void;
  onDeleteView: (id: string) => void;
  accounts: EmailAccount[];
  onSynced: () => void;
  onCompose: () => void;
}) {
  return (
    <>
      <div className="ibx-nav__head">
        <h2>Inbox</h2>
        <SyncButton accounts={accounts} onSynced={onSynced} />
      </div>

      <button className="btn btn-primary btn-sm ibx-nav__new" onClick={onCompose}>
        <Plus /> New conversation
      </button>

      <nav className="ibx-scroll ibx-nav__body" aria-label="Inbox views">
        {nav.map((group) => (
          <div key={group.title} className="ibx-nav__group">
            <div className="ibx-nav__title">{group.title}</div>
            {group.items.map((item) => {
              const n = countOf(item.filters);
              const unread = unreadOf(item.filters);
              return (
                <button
                  key={item.key}
                  className={`ibx-nav__item ${viewKey === item.key ? "active" : ""}`}
                  onClick={() => onSelect(item.key, item.filters)}
                  aria-current={viewKey === item.key ? "true" : undefined}
                >
                  <item.icon />
                  <span className="flex-1 truncate text-left">{item.label}</span>
                  {unread > 0 ? (
                    <span className="ibx-nav__badge unread">{unread}</span>
                  ) : n > 0 ? (
                    <span className="ibx-nav__badge">{n}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}

        <div className="ibx-nav__group">
          <div className="ibx-nav__title">
            Your views
            <button onClick={onNewView} aria-label="Create a view" title="Create a view from filters"><Plus size={13} /></button>
          </div>
          {views.length === 0 && (
            <p className="ibx-nav__empty">Filter the list, then save it here as a one-click view.</p>
          )}
          {views.map((v) => (
            <div key={v.id} className={`ibx-nav__item ibx-nav__item--view ${viewKey === `view:${v.id}` ? "active" : ""}`}>
              <button className="ibx-nav__viewbtn" onClick={() => onSelect(`view:${v.id}`, v.filters)}>
                <span className="ibx-nav__dot" style={{ background: v.color }} />
                <span className="flex-1 truncate text-left">{v.name}</span>
                <span className="ibx-nav__badge">{countOf(v.filters)}</span>
              </button>
              <button className="ibx-nav__del" onClick={() => onDeleteView(v.id)} aria-label={`Delete the ${v.name} view`} title="Delete view">
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      </nav>
    </>
  );
}

// ── conversation row ─────────────────────────────────────────────────────────
const CHANNEL_ICONS: Record<string, React.ElementType> = {
  email: Mail,
  sms: MessageSquare,
  call: Phone,
  fax: Printer,
};

function LastKindIcon({ kind }: { kind?: string }) {
  const Icon = CHANNEL_ICONS[kind || "sms"] || MessageSquare;
  return <Icon size={9} />;
}

function ConversationRow({
  row, active, selected, selecting, onSelect, onOpen,

}: {
  row: Row;
  active: boolean;
  selected: boolean;
  selecting: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  const unread = row.unread > 0;
  const isActive = active;
  const displayName = row.contact.id
    ? row.contact.name
    : isEmailPeer(row.peer)
      ? row.peer
      : prettyPhone(row.peer);

  return (
    <div
      className={`ibx-row ${isActive ? "active" : ""} ${unread ? "unread" : ""} ${selected ? "picked" : ""} ${selecting ? "selecting" : ""}`}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      aria-current={isActive ? "true" : undefined}
      onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }}
    >
      {/* the checkbox lives over the avatar — revealed on hover, sticky once selecting */}
      <span className="ibx-row__av">
        <span className="relative inline-flex">
          <Avatar name={row.contact.name} size={36} />
          {unread && (
            <span className="absolute -top-[2px] -right-[2px]">
              <UnreadDot count={row.unread} size="sm" pulse={true} />
            </span>
          )}
        </span>
        {/* the corner badge is a 16px circle — it takes the bare channel icon;
            the labeled ChannelBadge pill belongs in wider contexts only */}
        <span className="ibx-row__badge" title={row.last_kind}>
          <LastKindIcon kind={row.last_kind} />
        </span>
        <span className="ibx-row__pick">
          <BulkCheckbox on={selected} onToggle={onSelect} label={`Select ${row.contact.name}`} />
        </span>
      </span>

      <span className="min-w-0 flex-1">
        <span className="ibx-row__top">
          <span className={`ibx-row__name truncate ${unread ? "font-semibold" : ""}`}>{displayName}</span>
          {row.is_favorite && (
            <Star size={11} className="ibx-row__star fill-current text-warning" aria-label="Starred" />
          )}
          <span className="ibx-row__time">{timeAgo(row.last_at)}</span>
        </span>

        <span className="ibx-row__mid">
          <OwnerChip members={row.assignees} size={16} />
          {row.status !== "open" && <StatusDot status={row.status} size={8} />}
          {row.channels.length > 1 && (
            <span className="ibx-row__multi">
              <span className="flex items-center gap-0.5">
                {row.channels.slice(0, 3).map((c) => {
                  const Icon = CHANNEL_ICONS[c] || MessageSquare;
                  return <Icon key={c} size={9} />;
                })}
                <span className="text-[10px]">+{row.channels.length}</span>
              </span>
            </span>
          )}
        </span>

        <span className="ibx-row__prev">
          {row.last_text || `${row.count} messages`}
        </span>
      </span>

      {unread && (
        <UnreadDot count={row.unread} size="md" pulse={false} />
      )}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div aria-hidden>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="ibx-row ibx-row--skel">
          <span className="sk sk-circle" style={{ width: 36, height: 36 }} />
          <span className="min-w-0 flex-1">
            <span className="sk" style={{ width: `${52 + ((i * 13) % 26)}%`, height: 10 }} />
            <span className="sk" style={{ width: 88, height: 9, marginTop: 8 }} />
            <span className="sk" style={{ width: `${68 + ((i * 7) % 22)}%`, height: 9, marginTop: 8 }} />
          </span>
        </div>
      ))}
    </div>
  );
}

// ── mailbox sync ─────────────────────────────────────────────────────────────
function SyncButton({ accounts, onSynced }: { accounts: EmailAccount[]; onSynced: () => void }) {
  const [busy, setBusy] = useState(false);
  const active = accounts.filter((a) => a.status === "active");
  if (active.length === 0) return null;
  const sync = async () => {
    setBusy(true);
    try {
      const r = await api.post("/api/desk/email/sync", { max_results: 25 });
      toast.success("Mailbox synced", {
        description: `${r.imported} new message${r.imported === 1 ? "" : "s"} from ${r.account}`,
      });
      onSynced();
    } catch (e: any) {
      toast.error("Sync failed", { description: e.message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <button className="ibx-icobtn" onClick={sync} disabled={busy} title="Pull recent mail from the connected mailbox" aria-label="Sync mailbox">
      {busy ? <Spinner size={13} /> : <RefreshCw size={13} />}
    </button>
  );
}

// ── new conversation ─────────────────────────────────────────────────────────
function NewConversation({
  accounts, numbers, onClose, onSent,
}: {
  accounts: EmailAccount[];
  numbers: PhoneNum[];
  onClose: () => void;
  onSent: (peer: string) => void;
}) {
  const [tab, setTab] = useState<"email" | "sms" | "fax">("email");
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [fromId, setFromId] = useState("");
  const [toolkit, setToolkit] = useState("");
  const [busy, setBusy] = useState(false);

  const active = useMemo(() => accounts.filter((a) => a.status === "active"), [accounts]);
  useEffect(() => { if (!toolkit && active.length) setToolkit(active[0].toolkit); }, [active, toolkit]);
  useEffect(() => { if (!fromId && numbers.length) setFromId(numbers[0].id); }, [numbers, fromId]);

  const canSend =
    tab === "email" ? !!to.trim() && !!active.length && (!!body.trim() || !!subject.trim()) :
    tab === "sms" ? !!to.trim() && !!body.trim() && numbers.length > 0 :
    !!to.trim() && !!mediaUrl.trim() && numbers.length > 0;

  const send = async () => {
    if (!canSend || busy) return;
    setBusy(true);
    try {
      if (tab === "email") {
        await api.post("/api/desk/email/send", { to: to.trim(), subject: subject.trim(), body, toolkit });
        toast.success("Email sent");
        onSent(to.trim().toLowerCase());
      } else if (tab === "sms") {
        await api.post("/api/telephony/messages", { to: to.trim(), body, from_number_id: fromId });
        toast.success("Message sent");
        onSent(to.trim());
      } else {
        await api.post("/api/telephony/fax", { to: to.trim(), media_url: mediaUrl.trim(), from_number_id: fromId });
        toast.success("Fax queued", { description: "Delivery status lands in the thread." });
        onSent(to.trim());
      }
    } catch (e: any) {
      toast.error("Could not send", { description: e.message });
      setBusy(false);
    }
  };

  const warn =
    tab === "email" && active.length === 0 ? (
      <>No mailbox is connected. <Link href="/studio/integrations" className="text-accent">Connect Gmail or Outlook</Link>, then send from here.</>
    ) : (tab === "sms" || tab === "fax") && numbers.length === 0 ? (
      <>No phone number yet. <Link href="/studio/telephony" className="text-accent">Provision one in Studio → Telephony</Link> first.</>
    ) : null;

  return (
    <Modal onClose={onClose} title="New conversation">
      <div className="ibx-mtabs" role="tablist" aria-label="Channel">
        {(["email", "sms", "fax"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={`ibx-mtab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
            {t === "email" ? <Mail size={14} /> : t === "sms" ? <MessageSquare size={14} /> : <Printer size={14} />}
            {t === "email" ? "Email" : t === "sms" ? "SMS" : "Fax"}
          </button>
        ))}
      </div>

      {warn && (
        <div className="ibx-warn">
          <AlertTriangle size={15} />
          <span>{warn}</span>
        </div>
      )}

      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="nc-from">From</label>
          {tab === "email" ? (
            <select id="nc-from" className="select" value={toolkit} onChange={(e) => setToolkit(e.target.value)}>
              {active.length === 0 && <option value="">No mailbox connected</option>}
              {active.map((a) => <option key={a.id} value={a.toolkit}>{a.email || a.toolkit}</option>)}
            </select>
          ) : (
            <select id="nc-from" className="select" value={fromId} onChange={(e) => setFromId(e.target.value)}>
              {numbers.length === 0 && <option value="">No numbers</option>}
              {numbers.map((n) => <option key={n.id} value={n.id}>{n.friendly_name || prettyPhone(n.e164)}</option>)}
            </select>
          )}
        </div>
        <div>
          <label className="label" htmlFor="nc-to">To</label>
          <input
            id="nc-to"
            className="input"
            placeholder={tab === "email" ? "name@company.com" : "+1 555 000 1234"}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
      </div>

      {tab === "email" && (
        <div className="mb-4">
          <label className="label" htmlFor="nc-subject">Subject</label>
          <input id="nc-subject" className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
      )}

      {tab === "fax" ? (
        <div className="mb-5">
          <label className="label" htmlFor="nc-doc">Document URL (PDF)</label>
          <input id="nc-doc" className="input" placeholder="https://…/document.pdf" value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} />
          <p className="hint mt-1.5">A publicly reachable PDF. Sending needs a Telnyx fax application on your telephony settings.</p>
        </div>
      ) : (
        <div className="mb-5">
          <label className="label" htmlFor="nc-body">Message</label>
          <textarea
            id="nc-body"
            className="textarea"
            style={{ fontFamily: "inherit", fontSize: 14 }}
            rows={5}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your message…"
          />
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={send} disabled={!canSend || busy}>
          {busy ? <Spinner size={15} /> : <Send />} Send
        </button>
      </div>
    </Modal>
  );
}
