import { Graph, GraphNode } from '../graph/model';
import { rectsIntersect } from './collision';
import { makeAcyclic } from './cycles';
import { assignLayers } from './layering';
import { orderLayers } from './ordering';
import { GROUP_PAD, MARGIN, NODE_GAP_X, assignCoordinates } from './positioning';

export interface PositionedNode extends GraphNode {
  x: number;
  y: number;
}

export interface GroupFrame {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutResult {
  nodes: Map<string, PositionedNode>;
  groups: GroupFrame[];
  layerY: number[];
  layerHeights: number[];
  /** edgeId -> centers of the edge's dummy chain, source-to-target order. */
  dummyWaypoints: Map<string, { x: number; y: number }[]>;
  /** Edges reversed during cycle breaking (waypoints follow layout direction). */
  reversedEdgeIds: Set<string>;
  /** layer index of every node, for the edge router. */
  layerOf: Map<string, number>;
  width: number;
  height: number;
}

export interface LayoutEngine {
  layout(graph: Graph): LayoutResult;
}

const GROUP_LABEL_STRIP = 22;
const EVICT_GAP = 16;
const EVICT_PASSES = 3;

/** Padded bounding boxes of group members; reused by the app when nodes are dragged. */
export function computeGroupFrames(
  groups: Map<string, { id: string; label: string }>,
  nodes: Map<string, PositionedNode>,
): GroupFrame[] {
  const frames: GroupFrame[] = [];
  for (const [id, group] of groups) {
    const members = [...nodes.values()].filter((n) => n.group === id);
    if (members.length === 0) continue;
    const minX = Math.min(...members.map((n) => n.x)) - GROUP_PAD;
    const minY = Math.min(...members.map((n) => n.y)) - GROUP_PAD - GROUP_LABEL_STRIP;
    const maxX = Math.max(...members.map((n) => n.x + n.width)) + GROUP_PAD;
    const maxY = Math.max(...members.map((n) => n.y + n.height)) + GROUP_PAD;
    frames.push({ id, label: group.label, x: minX, y: minY, width: maxX - minX, height: maxY - minY });
  }
  return frames;
}

export class SugiyamaLayout implements LayoutEngine {
  layout(graph: Graph): LayoutResult {
    const nodeIds = [...graph.nodes.keys()];
    const acyclic = makeAcyclic(nodeIds, graph.edges);
    const layerOf = assignLayers(nodeIds, acyclic);
    const ordering = orderLayers(graph.nodes, layerOf, acyclic);
    const sizes = new Map(
      [...graph.nodes.values()].map((n) => [n.id, { width: n.width, height: n.height }]),
    );
    const coords = assignCoordinates(ordering, sizes);

    const nodes = new Map<string, PositionedNode>();
    for (const [id, node] of graph.nodes) {
      const p = coords.pos.get(id)!;
      nodes.set(id, { ...node, x: p.x, y: p.y });
    }

    const computeFrames = () => computeGroupFrames(graph.groups, nodes);
    this.evictFromFrames(nodes, layerOf, computeFrames);
    const groups = computeFrames();

    // Dummy waypoints per long edge, ordered by layer (= source-to-target in
    // the acyclic orientation).
    const dummyWaypoints = new Map<string, { x: number; y: number }[]>();
    for (const layer of ordering.layers) {
      for (const n of layer) {
        if (!n.isDummy || n.edgeId === undefined) continue;
        const p = coords.pos.get(n.id)!;
        const list = dummyWaypoints.get(n.edgeId) ?? [];
        list.push({ x: p.x + 4, y: coords.layerY[n.layer] + coords.layerHeights[n.layer] / 2 });
        dummyWaypoints.set(n.edgeId, list);
      }
    }
    for (const list of dummyWaypoints.values()) list.sort((a, b) => a.y - b.y);

    const reversedEdgeIds = new Set(acyclic.filter((e) => e.reversed).map((e) => e.edgeId));

    // Eviction may have widened the drawing; normalize bounds.
    let minX = Infinity;
    let maxX = -Infinity;
    for (const n of nodes.values()) {
      minX = Math.min(minX, n.x);
      maxX = Math.max(maxX, n.x + n.width);
    }
    for (const f of groups) {
      minX = Math.min(minX, f.x);
      maxX = Math.max(maxX, f.x + f.width);
    }
    if (!isFinite(minX)) {
      minX = 0;
      maxX = 0;
    }
    const shift = MARGIN - minX;
    if (shift !== 0) {
      for (const n of nodes.values()) n.x += shift;
      for (const f of groups) f.x += shift;
      for (const list of dummyWaypoints.values()) for (const p of list) p.x += shift;
    }

    return {
      nodes,
      groups,
      layerY: coords.layerY,
      layerHeights: coords.layerHeights,
      dummyWaypoints,
      reversedEdgeIds,
      layerOf,
      width: maxX - minX + 2 * MARGIN,
      height: coords.height,
    };
  }

  /**
   * Group contiguity is enforced per layer, so a non-member on an intermediate
   * layer can still land inside a group frame that spans layers. Push such
   * nodes out horizontally (toward the nearer frame edge), cascading within
   * their layer so spacing and order are preserved.
   */
  private evictFromFrames(
    nodes: Map<string, PositionedNode>,
    layerOf: Map<string, number>,
    computeFrames: () => GroupFrame[],
  ): void {
    const layerMates = (id: string): PositionedNode[] => {
      const layer = layerOf.get(id);
      return [...nodes.values()]
        .filter((n) => layerOf.get(n.id) === layer)
        .sort((a, b) => a.x - b.x || (a.id < b.id ? -1 : 1));
    };

    const pushLeft = (node: PositionedNode, newRight: number) => {
      if (node.x + node.width <= newRight) return;
      node.x = newRight - node.width;
      const mates = layerMates(node.id);
      const i = mates.findIndex((m) => m.id === node.id);
      if (i > 0) pushLeft(mates[i - 1], node.x - NODE_GAP_X);
    };

    const pushRight = (node: PositionedNode, newLeft: number) => {
      if (node.x >= newLeft) return;
      node.x = newLeft;
      const mates = layerMates(node.id);
      const i = mates.findIndex((m) => m.id === node.id);
      if (i >= 0 && i < mates.length - 1) pushRight(mates[i + 1], node.x + node.width + NODE_GAP_X);
    };

    for (let pass = 0; pass < EVICT_PASSES; pass++) {
      const frames = computeFrames();
      let moved = false;
      for (const f of frames) {
        const frameCenter = f.x + f.width / 2;
        const hits = [...nodes.values()].filter(
          (n) => n.group !== f.id && rectsIntersect(n, f, EVICT_GAP / 2),
        );
        // Evict per side in stacking order so evictees never land on each
        // other: leftward evictions go rightmost-first, each bounded by the
        // previous one; rightward evictions mirror that.
        const leftward = hits
          .filter((n) => n.x + n.width / 2 <= frameCenter)
          .sort((a, b) => b.x + b.width - (a.x + a.width) || (a.id < b.id ? -1 : 1));
        let rightBound = f.x - EVICT_GAP;
        for (const n of leftward) {
          pushLeft(n, rightBound);
          rightBound = n.x - NODE_GAP_X;
          moved = true;
        }
        const rightward = hits
          .filter((n) => n.x + n.width / 2 > frameCenter)
          .sort((a, b) => a.x - b.x || (a.id < b.id ? -1 : 1));
        let leftBound = f.x + f.width + EVICT_GAP;
        for (const n of rightward) {
          pushRight(n, leftBound);
          leftBound = n.x + n.width + NODE_GAP_X;
          moved = true;
        }
      }
      if (!moved) break;
    }
  }
}
