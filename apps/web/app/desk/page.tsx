"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  type LucideIcon,
  Bot,
  MessageSquare,
  Phone,
  Users,
  TrendingUp,
  Clock,
  Zap,
  PhoneOff,
  Ticket,
  Sparkles,
  CalendarDays,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader, SectionCard, Spinner } from "@/components/ui";
import { AreaChart } from "@/components/desk/kit";

/* ── data shape ───────────────────────────────────────────────────────────── */

type Dashboard = {
  top: {
    ai_managed_pct: number;
    support_volume: number;
    most_active_number: string;
    inbound_events: number;
    leads: number;
  };
  ai: {
    value_delivered: number;
    time_saved_hrs: number;
    ai_hours: number;
    contacts_in_ai: number;
    tickets_by_ai: number;
    missed_calls_prevented: number;
  };
  productivity: {
    managed: number;
    total: number;
    series: { date: string; ai: number; team: number }[];
  };
  handled: {
    ai_pct: number;
    team_pct: number;
    no_escalation: number;
    tool_actions: number;
    first_response_s: number;
  };
  counts: { contacts: number; tickets: number; leads: number; open_tickets: number };
  sample: boolean;
};

type Tab = "AI Productivity" | "Support" | "Channels" | "Team";
const TABS: Tab[] = ["AI Productivity", "Support", "Channels", "Team"];

type Delta = { dir: "up" | "down"; text: string };

/* ── small pieces ─────────────────────────────────────────────────────────── */

// A bordered pill used in the header for the date range and refresh hint.
function Chip({ icon: Icon, children }: { icon?: LucideIcon; children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12.5px] font-medium"
      style={{
        padding: "6px 11px",
        borderRadius: 999,
        border: "1px solid var(--border)",
        background: "var(--surface)",
        color: "var(--text-secondary)",
      }}
    >
      {Icon ? <Icon size={14} strokeWidth={1.9} /> : null}
      {children}
    </span>
  );
}

// The tiny "last 30 days" / "Live now" tag that sits in the top right of a KPI.
function MiniChip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="shrink-0 whitespace-nowrap text-[11px]"
      style={{
        padding: "4px 8px",
        borderRadius: 999,
        background: "var(--surface-sunken)",
        border: "1px solid var(--border)",
        color: "var(--text-tertiary)",
        lineHeight: 1,
      }}
    >
      {children}
    </span>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
  chip,
  delta,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  sub?: string;
  chip?: string;
  delta?: Delta;
}) {
  return (
    <div className="kpi">
      <div className="flex items-start justify-between gap-2">
        <span className="kpi__label">
          <Icon size={14} strokeWidth={1.9} />
          {label}
        </span>
        {chip ? <MiniChip>{chip}</MiniChip> : null}
      </div>
      <div className="kpi__value">{value}</div>
      {sub ? <div className="kpi__sub">{sub}</div> : null}
      {delta ? (
        <div
          className={`kpi__delta ${delta.dir}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            marginTop: 8,
            fontSize: 12,
            fontWeight: 550,
          }}
        >
          {delta.dir === "up" ? (
            <ArrowUpRight size={13} strokeWidth={2.4} />
          ) : (
            <ArrowDownRight size={13} strokeWidth={2.4} />
          )}
          <span>{delta.text}</span>
        </div>
      ) : null}
    </div>
  );
}

// A bordered stat block used in the "What AI handled" column.
function MiniStat({
  label,
  value,
  sub,
  rightNote,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  rightNote?: string;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: "12px 14px",
        background: "var(--surface-sunken)",
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
          {label}
        </span>
        <span className="text-[16px] font-semibold">{value}</span>
      </div>
      {sub ? <div className="text-tertiary mt-1 text-[12px] leading-snug">{sub}</div> : null}
      {rightNote ? (
        <div className="text-tertiary mt-1 text-right text-[12px]">{rightNote}</div>
      ) : null}
    </div>
  );
}

/* ── the dashboard, once data is present ──────────────────────────────────── */

function DashboardView({ data }: { data: Dashboard }) {
  const [tab, setTab] = useState<Tab>("AI Productivity");
  const { top, ai, productivity, handled, counts } = data;

  const valueDelivered =
    ai.value_delivered >= 1000
      ? `$${(ai.value_delivered / 1000).toFixed(0)}K`
      : `$${ai.value_delivered}`;

  const aiCards: {
    icon: LucideIcon;
    label: string;
    value: React.ReactNode;
    chip: string;
    sub?: string;
    delta?: Delta;
  }[] = [
    {
      icon: TrendingUp,
      label: "Value delivered",
      value: valueDelivered,
      chip: "last 30 days",
      delta: { dir: "up", text: "4.1% vs previous period" },
    },
    {
      icon: Clock,
      label: "Time saved",
      value: `${ai.time_saved_hrs} hrs`,
      chip: "last 30 days",
      delta: { dir: "up", text: "4.1% vs previous period" },
    },
    {
      icon: Zap,
      label: "AI hours worked",
      value: `${ai.ai_hours} hrs`,
      chip: "last 30 days",
      delta: { dir: "down", text: "2.1% vs previous period" },
    },
    {
      icon: Users,
      label: "Contacts in AI conversations",
      value: ai.contacts_in_ai.toLocaleString(),
      chip: "Live now",
      sub: "No change vs previous period",
    },
    {
      icon: Ticket,
      label: "Tickets created by AI",
      value: ai.tickets_by_ai.toLocaleString(),
      chip: "last 30 days",
      delta: { dir: "down", text: "1.8% vs previous period" },
    },
    {
      icon: PhoneOff,
      label: "Missed calls prevented",
      value: ai.missed_calls_prevented.toLocaleString(),
      chip: "last 30 days",
      delta: { dir: "up", text: "29.6% vs previous period" },
    },
  ];

  const channels: { label: string; share: number; color: string }[] = [
    { label: "Phone", share: 46, color: "var(--accent)" },
    { label: "SMS", share: 28, color: "#7c3aed" },
    { label: "Email", share: 18, color: "#0891b2" },
    { label: "Forms", share: 8, color: "#16a34a" },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* top row: headline KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          icon={Bot}
          label="AI managed conversations"
          value={`${top.ai_managed_pct}% AI`}
          sub="Productivity coverage"
        />
        <Kpi
          icon={MessageSquare}
          label="Support volume"
          value={top.support_volume.toLocaleString()}
          sub="Contacts, conversations, tickets"
        />
        <Kpi
          icon={Phone}
          label="Most active number"
          value={top.most_active_number}
          sub={`${top.inbound_events.toLocaleString()} inbound events`}
        />
        <Kpi
          icon={Ticket}
          label="Open tickets"
          value={counts.open_tickets.toLocaleString()}
          sub="Awaiting resolution"
        />
      </div>

      {/* segmented tabs */}
      <div className="seg">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            className={tab === t ? "active" : ""}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ── AI Productivity ─────────────────────────────────────────────── */}
      {tab === "AI Productivity" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-2">
            <Sparkles size={16} strokeWidth={1.9} style={{ color: "var(--accent-text)", marginTop: 1 }} />
            <div>
              <h2 className="text-[15px] font-semibold leading-none">AI Productivity</h2>
              <p className="hint mt-1.5">AI contribution for the last 30 days.</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {aiCards.map((c) => (
              <Kpi
                key={c.label}
                icon={c.icon}
                label={c.label}
                value={c.value}
                chip={c.chip}
                sub={c.sub}
                delta={c.delta}
              />
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
            <SectionCard
              title="Conversation productivity"
              description={`${productivity.managed} of ${productivity.total} conversations managed by AI.`}
            >
              <AreaChart series={data.productivity.series} height={300} />
            </SectionCard>

            <SectionCard
              title="What AI handled"
              description="Based on AI conversations, team replies, and tool activity."
            >
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-secondary">AI handled</span>
                <span className="font-medium">
                  {handled.ai_pct}% AI / {handled.team_pct}% team
                </span>
              </div>
              <div className="bar mt-2">
                <span style={{ width: `${handled.ai_pct}%` }} />
              </div>

              <div className="mt-5 flex flex-col gap-2.5">
                <MiniStat
                  label="No escalation"
                  value={handled.no_escalation.toLocaleString()}
                  sub="AI conversations resolved without team follow up"
                />
                <MiniStat
                  label="Tool actions"
                  value={handled.tool_actions.toLocaleString()}
                  sub="Integration work completed by AI"
                />
                <MiniStat
                  label="First response"
                  value={`${handled.first_response_s}s`}
                  rightNote="Team baseline 6m"
                />
              </div>
            </SectionCard>
          </div>
        </div>
      )}

      {/* ── Support ─────────────────────────────────────────────────────── */}
      {tab === "Support" && (
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Kpi
              icon={Ticket}
              label="Open tickets"
              value={counts.open_tickets.toLocaleString()}
              sub="Awaiting resolution"
            />
            <Kpi
              icon={Ticket}
              label="Total tickets"
              value={counts.tickets.toLocaleString()}
              sub="All time"
            />
            <Kpi
              icon={Users}
              label="Total contacts"
              value={counts.contacts.toLocaleString()}
              sub="People in your workspace"
            />
          </div>
          <p className="text-secondary text-sm">
            Support volume {top.support_volume.toLocaleString()} across contacts, conversations, and
            tickets.
          </p>
        </div>
      )}

      {/* ── Channels ────────────────────────────────────────────────────── */}
      {tab === "Channels" && (
        <SectionCard
          title="Channel activity"
          description={`${top.inbound_events.toLocaleString()} inbound events across your channels.`}
        >
          <div className="flex flex-col gap-4">
            {channels.map((c) => {
              const count = Math.round((top.inbound_events * c.share) / 100);
              return (
                <div key={c.label}>
                  <div className="mb-1.5 flex items-center justify-between text-[13px]">
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: c.color }}
                      />
                      <span className="font-medium">{c.label}</span>
                    </span>
                    <span className="text-tertiary">
                      {count.toLocaleString()} events · {c.share}%
                    </span>
                  </div>
                  <div className="bar">
                    <span style={{ width: `${c.share}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      {/* ── Team ────────────────────────────────────────────────────────── */}
      {tab === "Team" && (
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Kpi icon={Ticket} label="Open tickets" value={counts.open_tickets.toLocaleString()} sub="Across the team" />
            <Kpi icon={Users} label="Total contacts" value={counts.contacts.toLocaleString()} sub="Everyone Vera has talked to" />
          </div>
          <SectionCard
            title="Team workload"
            description="See who is handling what, and balance the load across the team."
          >
            <p className="text-secondary text-sm">
              Open the team view to see each member's open tickets and active conversations, and reassign in a click.
            </p>
            <Link href="/desk/team" className="btn btn-secondary btn-sm mt-4">
              Open team view
              <ArrowUpRight size={15} strokeWidth={2} />
            </Link>
          </SectionCard>
        </div>
      )}
    </div>
  );
}

/* ── page ─────────────────────────────────────────────────────────────────── */

export default function DeskDashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .get("/api/desk/dashboard")
      .then((d) => {
        if (alive) setData(d as Dashboard);
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : "Something went wrong");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div>
      <PageHeader
        title="Overview"
        description="AI value, support, channel activity and health, and sales flow for the selected window."
        actions={
          <div className="flex items-center gap-2.5">
            <span className="text-tertiary hidden items-center gap-1.5 text-[12.5px] sm:inline-flex">
              <RefreshCw size={13} strokeWidth={1.9} />
              Updated just now
            </span>
            <Chip icon={CalendarDays}>Last 30 days</Chip>
          </div>
        }
      />

      {loading ? (
        <div className="flex justify-center py-24">
          <Spinner size={22} />
        </div>
      ) : !data ? (
        <div className="card p-6">
          <p className="text-secondary text-sm">
            We could not load your dashboard just now. Please refresh in a moment.
            {error ? <span className="text-tertiary"> {error}</span> : null}
          </p>
        </div>
      ) : (
        <>
          {data.sample && (
            <p className="mb-6 text-[13px]" style={{ color: "var(--text-tertiary)" }}>
              Showing sample data until your phone line is live.
            </p>
          )}
          <DashboardView data={data} />
        </>
      )}
    </div>
  );
}
