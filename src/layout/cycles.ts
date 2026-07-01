import { GraphEdge } from '../graph/model';

export interface AcyclicEdge {
  source: string;
  target: string;
  edgeId: string;
  reversed: boolean;
}

/**
 * Greedy DFS cycle breaking: back edges (targets on the active DFS stack) are
 * reversed for layout purposes. Self-loops are dropped here; the router draws
 * them directly. Deterministic: nodes visited in insertion order, edges in
 * document order.
 */
export function makeAcyclic(nodeIds: string[], edges: GraphEdge[]): AcyclicEdge[] {
  const out = new Map<string, GraphEdge[]>(nodeIds.map((n) => [n, []]));
  for (const e of edges) {
    if (e.source === e.target) continue;
    out.get(e.source)?.push(e);
  }

  const WHITE = 0, GRAY = 1, BLACK = 2;
  const state = new Map<string, number>(nodeIds.map((n) => [n, WHITE]));
  const reversedIds = new Set<string>();

  function dfs(n: string): void {
    state.set(n, GRAY);
    for (const e of out.get(n) ?? []) {
      const s = state.get(e.target);
      if (s === GRAY) {
        reversedIds.add(e.id);
      } else if (s === WHITE) {
        dfs(e.target);
      }
    }
    state.set(n, BLACK);
  }

  for (const n of nodeIds) {
    if (state.get(n) === WHITE) dfs(n);
  }

  return edges
    .filter((e) => e.source !== e.target)
    .map((e) =>
      reversedIds.has(e.id)
        ? { source: e.target, target: e.source, edgeId: e.id, reversed: true }
        : { source: e.source, target: e.target, edgeId: e.id, reversed: false },
    );
}
