import { OrderingResult } from './ordering';

export interface PrimaryForest {
  /** child id -> its primary parent id. */
  parentOf: Map<string, string>;
  /** parent id -> children, sorted by the child's index in its layer. */
  childrenOf: Map<string, string[]>;
  /** Parentless nodes in (layer asc, index asc) order. */
  roots: string[];
}

/**
 * Carve a spanning forest out of the layered DAG: every node with incoming
 * segments picks one primary parent — the parent whose index in its layer's
 * ordering is nearest the node's own index, ties broken by smaller id. The
 * symmetric placement walks this forest; non-tree edges do not influence
 * placement.
 */
export function buildPrimaryForest(ordering: OrderingResult): PrimaryForest {
  const { layers, segments } = ordering;
  const indexIn = new Map<string, number>();
  for (const layer of layers) layer.forEach((n, i) => indexIn.set(n.id, i));

  const parentsOf = new Map<string, string[]>();
  for (const s of segments) {
    (parentsOf.get(s.target) ?? parentsOf.set(s.target, []).get(s.target)!).push(s.source);
  }

  const parentOf = new Map<string, string>();
  for (const [child, parents] of parentsOf) {
    const ci = indexIn.get(child)!;
    let best = parents[0];
    let bestDist = Math.abs(indexIn.get(best)! - ci);
    for (const p of parents.slice(1)) {
      const d = Math.abs(indexIn.get(p)! - ci);
      if (d < bestDist || (d === bestDist && p < best)) {
        best = p;
        bestDist = d;
      }
    }
    parentOf.set(child, best);
  }

  const childrenOf = new Map<string, string[]>();
  for (const [child, parent] of parentOf) {
    (childrenOf.get(parent) ?? childrenOf.set(parent, []).get(parent)!).push(child);
  }
  for (const list of childrenOf.values()) list.sort((a, b) => indexIn.get(a)! - indexIn.get(b)!);

  const roots: string[] = [];
  for (const layer of layers) for (const n of layer) if (!parentOf.has(n.id)) roots.push(n.id);

  return { parentOf, childrenOf, roots };
}
