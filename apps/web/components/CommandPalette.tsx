"use client";

/* Cmd/Ctrl K command palette (cmdk). A single keyboard entry point to every
   studio surface plus the common create actions. Opens over a scrim, filters
   as you type, and routes on select. Mirrors the launcher pattern shipped by
   Linear, Vercel, and Raycast, kept lightweight and theme aware. */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import {
  BookOpen,
  Bot,
  Code2,
  FlaskConical,
  LayoutDashboard,
  Plug,
  Plus,
  SlidersHorizontal,
  Sparkles,
  Workflow,
} from "lucide-react";

type Item = { label: string; hint: string; icon: any; href: string; keywords?: string };

const NAV: Item[] = [
  { label: "Overview", hint: "Dashboard", icon: LayoutDashboard, href: "/studio/overview", keywords: "home dashboard stats" },
  { label: "Experts", hint: "Autonomous agents", icon: Sparkles, href: "/studio/experts", keywords: "agent autonomous schedule cron" },
  { label: "Workflows", hint: "Visual node builder", icon: Workflow, href: "/studio/workflows", keywords: "graph nodes flow ability" },
  { label: "Knowledge Base", hint: "Documents and RAG", icon: BookOpen, href: "/studio/knowledge", keywords: "docs files rag upload" },
  { label: "Deep Agent", hint: "Build from a prompt", icon: Bot, href: "/studio/agent", keywords: "chat harness assistant" },
  { label: "Integrations", hint: "Apps, actions, MCP", icon: Plug, href: "/studio/integrations", keywords: "composio oauth tools mcp" },
  { label: "Voice Tuning", hint: "STT, TTS, turn taking", icon: SlidersHorizontal, href: "/studio/tuning", keywords: "voice model latency test compare" },
  { label: "Developers", hint: "API keys and webhooks", icon: Code2, href: "/studio/developers", keywords: "api key webhook rest v1" },
  { label: "Evals", hint: "Simulations and scoring", icon: FlaskConical, href: "/studio/evals", keywords: "test simulate persona score" },
];

const CREATE: Item[] = [
  { label: "New Expert", hint: "Autonomous agent", icon: Plus, href: "/studio/experts?new=1", keywords: "create add expert agent" },
  { label: "New Workflow", hint: "Visual node graph", icon: Plus, href: "/studio/workflows?new=1", keywords: "create add workflow" },
  { label: "Add knowledge", hint: "Upload or write a doc", icon: Plus, href: "/studio/knowledge?new=1", keywords: "create add document upload" },
  { label: "Create API key", hint: "For the REST API", icon: Plus, href: "/studio/developers?new=1", keywords: "create add key token" },
];

export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("open-command-palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("open-command-palette", onOpen);
    };
  }, []);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  if (!open) return null;

  const section = (title: string, items: Item[]) => (
    <Command.Group heading={title}>
      {items.map((it) => {
        const Icon = it.icon;
        return (
          <Command.Item key={it.href} value={`${it.label} ${it.keywords ?? ""}`} onSelect={() => go(it.href)}>
            <Icon size={16} strokeWidth={1.75} className="cmdk-ico" />
            <span className="cmdk-label">{it.label}</span>
            <span className="cmdk-hint">{it.hint}</span>
          </Command.Item>
        );
      })}
    </Command.Group>
  );

  return (
    <div className="scrim cmdk-scrim" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <Command label="Command palette" className="cmdk-root" shouldFilter>
        <div className="cmdk-input-row">
          <Command.Input autoFocus placeholder="Search the studio or jump to a page" />
          <kbd className="cmdk-kbd">esc</kbd>
        </div>
        <Command.List>
          <Command.Empty>No matches found.</Command.Empty>
          {section("Go to", NAV)}
          {section("Create", CREATE)}
        </Command.List>
      </Command>
    </div>
  );
}
