export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

const TOKEN_KEY = "rv-auth-token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

// Authorization header for the current session, merged into each request.
function authHeaders(base: Record<string, string> = {}): Record<string, string> {
  const t = getToken();
  return t ? { ...base, Authorization: `Bearer ${t}` } : base;
}

async function handle(resp: Response) {
  if (!resp.ok) {
    let detail = `${resp.status} ${resp.statusText}`;
    try {
      const body = await resp.json();
      detail =
        typeof body.detail === "string"
          ? body.detail
          : JSON.stringify(body.detail ?? body);
    } catch {}
    throw new Error(detail);
  }
  return resp.json();
}

export const api = {
  get: (path: string) => fetch(`${API_URL}${path}`, { headers: authHeaders() }).then(handle),
  post: (path: string, body?: unknown) =>
    fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then(handle),
  put: (path: string, body: unknown) =>
    fetch(`${API_URL}${path}`, {
      method: "PUT",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    }).then(handle),
  patch: (path: string, body: unknown) =>
    fetch(`${API_URL}${path}`, {
      method: "PATCH",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    }).then(handle),
  del: (path: string) =>
    fetch(`${API_URL}${path}`, { method: "DELETE", headers: authHeaders() }).then(handle),
  upload: (path: string, file: File, fields?: Record<string, string>) => {
    const form = new FormData();
    form.append("file", file);
    for (const [k, v] of Object.entries(fields ?? {})) form.append(k, v);
    return fetch(`${API_URL}${path}`, { method: "POST", body: form, headers: authHeaders() }).then(
      handle
    );
  },
};

export type Doc = {
  id: string;
  name: string;
  source_type: string;
  mime: string;
  size_bytes: number;
  n_chunks: number;
  status: "processing" | "ready" | "error";
  error?: string | null;
  content?: string;
  content_rich?: string;
  folder_id?: string | null;
  created_at: string;
  updated_at: string;
};

export type KbFolder = {
  id: string;
  name: string;
  parent_id: string | null;
  n_folders: number;
  n_files: number;
  created_at: string;
  updated_at: string;
};

export type BrowseResponse = {
  folder_id: string | null;
  breadcrumb: { id: string; name: string }[];
  folders: KbFolder[];
  files: Doc[];
};

export type WorkflowRow = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  spec: Record<string, any>;
  created_at: string;
  updated_at: string;
};

export type EvalRunRow = {
  id: string;
  status: "running" | "done" | "error";
  scenario: string;
  persona: string;
  turns: { role: string; text: string }[];
  scores: Record<string, any>;
  latency: Record<string, any>;
  error?: string | null;
  created_at: string;
};

// ── integrations ──────────────────────────────────────────────────────────

export type AppCard = {
  slug: string;
  name: string;
  description?: string;
  category: string;
  categories?: string[];
  color?: string;
  popular: boolean;
  oauth: boolean;
  no_auth?: boolean;
  managed_schemes?: string[];
  auth_schemes?: string[];
  app_url?: string | null;
  tools_count: number | null;
  triggers_count?: number;
  logo: string | null;
  connected?: boolean;
};

export type AuthField = {
  name: string;
  label: string;
  type: string;
  description: string;
  required: boolean;
  secret: boolean;
};

export type AuthSpec = { mode: string; managed: boolean; fields: AuthField[] };

export type ConnectionRow = {
  id: string;
  toolkit: string;
  app_name: string;
  status: "initiated" | "active" | "failed" | "disabled";
  connected_email?: string | null;
  tools?: { name: string; description: string }[];
  created_at: string;
  // catalog metadata so a connected card matches the library card
  logo?: string | null;
  description?: string;
  category?: string;
  tools_count?: number;
};

export type ToolRow = { slug: string; name: string; description: string };

export type CustomActionRow = {
  id: string;
  name: string;
  description: string;
  method: string;
  url: string;
  auth_type: string;
  args: { name: string; description: string; required: boolean; location: string }[];
  headers: Record<string, string>;
  enabled: boolean;
};

export type McpServerRow = {
  id: string;
  name: string;
  url: string;
  transport: string;
  auth_type: string;
  status: string;
  enabled: boolean;
  tools: { name: string; description?: string }[];
};

// ── experts ───────────────────────────────────────────────────────────────

export type ToolRef = { kind: "composio" | "action" | "mcp" | "kb"; ref: string; label: string };

export type ExpertRow = {
  id: string;
  name: string;
  description: string;
  kind: string;
  system_prompt: string;
  goal: string;
  triggers: string[];
  schedule: Record<string, any>;
  trigger_meta?: Record<string, { name?: string }>;
  app_trigger?: { toolkit?: string; slug?: string; name?: string; config?: Record<string, any> };
  schedule_label: string;
  reasoning: string;
  allowed_tools: ToolRef[];
  status: "active" | "inactive";
  external_url: string | null;
  next_run_at: string | null;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ExpertRunRow = {
  id: string;
  expert_id: string;
  trigger: string;
  status: "running" | "done" | "error";
  result: string;
  error: string | null;
  tokens: number;
  input?: string;
  steps?: { type: string; name?: string; text?: string; arguments?: any; result?: any }[];
  started_at: string;
  ended_at: string | null;
};

// ── abilities (visual node flows) ──────────────────────────────────────────

export type Branch = {
  id: string;
  label: string;
  variable?: string;
  operator?: string;
  value?: string;
  next?: string | null;
};

export type AbilityNode = {
  id: string;
  type: "start" | "ask" | "act" | "speak" | "condition" | "subflow" | "end" | "return";
  label: string;
  next?: string | null;
  position?: { x: number; y: number };
  // ask
  prompt?: string;
  save_as?: string;
  // act
  tool?: { kind: string; ref: string; label: string };
  instruction?: string;
  // speak
  text?: string;
  // condition (bounding box with dynamic branches)
  condition?: string;
  branches?: Branch[];
  then?: string; // legacy
  else?: string; // legacy
  // subflow (nested reusable flow)
  ability_id?: string;
  subflow_name?: string;
  sub_nodes?: AbilityNode[];
  sub_start?: string;
};

export type AbilityRow = {
  id: string;
  name: string;
  description: string;
  nodes: AbilityNode[];
  start_node: string;
  triggers: string[];
  global_prompt?: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};
