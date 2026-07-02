# Symmetric Layout Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a user-selectable "Symmetric" layout engine (parent centered exactly over its children, straight vertical edges where alignment allows) behind a pluggable engine registry, with a toolbar dropdown persisted in localStorage.

**Architecture:** Both engines share the Sugiyama pipeline stages (cycle breaking → layering → ordering → post-placement finalization); they differ only in the coordinate-assignment function. The new engine places nodes with a Reingold–Tilford-style contour pass over a primary-parent spanning forest, then repairs any per-layer order violations with isotonic regression (pool-adjacent-violators) in gap-normalized "u-space", which guarantees the crossing-minimized order and minimum gaps (non-overlap). Spec: `docs/superpowers/specs/2026-07-03-symmetric-layout-design.md`.

**Tech Stack:** TypeScript (strict), React 18, Vite, Vitest. No new dependencies.

## Global Constraints

- Determinism: identical input must produce identical output; no randomness, no unordered-map iteration affecting results (Map iteration in insertion order is fine and used deliberately).
- Non-overlap is the hard constraint; symmetry is best-effort within it.
- The classic engine's output must remain byte-identical after refactors (guarded by existing tests, especially `identical input produces identical layout` and the pipeline overlap tests).
- No changes to `src/routing/orthogonal.ts` or any render component.
- Default engine is `'classic'` everywhere (pipeline default parameter, localStorage fallback).
- Test command: `npx vitest run <file>` for a single file, `npm test` for the suite. Build: `npm run build`.
- Commit after every task; messages follow the repo's `feat:`/`refactor:`/`test:` style, ending with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Extract the shared layout driver

Pure refactor: pull the eviction pass out of `SugiyamaLayout` into its own module and turn the body of `SugiyamaLayout.layout` into a shared `runLayout(graph, assign)` driver parameterized by the coordinate assigner. No behavior change.

**Files:**
- Create: `src/layout/evict.ts`
- Modify: `src/layout/index.ts`
- Test: existing suite only (regression)

**Interfaces:**
- Consumes: `assignCoordinates` from `./positioning` (existing).
- Produces: `runLayout(graph: Graph, assign: CoordinateAssigner): LayoutResult` and `type CoordinateAssigner = (ordering: OrderingResult, sizes: Map<string, { width: number; height: number }>) => CoordinateResult`, both exported from `src/layout/index.ts`. `evictFromFrames(nodes, layerOf, computeFrames)` exported from `src/layout/evict.ts`. `SugiyamaLayout`, `LayoutEngine`, `LayoutResult`, `PositionedNode`, `GroupFrame`, `computeGroupFrames` keep their current names and shapes — `App.tsx`, `pipeline.ts`, and `routing/orthogonal.ts` import them and must not need changes.

- [ ] **Step 1: Baseline — run the full suite and confirm it is green**

Run: `npm test`
Expected: all tests pass. If not, stop and report; do not refactor on a red baseline.

- [ ] **Step 2: Create `src/layout/evict.ts`**

Move the `evictFromFrames` private method out of `SugiyamaLayout` verbatim (only `this.` removed, constants moved along):

```ts
import { rectsIntersect } from './collision';
import type { GroupFrame, PositionedNode } from './index';
import { NODE_GAP_X } from './positioning';

const EVICT_GAP = 16;
const EVICT_PASSES = 3;

/**
 * Group contiguity is enforced per layer, so a non-member on an intermediate
 * layer can still land inside a group frame that spans layers. Push such
 * nodes out horizontally (toward the nearer frame edge), cascading within
 * their layer so spacing and order are preserved.
 */
export function evictFromFrames(
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
```

(`import type` for `GroupFrame`/`PositionedNode` keeps the `evict.ts` ↔ `index.ts` cycle type-only, which erases at compile time.)

- [ ] **Step 3: Rewrite `src/layout/index.ts` around `runLayout`**

Keep every existing export (`PositionedNode`, `GroupFrame`, `LayoutResult`, `LayoutEngine`, `computeGroupFrames`, `SugiyamaLayout`) unchanged in shape. Replace the class body and remove the now-moved eviction code and its imports (`rectsIntersect`, `NODE_GAP_X`, `EVICT_GAP`, `EVICT_PASSES`, `evictFromFrames` method). The file becomes:

```ts
import { Graph, GraphNode } from '../graph/model';
import { makeAcyclic } from './cycles';
import { evictFromFrames } from './evict';
import { assignLayers } from './layering';
import { OrderingResult, orderLayers } from './ordering';
import { CoordinateResult, GROUP_PAD, MARGIN, assignCoordinates } from './positioning';

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

/** Engines share every pipeline stage except horizontal coordinate assignment. */
export type CoordinateAssigner = (
  ordering: OrderingResult,
  sizes: Map<string, { width: number; height: number }>,
) => CoordinateResult;

const GROUP_LABEL_STRIP = 22;

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

export function runLayout(graph: Graph, assign: CoordinateAssigner): LayoutResult {
  const nodeIds = [...graph.nodes.keys()];
  const acyclic = makeAcyclic(nodeIds, graph.edges);
  const layerOf = assignLayers(nodeIds, acyclic);
  const ordering = orderLayers(graph.nodes, layerOf, acyclic);
  const sizes = new Map(
    [...graph.nodes.values()].map((n) => [n.id, { width: n.width, height: n.height }]),
  );
  const coords = assign(ordering, sizes);

  const nodes = new Map<string, PositionedNode>();
  for (const [id, node] of graph.nodes) {
    const p = coords.pos.get(id)!;
    nodes.set(id, { ...node, x: p.x, y: p.y });
  }

  const computeFrames = () => computeGroupFrames(graph.groups, nodes);
  evictFromFrames(nodes, layerOf, computeFrames);
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

export class SugiyamaLayout implements LayoutEngine {
  layout(graph: Graph): LayoutResult {
    return runLayout(graph, assignCoordinates);
  }
}
```

- [ ] **Step 4: Run the full suite — must be green with no test changes**

Run: `npm test`
Expected: PASS, same test count as Step 1. The determinism test (`identical input produces identical layout`) doubles as the byte-identical guard.

- [ ] **Step 5: Commit**

```bash
git add src/layout/evict.ts src/layout/index.ts
git commit -m "refactor: extract shared runLayout driver and eviction pass"
```

---

### Task 2: Primary-parent forest builder

The spanning forest that the symmetric placement walks. TDD with hand-built `OrderingResult` fixtures (they're tiny literals, and hand-building sidesteps the barycenter sweeps reordering fixtures unpredictably).

**Files:**
- Create: `src/layout/symmetric.ts` (forest part only; placement comes in Task 3)
- Test: `src/layout/symmetric.test.ts`

**Interfaces:**
- Consumes: `OrderingNode`, `OrderingResult` from `./ordering`.
- Produces: `buildPrimaryForest(ordering: OrderingResult): PrimaryForest` where `PrimaryForest = { parentOf: Map<string, string>; childrenOf: Map<string, string[]>; roots: string[] }`. `childrenOf` lists are sorted by the child's index in its layer; `roots` are in (layer asc, index asc) order. Task 3 consumes exactly this.

- [ ] **Step 1: Write the failing tests**

Create `src/layout/symmetric.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { OrderingNode, OrderingResult } from './ordering';
import { buildPrimaryForest } from './symmetric';

const onode = (id: string, layer: number): OrderingNode => ({ id, layer, isDummy: false });

describe('buildPrimaryForest', () => {
  test('single-parent chain: parent/children/roots straightforward', () => {
    const ordering: OrderingResult = {
      layers: [[onode('A', 0)], [onode('B', 1)], [onode('C', 2)]],
      segments: [
        { source: 'A', target: 'B', edgeId: 'e0' },
        { source: 'B', target: 'C', edgeId: 'e1' },
      ],
    };
    const f = buildPrimaryForest(ordering);
    expect(f.parentOf.get('B')).toBe('A');
    expect(f.parentOf.get('C')).toBe('B');
    expect(f.childrenOf.get('A')).toEqual(['B']);
    expect(f.roots).toEqual(['A']);
  });

  test('multi-parent: nearest layer index wins', () => {
    // layer0: P(idx0) Q(idx1); layer1: X(idx0) C(idx1). C's parents P (dist 1)
    // and Q (dist 0) -> Q wins.
    const ordering: OrderingResult = {
      layers: [
        [onode('P', 0), onode('Q', 0)],
        [onode('X', 1), onode('C', 1)],
      ],
      segments: [
        { source: 'P', target: 'X', edgeId: 'e0' },
        { source: 'P', target: 'C', edgeId: 'e1' },
        { source: 'Q', target: 'C', edgeId: 'e2' },
      ],
    };
    const f = buildPrimaryForest(ordering);
    expect(f.parentOf.get('C')).toBe('Q');
    expect(f.parentOf.get('X')).toBe('P');
  });

  test('distance tie broken by smaller parent id', () => {
    // Parents Q(idx0) and P(idx2), child C(idx1): both dist 1 -> P (smaller id).
    const ordering: OrderingResult = {
      layers: [
        [onode('Q', 0), onode('M', 0), onode('P', 0)],
        [onode('X', 1), onode('C', 1)],
      ],
      segments: [
        { source: 'M', target: 'X', edgeId: 'e0' },
        { source: 'Q', target: 'C', edgeId: 'e1' },
        { source: 'P', target: 'C', edgeId: 'e2' },
      ],
    };
    expect(buildPrimaryForest(ordering).parentOf.get('C')).toBe('P');
  });

  test('children sorted by layer index; roots in (layer, index) order', () => {
    const ordering: OrderingResult = {
      layers: [
        [onode('A', 0), onode('Z', 0)],
        [onode('B', 1), onode('C', 1), onode('D', 1)],
      ],
      // Segments deliberately out of index order.
      segments: [
        { source: 'A', target: 'D', edgeId: 'e0' },
        { source: 'A', target: 'B', edgeId: 'e1' },
        { source: 'A', target: 'C', edgeId: 'e2' },
      ],
    };
    const f = buildPrimaryForest(ordering);
    expect(f.childrenOf.get('A')).toEqual(['B', 'C', 'D']);
    expect(f.roots).toEqual(['A', 'Z']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/layout/symmetric.test.ts`
Expected: FAIL — cannot resolve `./symmetric` (module does not exist).

- [ ] **Step 3: Implement `buildPrimaryForest` in `src/layout/symmetric.ts`**

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/layout/symmetric.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/layout/symmetric.ts src/layout/symmetric.test.ts
git commit -m "feat: primary-parent forest for symmetric layout"
```

---

### Task 3: Symmetric coordinate assignment and engine class

The core: contour-based Reingold–Tilford placement over the forest, then per-layer pool-adjacent-violators (PAV) order repair, then the same translate-to-margin tail as the classic engine. Also lifts `gapBetween` out of `assignCoordinates` so both engines share it.

**Files:**
- Modify: `src/layout/positioning.ts` (export `gapBetween`)
- Modify: `src/layout/symmetric.ts`
- Test: `src/layout/symmetric.test.ts`

**Interfaces:**
- Consumes: `runLayout`, `CoordinateAssigner` from `./index` (Task 1); `buildPrimaryForest` (Task 2); `CoordinateResult`, `Positioned`, `DUMMY_WIDTH`, `LAYER_GAP_Y`, `MARGIN`, `NODE_GAP_X`, `gapBetween` from `./positioning`.
- Produces: `assignSymmetricCoordinates: CoordinateAssigner` and `class SymmetricLayout implements LayoutEngine` exported from `src/layout/symmetric.ts`. Task 5's registry consumes `SymmetricLayout`.

- [ ] **Step 1: Lift `gapBetween` to a positioning.ts export**

In `src/layout/positioning.ts`, replace the inline `gapBetween` const inside `assignCoordinates`:

```ts
  // Horizontal gap between adjacent nodes, honoring group frame padding.
  const gapBetween = (a: OrderingNode, b: OrderingNode): number => {
    if (a.group !== undefined && a.group === b.group) return NODE_GAP_X;
    let gap = NODE_GAP_X;
    if (a.group !== undefined) gap += GROUP_PAD;
    if (b.group !== undefined) gap += GROUP_PAD;
    return gap;
  };
```

with a top-level export placed right after the constants (and delete the inline copy; `assignCoordinates` keeps calling `gapBetween` unchanged):

```ts
/** Horizontal gap between adjacent nodes, honoring group frame padding. */
export function gapBetween(a: OrderingNode, b: OrderingNode): number {
  if (a.group !== undefined && a.group === b.group) return NODE_GAP_X;
  let gap = NODE_GAP_X;
  if (a.group !== undefined) gap += GROUP_PAD;
  if (b.group !== undefined) gap += GROUP_PAD;
  return gap;
}
```

Run: `npm test` — expected PASS (pure move; classic output unchanged).

- [ ] **Step 2: Write the failing engine tests**

Append to `src/layout/symmetric.test.ts` (new imports at top: `parse` from `../dsl/parser`, `buildGraph` from `../graph/model`, `rectsIntersect` from `./collision`, `routeEdges` from `../routing/orthogonal`, and `SymmetricLayout` added to the `./symmetric` import):

```ts
import { parse } from '../dsl/parser';
import { buildGraph } from '../graph/model';
import { routeEdges } from '../routing/orthogonal';
import { rectsIntersect } from './collision';
import { LayoutResult } from './index';
// merge into the existing import: { buildPrimaryForest, SymmetricLayout } from './symmetric'

const lay = (dsl: string): LayoutResult => new SymmetricLayout().layout(buildGraph(parse(dsl)));
const cx = (layout: LayoutResult, id: string): number => {
  const n = layout.nodes.get(id)!;
  return n.x + n.width / 2;
};

describe('SymmetricLayout', () => {
  test('fan-out parent sits at the exact midpoint of its outer children', () => {
    const layout = lay('A -> B\nA -> C\nA -> D');
    expect(cx(layout, 'A')).toBeCloseTo((cx(layout, 'B') + cx(layout, 'D')) / 2, 6);
    // B, C, D measure identically (same type, same label length), so the
    // spacing is mirror-symmetric too.
    expect(cx(layout, 'C') - cx(layout, 'B')).toBeCloseTo(cx(layout, 'D') - cx(layout, 'C'), 6);
  });

  test('single-child chain is perfectly vertical and routes as one segment', () => {
    const graph = buildGraph(parse('A -> B\nB -> C'));
    const layout = new SymmetricLayout().layout(graph);
    expect(cx(layout, 'A')).toBeCloseTo(cx(layout, 'B'), 6);
    expect(cx(layout, 'B')).toBeCloseTo(cx(layout, 'C'), 6);
    for (const edge of routeEdges(graph, layout)) {
      expect(edge.points.length).toBe(2); // zero bends
      expect(edge.points[0].x).toBeCloseTo(edge.points[1].x, 6);
    }
  });

  test('multi-parent node centers under its primary parent', () => {
    // A and B are both roots; C picks A (nearest layer index, dist 0 vs 1).
    const layout = lay('A -> C\nB -> C');
    expect(cx(layout, 'C')).toBeCloseTo(cx(layout, 'A'), 6);
  });

  test('spec sample: no node overlaps', () => {
    const layout = lay(
      [
        'component API type=service',
        'component UserService type=service',
        'component Redis type=cache',
        'component Aurora type=database',
        'component Kafka type=queue',
        'API -> UserService : HTTPS',
        'UserService -> Redis',
        'UserService -> Aurora',
        'UserService -> Kafka',
        'Kafka -> NotificationService',
      ].join('\n'),
    );
    const rects = [...layout.nodes.values()];
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        expect(rectsIntersect(rects[i], rects[j]), `${rects[i].id} vs ${rects[j].id}`).toBe(false);
      }
    }
  });

  test('identical input produces identical layout', () => {
    const dsl = 'A -> B\nA -> C\nB -> D\nC -> D\nD -> E';
    expect(lay(dsl)).toEqual(lay(dsl));
  });

  test('canvas size covers all nodes', () => {
    const layout = lay('A -> B\nA -> C\nB -> D\nC -> D');
    for (const n of layout.nodes.values()) {
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.x + n.width).toBeLessThanOrEqual(layout.width);
      expect(n.y + n.height).toBeLessThanOrEqual(layout.height);
    }
  });
});
```

- [ ] **Step 3: Run tests to verify the new ones fail**

Run: `npx vitest run src/layout/symmetric.test.ts`
Expected: FAIL — `SymmetricLayout` is not exported (the 4 forest tests still pass).

- [ ] **Step 4: Implement placement + PAV + engine class in `src/layout/symmetric.ts`**

Add below `buildPrimaryForest` (new imports shown; `Graph` from `../graph/model`, engine pieces from `./index`, geometry from `./positioning`, `OrderingNode` added to the ordering import):

```ts
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
  for (const layer of layers) {
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
    const blocks: { sum: number; count: number }[] = [];
    layer.forEach((n, i) => {
      let block = { sum: center.get(n.id)! - e[i], count: 1 };
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
```

- [ ] **Step 5: Run the symmetric tests, then the full suite**

Run: `npx vitest run src/layout/symmetric.test.ts`
Expected: PASS (10 tests).
Run: `npm test`
Expected: PASS — classic engine untouched.

- [ ] **Step 6: Commit**

```bash
git add src/layout/positioning.ts src/layout/symmetric.ts src/layout/symmetric.test.ts
git commit -m "feat: symmetric layout engine (tree contours + isotonic order repair)"
```

---

### Task 4: Robustness and property tests

Push the new engine through cycles, groups + eviction, dummy chains, and random DAGs. These are tests only — if any fail, fix `symmetric.ts` (that's the point), but do not weaken an assertion to pass.

**Files:**
- Test: `src/layout/symmetric.test.ts`

**Interfaces:**
- Consumes: `SymmetricLayout` (Task 3); `syntheticGraph` from `./synthetic`; the `lay`/`cx` helpers already in the test file.

- [ ] **Step 1: Add the tests**

Append inside the `SymmetricLayout` describe block (add `import { syntheticGraph } from './synthetic';` at the top):

```ts
  test('cyclic input lays out without error and reports reversed edges', () => {
    const layout = lay('A -> B\nB -> C\nC -> A');
    expect(layout.nodes.size).toBe(3);
    expect(layout.reversedEdgeIds.size).toBe(1);
  });

  test('long edges expose dummy waypoints', () => {
    const layout = lay('A -> B\nB -> C\nC -> D\nA -> D');
    const long = layout.dummyWaypoints.get('e3');
    expect(long).toBeDefined();
    expect(long!.length).toBe(2);
  });

  test('group frame contains members; non-members evicted', () => {
    const layout = lay(
      [
        'component API',
        'group Backend label="Backend" {',
        'component UserService',
        'component OrderService',
        '}',
        'component Standalone',
        'API -> UserService',
        'API -> OrderService',
        'API -> Standalone',
      ].join('\n'),
    );
    const frame = layout.groups.find((g) => g.id === 'Backend')!;
    expect(frame).toBeDefined();
    for (const id of ['UserService', 'OrderService']) {
      const n = layout.nodes.get(id)!;
      expect(n.x).toBeGreaterThanOrEqual(frame.x);
      expect(n.x + n.width).toBeLessThanOrEqual(frame.x + frame.width);
    }
    for (const id of ['API', 'Standalone']) {
      expect(rectsIntersect(layout.nodes.get(id)!, frame)).toBe(false);
    }
  });

  test('property: random layered DAGs never overlap', () => {
    for (const [n, seed] of [
      [60, 7],
      [120, 11],
      [200, 23],
    ] as const) {
      const layout = new SymmetricLayout().layout(syntheticGraph(n, seed));
      const rects = [...layout.nodes.values()];
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          expect(
            rectsIntersect(rects[i], rects[j]),
            `n=${n} seed=${seed}: ${rects[i].id} overlaps ${rects[j].id}`,
          ).toBe(false);
        }
      }
    }
  });

  test('perf sanity: 500 synthetic nodes lay out well under a second', () => {
    const graph = syntheticGraph(500);
    const start = performance.now();
    const layout = new SymmetricLayout().layout(graph);
    expect(layout.nodes.size).toBe(500);
    expect(performance.now() - start).toBeLessThan(1000);
  });
```

- [ ] **Step 2: Run the file; fix `symmetric.ts` if anything fails**

Run: `npx vitest run src/layout/symmetric.test.ts`
Expected: PASS (15 tests). If the property test fails, debug the contour merge or PAV (likely spots: gap accounting at subtree boundaries, or a layer whose PAV blocks straddle group boundaries) — do not loosen the assertion.

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/layout/symmetric.test.ts src/layout/symmetric.ts
git commit -m "test: robustness and property coverage for symmetric layout"
```

---

### Task 5: Engine registry and pipeline parameter

**Files:**
- Create: `src/layout/engines.ts`
- Modify: `src/app/pipeline.ts`
- Test: `src/app/pipeline.test.ts`

**Interfaces:**
- Consumes: `SugiyamaLayout`, `LayoutEngine` from `../layout/index`; `SymmetricLayout` from `../layout/symmetric`.
- Produces: `type LayoutEngineId = 'classic' | 'symmetric'`, `layoutEngines: Record<LayoutEngineId, { label: string; create(): LayoutEngine }>`, `isLayoutEngineId(v: unknown): v is LayoutEngineId` from `src/layout/engines.ts`; `renderPipeline(text: string, engineId?: LayoutEngineId)` (default `'classic'`). Task 6 consumes all of these.

- [ ] **Step 1: Write the failing tests**

Append to `src/app/pipeline.test.ts` inside the existing describe:

```ts
  test('symmetric engine renders the sample overlap-free', () => {
    const result = renderPipeline(SAMPLE_DSL, 'symmetric');
    expect(result.errors).toEqual([]);
    expect(result.layout.nodes.size).toBeGreaterThan(5);
    const nodes = [...result.layout.nodes.values()];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        expect(
          rectsIntersect(nodes[i], nodes[j]),
          `${nodes[i].id} overlaps ${nodes[j].id}`,
        ).toBe(false);
      }
    }
  });

  test('engine defaults to classic', () => {
    expect(renderPipeline(SAMPLE_DSL)).toEqual(renderPipeline(SAMPLE_DSL, 'classic'));
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/pipeline.test.ts`
Expected: FAIL — TS error: `renderPipeline` takes 1 argument.

- [ ] **Step 3: Create `src/layout/engines.ts`**

```ts
import { LayoutEngine, SugiyamaLayout } from './index';
import { SymmetricLayout } from './symmetric';

export type LayoutEngineId = 'classic' | 'symmetric';

/** Selectable layout engines. Adding one = a LayoutEngine class + an entry here. */
export const layoutEngines: Record<LayoutEngineId, { label: string; create(): LayoutEngine }> = {
  classic: { label: 'Classic', create: () => new SugiyamaLayout() },
  symmetric: { label: 'Symmetric', create: () => new SymmetricLayout() },
};

export function isLayoutEngineId(v: unknown): v is LayoutEngineId {
  return typeof v === 'string' && v in layoutEngines;
}
```

- [ ] **Step 4: Thread the engine id through `src/app/pipeline.ts`**

Replace the import of `SugiyamaLayout` and the layout line:

```ts
import { parse } from '../dsl/parser';
import { ParseError } from '../dsl/types';
import { Graph, buildGraph } from '../graph/model';
import { LayoutEngineId, layoutEngines } from '../layout/engines';
import { LayoutResult } from '../layout/index';
import { RoutedEdge, routeEdges } from '../routing/orthogonal';
```

and in the function:

```ts
export function renderPipeline(text: string, engineId: LayoutEngineId = 'classic'): PipelineResult {
  const doc = parse(text);
  if (doc.errors.length > 0) {
    return { graph: EMPTY_GRAPH, layout: emptyLayout(), edges: [], errors: doc.errors };
  }
  const graph = buildGraph(doc);
  const layout = layoutEngines[engineId].create().layout(graph);
  const edges = routeEdges(graph, layout);
  return { graph, layout, edges, errors: [] };
}
```

- [ ] **Step 5: Run tests to verify they pass, then the full suite**

Run: `npx vitest run src/app/pipeline.test.ts` — expected PASS (6 tests).
Run: `npm test` — expected PASS.

- [ ] **Step 6: Commit**

```bash
git add src/layout/engines.ts src/app/pipeline.ts src/app/pipeline.test.ts
git commit -m "feat: pluggable layout engine registry in the render pipeline"
```

---

### Task 6: Toolbar dropdown, persistence, docs

**Files:**
- Modify: `src/app/App.tsx`
- Modify: `src/app/app.css`
- Modify: `README.md`

**Interfaces:**
- Consumes: `LayoutEngineId`, `isLayoutEngineId`, `layoutEngines` from `../layout/engines`; `renderPipeline(text, engineId)` (Task 5).
- Produces: user-facing behavior only.

- [ ] **Step 1: Add engine state and persistence to `src/app/App.tsx`**

Add the import and a module-level helper above `App`:

```tsx
import { LayoutEngineId, isLayoutEngineId, layoutEngines } from '../layout/engines';

const ENGINE_KEY = 'intellidraw.layoutEngine';

function loadEngineId(): LayoutEngineId {
  try {
    const stored = localStorage.getItem(ENGINE_KEY);
    if (isLayoutEngineId(stored)) return stored;
  } catch {
    // Storage unavailable (private mode etc.) — fall through to default.
  }
  return 'classic';
}
```

Inside `App`, add engine state before the `scene` state and initialize the scene with it:

```tsx
  const [engineId, setEngineId] = useState<LayoutEngineId>(loadEngineId);
  const [scene, setScene] = useState<PipelineResult>(() => renderPipeline(SAMPLE_DSL, engineId));
```

Replace the `render` callback so a just-selected engine can be passed explicitly (state updates are async):

```tsx
  const render = useCallback(
    (id: LayoutEngineId = engineId) => {
      const start = performance.now();
      const next = renderPipeline(text, id);
      setErrors(next.errors);
      if (next.errors.length === 0) {
        setRenderMs(performance.now() - start);
        setScene(next);
        fit(next.layout.width, next.layout.height);
      }
    },
    [text, fit, engineId],
  );

  const onEngineChange = useCallback(
    (id: LayoutEngineId) => {
      setEngineId(id);
      try {
        localStorage.setItem(ENGINE_KEY, id);
      } catch {
        // Persistence is best-effort.
      }
      render(id);
    },
    [render],
  );
```

**Pitfall:** the Render button is currently `onClick={render}` — React would pass the click event as the new first parameter. Change it to `onClick={() => render()}` (the ⌘-Enter path already calls `render()` and needs no change).

- [ ] **Step 2: Add the dropdown to the toolbar**

In the `actions` div, between the Fit button and the `divider` span:

```tsx
          <label className="layout-select">
            Layout
            <select
              value={engineId}
              aria-label="Layout engine"
              onChange={(e) => onEngineChange(e.target.value as LayoutEngineId)}
            >
              {(Object.keys(layoutEngines) as LayoutEngineId[]).map((id) => (
                <option key={id} value={id}>
                  {layoutEngines[id].label}
                </option>
              ))}
            </select>
          </label>
```

- [ ] **Step 3: Style it in `src/app/app.css`**

Append after the `.btn:focus-visible` rule, matching the pill buttons:

```css
.layout-select {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--ink-soft);
}

.layout-select select {
  font-family: var(--font-ui);
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
  background: var(--panel);
  border: 1px solid #d5d3ca;
  border-radius: 999px;
  padding: 6px 12px;
  cursor: pointer;
}

.layout-select select:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

- [ ] **Step 4: Verify — suite, build, and the running app**

Run: `npm test` — expected PASS.
Run: `npm run build` — expected: clean `tsc -b` + vite build.
Then start `npm run dev`, open http://localhost:5173, and check: (1) the Layout dropdown shows Classic/Symmetric; (2) switching to Symmetric re-renders the sample immediately with fan-outs centered under their parents; (3) reload keeps Symmetric selected; (4) node drag and both exports still work. (Under an agentic harness, use the project's run/verify tooling for this step.)

- [ ] **Step 5: Update `README.md`**

In the **Interaction** section add:

```markdown
- **Layout** dropdown switches the placement engine: *Classic* (compact
  median-based Sugiyama) or *Symmetric* (parents centered over their
  children, vertical edges wherever alignment allows). The choice is
  remembered across sessions.
```

In the **Architecture** listing, after the `positioning.ts` line add:

```text
                 symmetric.ts    alternative engine: primary-parent tree
                                 contours + isotonic order repair
```

- [ ] **Step 6: Commit**

```bash
git add src/app/App.tsx src/app/app.css README.md
git commit -m "feat: layout engine dropdown with persisted choice"
```
