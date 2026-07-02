import { Graph } from '../graph/model';
import { LayoutEngine, LayoutResult, runLayout } from './index';
import { OrderingNode, OrderingResult } from './ordering';
import {
  CoordinateResult,
  DUMMY_WIDTH,
  LAYER_GAP_Y,
  MARGIN,
  NODE_GAP_X,
  Positioned,
  gapBetween,
} from './positioning';

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

interface ContourEntry {
  left: number;
  right: number;
  /** Boundary nodes, so subtree merging can apply group-aware gaps. */
  leftNode: OrderingNode;
  rightNode: OrderingNode;
}

interface PlacedTree {
  ids: string[];
  /** Absolute layer index -> horizontal extent of this subtree at that layer. */
  contour: Map<number, ContourEntry>;
}

/**
 * Symmetric coordinate assignment: Reingold-Tilford-style contour placement
 * over the primary-parent forest (each parent at the exact midpoint of its
 * outermost children; sibling subtrees packed at minimum gaps), followed by a
 * per-layer isotonic repair that restores the crossing-minimized order where
 * the forest placement disagrees with it. Non-overlap is guaranteed: within a
 * layer, centers honor the same cumulative minimal offsets as the classic
 * engine.
 */
export function assignSymmetricCoordinates(
  ordering: OrderingResult,
  sizes: Map<string, { width: number; height: number }>,
): CoordinateResult {
  const { layers } = ordering;
  const byId = new Map<string, OrderingNode>();
  for (const layer of layers) for (const n of layer) byId.set(n.id, n);

  const widthOf = (n: OrderingNode) => (n.isDummy ? DUMMY_WIDTH : sizes.get(n.id)!.width);
  const heightOf = (n: OrderingNode) => (n.isDummy ? 0 : sizes.get(n.id)!.height);

  // Vertical placement: stacked layer bands, identical to the classic engine.
  const layerHeights = layers.map((layer) => Math.max(0, ...layer.map(heightOf)));
  const layerY: number[] = [];
  let y = MARGIN;
  for (let l = 0; l < layers.length; l++) {
    layerY.push(y);
    y += layerHeights[l] + LAYER_GAP_Y;
  }

  const { childrenOf, roots } = buildPrimaryForest(ordering);
  const center = new Map<string, number>();

  const mergeInto = (merged: PlacedTree, sub: PlacedTree): void => {
    let shift = -Infinity;
    for (const [l, m] of merged.contour) {
      const s = sub.contour.get(l);
      if (s) shift = Math.max(shift, m.right + gapBetween(m.rightNode, s.leftNode) - s.left);
    }
    if (!isFinite(shift)) {
      // No shared layer: pack fully to the right of everything placed so far.
      const mergedRight = Math.max(...[...merged.contour.values()].map((c) => c.right));
      const subLeft = Math.min(...[...sub.contour.values()].map((c) => c.left));
      shift = mergedRight + NODE_GAP_X - subLeft;
    }
    for (const id of sub.ids) center.set(id, center.get(id)! + shift);
    for (const c of sub.contour.values()) {
      c.left += shift;
      c.right += shift;
    }
    for (const [l, s] of sub.contour) {
      const m = merged.contour.get(l);
      if (!m) {
        merged.contour.set(l, s);
      } else {
        if (s.left < m.left) {
          m.left = s.left;
          m.leftNode = s.leftNode;
        }
        if (s.right > m.right) {
          m.right = s.right;
          m.rightNode = s.rightNode;
        }
      }
    }
    merged.ids.push(...sub.ids);
  };

  const addNodeAt = (tree: PlacedTree, node: OrderingNode, cx: number): void => {
    const half = widthOf(node) / 2;
    const entry = tree.contour.get(node.layer);
    if (!entry) {
      tree.contour.set(node.layer, {
        left: cx - half,
        right: cx + half,
        leftNode: node,
        rightNode: node,
      });
    } else {
      if (cx - half < entry.left) {
        entry.left = cx - half;
        entry.leftNode = node;
      }
      if (cx + half > entry.right) {
        entry.right = cx + half;
        entry.rightNode = node;
      }
    }
    tree.ids.push(node.id);
  };

  // Children live one layer below their parent, so a subtree's contour never
  // reaches the parent's own layer before addNodeAt places it there.
  const placeTree = (id: string): PlacedTree => {
    const node = byId.get(id)!;
    const kids = childrenOf.get(id) ?? [];
    if (kids.length === 0) {
      center.set(id, 0);
      const tree: PlacedTree = { ids: [], contour: new Map() };
      addNodeAt(tree, node, 0);
      return tree;
    }
    const merged = placeTree(kids[0]);
    for (let k = 1; k < kids.length; k++) mergeInto(merged, placeTree(kids[k]));
    const mid = (center.get(kids[0])! + center.get(kids[kids.length - 1])!) / 2;
    center.set(id, mid);
    addNodeAt(merged, node, mid);
    return merged;
  };

  let forest: PlacedTree | undefined;
  for (const r of roots) {
    const sub = placeTree(r);
    if (!forest) forest = sub;
    else mergeInto(forest, sub);
  }

  // Order repair: within each layer, u_i = center_i - e_i must be
  // non-decreasing (e_i = cumulative minimal center offsets). Pool adjacent
  // violators: conflicting stretches collapse to their mean u, which is the
  // closest order- and gap-respecting fit; already-consistent layers (the
  // common case) pass through untouched, preserving exact symmetry.
  //
  // Layers are swept bottom-up (deepest first) so that by the time a layer
  // is repaired, any of its nodes' forest children (which live strictly one
  // layer deeper) have already settled into their final, repaired centers.
  // Each node's *desired* center for PAV purposes is recomputed from those
  // settled children (midpoint of the outermost two) rather than reused from
  // the phase-1 placement, so a parent stays re-aimed at its children even
  // after they move. Childless nodes simply desire their existing center.
  // When nothing needs repair, a parent's children never move, so desired
  // equals the phase-1 center and this is a no-op.
  for (let l = layers.length - 1; l >= 0; l--) {
    const layer = layers[l];
    if (layer.length === 0) continue;
    const e: number[] = [0];
    for (let i = 1; i < layer.length; i++) {
      e.push(
        e[i - 1] +
          widthOf(layer[i - 1]) / 2 +
          gapBetween(layer[i - 1], layer[i]) +
          widthOf(layer[i]) / 2,
      );
    }
    const desired = layer.map((n) => {
      const kids = childrenOf.get(n.id);
      if (kids && kids.length > 0) {
        return (center.get(kids[0])! + center.get(kids[kids.length - 1])!) / 2;
      }
      return center.get(n.id)!;
    });
    const blocks: { sum: number; count: number }[] = [];
    layer.forEach((_n, i) => {
      let block = { sum: desired[i] - e[i], count: 1 };
      while (blocks.length > 0) {
        const prev = blocks[blocks.length - 1];
        if (prev.sum / prev.count <= block.sum / block.count) break;
        blocks.pop();
        block = { sum: prev.sum + block.sum, count: prev.count + block.count };
      }
      blocks.push(block);
    });
    let i = 0;
    for (const b of blocks) {
      const u = b.sum / b.count;
      for (let k = 0; k < b.count; k++, i++) center.set(layer[i].id, u + e[i]);
    }
  }

  // Translate so the leftmost node border sits at MARGIN (same as classic).
  let minLeft = Infinity;
  let maxRight = -Infinity;
  for (const layer of layers) {
    for (const n of layer) {
      const c = center.get(n.id)!;
      minLeft = Math.min(minLeft, c - widthOf(n) / 2);
      maxRight = Math.max(maxRight, c + widthOf(n) / 2);
    }
  }
  if (!isFinite(minLeft)) minLeft = 0;
  if (!isFinite(maxRight)) maxRight = 0;
  const shift = MARGIN - minLeft;

  const pos = new Map<string, Positioned>();
  for (let l = 0; l < layers.length; l++) {
    for (const n of layers[l]) {
      const c = center.get(n.id)! + shift;
      pos.set(n.id, {
        x: c - widthOf(n) / 2,
        y: layerY[l] + (layerHeights[l] - heightOf(n)) / 2,
      });
    }
  }

  return {
    pos,
    layerY,
    layerHeights,
    width: maxRight - minLeft + 2 * MARGIN,
    height: y - LAYER_GAP_Y + MARGIN,
  };
}

export class SymmetricLayout implements LayoutEngine {
  layout(graph: Graph): LayoutResult {
    return runLayout(graph, assignSymmetricCoordinates);
  }
}
