import { AcyclicEdge } from './cycles';

/**
 * Longest-path layering with a pull-up pass: predecessor-less nodes are moved
 * down next to their nearest successor so short branches don't get stranded at
 * the top of the diagram. Result uses contiguous layers starting at 0.
 */
export function assignLayers(nodeIds: string[], edges: AcyclicEdge[]): Map<string, number> {
  const preds = new Map<string, string[]>(nodeIds.map((n) => [n, []]));
  const succs = new Map<string, string[]>(nodeIds.map((n) => [n, []]));
  for (const e of edges) {
    succs.get(e.source)?.push(e.target);
    preds.get(e.target)?.push(e.source);
  }

  // Topological order via Kahn's algorithm (input is a DAG by contract).
  const indegree = new Map(nodeIds.map((n) => [n, preds.get(n)!.length]));
  const queue = nodeIds.filter((n) => indegree.get(n) === 0);
  const topo: string[] = [];
  while (queue.length > 0) {
    const n = queue.shift()!;
    topo.push(n);
    for (const s of succs.get(n)!) {
      const d = indegree.get(s)! - 1;
      indegree.set(s, d);
      if (d === 0) queue.push(s);
    }
  }

  const layer = new Map<string, number>(nodeIds.map((n) => [n, 0]));
  for (const n of topo) {
    for (const s of succs.get(n)!) {
      layer.set(s, Math.max(layer.get(s)!, layer.get(n)! + 1));
    }
  }

  // Pull-up: sources drop to just above their nearest successor.
  for (const n of [...topo].reverse()) {
    if (preds.get(n)!.length > 0 || succs.get(n)!.length === 0) continue;
    const minSucc = Math.min(...succs.get(n)!.map((s) => layer.get(s)!));
    layer.set(n, Math.max(layer.get(n)!, minSucc - 1));
  }

  // Compact to contiguous layer indices.
  const used = [...new Set(layer.values())].sort((a, b) => a - b);
  const remap = new Map(used.map((l, i) => [l, i]));
  for (const [n, l] of layer) layer.set(n, remap.get(l)!);

  return layer;
}
