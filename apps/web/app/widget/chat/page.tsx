"use client";

/* The embeddable chat widget — the page an <iframe> loads.

   Served from our own origin, so its API calls need no third-party CORS
   story (the Intercom pattern). Query params: ?agent=exp_…&pk=z360_pk_…;
   both optional — without them it bootstraps from /v1/chat/config, which is
   how the first-party site chatbot stays zero-config.

   The visitor's session id lives in localStorage, so the conversation —
   backed by the server-side checkpointer thread — survives reloads. History
   is re-polled while idle so a human reply sent later from Veyra Desk shows
   up in the same window. */

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Send } from "lucide-react";
import { API_URL } from "@/lib/api";

type Msg = { id: string; direction: "inbound" | "outbound"; body: string; streaming?: boolean };

function newSessionId(): string {
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(12)))
    .map((b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36])
    .join("");
  return `wc_${rand}`;
}

function ChatWidget() {
  const params = useSearchParams();
  const [agent, setAgent] = useState(params.get("agent") || "");
  const [pk, setPk] = useState(params.get("pk") || "");
  const [agentName, setAgentName] = useState("Veyra");
  const [session, setSession] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [fatal, setFatal] = useState("");
  const scroller = useRef<HTMLDivElement>(null);

  // session identity, per agent, persisted
  useEffect(() => {
    if (!agent) return;
    const key = `vw_session_${agent}`;
    try {
      let s = localStorage.getItem(key);
      if (!s) {
        s = newSessionId();
        localStorage.setItem(key, s);
      }
      setSession(s);
    } catch {
      setSession(newSessionId());
    }
  }, [agent]);

  // zero-config bootstrap when the iframe carries no params
  useEffect(() => {
    if (agent && pk) return;
    fetch(`${API_URL}/v1/chat/config`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        setAgent((a) => a || d.agent_id);
        setPk((k) => k || d.publishable_key);
        if (d.agent_name) setAgentName(d.agent_name);
      })
      .catch(() => setFatal("Chat is not available right now."));
  }, [agent, pk]);

  const loadHistory = useCallback(() => {
    if (!agent || !pk || !session) return;
    fetch(`${API_URL}/v1/chat/${agent}/history?session_id=${session}`, {
      headers: { Authorization: `Bearer ${pk}` },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => setMsgs(d.messages.map((m: Msg) => ({ id: m.id, direction: m.direction, body: m.body }))))
      .catch(() => {});
  }, [agent, pk, session]);

  useEffect(loadHistory, [loadHistory]);

  // pick up desk-side human replies while the widget sits open
  useEffect(() => {
    if (busy) return;
    const t = setInterval(loadHistory, 10000);
    return () => clearInterval(t);
  }, [busy, loadHistory]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [msgs]);

  async function send() {
    const text = draft.trim();
    if (!text || busy || !agent || !pk || !session) return;
    setDraft("");
    setBusy(true);
    setMsgs((m) => [...m, { id: `local-${Date.now()}`, direction: "inbound", body: text }]);
    const replyId = `stream-${Date.now()}`;
    setMsgs((m) => [...m, { id: replyId, direction: "outbound", body: "", streaming: true }]);

    const patch = (body: string, streaming: boolean) =>
      setMsgs((m) => m.map((x) => (x.id === replyId ? { ...x, body, streaming } : x)));

    try {
      const res = await fetch(`${API_URL}/v1/chat/${agent}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${pk}`, "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: session, message: text }),
      });
      if (!res.ok || !res.body) throw new Error(String(res.status));
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      let shown = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        const frames = acc.split("\n\n");
        acc = frames.pop() || "";
        for (const f of frames) {
          const line = f.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          try {
            const ev = JSON.parse(line.slice(6));
            if (ev.type === "token") {
              shown += ev.text;
              patch(shown, true);
            } else if (ev.type === "done") {
              patch(ev.text || shown, false);
            } else if (ev.type === "error") {
              patch(ev.text, false);
            }
          } catch {
            /* partial frame */
          }
        }
      }
      patch(shown || "…", false);
    } catch {
      patch("Couldn't reach the agent. Try again in a moment.", false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="vw-root" data-theme="dark">
      <header className="vw-head">
        <span className="vw-dot" aria-hidden="true" />
        <span className="vw-title">{agentName} — live chat</span>
        <span className="vw-live mono">agent online</span>
      </header>

      <div className="vw-scroll" ref={scroller}>
        {msgs.length === 0 && !fatal && (
          <p className="vw-empty">
            Ask anything — how Veyra answers calls, what it costs, how the handoff to humans works.
          </p>
        )}
        {fatal && <p className="vw-empty">{fatal}</p>}
        {msgs.map((m) => (
          <div key={m.id} className={`vw-msg ${m.direction === "inbound" ? "vw-msg--you" : "vw-msg--agent"}`}>
            {m.body || (m.streaming ? "…" : "")}
          </div>
        ))}
      </div>

      <form
        className="vw-input"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a message…"
          aria-label="Your message"
          disabled={!!fatal}
        />
        <button type="submit" className="vw-send" disabled={busy || !draft.trim() || !!fatal} aria-label="Send">
          <Send size={14} />
        </button>
      </form>
    </div>
  );
}

export default function ChatWidgetPage() {
  return (
    <Suspense fallback={null}>
      <ChatWidget />
    </Suspense>
  );
}
