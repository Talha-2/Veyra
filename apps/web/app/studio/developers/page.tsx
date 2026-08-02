"use client";

import { useEffect, useState } from "react";
import {
  Check, Code2, Copy, KeyRound, Phone, Plus, Send, Terminal, Trash2, Webhook, Wrench,
} from "lucide-react";
import { api, API_URL } from "@/lib/api";
import { PageHeader, SectionCard, EmptyState, Spinner, Modal } from "@/components/ui";
import { CodeBlock, ApiPlayground } from "@/components/devtools";
import { toast } from "@/components/Toasts";

type Key = { id: string; name: string; prefix: string; last4: string; revoked: boolean; created_at: string; last_used_at: string | null };
type Hook = { id: string; url: string; events: string[]; enabled: boolean; secret_hint: string; created_at: string };

const SECTIONS: [string, string][] = [
  ["#quickstart", "Quickstart"],
  ["#keys", "API keys"],
  ["#reference", "API reference"],
  ["#webhooks", "Webhooks"],
  ["#voice", "Embed a voice call"],
  ["#tools", "Tools on your server"],
];

const B = "$BASE";

function Copyable({ value }: { value: string }) {
  const [c, setC] = useState(false);
  return (
    <button
      className="mono inline-flex items-center gap-1.5 text-[12px]"
      onClick={() => { navigator.clipboard.writeText(value); setC(true); setTimeout(() => setC(false), 1200); }}
    >
      {c ? <Check size={13} style={{ color: "var(--success)" }} /> : <Copy size={13} className="text-tertiary" />}
      <span className="truncate">{value}</span>
    </button>
  );
}

export default function DevelopersPage() {
  const [keys, setKeys] = useState<Key[]>([]);
  const [hooks, setHooks] = useState<Hook[]>([]);
  const [events, setEvents] = useState<string[]>([]);
  const [newSecret, setNewSecret] = useState<{ kind: string; secret: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [hookModal, setHookModal] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);

  const load = () => {
    api.get("/api/dev/keys").then(setKeys).catch(() => {});
    api.get("/api/dev/webhooks").then(setHooks).catch(() => {});
    api.get("/api/dev/events").then((d) => setEvents(d.events)).catch(() => {});
  };
  useEffect(load, []);

  const createKey = async () => {
    setBusy(true);
    try {
      const k = await api.post("/api/dev/keys", { name: "Secret key" });
      setNewSecret({ kind: "API key", secret: k.secret });
      toast.success("API key created", { description: "Copy it now. It is not shown again." });
      load();
    } catch (e: any) { toast.error("Could not create key", { description: e.message }); }
    finally { setBusy(false); }
  };

  const revokeKey = async (id: string) => {
    if (!confirm("Revoke this key? Requests using it fail immediately.")) return;
    try { await api.del(`/api/dev/keys/${id}`); toast.success("Key revoked"); load(); }
    catch (e: any) { toast.error("Could not revoke key", { description: e.message }); }
  };

  const testHook = async (id: string) => {
    setTesting(id);
    try {
      const r = await api.post(`/api/dev/webhooks/${id}/test`);
      if (r.ok) toast.success(`Endpoint replied ${r.status}`, { description: "Signature sent as webhook-signature." });
      else toast.error(r.status ? `Endpoint replied ${r.status}` : "Delivery failed", { description: r.error || r.response || "" });
    } catch (e: any) { toast.error("Test failed", { description: e.message }); }
    finally { setTesting(null); }
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Developers"
        description="Drive the platform from your own code. Create agents, run them, embed a live voice call in your app, and receive signed events. Everything in the studio is available over the REST API."
      />

      <div className="grid gap-8 lg:grid-cols-[176px_1fr]">
        {/* section rail */}
        <aside className="hidden lg:block">
          <div className="sticky top-6 flex flex-col gap-0.5">
            <div className="sidebar-group-label">On this page</div>
            {SECTIONS.map(([href, label]) => (
              <a key={href} href={href} className="sidebar-item" style={{ height: 32, fontSize: 13 }}>{label}</a>
            ))}
            <a
              className="sidebar-item"
              style={{ height: 32, fontSize: 13 }}
              href={`${API_URL}/v1/openapi.json`}
              target="_blank"
              rel="noreferrer"
            >
              OpenAPI spec
            </a>
          </div>
        </aside>

        <div className="min-w-0 space-y-8">
          {/* ── quickstart ── */}
          <div id="quickstart" className="scroll-mt-8">
            <SectionCard title="Quickstart" description="Authenticate, then run an agent and read its result. Three lines in any language.">
              <CodeBlock
                snippets={[
                  {
                    label: "cURL", lang: "bash",
                    code: `BASE="${API_URL}"
KEY="z360_sk_live_..."

# 1. check the key works
curl $BASE/v1/me -H "Authorization: Bearer $KEY"

# 2. run an agent and block until it finishes
curl -X POST "$BASE/v1/agents/AGENT_ID/runs?wait=true" \\
  -H "Authorization: Bearer $KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"input": "Summarize today's leads"}'`,
                  },
                  {
                    label: "Python", lang: "python",
                    code: `import requests

BASE = "${API_URL}"
KEY  = "z360_sk_live_..."
headers = {"Authorization": f"Bearer {KEY}"}

# run an agent, blocking until the result is ready
r = requests.post(
    f"{BASE}/v1/agents/AGENT_ID/runs",
    params={"wait": "true"},
    headers=headers,
    json={"input": "Summarize today's leads"},
)
run = r.json()
print(run["status"])            # success
print(run["output"]["result"])  # the agent's answer`,
                  },
                  {
                    label: "TypeScript", lang: "typescript",
                    code: `const BASE = "${API_URL}";
const KEY = process.env.RELAYVOICE_KEY!;

const res = await fetch(\`\${BASE}/v1/agents/AGENT_ID/runs?wait=true\`, {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${KEY}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ input: "Summarize today's leads" }),
});

const run = await res.json();
console.log(run.status);          // "success"
console.log(run.output.result);   // the agent's answer`,
                  },
                ]}
              />
              <p className="hint mt-3">
                Runs are async by default and return a run id immediately. Add <span className="kbd">?wait=true</span> to block,
                or subscribe to the <span className="kbd">run.completed</span> webhook.
              </p>
            </SectionCard>
          </div>

          {/* ── keys ── */}
          <div id="keys" className="scroll-mt-8">
            <SectionCard title="API keys" description="Bearer keys for the REST API. The secret is shown once, at creation.">
              <div className="mb-4 flex justify-end">
                <button className="btn btn-primary btn-sm" onClick={createKey} disabled={busy}>
                  {busy ? <Spinner size={15} /> : <Plus size={15} />} Create key
                </button>
              </div>
              {keys.length === 0 ? (
                <EmptyState icon={KeyRound} title="No API keys" body="Create a key to call the API from your own systems." />
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Name</th><th>Key</th><th>Last used</th><th></th></tr></thead>
                    <tbody>
                      {keys.map((k) => (
                        <tr key={k.id} style={k.revoked ? { opacity: 0.5 } : undefined}>
                          <td className="font-medium">{k.name}{k.revoked && <span className="badge badge-danger ml-2">revoked</span>}</td>
                          <td className="mono text-[12px]">{k.prefix}{k.last4}</td>
                          <td className="text-tertiary text-[12px]">{k.last_used_at ? new Date(k.last_used_at).toLocaleString() : "never"}</td>
                          <td className="text-right">
                            {!k.revoked && <button className="btn btn-danger-ghost btn-icon btn-sm" onClick={() => revokeKey(k.id)}><Trash2 size={14} /></button>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          </div>

          {/* ── reference / playground ── */}
          <div id="reference" className="scroll-mt-8">
            <SectionCard
              title="API reference"
              description="Every endpoint, live. Pick an operation, paste a key, and send a real request against your own deployment."
            >
              <ApiPlayground />
            </SectionCard>
          </div>

          {/* ── webhooks ── */}
          <div id="webhooks" className="scroll-mt-8">
            <SectionCard title="Webhooks" description="Signed events pushed to your server. Standard Webhooks HMAC, so any Svix compatible library verifies them.">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex flex-wrap gap-1.5">
                  {events.map((e) => <span key={e} className="badge badge-mono">{e}</span>)}
                </div>
                <button className="btn btn-primary btn-sm shrink-0" onClick={() => setHookModal(true)}><Plus size={15} /> Add endpoint</button>
              </div>

              {hooks.length === 0 ? (
                <EmptyState icon={Webhook} title="No endpoints" body="Add a URL to receive run, call, and tool events as they happen." />
              ) : (
                <div className="mb-5 space-y-2">
                  {hooks.map((h) => (
                    <div key={h.id} className="card flex items-center gap-3 p-3">
                      <div className="min-w-0 flex-1">
                        <Copyable value={h.url} />
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {h.events.map((e) => <span key={e} className="badge badge-mono">{e === "*" ? "all events" : e}</span>)}
                        </div>
                      </div>
                      <span className="mono text-tertiary shrink-0 text-[11px]">{h.secret_hint}</span>
                      <button className="btn btn-ghost btn-sm shrink-0" onClick={() => testHook(h.id)} disabled={testing === h.id}>
                        {testing === h.id ? <Spinner size={14} /> : <Send size={14} />} Test
                      </button>
                      <button
                        className="btn btn-danger-ghost btn-icon btn-sm shrink-0"
                        onClick={async () => { if (confirm("Delete endpoint?")) { await api.del(`/api/dev/webhooks/${h.id}`); toast.success("Endpoint deleted"); load(); } }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <label className="label">Verify the signature</label>
              <CodeBlock
                snippets={[
                  {
                    label: "Python", lang: "python",
                    code: `import base64, hmac, hashlib

def verify(secret: str, headers: dict, body: bytes) -> bool:
    """secret is the whsec_... value shown when you created the endpoint."""
    key = base64.b64decode(secret.split("_", 1)[1])
    signed = f"{headers['webhook-id']}.{headers['webhook-timestamp']}.".encode() + body
    expected = "v1," + base64.b64encode(
        hmac.new(key, signed, hashlib.sha256).digest()
    ).decode()
    return hmac.compare_digest(expected, headers["webhook-signature"])`,
                  },
                  {
                    label: "TypeScript", lang: "typescript",
                    code: `import crypto from "node:crypto";

export function verify(secret: string, headers: Record<string, string>, body: string) {
  const key = Buffer.from(secret.split("_")[1], "base64");
  const signed = \`\${headers["webhook-id"]}.\${headers["webhook-timestamp"]}.\${body}\`;
  const expected =
    "v1," + crypto.createHmac("sha256", key).update(signed).digest("base64");

  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(headers["webhook-signature"]),
  );
}`,
                  },
                ]}
              />
              <p className="hint mt-3">Use the Test button above to send a signed sample event and confirm your handler accepts it.</p>
            </SectionCard>
          </div>

          {/* ── embed a voice call ── */}
          <div id="voice" className="scroll-mt-8">
            <SectionCard
              title="Embed a voice call"
              description="Put a live voice agent inside your own product. Your server mints a short lived token; your frontend joins with it. Your secret key never reaches the browser."
            >
              <CodeBlock
                snippets={[
                  {
                    label: "Your server", lang: "typescript",
                    code: `// Never expose your secret key to the browser. Mint a call token server side.
app.post("/api/voice-token", async (req, res) => {
  const r = await fetch("${API_URL}/v1/calls", {
    method: "POST",
    headers: {
      Authorization: \`Bearer \${process.env.RELAYVOICE_KEY}\`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ identity: req.user.id, name: req.user.name }),
  });

  // { room, token, url, expires_in: 1800 }
  res.json(await r.json());
});`,
                  },
                  {
                    label: "Your frontend", lang: "typescript",
                    code: `// npm i livekit-client
import { Room } from "livekit-client";

const { token, url } = await fetch("/api/voice-token", { method: "POST" })
  .then((r) => r.json());

const room = new Room();
await room.connect(url, token);
await room.localParticipant.setMicrophoneEnabled(true);

// The voice agent joins the room automatically and starts talking.
room.on("trackSubscribed", (track) => {
  if (track.kind === "audio") track.attach(); // play the agent's voice
});`,
                  },
                  {
                    label: "React", lang: "tsx",
                    code: `// npm i @livekit/components-react livekit-client
import { LiveKitRoom, RoomAudioRenderer, useVoiceAssistant } from "@livekit/components-react";

export function VoiceWidget({ token, url }: { token: string; url: string }) {
  return (
    <LiveKitRoom token={token} serverUrl={url} connect audio>
      <RoomAudioRenderer />   {/* plays the agent */}
      <Transcript />
    </LiveKitRoom>
  );
}

function Transcript() {
  const { state, audioTrack } = useVoiceAssistant();
  return <p>Agent is {state}</p>;  // listening | thinking | speaking
}`,
                  },
                ]}
              />
              <p className="hint mt-3 flex items-center gap-1.5">
                <Phone size={13} /> The token expires in 30 minutes. Call <span className="kbd">POST /v1/calls</span> again for each new session.
              </p>
            </SectionCard>
          </div>

          {/* ── tools on your server ── */}
          <div id="tools" className="scroll-mt-8">
            <SectionCard
              title="Tools on your server"
              description="Let the agent call your own backend mid conversation. Define an HTTP action in Integrations, and we call your endpoint and speak the result back to the caller."
            >
              <CodeBlock
                snippets={[
                  {
                    label: "What we send", lang: "json",
                    code: `POST https://your-api.example.com/lookup-order
Content-Type: application/json

{
  "order_id": "A-1024",
  "email": "ada@example.com"
}

// Arguments are exactly the ones you declared on the action.
// The model fills them from the conversation.`,
                  },
                  {
                    label: "What you return", lang: "json",
                    code: `200 OK
Content-Type: application/json

{
  "status": "shipped",
  "carrier": "DHL",
  "eta": "Tuesday"
}

// Return plain JSON. The agent reads it and speaks a natural
// sentence: "Your order shipped with DHL and arrives Tuesday."`,
                  },
                  {
                    label: "Your handler", lang: "python",
                    code: `from fastapi import FastAPI
app = FastAPI()

@app.post("/lookup-order")
def lookup_order(body: dict):
    order = db.get(body["order_id"])
    if not order:
        # Errors are fine: the agent handles them gracefully out loud.
        return {"error": "No order with that id."}
    return {
        "status": order.status,
        "carrier": order.carrier,
        "eta": order.eta,
    }`,
                  },
                ]}
              />
              <p className="hint mt-3 flex items-center gap-1.5">
                <Wrench size={13} /> Create the action under Integrations, then attach it to an Act node in a workflow or to an agent.
              </p>
            </SectionCard>
          </div>
        </div>
      </div>

      {newSecret && (
        <Modal title={`Your ${newSecret.kind}`} onClose={() => setNewSecret(null)}>
          <p className="hint mb-3">Copy it now. For security it is not shown again.</p>
          <div className="card p-3" style={{ background: "var(--surface-sunken)" }}>
            <Copyable value={newSecret.secret} />
          </div>
          <div className="mt-4 flex justify-end"><button className="btn btn-primary" onClick={() => setNewSecret(null)}>Done</button></div>
        </Modal>
      )}

      {hookModal && (
        <WebhookModal
          events={events}
          onClose={() => setHookModal(false)}
          onSaved={(secret) => { setHookModal(false); setNewSecret({ kind: "webhook secret", secret }); toast.success("Endpoint added"); load(); }}
        />
      )}
    </div>
  );
}

function WebhookModal({ events, onClose, onSaved }: { events: string[]; onClose: () => void; onSaved: (secret: string) => void }) {
  const [url, setUrl] = useState("");
  const [selected, setSelected] = useState<string[]>(["*"]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const toggle = (e: string) =>
    setSelected((s) => (e === "*" ? ["*"] : s.includes(e) ? s.filter((x) => x !== e) : [...s.filter((x) => x !== "*"), e]));

  const save = async () => {
    setSaving(true);
    try { const r = await api.post("/api/dev/webhooks", { url, events: selected }); onSaved(r.secret); }
    catch (e: any) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal title="Add webhook endpoint" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="label">Endpoint URL</label>
          <input className="input mono" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://your.app/hooks/relayvoice" />
        </div>
        <div>
          <label className="label">Events</label>
          <div className="flex flex-wrap gap-1.5">
            {["*", ...events].map((e) => (
              <button key={e} onClick={() => toggle(e)} className={`badge ${selected.includes(e) ? "badge-accent" : "badge-mono"}`}>
                {e === "*" ? "all events" : e}
              </button>
            ))}
          </div>
        </div>
        {err && <p className="text-[13px]" style={{ color: "var(--danger)" }}>{err}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving || !url.trim()}>
            {saving && <Spinner size={15} />} Add endpoint
          </button>
        </div>
      </div>
    </Modal>
  );
}
