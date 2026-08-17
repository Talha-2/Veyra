"use client";

/* Veyra Desk — Overview.

   Leads with ONE hero figure (the share of conversations Veyra carried), then a
   hairline stat strip, then the trend as the main event. Deliberately not a
   grid of identical cards: cards are the lazy page scaffold, and nesting them
   is worse. Structure here comes from the hairline skeleton — the same 1px
   seam the rest of the console uses — so the numbers are the only loud thing.

   Every figure is a real count from the workspace's own rows. There is no
   historical baseline in the API, so there are NO period-over-period deltas —
   an invented "+12% vs last month" would be the easiest lie on the page. */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight, CalendarDays, Clock, PhoneOff, RefreshCw, Ticket as TicketIcon,
  TrendingUp, Users, Zap,
} from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader, Spinner } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarMix, HeroFigure, StatTile, TrendArea, compact, type MixItem } from "@/components/desk/charts";

type Dashboard = {
  top: {
    ai_managed_pct: number;
    support_volume: number;
    most_active_number: string;
    inbound_events: number;
    leads: number;
  };
  ai: {
    calls_handled: number;
    talk_minutes: number;
    tickets_by_ai: number;
    contacts_in_ai: number;
    answered_pct: number;
    missed_calls: number;
  };
  productivity: { managed: number; total: number; series: { date: string; ai: number; team: number }[] };
  handled: { ai_pct: number; team_pct: number; open_tickets: number; tool_actions: number };
  channels: { calls: number; sms_in: number; sms_out: number; email: number; email_unread: number; fax: number };
  counts: { contacts: number; tickets: number; leads: number; open_tickets: number };
  sample: boolean;
};

/* A hairline-divided run of figures. Not cards — the seam does the separating,
   which is what keeps a row of numbers from reading as five competing boxes. */
function StatStrip({ children }: { children: React.ReactNode }) {
  return <div className="stat-strip">{children}</div>;
}

function DashboardView({ data }: { data: Dashboard }) {
  const { top, ai, productivity, handled, counts } = data;

  const aiTrend = useMemo(() => productivity.series.map((p) => p.ai), [productivity.series]);
  const teamTrend = useMemo(() => productivity.series.map((p) => p.team), [productivity.series]);

  /* Fixed slot order — colour follows the channel, never its size, so filtering
     or a quiet week never repaints the others. */
  const channels: MixItem[] = [
    { label: "Calls", value: data.channels.calls, color: "var(--chart-1)" },
    { label: "SMS", value: data.channels.sms_in + data.channels.sms_out, color: "var(--chart-2)" },
    { label: "Email", value: data.channels.email, color: "var(--chart-3)" },
    { label: "Fax", value: data.channels.fax, color: "var(--chart-4)" },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* ── the lead ── */}
      <Card>
        <CardContent className="dash-lead">
          <HeroFigure
            label="Conversations Veyra carried"
            value={`${top.ai_managed_pct}%`}
            meter={top.ai_managed_pct}
            sub={`${productivity.managed.toLocaleString()} of ${productivity.total.toLocaleString()} conversations had no teammate assigned. The rest went to your team.`}
          />
          <StatStrip>
            <StatTile
              label="Support volume"
              value={compact(top.support_volume)}
              sub="Contacts, conversations and tickets"
            />
            <StatTile
              label="Open tickets"
              value={counts.open_tickets.toLocaleString()}
              sub="Awaiting resolution"
            />
            <StatTile
              label="Busiest number"
              value={top.most_active_number}
              sub={`${compact(top.inbound_events)} inbound events`}
            />
          </StatStrip>
        </CardContent>
      </Card>

      <Tabs defaultValue="ai">
        <TabsList variant="line">
          <TabsTrigger value="ai">AI productivity</TabsTrigger>
          <TabsTrigger value="support">Support</TabsTrigger>
          <TabsTrigger value="channels">Channels</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
        </TabsList>

        {/* ── AI productivity ── */}
        <TabsContent value="ai" className="flex flex-col gap-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Who handled the conversation</CardTitle>
              <CardDescription>
                Conversations per day over the last 30 days. Both series count the same thing, so
                they share one axis.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TrendArea data={productivity.series} height={264} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>What Veyra did on the line</CardTitle>
              <CardDescription>Counted across everything on record, not just the window above.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="dash-grid">
                <StatTile
                  label="Calls the agent held"
                  value={compact(ai.calls_handled)}
                  sub="Calls where Veyra carried the line"
                  trend={aiTrend}
                  trendColor="var(--chart-1)"
                />
                <StatTile label="Talk time" value={`${compact(ai.talk_minutes)} min`} sub="Total connected duration" />
                <StatTile label="Inbound answered" value={`${ai.answered_pct}%`} sub="Inbound calls that completed" />
                <StatTile
                  label="Handled alone"
                  value={compact(ai.contacts_in_ai)}
                  sub="No teammate assigned yet"
                  trend={teamTrend}
                  trendColor="var(--chart-2)"
                />
                <StatTile label="Tickets raised by Veyra" value={compact(ai.tickets_by_ai)} sub="Filed from a conversation" />
                <StatTile label="Missed inbound" value={compact(ai.missed_calls)} sub="No answer, busy, or failed" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Support ── */}
        <TabsContent value="support" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Support load</CardTitle>
              <CardDescription>
                {compact(top.support_volume)} across contacts, conversations and tickets.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <StatStrip>
                <StatTile label="Open tickets" value={counts.open_tickets.toLocaleString()} sub="Awaiting resolution" />
                <StatTile label="All tickets" value={compact(counts.tickets)} sub="Filed all time" />
                <StatTile label="Contacts" value={compact(counts.contacts)} sub="People in this workspace" />
                <StatTile label="Leads" value={compact(counts.leads)} sub="In a pipeline" />
              </StatStrip>
              <div className="flex flex-wrap gap-2">
                <Link href="/desk/tickets" className="btn btn-secondary btn-sm">
                  Open tickets <ArrowUpRight size={14} strokeWidth={2} />
                </Link>
                <Link href="/desk/contacts" className="btn btn-ghost btn-sm">
                  Browse contacts <ArrowUpRight size={14} strokeWidth={2} />
                </Link>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Channels ── */}
        <TabsContent value="channels" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Channel mix</CardTitle>
              <CardDescription>Every call, message, email and fax on record, by channel.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <BarMix items={channels} unit="total" />
              {data.channels.email_unread > 0 && (
                <p className="text-secondary text-[13px]">
                  <Badge variant="secondary">{data.channels.email_unread} unread</Badge>{" "}
                  email{data.channels.email_unread === 1 ? "" : "s"} waiting in the inbox.{" "}
                  <Link href="/desk/inbox" className="text-accent">Open the inbox</Link>
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Team ── */}
        <TabsContent value="team" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Team workload</CardTitle>
              <CardDescription>Who is holding what, and where to rebalance.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <StatStrip>
                <StatTile label="Open tickets" value={counts.open_tickets.toLocaleString()} sub="Across the team" />
                <StatTile label="Contacts" value={compact(counts.contacts)} sub="Everyone Veyra has talked to" />
                <StatTile
                  label="Split"
                  value={`${handled.ai_pct}/${handled.team_pct}`}
                  sub="Veyra vs team, by conversation"
                />
              </StatStrip>
              <Link href="/desk/team" className="btn btn-secondary btn-sm self-start">
                Open team view <ArrowUpRight size={14} strokeWidth={2} />
              </Link>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function DeskDashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .get("/api/desk/dashboard")
      .then((d) => { if (alive) setData(d as Dashboard); })
      .catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : "Something went wrong"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  return (
    <div>
      <PageHeader
        title="Overview"
        description="What Veyra handled, what your team handled, and where the volume came from."
        actions={
          <div className="flex items-center gap-2.5">
            <span className="text-tertiary hidden items-center gap-1.5 text-[12.5px] sm:inline-flex">
              <RefreshCw size={13} strokeWidth={1.9} /> Updated just now
            </span>
            <Badge variant="outline" className="gap-1.5">
              <CalendarDays size={13} /> Last 30 days
            </Badge>
          </div>
        }
      />

      {loading ? (
        <div className="dash-skeleton" aria-busy>
          <Spinner size={22} />
          <span>Counting your calls, messages and tickets…</span>
        </div>
      ) : !data ? (
        <Card>
          <CardContent>
            <p className="text-secondary text-sm">
              We could not load your dashboard just now. Please refresh in a moment.
              {error ? <span className="text-tertiary"> {error}</span> : null}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {data.sample && (
            <p className="mb-5 text-[13px]" style={{ color: "var(--text-tertiary)" }}>
              Showing sample data until your phone line is live.
            </p>
          )}
          <DashboardView data={data} />
        </>
      )}
    </div>
  );
}
