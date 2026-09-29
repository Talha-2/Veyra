import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, Code2, Inbox, KeyRound, MessagesSquare, Rocket, Sparkles, Webhook } from "lucide-react";

import { API_BASE } from "@/components/mk/links";

export const metadata: Metadata = {
  title: "Documentation",
  description: "Guides for Veyra Studio and Veyra Desk, and the reference for the Veyra API.",
};

const START = [
  { href: "/docs/getting-started/quickstart", icon: Rocket, title: "Quickstart", body: "From sign-up to an agent you can talk to, then your first API request." },
  { href: "/docs/getting-started/concepts", icon: BookOpen, title: "Core concepts", body: "Agents, experts, skills, knowledge and how Studio and Desk fit together." },
  { href: "/docs/api/authentication", icon: KeyRound, title: "Authentication", body: "Secret and publishable keys, and the scopes each request needs." },
  { href: "/docs/api/chat", icon: MessagesSquare, title: "Chat with your agent", body: "Put your agent inside your own product over the chat API." },
];

const PRODUCTS = [
  { href: "/docs/studio/overview", icon: Sparkles, name: "Veyra Studio", tag: "The agent platform", body: "Build and test the agent: its identity, voice, knowledge, skills, experts and integrations. Developers connect it to their own products with the API." },
  { href: "/docs/desk/overview", icon: Inbox, name: "Veyra Desk", tag: "The team's workspace", body: "Every conversation the agent has lands here: the inbox, calls, contacts, leads and tickets your team works from." },
];

export default function DocsHome() {
  return (
    <div className="dk-page dk-page--home">
      <header className="dk-home__hero">
        <p className="dk-eyebrow">Documentation</p>
        <h1>Build with Veyra</h1>
        <p className="dk-lead">Guides for Veyra Studio and Veyra Desk, and the full reference for the Veyra API.</p>
        <div className="dk-home__base">
          <span>API base URL</span>
          <code>{API_BASE}</code>
        </div>
      </header>

      <section className="dk-home__section">
        <h2>Start here</h2>
        <div className="dk-grid dk-grid--4">
          {START.map((c) => (
            <Link key={c.href} href={c.href} className="dk-card">
              <c.icon size={20} className="dk-card__icon" />
              <h3>{c.title}</h3>
              <p>{c.body}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="dk-home__section">
        <h2>Two products, one agent</h2>
        <div className="dk-grid dk-grid--2">
          {PRODUCTS.map((p) => (
            <Link key={p.href} href={p.href} className="dk-card dk-card--big">
              <p.icon size={22} className="dk-card__icon" />
              <p className="dk-eyebrow">{p.tag}</p>
              <h3>{p.name}</h3>
              <p>{p.body}</p>
              <span className="dk-card__more">Read the guides <ArrowRight size={14} /></span>
            </Link>
          ))}
        </div>
      </section>

      <section className="dk-home__section">
        <h2>API reference</h2>
        <div className="dk-grid dk-grid--2">
          <Link href="/docs/api-reference" className="dk-card">
            <Code2 size={20} className="dk-card__icon" />
            <h3>REST API</h3>
            <p>Contacts, conversations, messages, tickets, leads, calls, knowledge and agent chat, with examples in cURL, JavaScript and Python.</p>
          </Link>
          <Link href="/docs/api-reference/events" className="dk-card">
            <Webhook size={20} className="dk-card__icon" />
            <h3>Webhook events</h3>
            <p>Every event Veyra can send to your endpoint, with its payload and how to verify the signature.</p>
          </Link>
        </div>
      </section>
    </div>
  );
}
