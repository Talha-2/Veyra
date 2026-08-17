"use client";

import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  MiniMap,
  Panel,
  Handle,
  Position,
  MarkerType,
  useNodesState,
  useEdgesState,
  useReactFlow,
  addEdge,
  type Node,
  type Edge,
  type Connection,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import Dagre from "@dagrejs/dagre";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  CircleDot,
  Code2,
  CornerUpLeft,
  GitBranch,
  Grid2x2,
  LayoutGrid,
  Maximize2,
  MessageSquare,
  Play,
  Plug,
  Plus,
  Redo2,
  Repeat,
  Rocket,
  Save,
  Search,
  SquarePen,
  Trash2,
  TriangleAlert,
  Sparkles,
  Split,
  Undo2,
  Volume2,
  Webhook,
  X,
  Zap,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { api, ToolRef, AbilityRow } from "@/lib/api";
import { Spinner } from "@/components/ui";
import { toast } from "@/components/Toasts";
import WorkflowTest from "@/components/WorkflowTest";

type NType = "start" | "trigger" | "agent" | "ask" | "act" | "speak" | "condition" | "subflow" | "webhook" | "end" | "return";

// what starts a flow. The trigger node is the entry point, n8n style: it makes
// the flow self describing instead of hiding the triggers in a side form.

// cohesive cool palette aligned to the product accent (electric blue to cyan),
// each node type a distinct hue within the brand family
const META: Record<NType, { label: string; color: string; icon: any }> = {
  start: { label: "Start", color: "#0d9488", icon: Play },        // teal
  trigger: { label: "Trigger", color: "#0d9488", icon: Zap },     // teal, the entry point
  agent: { label: "Agent", color: "#d946ef", icon: Sparkles },    // fuchsia, autonomous loop
  ask: { label: "Ask", color: "#2563eb", icon: MessageSquare },   // brand blue
  act: { label: "Act", color: "#0891b2", icon: Play },            // cyan
  condition: { label: "Condition", color: "#7c3aed", icon: GitBranch }, // violet
  subflow: { label: "Subflow", color: "#0ea5e9", icon: Repeat },  // sky
  webhook: { label: "Webhook", color: "#0891b2", icon: Webhook }, // cyan
  speak: { label: "Speak", color: "#6366f1", icon: Volume2 },     // indigo
  end: { label: "End", color: "#64748b", icon: CircleDot },       // slate
  return: { label: "Return", color: "#64748b", icon: CornerUpLeft },
};

// palette shown to the user (trigger is seeded, not addable; return only in subflows)
const PALETTE: NType[] = ["ask", "act", "agent", "webhook", "condition", "speak", "subflow", "end"];
const SUB_PALETTE: NType[] = ["ask", "act", "condition", "speak", "end"];

const OPERATORS = ["is", "is not", "contains", "greater than", "less than", "is set", "is empty"];

// condition node geometry (kept in sync with the .wf-cond CSS so branch handles align to rows)
const COND_HEAD = 60;
const COND_ROW = 34;

const uid = (p = "n") => p + "_" + Math.random().toString(36).slice(2, 9);

const clip = (s: string, n = 42) => (s.length > n ? s.slice(0, n).trimEnd() + "…" : s);

/* n8n rule: a node's subtitle comes from its parameters, not its type. "Ask node"
   tells you nothing; "saves {caller_name}" tells you what it does. */
function subtitleFor(d: any): string {
  const t = d.type as NType;
  switch (t) {
    case "ask": return d.save_as ? `saves {${d.save_as}}` : "No variable saved yet";
    case "act": return d.tool?.label ? d.tool.label : "No tool selected";
    case "speak": return d.text ? clip(d.text) : "Nothing to say yet";
    case "agent": return d.goal ? clip(d.goal) : "No goal set";
    case "subflow": return d.subflow_name || "Nested flow";
    case "webhook": return d.webhook?.url ? `${(d.webhook.method || "POST").toUpperCase()} ${clip(d.webhook.url, 26)}` : "No endpoint set";
    case "condition": return `${(d.branches || []).length} branches`;
    default: return META[t]?.label ?? "";
  }
}

/* Our answer to n8n's INPUT pane. There is no item stream to show, but every
   Ask/Act node upstream saves a variable, so walk backwards and report exactly
   what a node can reference at this point in the flow. */
export type VarRef = { name: string; from: string; type: NType };
function upstreamVars(nodeId: string, nodes: Node[], edges: Edge[]): VarRef[] {
  const byId: Record<string, Node> = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const incoming: Record<string, string[]> = {};
  edges.forEach((e) => { (incoming[e.target] ||= []).push(e.source); });

  const out: VarRef[] = [];
  const seen = new Set<string>();
  const queue = [...(incoming[nodeId] || [])];
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const d = byId[id]?.data as any;
    if (d?.save_as) out.push({ name: d.save_as, from: d.label || META[d.type as NType]?.label || "step", type: d.type });
    (incoming[id] || []).forEach((x) => queue.push(x));
  }
  return out.reverse(); // nearest step last is confusing; show flow order
}
const newBranch = (count: number) => ({ id: uid("b"), label: `Branch ${count + 1}`, variable: "", operator: "is", value: "", next: null as string | null });

const rfType = (t: NType): string =>
  t === "condition" ? "condition"
    : t === "trigger" ? "trigger"
      : t === "start" || t === "end" || t === "return" ? "terminal"
        : "flow";


/* A Composio node should look like the app it calls, not like a generic step.
   Logos live on a predictable path, so the slug alone is enough. */
const composioLogo = (ref?: string) =>
  ref ? `https://logos.composio.dev/api/${ref.toLowerCase()}` : null;

function ToolMark({ tool, size = 30 }: { tool?: any; size?: number }) {
  const [failed, setFailed] = useState(false);
  const logo = tool?.kind === "composio" ? composioLogo(tool.ref) : null;
  if (logo && !failed) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logo} alt="" className="wf-toolmark" style={{ width: size, height: size }} onError={() => setFailed(true)} />;
  }
  return null;
}

/* ─── node components (module scope so React Flow never remounts them) ───── */

// on-node remove control; deletes the node + its edges from whichever flow
// instance it belongs to (main canvas or a subflow). Start has no control.
function DeleteBtn({ id, type }: { id: string; type: NType }) {
  const rf = useReactFlow();
  if (type === "start") return null;
  return (
    <button
      className="wf-del nodrag nopan"
      title="Remove node"
      onClick={(e) => { e.stopPropagation(); rf.deleteElements({ nodes: [{ id }] }); }}
    >
      <X size={11} strokeWidth={2.5} />
    </button>
  );
}

function FlowNode({ id, data, selected }: NodeProps) {
  const d = data as any;
  const type = d.type as NType;
  const meta = META[type] ?? META.speak;
  const Icon = meta.icon;
  const preview =
    type === "speak" ? d.text
      : type === "ask" ? d.prompt
      : type === "act" ? d.instruction
      : type === "agent" ? d.goal
      : "";
  const unset = // an unconfigured node is a silent failure at call time: flag it
    (type === "act" && !d.tool) ||
    (type === "speak" && !d.text) ||
    (type === "ask" && !d.prompt) ||
    (type === "agent" && !d.goal) ||
    (type === "webhook" && !d.webhook?.url);
  return (
    <div
      className={`wf-node ${selected ? "selected" : ""}`}
      style={{ ["--node-color" as any]: meta.color, ["--node-tint" as any]: `color-mix(in srgb, ${meta.color} 14%, var(--surface))` }}
    >
      <div className="wf-node__accent" />
      <DeleteBtn id={id} type={type} />
      {unset && <span className="wf-node__warn" title="This step is not configured yet"><TriangleAlert size={10} /></span>}
      <Handle type="target" position={Position.Top} id="in" />
      <div className="wf-node__head">
        <span className="wf-node__plate">
          {d.tool?.kind === "composio" ? <ToolMark tool={d.tool} size={20} /> : null}
          {d.tool?.kind === "composio" ? null : <Icon size={15} />}
        </span>
        <div className="min-w-0">
          <div className="wf-node__title truncate">{d.label || meta.label}</div>
          <div className="wf-node__type truncate">{subtitleFor(d)}</div>
        </div>
      </div>
      {preview ? <div className="wf-node__body line-clamp-2">{preview}</div> : null}
      {type === "subflow" && <div className="wf-node__chip"><Repeat size={11} /> Nested flow</div>}
      <Handle type="source" position={Position.Bottom} id="out" />
    </div>
  );
}

function TerminalNode({ id, data, selected }: NodeProps) {
  const d = data as any;
  const type = d.type as NType;
  const isStart = type === "start";
  const isReturn = type === "return";
  const Icon = isStart ? Play : isReturn ? CornerUpLeft : CircleDot;
  return (
    <div className={`wf-term ${type} ${selected ? "selected" : ""}`}>
      <DeleteBtn id={id} type={type} />
      {!isStart && <Handle type="target" position={Position.Top} id="in" />}
      <span className="wf-term__plate"><Icon size={15} /></span>
      <span className="wf-term__label">{d.label || META[type].label}</span>
      {isStart && <Handle type="source" position={Position.Bottom} id="out" />}
    </div>
  );
}

function ConditionNode({ id, data, selected }: NodeProps) {
  const d = data as any;
  const branches: any[] = d.branches || [];
  return (
    <div className={`wf-cond ${selected ? "selected" : ""}`}>
      <DeleteBtn id={id} type="condition" />
      <Handle type="target" position={Position.Top} id="in" />
      <div className="wf-cond__head">
        <span className="wf-cond__plate"><GitBranch size={14} /></span>
        <div className="min-w-0">
          <div className="wf-cond__title truncate">{d.label || "Condition"}</div>
          <div className="wf-cond__eyebrow">Condition</div>
        </div>
      </div>
      <div className="wf-cond__branches">
        {branches.map((b: any) => (
          // handle nests inside its row (position:relative), so it centers on the row via CSS
          <div key={b.id} className="wf-cond__branch">
            <span className="wf-cond__branch-label">{b.label}</span>
            <span className="wf-cond__branch-pred truncate">
              {b.variable ? `${b.variable} ${b.operator} ${b.value}`.trim() : "otherwise"}
            </span>
            <Handle type="source" position={Position.Right} id={b.id} style={{ top: "50%", right: -5 }} />
          </div>
        ))}
        <div className="wf-cond__addrow">
          <Plus size={12} /> Drag out to branch
          <Handle type="source" position={Position.Right} id="add" className="wf-cond__addhandle" style={{ top: "50%", right: -5 }} />
        </div>
      </div>
    </div>
  );
}

/* The trigger: what starts this flow, and therefore which runtime executes it.
   Rendered as the entry point so the flow explains itself at a glance. */
function TriggerNode({ id, data, selected }: NodeProps) {
  const d = data as any;
  const phrases: string[] = (d.phrases || []).filter(Boolean);
  const summary = phrases.length
    ? `Listens for ${phrases.length} phrase${phrases.length === 1 ? "" : "s"}`
    : "Add the phrases that start this flow";
  return (
    <div className={`wf-trigger ${selected ? "selected" : ""}`}>
      <DeleteBtn id={id} type="trigger" />
      <div className="wf-trigger__cap">
        <span className="wf-trigger__badge"><Zap size={13} /></span>
        <span className="wf-trigger__eyebrow">Start</span>
      </div>
      <div className="wf-trigger__main">
        <div className="wf-trigger__title truncate">{phrases[0] || "When the caller begins"}</div>
        <div className="wf-trigger__summary truncate">{summary}</div>
      </div>
      <Handle type="source" position={Position.Bottom} id="out" />
    </div>
  );
}

const nodeTypes: NodeTypes = { flow: FlowNode, condition: ConditionNode, terminal: TerminalNode, trigger: TriggerNode };

/* ─── graph <-> ability model ───────────────────────────────────────────── */

/* Every node has one source handle and may have many edges leaving it, one per
   pathway. The pathway id lives in edge.data.pid so the label survives edits. */
function mkEdge(source: string, pid: string, target: string, label?: string): Edge {
  return {
    id: `${source}:${pid}->${target}`,
    source,
    target,
    sourceHandle: "out",
    label,
    data: { pid },
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
  };
}

/* A pathway is one way out of a node, carrying a natural language label the
   agent routes on ("caller wants to change details"). Every node can have
   several. This is the core of the model, so reading a graph means turning each
   node's pathways into edges, and older shapes (a bare `next`, or a condition
   node's `branches`) are migrated on the way in. */
function pathwaysOf(n: any): any[] {
  if (n.pathways?.length) return n.pathways.filter((p: any) => p.next);
  if (n.type === "condition" && n.branches?.length) {
    return n.branches.filter((b: any) => b.next).map((b: any) => ({
      id: b.id, label: b.label || "branch", next: b.next,
      description: b.variable ? `${b.variable} ${b.operator} ${b.value}`.trim() : "",
    }));
  }
  const nxt = n.next || n.then;
  return nxt ? [{ id: "out", label: "", next: nxt, always: true }] : [];
}

function toFlow(nodesIn: any[]): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = (nodesIn || []).map((n: any, i: number) => ({
    id: n.id,
    type: rfType(n.type),
    // condition nodes become ordinary nodes: pathways make them redundant
    position: n.position || { x: 60, y: i * 150 },
    data: { ...n, pathways: pathwaysOf(n) },
    deletable: n.type !== "start" && n.type !== "trigger", // the entry point is fixed
  }));
  const edges: Edge[] = [];
  for (const n of nodesIn || []) {
    for (const p of pathwaysOf(n)) {
      const pid = p.id || "out";
      edges.push({
        ...mkEdge(n.id, pid, p.next, p.label || undefined),
        data: { pid, description: p.description || "", always: !!p.always },
      });
    }
  }
  return { nodes, edges };
}

function findTarget(edges: Edge[], source: string, handle: string): string | null {
  return edges.find((e) => e.source === source && (e.sourceHandle || "out") === handle)?.target ?? null;
}

function toModel(nodes: Node[], edges: Edge[]): { nodes: any[]; start_node: string } {
  const outgoing: Record<string, Edge[]> = {};
  edges.forEach((e) => { (outgoing[e.source] ||= []).push(e); });
  const incoming = new Set(edges.map((e) => e.target));
  const startNode = nodes.find((n) => (n.data as any).type === "start")
    || nodes.find((n) => !incoming.has(n.id))
    || nodes[0];
  const start = startNode?.id || "";

  // BFS from start for a stable authored order
  const byId: Record<string, Node> = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const order: Node[] = [];
  const seen = new Set<string>();
  const queue = start ? [start] : nodes.map((n) => n.id);
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id) || !byId[id]) continue;
    seen.add(id); order.push(byId[id]);
    (outgoing[id] || []).forEach((e) => queue.push(e.target));
  }
  nodes.forEach((n) => { if (!seen.has(n.id)) order.push(n); });

  const out = order.map((n) => {
    const d: any = { ...(n.data as any), id: n.id, position: n.position };
    delete d.then; delete d.else; delete d.branches; // superseded by pathways
    // pathways are rebuilt from the live edges, so the canvas is the source of truth
    const mine = (outgoing[n.id] || []).map((e) => ({
      id: (e.data as any)?.pid || e.id,
      label: typeof e.label === "string" ? e.label : "",
      description: (e.data as any)?.description || "",
      always: !!(e.data as any)?.always,
      next: e.target,
    }));
    d.pathways = mine;
    // keep `next` in sync for the single unlabelled case, so older readers still work
    d.next = mine.length === 1 && !mine[0].label ? mine[0].next : null;
    return d;
  });
  return { nodes: out, start_node: start };
}

function nodeSize(n: Node): { width: number; height: number } {
  const t = (n.data as any).type as NType;
  if (t === "condition") return { width: 252, height: COND_HEAD + ((n.data as any).branches?.length || 0) * COND_ROW + 40 };
  if (t === "start" || t === "end" || t === "return") return { width: 150, height: 54 };
  return { width: 244, height: 96 };
}

function autoLayout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 60, ranksep: 74 });
  edges.forEach((e) => g.setEdge(e.source, e.target));
  nodes.forEach((n) => { const s = nodeSize(n); g.setNode(n.id, s); });
  Dagre.layout(g);
  return nodes.map((n) => {
    const p = g.node(n.id); const s = nodeSize(n);
    return p ? { ...n, position: { x: p.x - s.width / 2, y: p.y - s.height / 2 } } : n;
  });
}

/* ─── shared canvas backgrounds (fine dots over a coarse grid) ──────────── */
function GridBackground({ grid }: { grid: boolean }) {
  return grid ? (
    <>
      <Background id="a" variant={BackgroundVariant.Lines} gap={24} lineWidth={1} color="var(--wf-grid)" />
      <Background id="b" variant={BackgroundVariant.Lines} gap={120} lineWidth={1} color="var(--wf-grid-bold)" />
    </>
  ) : (
    <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="var(--border)" />
  );
}

/* ─── canvas toolbar (floats over the flow) ─────────────────────────────── */
function CanvasToolbar({
  onUndo, onRedo, canUndo, canRedo, onTidy, grid, onToggleGrid, onDelete, canDelete,
}: {
  onUndo: () => void; onRedo: () => void; canUndo: boolean; canRedo: boolean;
  onTidy: () => void; grid: boolean; onToggleGrid: () => void; onDelete: () => void; canDelete: boolean;
}) {
  const rf = useReactFlow();
  const B = ({ children, onClick, disabled, title, active }: any) => (
    <button className={`wf-tool ${active ? "active" : ""}`} onClick={onClick} disabled={disabled} title={title} type="button">{children}</button>
  );
  return (
    <Panel position="top-left">
      <div className="wf-toolbar">
        <B onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl Z)"><Undo2 size={15} /></B>
        <B onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl Shift Z)"><Redo2 size={15} /></B>
        <span className="wf-tool-sep" />
        <B onClick={() => rf.zoomIn()} title="Zoom in"><ZoomIn size={15} /></B>
        <B onClick={() => rf.zoomOut()} title="Zoom out"><ZoomOut size={15} /></B>
        <B onClick={() => rf.fitView({ padding: 0.2, duration: 300 })} title="Fit to view"><Maximize2 size={15} /></B>
        <span className="wf-tool-sep" />
        <B onClick={onTidy} title="Tidy layout"><LayoutGrid size={15} /></B>
        <B onClick={onToggleGrid} active={grid} title="Toggle grid"><Grid2x2 size={15} /></B>
        <span className="wf-tool-sep" />
        <B onClick={onDelete} disabled={!canDelete} title="Delete selection (Del)"><Trash2 size={15} /></B>
      </div>
    </Panel>
  );
}

/* ─── main builder ──────────────────────────────────────────────────────── */
function Builder() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [triggers, setTriggers] = useState<string[]>([]);
  const [globalPrompt, setGlobalPrompt] = useState("");
  const [liveVersion, setLiveVersion] = useState(0);
  const [versions, setVersions] = useState<any[]>([]);
  const [verOpen, setVerOpen] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [abilities, setAbilities] = useState<AbilityRow[]>([]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [selEdge, setSelEdge] = useState<string | null>(null);
  const [tools, setTools] = useState<ToolRef[]>([]);
  const [tab, setTab] = useState<"nodes" | "test" | "details">("nodes");
  const [view, setView] = useState<"create" | "developer">("create");
  const [grid, setGrid] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [subflowFor, setSubflowFor] = useState<string | null>(null);

  // undo / redo history
  const graphRef = useRef<{ nodes: Node[]; edges: Edge[] }>({ nodes: [], edges: [] });
  graphRef.current = { nodes, edges };
  const past = useRef<{ nodes: Node[]; edges: Edge[] }[]>([]);
  const future = useRef<{ nodes: Node[]; edges: Edge[] }[]>([]);
  const [histTick, setHistTick] = useState(0);
  const snapshot = useCallback(() => {
    past.current.push(structuredClone(graphRef.current));
    if (past.current.length > 80) past.current.shift();
    future.current = [];
    setHistTick((t) => t + 1);
  }, []);
  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(structuredClone(graphRef.current));
    setNodes(prev.nodes); setEdges(prev.edges); setDirty(true); setHistTick((t) => t + 1);
  }, [setNodes, setEdges]);
  const redo = useCallback(() => {
    const nxt = future.current.pop();
    if (!nxt) return;
    past.current.push(structuredClone(graphRef.current));
    setNodes(nxt.nodes); setEdges(nxt.edges); setDirty(true); setHistTick((t) => t + 1);
  }, [setNodes, setEdges]);

  useEffect(() => {
    api.get(`/api/abilities/${id}`).then((a) => {
      setName(a.name); setDescription(a.description); setEnabled(a.enabled); setTriggers(a.triggers || []); setGlobalPrompt(a.global_prompt || ""); setLiveVersion(a.live_version || 0);
      let src: any[] = a.nodes || [];
      // Every flow begins at a trigger. Older flows seeded a plain Start node:
      // promote it in place so the graph keeps its shape and its edges.
      const legacyStart = src.find((n) => n.type === "start");
      if (legacyStart) {
        legacyStart.type = "trigger";
        legacyStart.label = "Trigger";
        legacyStart.trigger_kind = "phrase";
        legacyStart.phrases = a.triggers || [];
      } else if (!src.some((n) => n.type === "trigger")) {
        src = [{
          id: uid("trg"), type: "trigger", label: "Trigger",
          trigger_kind: "phrase", phrases: a.triggers || [],
          next: src[0]?.id || null,
        }, ...src];
      }
      if (!src.some((n) => n.type === "end")) {
        src = [...src, { id: uid("end"), type: "end", label: "End" }];
      }
      const f = toFlow(src);
      const needLayout = src.some((n) => !n.position);
      setNodes(needLayout ? autoLayout(f.nodes, f.edges) : f.nodes);
      setEdges(f.edges);
      setLoaded(true);
    }).catch(() => setLoaded(true));

    Promise.allSettled([api.get("/api/integrations/connections"), api.get("/api/integrations/actions")]).then(([c, ac]) => {
      const list: ToolRef[] = [{ kind: "kb", ref: "knowledge_base", label: "Knowledge Base" }];
      if (c.status === "fulfilled") c.value.filter((x: any) => x.status === "active").forEach((x: any) => list.push({ kind: "composio", ref: x.toolkit, label: x.app_name || x.toolkit }));
      if (ac.status === "fulfilled") ac.value.forEach((x: any) => list.push({ kind: "action", ref: x.id, label: x.name }));
      setTools(list);
    });
    api.get(`/api/abilities/${id}/versions`).then((r) => { setVersions(r.versions || []); setLiveVersion(r.live_version || 0); }).catch(() => {});
    // other workflows this subflow node can reference as a reusable flow
    api.get("/api/abilities").then((all: AbilityRow[]) => setAbilities(all.filter((a) => a.id !== id))).catch(() => {});
  }, [id, setNodes, setEdges]);

  const onConnect = useCallback((c: Connection) => {
    snapshot();
    // Each connection is a new pathway out of the node. A node may have many:
    // that is how the agent gets a choice, so we never replace an existing one.
    const existing = graphRef.current.edges.filter((e) => e.source === c.source).length;
    const pid = uid("p");
    setEdges((eds) =>
      addEdge(
        {
          ...c,
          id: `${c.source}:${pid}->${c.target}`,
          sourceHandle: "out",
          // the first way out needs no label; once there is a choice, it does
          label: existing === 0 ? undefined : `Pathway ${existing + 1}`,
          data: { pid, description: "", always: false },
          markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
        },
        eds,
      ),
    );
    setDirty(true);
  }, [setNodes, setEdges, snapshot]);

  // strict flow: reject self loops (single next per handle is enforced on connect)
  const isValidConnection = useCallback((c: Connection | Edge) => (c as any).source !== (c as any).target, []);

  const addNode = (type: NType) => {
    snapshot();
    const base: any = { type, label: META[type].label };
    if (type === "condition") base.branches = [newBranch(0), { ...newBranch(1), label: "Otherwise" }];
    if (type === "subflow") { base.subflow_name = "Subflow"; base.sub_nodes = []; base.sub_start = ""; }
    const n: Node = { id: uid(), type: rfType(type), position: { x: 320, y: 120 + nodes.length * 26 }, data: base };
    setNodes((nds) => [...nds, n]);
    setSel(n.id); setDirty(true);
  };

  // an app from the library is an Act node already bound to that tool

  const patchNode = (patch: any) => {
    setNodes((nds) => nds.map((n) => (n.id === sel ? { ...n, data: { ...n.data, ...patch } } : n)));
    setDirty(true);
  };
  // keep branch edge labels in sync when a branch is renamed
  const patchBranch = (bid: string, patch: any) => {
    setNodes((nds) => nds.map((n) => {
      if (n.id !== sel) return n;
      const branches = ((n.data as any).branches || []).map((b: any) => (b.id === bid ? { ...b, ...patch } : b));
      return { ...n, data: { ...n.data, branches } };
    }));
    if (patch.label !== undefined) {
      setEdges((eds) => eds.map((e) => (e.source === sel && e.sourceHandle === bid ? { ...e, label: patch.label } : e)));
    }
    setDirty(true);
  };
  const addBranch = () => {
    snapshot();
    setNodes((nds) => nds.map((n) => {
      if (n.id !== sel) return n;
      const branches = (n.data as any).branches || [];
      return { ...n, data: { ...n.data, branches: [...branches, newBranch(branches.length)] } };
    }));
    setDirty(true);
  };
  const removeBranch = (bid: string) => {
    snapshot();
    setNodes((nds) => nds.map((n) => {
      if (n.id !== sel) return n;
      const branches = ((n.data as any).branches || []).filter((b: any) => b.id !== bid);
      return { ...n, data: { ...n.data, branches } };
    }));
    setEdges((eds) => eds.filter((e) => !(e.source === sel && e.sourceHandle === bid)));
    setDirty(true);
  };

  const deleteSelected = () => {
    if (!sel) return;
    const t = (nodes.find((n) => n.id === sel)?.data as any)?.type;
    if (t === "start" || t === "trigger") { toast.error("Every flow needs its trigger"); return; }
    snapshot();
    setNodes((nds) => nds.filter((n) => n.id !== sel));
    setEdges((eds) => eds.filter((e) => e.source !== sel && e.target !== sel));
    setSel(null); setDirty(true);
  };

  const patchEdge = (patch: { label?: string; description?: string; always?: boolean }) => {
    setEdges((eds) => eds.map((e) => {
      if (e.id !== selEdge) return e;
      const next: any = { ...e, data: { ...(e.data as any) } };
      if (patch.label !== undefined) next.label = patch.label;
      if (patch.description !== undefined) next.data.description = patch.description;
      if (patch.always !== undefined) next.data.always = patch.always;
      return next;
    }));
    setDirty(true);
  };
  const deleteEdge = () => {
    snapshot();
    setEdges((eds) => eds.filter((e) => e.id !== selEdge));
    setSelEdge(null); setDirty(true);
  };

  const tidy = () => { snapshot(); setNodes((nds) => autoLayout(nds, edges)); setDirty(true); };

  const saveSubflow = (nodeId: string, payload: { name: string; sub_nodes: any[]; sub_start: string }) => {
    setNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, subflow_name: payload.name, sub_nodes: payload.sub_nodes, sub_start: payload.sub_start } } : n)));
    setDirty(true);
    toast.success("Subflow saved");
  };

  const validate = (): string[] => {
    const issues: string[] = [];
    const incoming = new Set(edges.map((e) => e.target));
    const outgoing = new Set(edges.map((e) => e.source));

    // a {variable} that no upstream step creates is a silent failure at call
    // time: the agent reads the braces aloud or invents a value
    for (const n of nodes) {
      const d = n.data as any;
      const text = [d.text, d.prompt, d.instruction, d.goal].filter(Boolean).join(" ");
      if (!text) continue;
      const known = new Set(upstreamVars(n.id, nodes, edges).map((v) => v.name));
      const used = [...text.matchAll(/\{([a-zA-Z_][\w]*)\}/g)].map((m) => m[1]);
      for (const v of new Set(used)) {
        if (!known.has(v)) {
          issues.push(`"${d.label || META[d.type as NType].label}" uses {${v}} but no earlier step saves it`);
        }
      }
    }
    // The entry point is a trigger (older flows used a plain Start node); either
    // one satisfies "where does this begin", and neither needs an incoming edge.
    const isEntry = (nd: any) => nd.type === "trigger" || nd.type === "start";
    if (!nodes.some((n) => isEntry(n.data))) issues.push("No trigger — every flow needs a starting point");
    if (!nodes.some((n) => (n.data as any).type === "end")) issues.push("No End node");
    for (const n of nodes) {
      const t = (n.data as any).type as NType;
      const label = (n.data as any).label || META[t].label;
      if (!isEntry(n.data) && !incoming.has(n.id)) issues.push(`"${label}" is not connected`);
      if (t !== "end" && t !== "return" && t !== "condition" && !outgoing.has(n.id)) issues.push(`"${label}" has no next step`);
      if (t === "condition" && !((n.data as any).branches || []).some((b: any) => b.next)) issues.push(`"${label}" has no connected branch`);
      // An Action with nothing connected still reads as a real step on the
      // canvas, but the agent has no way to perform it and will improvise a
      // tool call out loud. This is the single most expensive gap to miss.
      // Template placeholders are exempt: they are intentional "wire your tool
      // here" scaffolding and deploy with graceful degradation, so a freshly
      // created template saves cleanly.
      if (t === "act" && !((n.data as any).tool || {}).ref && !(n.data as any).placeholder)
        issues.push(`"${label}" has no tool connected`);
      if (t === "webhook" && !((n.data as any).webhook || {}).url) issues.push(`"${label}" has no URL set`);
    }
    return issues;
  };

  const persist = async (publish: boolean) => {
    setSaving(true);
    try {
      const { nodes: aNodes, start_node } = toModel(nodes, edges);
      const nextEnabled = publish ? true : enabled;
      await api.put(`/api/abilities/${id}`, { name, description, enabled: nextEnabled, nodes: aNodes, start_node, triggers, global_prompt: globalPrompt });
      setEnabled(nextEnabled); setDirty(false);
      toast.success(publish ? "Workflow saved" : "Draft saved");
    } catch (e: any) {
      toast.error("Save failed", { description: e.message });
    } finally { setSaving(false); }
  };
  const save = () => {
    const issues = validate();
    if (issues.length) { toast.error(`${issues.length} issue${issues.length > 1 ? "s" : ""} to fix`, { description: issues.slice(0, 3).join("; ") }); return; }
    persist(true);
  };

  const deploy = async () => {
    const issues = validate();
    if (issues.length) { toast.error(`Fix ${issues.length} issue${issues.length > 1 ? "s" : ""} before deploying`, { description: issues.slice(0, 2).join("; ") }); return; }
    setDeploying(true);
    try {
      if (dirty) await persist(false);   // never deploy something that is not saved
      const r = await api.post(`/api/abilities/${id}/deploy`, { note: "" });
      setLiveVersion(r.deployed);
      const vs = await api.get(`/api/abilities/${id}/versions`);
      setVersions(vs.versions || []);
      setEnabled(true);
      toast.success(`Deployed version ${r.deployed}`, { description: "Live calls now run this pathway." });
    } catch (e: any) {
      toast.error("Deploy failed", { description: e.message });
    } finally { setDeploying(false); }
  };

  const restoreVersion = async (v: number) => {
    if (!confirm(`Restore version ${v} onto the canvas? Your unsaved draft will be replaced.`)) return;
    try {
      const a = await api.post(`/api/abilities/${id}/restore/${v}`, {});
      const f = toFlow(a.nodes || []);
      setNodes(f.nodes); setEdges(f.edges);
      setGlobalPrompt(a.global_prompt || ""); setTriggers(a.triggers || []);
      setVerOpen(false); setDirty(true);
      toast.success(`Version ${v} restored to the draft`, { description: "Deploy it when you are ready." });
    } catch (e: any) {
      toast.error("Restore failed", { description: e.message });
    }
  };

  const remove = async () => { if (!confirm(`Delete workflow "${name}"?`)) return; await api.del(`/api/abilities/${id}`); router.push("/studio/workflows"); };

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const tag = (e.target as HTMLElement)?.tagName;
      if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); save(); }
      else if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) { if (tag === "INPUT" || tag === "TEXTAREA") return; e.preventDefault(); undo(); }
      else if (mod && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) { if (tag === "INPUT" || tag === "TEXTAREA") return; e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const selected = useMemo(() => nodes.find((n) => n.id === sel) || null, [nodes, sel]);
  const selectedEdge = useMemo(() => edges.find((e) => e.id === selEdge) || null, [edges, selEdge]);
  const nodeLabel = (nid: string) => {
    const d = nodes.find((n) => n.id === nid)?.data as any;
    return d?.label || META[d?.type as NType]?.label || "step";
  };
  const model = useMemo(() => (loaded ? { name, description, enabled, ...toModel(nodes, edges) } : null), [loaded, name, description, enabled, nodes, edges]);
  const subflowNode = subflowFor ? nodes.find((n) => n.id === subflowFor) : null;

  const applyDeveloper = (parsed: any) => {
    snapshot();
    if (typeof parsed.name === "string") setName(parsed.name);
    if (typeof parsed.description === "string") setDescription(parsed.description);
    if (typeof parsed.enabled === "boolean") setEnabled(parsed.enabled);
    const f = toFlow(parsed.nodes || []);
    const needLayout = (parsed.nodes || []).some((n: any) => !n.position);
    setNodes(needLayout ? autoLayout(f.nodes, f.edges) : f.nodes);
    setEdges(f.edges);
    setDirty(true); setView("create");
    toast.success("Applied to canvas");
  };

  return (
    <div className="studio-shell fixed inset-0 z-[35] flex flex-col" style={{ background: "var(--bg)" }}>
      {/* top bar */}
      <div className="flex items-center justify-between gap-3 px-5 py-3" style={{ borderBottom: "1px solid var(--border)", background: "var(--surface)" }}>
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/studio/workflows" className="btn btn-ghost btn-sm"><ArrowLeft size={15} /> Workflows</Link>
          <input className="title min-w-0 bg-transparent text-[18px] outline-none" value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} placeholder="Workflow name" />

          {/* what is on the canvas vs what calls actually run */}
          <div className="relative">
            <button className="ver-pill" onClick={() => setVerOpen((o) => !o)} title="Version history">
              <span className={`ver-dot ${liveVersion ? "live" : ""}`} />
              {liveVersion ? `Live v${liveVersion}` : "Not deployed"}
              {dirty && <span className="ver-draft">draft</span>}
              <ChevronDown size={13} />
            </button>
            {verOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setVerOpen(false)} />
                <div className="ver-menu">
                  <div className="ver-menu__head">Version history</div>
                  {versions.length === 0 ? (
                    <p className="text-tertiary px-3 py-3 text-[12px]">Never deployed. The canvas is a draft, and calls will not run it until you deploy.</p>
                  ) : versions.map((v) => (
                    <div key={v.version} className="ver-item">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[12.5px] font-semibold">v{v.version}</span>
                          {v.is_live && <span className="badge badge-success">live</span>}
                        </div>
                        <div className="text-tertiary text-[11px]">
                          {v.nodes} nodes · {new Date(v.created_at).toLocaleString()}
                        </div>
                      </div>
                      {!v.is_live && (
                        <button className="btn btn-ghost btn-sm" onClick={() => restoreVersion(v.version)}>Restore</button>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {/* Create | Developer switcher */}
          <div className="wf-switch">
            <button className={view === "create" ? "active" : ""} onClick={() => setView("create")} type="button"><SquarePen size={14} /> Create</button>
            <button className={view === "developer" ? "active" : ""} onClick={() => setView("developer")} type="button"><Code2 size={14} /> Developer</button>
          </div>
          <span className="wf-tool-sep" style={{ height: 22 }} />
          {dirty && <span className="text-tertiary text-[12px]">Unsaved</span>}
          <button className="btn btn-danger-ghost btn-icon btn-sm" onClick={remove} title="Delete workflow"><Trash2 size={15} /></button>
          <button className="btn btn-ghost btn-sm" onClick={() => persist(false)} disabled={saving}><Save size={15} /> Save draft</button>
          <button className="btn btn-secondary btn-sm" onClick={save} disabled={saving}>{saving ? <Spinner size={15} /> : <Check size={15} />} Save</button>
          <button className="btn btn-primary btn-sm" onClick={deploy} disabled={deploying || saving} title="Freeze this draft as a version and send it live">
            {deploying ? <Spinner size={15} /> : <Rocket size={15} />} Deploy
          </button>
        </div>
      </div>

      {view === "developer" ? (
        <DeveloperView id={id} model={model} onApply={applyDeveloper} />
      ) : (
        <div className="flex min-h-0 flex-1">
          {/* canvas */}
          <div className="relative min-w-0 flex-1">
            {loaded && (
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodesChange={(c) => { onNodesChange(c); if (c.some((x) => x.type === "position" && (x as any).dragging === false)) setDirty(true); }}
                onEdgesChange={(c) => { onEdgesChange(c); setDirty(true); }}
                onConnect={onConnect}
                isValidConnection={isValidConnection}
                onNodeClick={(_, n) => { setSel(n.id); setSelEdge(null); }}
                onEdgeClick={(_, e) => { setSelEdge(e.id); setSel(null); }}
                onNodeDragStart={() => snapshot()}
                onPaneClick={() => { setSel(null); setSelEdge(null); }}
                fitView
                minZoom={0.2}
                deleteKeyCode={["Backspace", "Delete"]}
                proOptions={{ hideAttribution: true }}
                defaultEdgeOptions={{ style: { stroke: "var(--wf-edge)", strokeWidth: 1.75 } }}
              >
                <GridBackground grid={grid} />
                <CanvasToolbar
                  onUndo={undo} onRedo={redo} canUndo={past.current.length > 0} canRedo={future.current.length > 0}
                  onTidy={tidy} grid={grid} onToggleGrid={() => setGrid((g) => !g)} onDelete={deleteSelected} canDelete={!!sel}
                />
                <Panel position="bottom-right"><span className="wf-hint-kbd">Ctrl S save · Ctrl Z undo · Del remove</span></Panel>
                <MiniMap pannable zoomable className="wf-minimap" nodeColor={(n) => META[(n.data as any).type as NType]?.color || "#888"} maskColor="color-mix(in srgb, var(--bg) 62%, transparent)" />
              </ReactFlow>
            )}
          </div>

          {/* right panel */}
          <div className="w-[368px] shrink-0 overflow-y-auto" style={{ borderLeft: "1px solid var(--border)", background: "var(--surface)" }}>
            <div className="p-4">
              {selectedEdge ? (
                <PathwayInspector
                  key={selectedEdge.id}
                  edge={selectedEdge}
                  sourceLabel={nodeLabel(selectedEdge.source)}
                  targetLabel={nodeLabel(selectedEdge.target)}
                  onChange={patchEdge}
                  onDelete={deleteEdge}
                  onBack={() => setSelEdge(null)}
                />
              ) : selected ? (
                <NodeInspector
                  key={selected.id}
                  node={selected}
                  tools={tools}
                  abilities={abilities}
                  vars={upstreamVars(selected.id, nodes, edges)}
                  onChange={patchNode}
                  onBranch={patchBranch}
                  onAddBranch={addBranch}
                  onRemoveBranch={removeBranch}
                  onOpenSubflow={() => setSubflowFor(selected.id)}
                  onOpenExisting={(aid) => router.push(`/studio/workflows/${aid}`)}
                  onDelete={deleteSelected}
                  onBack={() => setSel(null)}
                />
              ) : (
                <>
                  <div className="mb-4 flex gap-1" style={{ borderBottom: "1px solid var(--border)" }}>
                    {(["nodes", "test", "details"] as const).map((t) => (
                      <button key={t} onClick={() => setTab(t)} className="relative px-3 py-2 text-[13px] font-medium" style={{ color: tab === t ? "var(--text-primary)" : "var(--text-tertiary)" }}>
                        {t === "nodes" ? "Nodes" : t === "test" ? "Test" : "Flow details"}
                        {tab === t && <span className="absolute inset-x-2 -bottom-px h-0.5" style={{ background: "var(--accent)" }} />}
                      </button>
                    ))}
                  </div>
                  {tab === "nodes" ? (
                    <NodeLibrary palette={PALETTE} onAddNode={addNode} />
                  ) : tab === "test" ? (
                    <>
                      {dirty && (
                        <div className="mb-3 flex items-start gap-2 rounded-[var(--radius-sm)] p-2.5 text-[12px]"
                          style={{ background: "var(--warning-subtle)", border: "1px solid var(--warning-border)" }}>
                          <TriangleAlert size={13} style={{ color: "var(--warning)", marginTop: 1 }} />
                          <span>You have unsaved changes. The test runs the last saved version.</span>
                        </div>
                      )}
                      <WorkflowTest abilityId={id} />
                    </>
                  ) : (
                    <div className="space-y-4">
                      <div><label className="label">Description</label><textarea className="textarea min-h-[70px]" value={description} onChange={(e) => { setDescription(e.target.value); setDirty(true); }} placeholder="What this workflow does and when the agent should follow it." /></div>

                      <div>
                        <label className="label">Global prompt</label>
                        <textarea
                          className="textarea min-h-[100px]"
                          value={globalPrompt}
                          onChange={(e) => { setGlobalPrompt(e.target.value); setDirty(true); }}
                          placeholder="You are Ana at Northwind Plumbing. Never quote a price you have not looked up. If unsure, offer a callback."
                        />
                        <p className="hint mt-1.5">Applies in every node, unless a node turns it off in its Settings tab. Put identity and hard rules here, not step instructions.</p>
                      </div>

                      <div>
                        <div className="mb-1.5 flex items-center justify-between">
                          <label className="label mb-0">Triggers</label>
                          <button className="btn btn-ghost btn-sm" onClick={() => { setTriggers((t) => [...t, ""]); setDirty(true); }}><Plus size={13} /> Add</button>
                        </div>
                        <p className="hint mb-2.5">Phrases or intents that start this workflow when the caller says something like them.</p>
                        <div className="space-y-2">
                          {triggers.length === 0 && <p className="text-tertiary text-[12px]">No triggers yet. The agent uses this workflow only when you attach it directly.</p>}
                          {triggers.map((t, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <span className="wf-trigger-dot" />
                              <input className="input h-9 flex-1 text-[13px]" value={t} onChange={(e) => { setTriggers((arr) => arr.map((x, j) => (j === i ? e.target.value : x))); setDirty(true); }} placeholder="When someone asks to book an appointment" />
                              <button className="btn btn-danger-ghost btn-icon btn-sm" onClick={() => { setTriggers((arr) => arr.filter((_, j) => j !== i)); setDirty(true); }}><X size={13} /></button>
                            </div>
                          ))}
                        </div>
                      </div>

                      <label className="flex items-center justify-between text-[13px] font-medium">Published<button className="switch" role="switch" aria-checked={enabled} onClick={() => { setEnabled(!enabled); setDirty(true); }} /></label>
                      <p className="hint">Attach this workflow to the voice agent in Voice Tuning so it is followed on calls. Save draft keeps it private while you build.</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {subflowNode && (
        <SubflowModal
          node={subflowNode}
          tools={tools}
          grid={grid}
          onClose={() => setSubflowFor(null)}
          onSave={(payload) => { saveSubflow(subflowNode.id, payload); setSubflowFor(null); }}
        />
      )}
    </div>
  );
}

const PAL_DESC: Record<NType, string> = {
  start: "Entry point", trigger: "What starts this flow", agent: "Works autonomously",
  ask: "Collect an answer", act: "Call a tool", condition: "Branch on logic",
  speak: "Say a line", subflow: "Nested reusable flow", webhook: "Call an API", end: "Finish the call", return: "Back to parent",
};

/* The node library lists STEP TYPES only. Tools are not here on purpose: a tool
   is something an Act step calls, chosen inside that step, so listing tools here
   too would be two doors to the same room. Steps are grouped by what they do, so
   the palette reads as a menu of capabilities rather than a flat list. */
const PAL_GROUPS: { title: string; hint: string; types: NType[] }[] = [
  { title: "Converse", hint: "Talk with the caller", types: ["ask", "speak"] },
  { title: "Act", hint: "Do something in the world", types: ["act", "webhook", "agent"] },
  { title: "Branch", hint: "Decide the path", types: ["condition", "subflow"] },
  { title: "Finish", hint: "End the flow", types: ["end"] },
];

function NodeLibrary({ onAddNode, palette }: { onAddNode: (t: NType) => void; palette: NType[] }) {
  const [q, setQ] = useState("");
  const ql = q.trim().toLowerCase();
  const inPalette = new Set(palette);
  const match = (t: NType) =>
    inPalette.has(t) && (!ql || META[t].label.toLowerCase().includes(ql) || PAL_DESC[t].toLowerCase().includes(ql));

  const groups = PAL_GROUPS.map((g) => ({ ...g, types: g.types.filter(match) })).filter((g) => g.types.length);

  return (
    <div>
      <div className="relative mb-3">
        <Search size={15} className="text-tertiary absolute left-2.5 top-1/2 -translate-y-1/2" />
        <input
          className="input h-9 pl-8 text-[13px]"
          placeholder="Search steps"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {groups.map((g) => (
        <div key={g.title} className="mb-4">
          <div className="wf-lib__group">
            {g.title} <span className="wf-lib__grouphint">{g.hint}</span>
          </div>
          <div className="wf-pal__grid">
            {g.types.map((t) => {
              const m = META[t]; const Icon = m.icon;
              return (
                <button key={t} onClick={() => onAddNode(t)} className="wf-pal"
                  style={{ ["--pal" as any]: m.color }}>
                  <span className="wf-pal__plate"><Icon size={16} /></span>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="wf-pal__name">{m.label}</span>
                    <span className="wf-pal__desc">{PAL_DESC[t]}</span>
                  </span>
                  <Plus size={15} className="wf-pal__add" />
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {groups.length === 0 && (
        <p className="text-tertiary py-8 text-center text-[13px]">Nothing matches that search.</p>
      )}

      <Link href="/studio/integrations" className="wf-lib__more">
        <Plug size={13} /> Connect apps for Act steps
      </Link>
    </div>
  );
}

/* ─── node inspector (with condition branch editor + subflow launcher) ──── */
/* n8n shows the data arriving at a node. We have no item stream, but we do have
   variables: this is every one an upstream step saved, so you never guess. */
function VarsPanel({ vars, onInsert }: { vars: VarRef[]; onInsert?: (token: string) => void }) {
  if (vars.length === 0) {
    return (
      <div className="wf-vars">
        <div className="wf-vars__label">Variables available here</div>
        <p className="text-tertiary text-[12px]">
          None yet. An Ask or Act step earlier in the flow creates variables you can use here.
        </p>
      </div>
    );
  }
  return (
    <div className="wf-vars">
      <div className="wf-vars__label">Variables available here</div>
      <div className="flex flex-wrap gap-1.5">
        {vars.map((v) => (
          <button
            key={v.name}
            className="wf-var"
            title={`Saved by ${v.from}. Click to insert.`}
            onClick={() => onInsert?.(`{${v.name}}`)}
          >
            <span className="wf-var__dot" style={{ background: META[v.type]?.color || "var(--accent)" }} />
            {v.name}
          </button>
        ))}
      </div>
      <p className="hint mt-2">Click to copy a variable. Write it as {"{name}"} and the agent fills it in as it speaks.</p>
    </div>
  );
}

/* Picking a connected app is only half the job. An app is 60+ actions, so this
   lets you choose the actual action and fill its real parameters, with the
   variables the flow already collected offered as values. */
function ComposioAction({ tool, d, onChange, vars }: { tool: any; d: any; onChange: (p: any) => void; vars: VarRef[] }) {
  const [actions, setActions] = useState<any[] | null>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const chosen = d.action || null;

  useEffect(() => {
    if (!tool?.ref) return;
    setActions(null);
    const p = new URLSearchParams({ q, limit: "40" });
    api.get(`/api/integrations/apps/${tool.ref}/tools?${p}`)
      .then((r) => setActions(r.tools || []))
      .catch(() => setActions([]));
  }, [tool?.ref, q]);

  const pick = (a: any) => {
    onChange({ action: { slug: a.slug, name: a.name, params: a.params || [] }, action_args: d.action_args || {} });
    setOpen(false);
  };
  const setArg = (name: string, value: string) =>
    onChange({ action_args: { ...(d.action_args || {}), [name]: value } });

  return (
    <>
      <div>
        <label className="label">Action</label>
        {chosen ? (
          <div className="cx-chosen">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold">{chosen.name}</div>
              <div className="mono text-tertiary truncate text-[10.5px]">{chosen.slug}</div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>Change</button>
          </div>
        ) : (
          <button className="btn btn-secondary w-full" onClick={() => setOpen(true)}>
            <Search size={14} /> Choose an action
          </button>
        )}
        {!chosen && <p className="hint mt-1.5">{tool.label} exposes many actions. Pick the one this step performs.</p>}
      </div>

      {open && (
        <div className="cx-picker">
          <div className="relative mb-2">
            <Search size={14} className="text-tertiary absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input className="input h-8 pl-8 text-[12.5px]" autoFocus value={q}
              onChange={(e) => setQ(e.target.value)} placeholder={`Search ${tool.label} actions`} />
          </div>
          <div className="cx-list">
            {actions === null ? (
              <div className="flex items-center gap-2 p-3"><Spinner size={14} /> <span className="text-tertiary text-[12px]">Loading actions</span></div>
            ) : actions.length === 0 ? (
              <p className="text-tertiary p-3 text-[12px]">No actions match that.</p>
            ) : actions.map((a) => (
              <button key={a.slug} className="cx-item" onClick={() => pick(a)}>
                <div className="min-w-0">
                  <div className="truncate text-[12.5px] font-medium">{a.name}</div>
                  <div className="mono text-tertiary truncate text-[10px]">{a.slug}</div>
                </div>
                <span className="badge badge-mono shrink-0">{(a.params || []).length}</span>
              </button>
            ))}
          </div>
          <button className="btn btn-ghost btn-sm mt-2 w-full" onClick={() => setOpen(false)}>Cancel</button>
        </div>
      )}

      {chosen?.params?.length > 0 && (
        <div>
          <label className="label">Parameters</label>
          <p className="hint mb-2.5">Leave a field empty and the agent fills it from the conversation. Use {"{variable}"} to pass something you already collected.</p>
          <div className="space-y-2.5">
            {chosen.params.map((p: any) => (
              <div key={p.name}>
                <div className="mb-1 flex items-center gap-1.5">
                  <span className="mono text-[11.5px] font-medium">{p.name}</span>
                  {p.required && <span className="cx-req">required</span>}
                  <span className="text-tertiary text-[10px]">{p.type}</span>
                </div>
                {p.enum ? (
                  <select className="select h-8 text-[12px]" value={(d.action_args || {})[p.name] || ""} onChange={(e) => setArg(p.name, e.target.value)}>
                    <option value="">Let the agent decide</option>
                    {p.enum.map((o: string) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input className="input mono h-8 text-[12px]" value={(d.action_args || {})[p.name] || ""}
                    onChange={(e) => setArg(p.name, e.target.value)}
                    placeholder={p.default != null ? String(p.default) : (vars[0] ? `{${vars[0].name}}` : "")} />
                )}
                {p.description && <p className="hint mt-1">{p.description}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/* The webhook node. The Test button is the important part: you run the request
   from here and map response variables off a real payload, rather than guessing
   JSON paths from an API doc and finding out on a live call. */
function WebhookConfig({ d, onChange, vars }: { d: any; onChange: (p: any) => void; vars: VarRef[] }) {
  const wh = d.webhook || { method: "POST", url: "", headers: [], body: "", timeout: 10, response_vars: [] };
  const set = (patch: any) => onChange({ webhook: { ...wh, ...patch } });
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<any>(null);

  const runTest = async () => {
    setTesting(true); setResult(null);
    try {
      // sample values for {variables}, so the request is shaped like the real one
      const sample: Record<string, string> = {};
      vars.forEach((v) => { sample[v.name] = `sample_${v.name}`; });
      const r = await api.post("/api/abilities/webhook/test", { ...wh, variables: sample });
      setResult(r);
      if (r.ok) toast.success(`${r.status} in ${r.ms} ms`);
      else toast.error(r.error || `Request returned ${r.status}`);
    } catch (e: any) {
      toast.error("Test failed", { description: e.message });
    } finally { setTesting(false); }
  };

  const rvars = wh.response_vars || [];
  const setRvars = (next: any[]) => set({ response_vars: next });

  return (
    <>
      <div>
        <label className="label">Endpoint</label>
        <div className="flex gap-2">
          <select className="select w-[92px]" value={wh.method || "POST"} onChange={(e) => set({ method: e.target.value })}>
            {["POST", "GET", "PUT", "PATCH", "DELETE"].map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <input className="input mono flex-1 text-[12px]" value={wh.url || ""} onChange={(e) => set({ url: e.target.value })} placeholder="https://api.yourservice.com/slots" />
        </div>
        <p className="hint mt-1.5">Use {"{variable}"} anywhere in the URL, headers or body and it is filled in at call time.</p>
      </div>

      <div>
        <label className="label">Authorization (optional)</label>
        <input className="input mono text-[12px]" value={wh.auth_value || ""} onChange={(e) => set({ auth_value: e.target.value })} placeholder="Bearer sk_live_..." />
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="label mb-0">Headers</label>
          <button className="btn btn-ghost btn-sm" onClick={() => set({ headers: [...(wh.headers || []), { name: "", value: "" }] })}><Plus size={13} /> Add</button>
        </div>
        {(wh.headers || []).map((h: any, i: number) => (
          <div key={i} className="mb-2 flex items-center gap-2">
            <input className="input mono h-8 flex-1 text-[12px]" value={h.name || ""} onChange={(e) => set({ headers: wh.headers.map((x: any, j: number) => (j === i ? { ...x, name: e.target.value } : x)) })} placeholder="Content-Type" />
            <input className="input mono h-8 flex-1 text-[12px]" value={h.value || ""} onChange={(e) => set({ headers: wh.headers.map((x: any, j: number) => (j === i ? { ...x, value: e.target.value } : x)) })} placeholder="application/json" />
            <button className="btn btn-danger-ghost btn-icon btn-sm" onClick={() => set({ headers: wh.headers.filter((_: any, j: number) => j !== i) })}><X size={12} /></button>
          </div>
        ))}
      </div>

      {wh.method !== "GET" && (
        <div>
          <label className="label">Request body (JSON)</label>
          <textarea className="textarea mono min-h-[92px] text-[12px]" value={wh.body || ""} onChange={(e) => set({ body: e.target.value })} placeholder={'{\n  "date": "{preferred_time}"\n}'} />
        </div>
      )}

      <div className="flex items-end gap-2">
        <div className="w-[110px]">
          <label className="label">Timeout</label>
          <input className="input h-9" type="number" min={1} max={30} value={wh.timeout ?? 10} onChange={(e) => set({ timeout: parseFloat(e.target.value) })} />
        </div>
        <button className="btn btn-secondary flex-1" onClick={runTest} disabled={testing || !wh.url}>
          {testing ? <Spinner size={14} /> : <Play size={14} />} Test API request
        </button>
      </div>

      {result && (
        <div className="wh-result">
          <div className="mb-2 flex items-center gap-2">
            <span className={`badge ${result.ok ? "badge-success" : "badge-danger"}`}>
              {result.status ? `HTTP ${result.status}` : "failed"}
            </span>
            {result.ms != null && <span className="mono text-tertiary text-[11px] tabular-nums">{result.ms} ms</span>}
          </div>
          {result.error && <p className="text-[12px]" style={{ color: "var(--danger)" }}>{result.error}</p>}
          {(result.json || result.text) && (
            <pre className="wh-json">{result.text || JSON.stringify(result.json, null, 2).slice(0, 1200)}</pre>
          )}
        </div>
      )}

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="label mb-0">Response variables</label>
          <button className="btn btn-ghost btn-sm" onClick={() => setRvars([...rvars, { name: "", path: "", description: "" }])}><Plus size={13} /> Add</button>
        </div>
        <p className="hint mb-2.5">Pull values out of the response so the agent gets a variable, not a wall of JSON. Run the test above and pick from the paths it found.</p>
        {rvars.length === 0 && <p className="text-tertiary text-[12px]">Nothing mapped from the response.</p>}
        <div className="space-y-2.5">
          {rvars.map((v: any, i: number) => (
            <div key={i} className="nd-var">
              <div className="mb-2 flex items-center gap-2">
                <input className="input mono h-8 flex-1 text-[12px]" value={v.name || ""} onChange={(e) => setRvars(rvars.map((x: any, j: number) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="available_slots" />
                <button className="btn btn-danger-ghost btn-icon btn-sm" onClick={() => setRvars(rvars.filter((_: any, j: number) => j !== i))}><X size={12} /></button>
              </div>
              <input className="input mono h-8 text-[12px]" value={v.path || ""} onChange={(e) => setRvars(rvars.map((x: any, j: number) => (j === i ? { ...x, path: e.target.value } : x)))} placeholder="$.data.slots" />
              {result?.suggestions?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {result.suggestions.slice(0, 8).map((p: string) => (
                    <button key={p} className="wh-path" onClick={() => setRvars(rvars.map((x: any, j: number) => (j === i ? { ...x, path: p } : x)))}>{p}</button>
                  ))}
                </div>
              )}
              {result?.extracted?.[v.name] !== undefined && (
                <p className="hint mt-1.5">got: <span className="mono">{JSON.stringify(result.extracted[v.name])?.slice(0, 70)}</span></p>
              )}
            </div>
          ))}
        </div>
      </div>

      <div>
        <label className="label">Say while it runs</label>
        <input className="input" value={d.say_while_waiting || ""} onChange={(e) => onChange({ say_while_waiting: e.target.value })} placeholder="Let me check what we have available." />
        <p className="hint mt-1.5">Silence during an API call sounds like a dropped line. Fill it.</p>
      </div>
    </>
  );
}

/* Clicking a pathway opens this. The label is what the agent reads when it
   decides which way to go, so it is the single most important field on the
   canvas: it should read like the situation it describes. */
function PathwayInspector({
  edge, sourceLabel, targetLabel, onChange, onDelete, onBack,
}: {
  edge: Edge;
  sourceLabel: string;
  targetLabel: string;
  onChange: (patch: { label?: string; description?: string; always?: boolean }) => void;
  onDelete: () => void;
  onBack: () => void;
}) {
  const label = typeof edge.label === "string" ? edge.label : "";
  const d = (edge.data as any) || {};
  return (
    <div>
      <button className="btn btn-ghost btn-sm mb-3" onClick={onBack}><ArrowLeft size={14} /> Back to canvas</button>

      <div className="pw-head">
        <Split size={15} />
        <div className="min-w-0">
          <div className="text-[13px] font-semibold">Pathway</div>
          <div className="text-tertiary truncate text-[11px]">{sourceLabel} → {targetLabel}</div>
        </div>
        <button className="btn btn-danger-ghost btn-icon btn-sm ml-auto" onClick={onDelete} title="Remove pathway">
          <Trash2 size={14} />
        </button>
      </div>

      <p className="hint mb-4">How should the agent decide? It reads the labels on every pathway out of a node and picks the one that matches what actually happened.</p>

      <div className="space-y-4">
        <div>
          <label className="label">Pathway label</label>
          <textarea
            className="textarea min-h-[64px]"
            value={label}
            maxLength={100}
            onChange={(e) => onChange({ label: e.target.value })}
            placeholder="Caller wants to change details"
          />
          <div className="mt-1 flex items-center justify-between">
            <p className="hint">Short and specific, describing when this path is taken.</p>
            <span className="text-tertiary mono text-[11px]">{label.length}/100</span>
          </div>
        </div>

        <div>
          <label className="label">Description (optional)</label>
          <textarea
            className="textarea min-h-[80px]"
            value={d.description || ""}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="More context on when to choose this, if the label alone is ambiguous."
          />
        </div>

        <label className="flex items-center justify-between text-[13px] font-medium">
          Always take this pathway
          <button
            className="switch"
            role="switch"
            aria-checked={!!d.always}
            onClick={() => onChange({ always: !d.always })}
          />
        </label>
        <p className="hint">Use for the fall through path when nothing else matches.</p>
      </div>
    </div>
  );
}

function NodeInspector({
  node, tools, abilities = [], vars = [], onChange, onBranch, onAddBranch, onRemoveBranch, onOpenSubflow, onOpenExisting, onDelete, onBack,
}: {
  node: Node; tools: ToolRef[]; abilities?: AbilityRow[]; vars?: VarRef[]; onChange: (p: any) => void;
  onBranch: (bid: string, p: any) => void; onAddBranch: () => void; onRemoveBranch: (bid: string) => void;
  onOpenSubflow: () => void; onOpenExisting?: (aid: string) => void; onDelete: () => void; onBack: () => void;
}) {
  const d = node.data as any;
  const type = d.type as NType;
  const meta = META[type]; const Icon = meta.icon;
  const isStart = type === "start" || type === "trigger";
  const phrases: string[] = d.phrases || [];
  const setPhrases = (next: string[]) => onChange({ phrases: next });
  const [ntab, setNtab] = useState<"prompt" | "standards" | "settings">("prompt");
  const settings = d.settings || {};
  const setSetting = (k: string, v: any) => onChange({ settings: { ...settings, [k]: v } });

  return (
    <div>
      <button className="btn btn-ghost btn-sm mb-3" onClick={onBack}><ArrowLeft size={14} /> Back to canvas</button>
      <div className="mb-3 flex items-center gap-2.5 rounded-[var(--radius-md)] px-3 py-2.5" style={{ background: `color-mix(in srgb, ${meta.color} 12%, var(--surface))`, border: `1px solid color-mix(in srgb, ${meta.color} 35%, transparent)` }}>
        <Icon size={16} style={{ color: meta.color }} />
        <div className="min-w-0"><div className="truncate text-[13px] font-semibold">{d.label || meta.label}</div><div className="mono text-[10px] uppercase tracking-wider" style={{ color: meta.color }}>{meta.label} node</div></div>
        {!isStart && <button className="btn btn-danger-ghost btn-icon btn-sm ml-auto" onClick={onDelete}><Trash2 size={14} /></button>}
      </div>

      {/* a node is a small configuration surface, not one form */}
      <div className="nd-tabs">
        {(["prompt", "standards", "settings"] as const).map((t) => (
          <button key={t} onClick={() => setNtab(t)} className={ntab === t ? "active" : ""}>{t}</button>
        ))}
      </div>


      {ntab === "standards" && (
        <div className="space-y-3">
          <p className="hint">
            Standards are the behaviour you expect at this node. Change the prompt, run them again, and you find out
            immediately whether you broke something that used to work.
          </p>
          <div className="nd-standard">
            <div className="text-[13px] font-semibold">Dialogue</div>
            <p className="hint mt-0.5">Simulate a call and check the agent says the right kind of thing here.</p>
          </div>
          <div className="nd-standard">
            <div className="text-[13px] font-semibold">Pathway choice</div>
            <p className="hint mt-0.5">Check it leaves by the pathway you would expect.</p>
          </div>
          <p className="hint">Run these from the Test tab, which exercises the whole flow end to end.</p>
        </div>
      )}

      {ntab === "settings" && (
        <div className="space-y-4">
          <div>
            <label className="label">Temperature <span className="mono text-tertiary">{settings.temperature ?? 0.3}</span></label>
            <input
              type="range" className="slider" min={0} max={1} step={0.05}
              value={settings.temperature ?? 0.3}
              onChange={(e) => setSetting("temperature", parseFloat(e.target.value))}
              style={{ "--slider-fill": `${((settings.temperature ?? 0.3) / 1) * 100}%` } as React.CSSProperties}
            />
            <p className="hint mt-1.5">Low keeps the wording tight and predictable. Raise it only where you want variety.</p>
          </div>

          {[
            ["skip_response", "Skip the caller's reply", "Continue straight on without waiting."],
            ["block_interruptions", "Block interruptions", "The caller cannot cut in. Use for disclosures that must play in full."],
            ["include_global_prompt", "Include global prompt", "Apply the pathway wide instructions in this node."],
          ].map(([k, title, hint]) => (
            <div key={k as string}>
              <label className="flex items-center justify-between text-[13px] font-medium">
                {title}
                <button
                  className="switch" role="switch"
                  aria-checked={k === "include_global_prompt" ? settings[k as string] !== false : !!settings[k as string]}
                  onClick={() => setSetting(k as string, k === "include_global_prompt" ? !(settings[k as string] !== false) : !settings[k as string])}
                />
              </label>
              <p className="hint mt-0.5">{hint}</p>
            </div>
          ))}

          <div className="pt-1">
            <div className="label mb-2">Data control and privacy</div>
            {[
              ["disable_recording", "Disable recording", "No audio kept for this node."],
              ["disable_logging", "Disable logging", "Nothing said here is written to the transcript."],
            ].map(([k, title, hint]) => (
              <div key={k as string} className="mb-3">
                <label className="flex items-center justify-between text-[13px] font-medium">
                  {title}
                  <button className="switch" role="switch" aria-checked={!!settings[k as string]}
                    onClick={() => setSetting(k as string, !settings[k as string])} />
                </label>
                <p className="hint mt-0.5">{hint}</p>
              </div>
            ))}
            <p className="hint">Turn both on for the node that takes card or health details.</p>
          </div>
        </div>
      )}

      <div className="space-y-4" style={{ display: ntab === "prompt" ? undefined : "none" }}>
        <div><label className="label">Label</label><input className="input" value={d.label || ""} onChange={(e) => onChange({ label: e.target.value })} /></div>

        {/* what this step can reference, computed from the steps above it */}
        {["speak", "ask", "act", "agent", "condition"].includes(type) && (
          <VarsPanel vars={vars} onInsert={(token) => navigator.clipboard.writeText(token)} />
        )}

        {type === "start" && <p className="hint">Every call begins here. Connect the Start node to the first step of your flow.</p>}

        {type === "trigger" && (
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="label mb-0">Starting phrases</label>
              <button className="btn btn-ghost btn-sm" onClick={() => setPhrases([...phrases, ""])}><Plus size={13} /> Add</button>
            </div>
            <p className="hint mb-2.5">What a caller might say to begin this flow. The agent matches meaning, not exact words — two or three natural examples are enough.</p>
            <div className="space-y-2">
              {phrases.length === 0 && <p className="text-tertiary text-[12px]">No phrases yet. Add what a caller might say.</p>}
              {phrases.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="wf-trigger-dot" />
                  <input
                    className="input h-9 flex-1 text-[13px]"
                    value={p}
                    onChange={(e) => setPhrases(phrases.map((x, j) => (j === i ? e.target.value : x)))}
                    placeholder="When someone asks to book an appointment"
                  />
                  <button className="btn btn-danger-ghost btn-icon btn-sm" onClick={() => setPhrases(phrases.filter((_, j) => j !== i))}><X size={13} /></button>
                </div>
              ))}
            </div>
            <p className="hint mt-3">To begin the moment a call connects instead, leave phrases empty and attach the flow in Voice Tuning. Schedules and external triggers live on the Experts page.</p>
          </div>
        )}

        {type === "agent" && <>
          <div><label className="label">Goal</label><textarea className="textarea min-h-[110px]" value={d.goal || ""} onChange={(e) => onChange({ goal: e.target.value })} placeholder="Look up the caller in the CRM and summarise their last order." /></div>
          <div>
            <label className="label">Effort</label>
            <select className="select" value={d.reasoning || "balanced"} onChange={(e) => onChange({ reasoning: e.target.value })}>
              <option value="fast">Fast · fewest steps, lowest latency</option>
              <option value="balanced">Balanced</option>
              <option value="deep">Deep · more tool steps, thorough</option>
            </select>
          </div>
          <p className="hint">The agent node runs its own tool loop until it reaches the goal, then hands the result back to the flow. Every step is recorded in Executions.</p>
        </>}

        {type === "speak" && <div><label className="label">What to speak</label><textarea className="textarea min-h-[150px]" value={d.text || ""} onChange={(e) => onChange({ text: e.target.value })} placeholder="Use {variables} you collected earlier." /></div>}

        {type === "ask" && <>
          <div><label className="label">Question</label><textarea className="textarea min-h-[110px]" value={d.prompt || ""} onChange={(e) => onChange({ prompt: e.target.value })} placeholder="What is your full name?" /></div>
          <div><label className="label">Save answer as</label><input className="input mono" value={d.save_as || ""} onChange={(e) => onChange({ save_as: e.target.value })} placeholder="caller_name" /></div>
        </>}

        {type === "act" && <>
          <div><label className="label">Tool</label>
            <select className="select" value={d.tool ? `${d.tool.kind}:${d.tool.ref}` : ""} onChange={(e) => { const t = tools.find((x) => `${x.kind}:${x.ref}` === e.target.value); onChange({ tool: t ? { kind: t.kind, ref: t.ref, label: t.label } : undefined }); }}>
              <option value="">Select a tool</option>
              {tools.map((t) => <option key={`${t.kind}:${t.ref}`} value={`${t.kind}:${t.ref}`}>{t.label} ({t.kind})</option>)}
            </select>
            {!d.tool && <p className="hint mt-1.5">Pick a tool first. Connect more in Integrations.</p>}
          </div>

          {/* a connected app is many actions: choose which one, and fill its real fields */}
          {d.tool?.kind === "composio" && (
            <>
              <div className="cx-app">
                <ToolMark tool={d.tool} size={26} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold">{d.tool.label}</div>
                  <div className="text-tertiary text-[11px]">connected app</div>
                </div>
              </div>
              <ComposioAction tool={d.tool} d={d} onChange={onChange} vars={vars} />
            </>
          )}

          {/* the rest only makes sense once a tool is chosen */}
          {d.tool && <>
            <div><label className="label">Instruction</label><textarea className="textarea min-h-[100px]" value={d.instruction || ""} onChange={(e) => onChange({ instruction: e.target.value })} placeholder="Create a contact with the details you collected." /></div>
            <div><label className="label">Save result as</label><input className="input mono" value={d.save_as || ""} onChange={(e) => onChange({ save_as: e.target.value })} placeholder="context" /></div>
          </>}
        </>}

        {type === "condition" && <>
          <div><label className="label">What is being decided</label><input className="input" value={d.condition || ""} onChange={(e) => onChange({ condition: e.target.value })} placeholder="Route by caller type" /></div>
          <div className="flex items-center justify-between">
            <label className="label mb-0">Branches</label>
            <button className="btn btn-ghost btn-sm" onClick={onAddBranch}><Plus size={13} /> Add branch</button>
          </div>
          <div className="space-y-3">
            {(d.branches || []).map((b: any, i: number) => (
              <div key={b.id} className="wf-branch-card">
                <div className="mb-2 flex items-center gap-2">
                  <span className="wf-branch-dot" />
                  <input className="input h-8 flex-1 text-[13px]" value={b.label} onChange={(e) => onBranch(b.id, { label: e.target.value })} />
                  <button className="btn btn-danger-ghost btn-icon btn-sm" onClick={() => onRemoveBranch(b.id)}><X size={13} /></button>
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <input className="input h-8 mono text-[12px]" value={b.variable || ""} onChange={(e) => onBranch(b.id, { variable: e.target.value })} placeholder="variable" />
                  <select className="select h-8 text-[12px]" value={b.operator || "is"} onChange={(e) => onBranch(b.id, { operator: e.target.value })}>
                    {OPERATORS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                {b.operator !== "is set" && b.operator !== "is empty" && (
                  <input className="input mt-2 h-8 text-[12px]" value={b.value || ""} onChange={(e) => onBranch(b.id, { value: e.target.value })} placeholder="value" />
                )}
              </div>
            ))}
          </div>
          <p className="hint">Each branch is a source handle on the node. Drag from a branch to the step it should lead to. Leave a branch empty to make it the otherwise path.</p>
        </>}

        {type === "subflow" && <>
          <div><label className="label">Subflow name</label><input className="input" value={d.subflow_name || ""} onChange={(e) => onChange({ subflow_name: e.target.value })} placeholder="Subflow" /></div>
          <div>
            <label className="label">Use an existing workflow</label>
            <select className="select" value={d.ability_id || ""} onChange={(e) => { const a = abilities.find((x) => x.id === e.target.value); onChange({ ability_id: e.target.value || undefined, subflow_name: a ? a.name : d.subflow_name }); }}>
              <option value="">None, edit inline steps below</option>
              {abilities.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          {d.ability_id ? (
            <button className="btn btn-secondary w-full" onClick={() => onOpenExisting?.(d.ability_id)}><SquarePen size={15} /> Open referenced workflow</button>
          ) : <>
            <button className="btn btn-secondary w-full" onClick={onOpenSubflow}><Repeat size={15} /> Open subflow editor</button>
            <p className="hint">{(d.sub_nodes?.length || 0)} step{(d.sub_nodes?.length || 0) === 1 ? "" : "s"} in this nested flow. It runs inline, then returns to the parent.</p>
          </>}
        </>}

        {type === "webhook" && <WebhookConfig d={d} onChange={onChange} vars={vars} />}

        {type === "end" && <p className="hint">The conversation wraps up politely and ends here.</p>}

        {!isStart && type !== "end" && <>

          {/* the agent stays put until this is true: the thing that stops it racing ahead */}
          <div>
            <label className="label">Stay in this node until</label>
            <textarea
              className="textarea min-h-[64px]"
              value={d.loop_condition || ""}
              onChange={(e) => onChange({ loop_condition: e.target.value })}
              placeholder="The caller has given a time and confirmed it back."
            />
            <p className="hint mt-1.5">Leave empty to move on as soon as the step is done.</p>
          </div>
        </>}
      </div>
    </div>
  );
}

/* ─── subflow editor (nested canvas in a modal) ─────────────────────────── */
function SubflowInner({
  node, tools, grid, onClose, onSave,
}: {
  node: Node; tools: ToolRef[]; grid: boolean; onClose: () => void; onSave: (p: { name: string; sub_nodes: any[]; sub_start: string }) => void;
}) {
  const d = node.data as any;
  const [name, setName] = useState(d.subflow_name || "Subflow");
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [sel, setSel] = useState<string | null>(null);

  useEffect(() => {
    let src: any[] = d.sub_nodes || [];
    if (!src.some((n) => n.type === "start")) {
      const startId = uid("start");
      src = [{ id: startId, type: "start", label: "Start", next: src[0]?.id || null }, ...src];
    }
    if (!src.some((n) => n.type === "return")) src = [...src, { id: uid("ret"), type: "return", label: "Return" }];
    const f = toFlow(src);
    const need = src.some((n) => !n.position);
    setNodes(need ? autoLayout(f.nodes, f.edges) : f.nodes);
    setEdges(f.edges);
  }, [d.sub_nodes, setNodes, setEdges]);

  const onConnect = useCallback((c: Connection) => {
    const handle = c.sourceHandle || "out";
    if (handle === "add") {
      const src = nodes.find((n) => n.id === c.source);
      const branches = ((src?.data as any)?.branches || []) as any[];
      const b = newBranch(branches.length); b.next = c.target;
      setNodes((nds) => nds.map((n) => (n.id === c.source ? { ...n, data: { ...n.data, branches: [...branches, b] } } : n)));
      setEdges((eds) => addEdge({ ...c, sourceHandle: b.id, label: b.label, markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 } }, eds));
      return;
    }
    const src = nodes.find((n) => n.id === c.source);
    const branch = ((src?.data as any)?.branches || []).find((b: any) => b.id === handle);
    setEdges((eds) => addEdge({ ...c, sourceHandle: handle, label: branch?.label, markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 } }, eds.filter((e) => !(e.source === c.source && (e.sourceHandle || "out") === handle))));
  }, [nodes, setNodes, setEdges]);

  const addNode = (type: NType) => {
    const base: any = { type, label: META[type].label };
    if (type === "condition") base.branches = [newBranch(0), { ...newBranch(1), label: "Otherwise" }];
    const n: Node = { id: uid(), type: rfType(type), position: { x: 300, y: 120 + nodes.length * 26 }, data: base };
    setNodes((nds) => [...nds, n]); setSel(n.id);
  };
  const patch = (p: any) => { setNodes((nds) => nds.map((n) => (n.id === sel ? { ...n, data: { ...n.data, ...p } } : n))); };
  const patchBranch = (bid: string, p: any) => {
    setNodes((nds) => nds.map((n) => (n.id === sel ? { ...n, data: { ...n.data, branches: ((n.data as any).branches || []).map((b: any) => (b.id === bid ? { ...b, ...p } : b)) } } : n)));
    if (p.label !== undefined) setEdges((eds) => eds.map((e) => (e.source === sel && e.sourceHandle === bid ? { ...e, label: p.label } : e)));
  };
  const addBranch = () => setNodes((nds) => nds.map((n) => { if (n.id !== sel) return n; const branches = (n.data as any).branches || []; return { ...n, data: { ...n.data, branches: [...branches, newBranch(branches.length)] } }; }));
  const removeBranch = (bid: string) => { setNodes((nds) => nds.map((n) => (n.id === sel ? { ...n, data: { ...n.data, branches: ((n.data as any).branches || []).filter((b: any) => b.id !== bid) } } : n))); setEdges((eds) => eds.filter((e) => !(e.source === sel && e.sourceHandle === bid))); };
  const del = (nid: string) => {
    if ((nodes.find((n) => n.id === nid)?.data as any)?.type === "start") { toast.error("The Start node cannot be deleted"); return; }
    setNodes((nds) => nds.filter((n) => n.id !== nid)); setEdges((eds) => eds.filter((e) => e.source !== nid && e.target !== nid)); setSel(null);
  };
  const selected = nodes.find((n) => n.id === sel) || null;

  const save = () => {
    const { nodes: sub_nodes, start_node } = toModel(nodes, edges);
    onSave({ name, sub_nodes, sub_start: start_node });
  };

  return (
    <div className="wf-sub-modal">
      <div className="wf-sub-head">
        <div className="min-w-0">
          <input className="title bg-transparent text-[17px] outline-none" value={name} onChange={(e) => setName(e.target.value)} />
          <p className="hint mt-0.5">Edit the reusable steps that run for this subflow, then return to the parent flow.</p>
        </div>
        <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={17} /></button>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          <ReactFlow
            nodes={nodes} edges={edges} nodeTypes={nodeTypes}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
            isValidConnection={(c) => (c as any).source !== (c as any).target}
            onNodeClick={(_, n) => setSel(n.id)} onPaneClick={() => setSel(null)}
            fitView minZoom={0.2} deleteKeyCode={["Backspace", "Delete"]} proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={{ style: { stroke: "var(--wf-edge)", strokeWidth: 1.75 } }}
          >
            <GridBackground grid={grid} />
            <MiniMap pannable zoomable className="wf-minimap" nodeColor={(n) => META[(n.data as any).type as NType]?.color || "#888"} />
          </ReactFlow>
        </div>
        <div className="w-[320px] shrink-0 overflow-y-auto p-4" style={{ borderLeft: "1px solid var(--border)", background: "var(--surface)" }}>
          {selected ? (
            <NodeInspector
              key={selected.id}
              node={selected}
              tools={tools}
              vars={upstreamVars(selected.id, nodes, edges)}
              onChange={patch}
              onBranch={patchBranch}
              onAddBranch={addBranch}
              onRemoveBranch={removeBranch}
              onOpenSubflow={() => {}}
              onDelete={() => del(selected.id)}
              onBack={() => setSel(null)}
            />
          ) : (
            <NodeLibrary palette={SUB_PALETTE} onAddNode={addNode} />
          )}
        </div>
      </div>

      <div className="wf-sub-foot">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save}><Check size={15} /> Save subflow</button>
      </div>
    </div>
  );
}

function SubflowModal(props: { node: Node; tools: ToolRef[]; grid: boolean; onClose: () => void; onSave: (p: { name: string; sub_nodes: any[]; sub_start: string }) => void }) {
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <ReactFlowProvider>
        <SubflowInner {...props} />
      </ReactFlowProvider>
    </div>
  );
}

/* ─── developer view (graph JSON + compiled preview) ────────────────────── */
function DeveloperView({ id, model, onApply }: { id: string; model: any; onApply: (parsed: any) => void }) {
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [compiled, setCompiled] = useState<{ script: string; tools: any[] } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => { if (model) setText(JSON.stringify(model, null, 2)); }, [model]);
  useEffect(() => { api.get(`/api/abilities/${id}/compiled`).then(setCompiled).catch(() => {}); }, [id]);

  const format = () => { try { setText(JSON.stringify(JSON.parse(text), null, 2)); setErr(null); } catch (e: any) { setErr(e.message); } };
  const apply = () => { try { onApply(JSON.parse(text)); setErr(null); } catch (e: any) { setErr(e.message); } };
  const copy = () => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1200); };

  return (
    <div className="flex min-h-0 flex-1">
      {/* JSON graph */}
      <div className="flex min-w-0 flex-1 flex-col" style={{ borderRight: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="flex items-center gap-2 text-[13px] font-semibold"><Code2 size={15} /> Workflow graph</div>
          <div className="flex items-center gap-2">
            {err ? <span className="badge badge-danger">invalid JSON</span> : <span className="badge badge-success"><Check size={11} /> valid</span>}
            <button className="btn btn-ghost btn-sm" onClick={copy}>{copied ? <Check size={13} /> : null} Copy</button>
            <button className="btn btn-ghost btn-sm" onClick={format}>Format</button>
            <button className="btn btn-primary btn-sm" onClick={apply}>Apply to canvas</button>
          </div>
        </div>
        <textarea
          className="wf-code min-h-0 flex-1"
          spellCheck={false}
          value={text}
          onChange={(e) => { setText(e.target.value); try { JSON.parse(e.target.value); setErr(null); } catch (x: any) { setErr(x.message); } }}
        />
        {err && <div className="px-4 py-2 text-[12px]" style={{ color: "var(--danger)", borderTop: "1px solid var(--border)" }}>{err}</div>}
      </div>

      {/* compiled preview */}
      <div className="flex w-[42%] min-w-0 flex-col" style={{ background: "var(--surface)" }}>
        <div className="flex items-center gap-2 px-4 py-2.5 text-[13px] font-semibold" style={{ borderBottom: "1px solid var(--border)" }}>
          <TriangleAlert size={15} style={{ color: "var(--accent)" }} /> Compiled agent script
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <p className="hint mb-3">This is what the voice agent receives at runtime. It reflects the last saved version.</p>
          <pre className="wf-compiled">{compiled?.script || "Save the workflow to compile."}</pre>
          {!!compiled?.tools?.length && (
            <div className="mt-4">
              <div className="label mb-2">Tools loaded</div>
              <div className="flex flex-wrap gap-1.5">
                {compiled.tools.map((t: any, i: number) => <span key={i} className="badge badge-mono">{t.label || t.ref}</span>)}
              </div>
            </div>
          )}
          <div className="mt-5">
            <div className="label mb-2">Read this workflow from your code</div>
            <pre className="wf-compiled">{`# the graph, as JSON
curl $API/v1/workflows/${id} \\
  -H "Authorization: Bearer z360_sk_live_..."

# the compiled script + tools the voice agent actually runs
curl $API/v1/workflows/${id}/compiled \\
  -H "Authorization: Bearer z360_sk_live_..."`}</pre>
            <p className="hint mt-2">
              A workflow runs on calls. Attach it to the agent in Voice Tuning, or let a trigger phrase start it.
              To start a call from your own app, use <span className="kbd">POST /v1/calls</span>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function WorkflowBuilderPage() {
  return <ReactFlowProvider><Builder /></ReactFlowProvider>;
}
