"use client";

import { useMemo, useState } from "react";
import { ReactFlow, Background, Handle, Position, type Node, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { MessageSquare, Play, Volume2, GitBranch, Zap, CircleDot, Webhook, X } from "lucide-react";

/* A read-only preview of an ability's node graph — the "live visualizer" that
   shows what the Workflow Builder is constructing. Click a node to inspect its
   configuration (tool, inputs, saved variable, branches). */

const META: Record<string, { color: string; icon: any; label: string }> = {
  trigger: { color: "#0d9488", icon: Zap, label: "Start" },
  start: { color: "#0d9488", icon: Zap, label: "Start" },
  ask: { color: "#2563eb", icon: MessageSquare, label: "Ask" },
  act: { color: "#0891b2", icon: Play, label: "Act" },
  speak: { color: "#6366f1", icon: Volume2, label: "Say" },
  condition: { color: "#7c3aed", icon: GitBranch, label: "Branch" },
  webhook: { color: "#0891b2", icon: Webhook, label: "Webhook" },
  end: { color: "#64748b", icon: CircleDot, label: "End" },
};

function VizNode({ data }: any) {
  const m = META[data.type] || META.act;
  const Icon = m.icon;
  return (
    <div className="wfviz-node" style={{ ["--c" as any]: m.color }}>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <span className="wfviz-node__plate"><Icon size={13} /></span>
      <span className="wfviz-node__body">
        <span className="wfviz-node__label">{data.label || m.label}</span>
        <span className="wfviz-node__type">{m.label} node</span>
      </span>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}
const nodeTypes = { viz: VizNode };

function NodeDetail({ node, onClose }: { node: any; onClose: () => void }) {
  const m = META[node.type] || META.act;
  const rows: [string, any][] = [];
  if (node.tool) rows.push(["Action", node.tool.label || node.tool.ref]);
  if (node.tool?.kind) rows.push(["Kind", node.tool.kind]);
  if (node.prompt) rows.push(["Ask", node.prompt]);
  if (node.text) rows.push(["Say", node.text]);
  if (node.instruction) rows.push(["Instruction", node.instruction]);
  if (node.save_as) rows.push(["Save as", node.save_as]);
  if (node.phrases?.length) rows.push(["Phrases", node.phrases.join(" · ")]);
  const paths = node.pathways?.length ? node.pathways : (node.next ? [{ label: "next", next: node.next }] : []);
  return (
    <div className="wfviz-detail" onClick={(e) => e.stopPropagation()}>
      <div className="wfviz-detail__head" style={{ ["--c" as any]: m.color }}>
        <span className="wfviz-node__plate"><m.icon size={13} /></span>
        <div className="min-w-0 flex-1">
          <div className="wfviz-detail__title truncate">{node.label || m.label}</div>
          <div className="wfviz-detail__type">{m.label} node</div>
        </div>
        <button onClick={onClose} aria-label="Close"><X size={15} /></button>
      </div>
      <div className="wfviz-detail__body">
        {rows.map(([k, v]) => (
          <div key={k} className="wfviz-detail__row"><div className="wfviz-detail__k">{k}</div><div className="wfviz-detail__v">{String(v)}</div></div>
        ))}
        {paths.length > 0 && (
          <div className="wfviz-detail__row"><div className="wfviz-detail__k">Branches</div>
            <div className="wfviz-detail__v">{paths.map((p: any, i: number) => (
              <div key={i} className="wfviz-detail__branch"><b>{p.label || "→"}</b>{p.description ? ` — ${p.description}` : ""} → {p.next}</div>
            ))}</div></div>
        )}
        {rows.length === 0 && paths.length === 0 && <div className="wfviz-detail__v">No configuration.</div>}
      </div>
    </div>
  );
}

export function WorkflowViz({ nodes: aNodes }: { nodes: any[] }) {
  const [sel, setSel] = useState<any | null>(null);
  const list = aNodes || [];
  const byId = useMemo(() => Object.fromEntries(list.map((n: any) => [n.id, n])), [list]);

  const { nodes, edges } = useMemo(() => {
    const rfNodes: Node[] = list.map((n: any, i: number) => ({
      id: n.id, type: "viz",
      position: n.position && typeof n.position.x === "number" ? { x: n.position.x, y: n.position.y } : { x: 40, y: i * 92 },
      data: { type: n.type, label: n.label },
      draggable: false,
    }));
    const rfEdges: Edge[] = [];
    for (const n of list) {
      const paths = n.pathways && n.pathways.length ? n.pathways : (n.next ? [{ next: n.next }] : []);
      for (const p of paths) {
        if (p?.next) rfEdges.push({
          id: `${n.id}-${p.next}-${p.id || "e"}`, source: n.id, target: p.next,
          label: typeof p.label === "string" ? p.label : undefined, animated: true,
          style: { stroke: "var(--border-strong)" },
        });
      }
    }
    return { nodes: rfNodes, edges: rfEdges };
  }, [list]);

  if (!nodes.length) return <div className="wfviz-empty">The workflow graph will appear here as it is built.</div>;

  return (
    <div className="wfviz" onClick={() => setSel(null)}>
      <ReactFlow
        nodes={nodes} edges={edges} nodeTypes={nodeTypes}
        fitView fitViewOptions={{ padding: 0.2 }} proOptions={{ hideAttribution: true }}
        nodesDraggable={false} nodesConnectable={false}
        onNodeClick={(_e, n) => setSel(byId[n.id])}
        panOnScroll zoomOnScroll={false} minZoom={0.3} maxZoom={1.3}
      >
        <Background gap={16} size={1} color="var(--border)" />
      </ReactFlow>
      {sel && <NodeDetail node={sel} onClose={() => setSel(null)} />}
    </div>
  );
}
