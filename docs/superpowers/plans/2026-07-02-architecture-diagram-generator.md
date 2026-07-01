# Architecture Diagram Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Client-side React+TS app converting an architecture DSL into professional SVG diagrams via a deterministic Sugiyama layout engine with orthogonal edge routing.

**Architecture:** Pure-function pipeline: `parse() -> buildGraph() -> SugiyamaLayout.layout() -> routeEdges() -> <DiagramSvg/>`. Each stage is an independent module with its own Vitest suite. The React app orchestrates the pipeline on "Render Diagram" and adds zoom/pan/drag/export.

**Tech Stack:** React 18, TypeScript (strict), Vite, Vitest. No other runtime deps.

## Global Constraints

- No backend, no AI services, no network calls, no persistence.
- Layout must be deterministic: identical input => identical output (stable sorts, fixed iteration counts, insertion-order tie-breaks; no `Math.random`, no platform-dependent text metrics in layout).
- Light visual theme.
- Performance: 100 nodes < 100 ms, 500 < 500 ms, 1000 < 2000 ms (layout+routing, measured in perf test).
- Renderer consumes only geometry (`LayoutResult` + `RoutedEdge[]`) so new layout engines can be added without renderer changes.
- Node types: `service | database | cache | queue | external | lambda`.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/app/App.tsx` (placeholder), `.gitignore`
- Test: `src/smoke.test.ts`

**Interfaces:** Produces the build/test toolchain all later tasks use: `npm test` (vitest run), `npm run dev`, `npm run build`.

- [ ] Scaffold Vite react-ts app manually (no `npm create` prompt), add vitest, strict tsconfig.
- [ ] `src/smoke.test.ts`: `expect(1+1).toBe(2)`; run `npm test` => PASS.
- [ ] Commit `chore: scaffold vite react-ts app with vitest`.

### Task 2: DSL parser

**Files:**
- Create: `src/dsl/parser.ts`, `src/dsl/types.ts`
- Test: `src/dsl/parser.test.ts`

**Interfaces (produces):**

```ts
export type NodeType = 'service'|'database'|'cache'|'queue'|'external'|'lambda';
export interface ComponentDecl { id: string; type: NodeType; label: string; color?: string; group?: string; line: number }
export interface GroupDecl { id: string; label: string; line: number }
export interface EdgeDecl { source: string; target: string; label?: string; bidirectional: boolean; line: number }
export interface ParseError { line: number; message: string }
export interface ParsedDocument { components: ComponentDecl[]; groups: GroupDecl[]; edges: EdgeDecl[]; errors: ParseError[] }
export function parse(text: string): ParsedDocument
```

Grammar (line-oriented):
- `component <id> [type=<t>] [label="..."] [color=<v>]` — id is `[A-Za-z_][\w.-]*`; quoted labels may contain spaces; default label = id, default type = service.
- `group <id> [label="..."] {` … `}` — components inside get `group` set; nesting groups is an error.
- `<id> -> <id> [: label]`, `<id> <-> <id> [: label]`.
- `#`/`//` comments, blank lines skipped.
- Errors (with line numbers): unknown type, duplicate component id, unclosed group, `}` without group, unparseable line, nested group.

- [ ] Write failing tests covering: basic components; defaults; quoted labels; edges with/without labels; bidirectional; groups assign membership; comments/blanks; each error case; determinism of output ordering (document order).
- [ ] Run tests => FAIL (module missing).
- [ ] Implement parser (regex per line form; simple state for group block).
- [ ] Tests PASS; commit `feat: DSL parser`.

### Task 3: Graph model

**Files:**
- Create: `src/graph/model.ts`
- Test: `src/graph/model.test.ts`

**Interfaces (produces):**

```ts
export interface GraphNode { id: string; type: NodeType; label: string; color?: string; group?: string; width: number; height: number }
export interface GraphEdge { id: string; source: string; target: string; label?: string; bidirectional: boolean }
export interface GraphGroup { id: string; label: string }
export interface Graph { nodes: Map<string, GraphNode>; edges: GraphEdge[]; groups: Map<string, GraphGroup> }
export function buildGraph(doc: ParsedDocument): Graph
export function successors(g: Graph, id: string): string[]
export function predecessors(g: Graph, id: string): string[]
```

Behavior: auto-create undeclared edge endpoints as `service` nodes; node sizes filled by `measureNode` (Task 4); edge ids `e0…eN` in document order; self-loops kept; duplicate edges kept.

- [ ] Failing tests: auto-creation (spec example's `NotificationService`); adjacency helpers; sizes populated; insertion order preserved.
- [ ] Implement; PASS; commit `feat: graph model`.

### Task 4: Node measurement + collision utils

**Files:**
- Create: `src/layout/measure.ts`, `src/layout/collision.ts`
- Test: `src/layout/measure.test.ts`, `src/layout/collision.test.ts`

**Interfaces (produces):**

```ts
// measure.ts — deterministic (no canvas): estimated char widths for 13px Inter
export function measureText(text: string, fontSize?: number): number
export function measureNode(type: NodeType, label: string): { width: number; height: number }
// min 120x52; width = max(min, labelWidth + padding + icon allowance); database/queue taller for shape.

// collision.ts
export interface Rect { x: number; y: number; width: number; height: number }
export function rectsIntersect(a: Rect, b: Rect, gap?: number): boolean
export function segmentIntersectsRect(x1:number,y1:number,x2:number,y2:number, r: Rect): boolean // axis-aligned segments only
export function inflate(r: Rect, by: number): Rect
```

- [ ] Failing tests: longer label => wider node; min size respected; determinism; rect intersection incl. gap; H/V segment vs rect.
- [ ] Implement; PASS; commit `feat: node measurement and collision utilities`.

### Task 5: Cycle breaking + layering

**Files:**
- Create: `src/layout/cycles.ts`, `src/layout/layering.ts`
- Test: `src/layout/cycles.test.ts`, `src/layout/layering.test.ts`

**Interfaces (produces):**

```ts
// cycles.ts
export interface AcyclicEdge { source: string; target: string; edgeId: string; reversed: boolean }
export function makeAcyclic(nodeIds: string[], edges: GraphEdge[]): AcyclicEdge[]
// DFS from nodes in insertion order; back edges flagged reversed (endpoints swapped). Self-loops excluded (routed separately).

// layering.ts
export function assignLayers(nodeIds: string[], edges: AcyclicEdge[]): Map<string, number>
// Longest-path from sources, then pull-up: sink-less nodes moved down to (min successor layer - 1) to shorten spans. Layers 0..L contiguous.
```

- [ ] Failing tests: DAG untouched; 2-cycle and 3-cycle reversed count = minimal-ish (result acyclic — verify by topological sort succeeding); determinism; chain A->B->C layers 0,1,2; diamond; disconnected components; pull-up moves lone source next to its target.
- [ ] Implement; PASS; commit `feat: cycle breaking and layer assignment`.

### Task 6: Ordering (crossing minimization)

**Files:**
- Create: `src/layout/ordering.ts`
- Test: `src/layout/ordering.test.ts`

**Interfaces (produces):**

```ts
export interface OrderingNode { id: string; layer: number; isDummy: boolean; edgeId?: string; group?: string }
export interface OrderingResult { layers: OrderingNode[][]; /* index = layer, array order = left-to-right */ }
export function orderLayers(nodes: Map<string, GraphNode>, layerOf: Map<string, number>, edges: AcyclicEdge[]): OrderingResult
export function countCrossings(layers: OrderingNode[][], edges: {source:string;target:string}[]): number
```

Algorithm: insert dummy nodes (`edgeId__d<k>`) for edges spanning >1 layer, dummies inherit no group; initial order = BFS from layer 0 in insertion order; 8 fixed down/up barycenter sweeps (median for ties, keep previous position when barycenter undefined); after each sweep keep ordering iff crossings not worsened. **Group contiguity:** within each layer, sort key = (group barycenter, member barycenter) so group members are contiguous; groupless nodes are singleton groups.

- [ ] Failing tests: two-layer K2 crossing pair gets uncrossed (crossings 0); `countCrossings` correct on hand-computed cases; dummy chain created for 3-span edge; group members contiguous in every layer; determinism (two runs identical).
- [ ] Implement; PASS; commit `feat: barycenter crossing minimization with group contiguity`.

### Task 7: Coordinate assignment

**Files:**
- Create: `src/layout/positioning.ts`
- Test: `src/layout/positioning.test.ts`

**Interfaces (produces):**

```ts
export interface Positioned { x: number; y: number } // top-left of node rect
export const NODE_GAP_X = 48; export const LAYER_GAP_Y = 96; export const GROUP_PAD = 28;
export function assignCoordinates(
  ordering: OrderingResult,
  sizes: Map<string, {width:number;height:number}>, // dummies get width 8
  edges: AcyclicEdge[],
): { pos: Map<string, Positioned>; layerY: number[]; width: number; height: number }
```

Algorithm: y per layer = cumulative max layer height + LAYER_GAP_Y. x: initial packing left-to-right with NODE_GAP_X (+ extra GROUP_PAD at group boundaries so frames don't collide); then 6 fixed refinement sweeps (down, up, down…): each node moves toward median of neighbor centers, clamped so left-to-right order and min gaps are preserved (priority: dummies > high-degree > low-degree). Finally translate so min x = margin. Deterministic.

- [ ] Failing tests: no overlapping rects in any layer (property test on random-but-seeded graph via mulberry32 seeded generator); min gap respected; parent centered over sole child chain (straight line for A->B->C: equal centers); group-boundary extra spacing present; determinism.
- [ ] Implement; PASS; commit `feat: coordinate assignment`.

### Task 8: Layout engine facade + group frames + perf

**Files:**
- Create: `src/layout/index.ts`
- Test: `src/layout/index.test.ts`, `src/layout/perf.test.ts`

**Interfaces (produces):**

```ts
export interface PositionedNode extends GraphNode { x: number; y: number }
export interface GroupFrame { id: string; label: string; x: number; y: number; width: number; height: number }
export interface LayoutResult {
  nodes: Map<string, PositionedNode>;
  groups: GroupFrame[];
  layerY: number[];               // top y of each layer band
  layerHeights: number[];
  dummyWaypoints: Map<string, {x:number;y:number}[]>; // edgeId -> dummy centers, source-to-target order (even for reversed edges)
  reversedEdgeIds: Set<string>;
  width: number; height: number;
}
export interface LayoutEngine { layout(graph: Graph): LayoutResult }
export class SugiyamaLayout implements LayoutEngine {}
```

Group frame = padded bbox of member nodes (GROUP_PAD, plus 22px top strip for the label). Frames must not intersect non-member nodes (guaranteed by contiguity + boundary spacing; test it).

- [ ] Failing tests: spec example lays out with 0 node overlaps, edges' dummyWaypoints present for long edges; group frame contains members, intersects no non-members; identical input => deep-equal results; perf test builds seeded random layered graphs (100/500/1000 nodes, ~1.5x edges) and asserts layout+routing time under targets (routing added in Task 9 — perf test initially layout-only, extended in Task 9).
- [ ] Implement; PASS; commit `feat: Sugiyama layout engine facade with group frames`.

### Task 9: Orthogonal edge routing

**Files:**
- Create: `src/routing/orthogonal.ts`
- Modify: `src/layout/perf.test.ts` (add routing to timing)
- Test: `src/routing/orthogonal.test.ts`

**Interfaces (produces):**

```ts
export interface Point { x: number; y: number }
export interface RoutedEdge { id: string; source: string; target: string; label?: string; bidirectional: boolean; points: Point[]; labelPos: Point }
export function routeEdges(graph: Graph, layout: LayoutResult): RoutedEdge[]
```

Algorithm:
- Forward edge (source layer < target layer): exit source **bottom** port, enter target **top** port. Ports: for each node side, collect attached edges, sort by the x of the adjacent bend, distribute evenly along the side (deterministic ties by edge id).
- Path: vertical from source port into the inter-layer channel; horizontal run at an assigned **track** y within the channel; vertical to next waypoint/target port. Long edges do this per spanned channel following dummy x's.
- Track assignment per channel: sort horizontal segments by (y-goal, id); greedy assign to tracks (12px apart, centered in channel) so overlapping x-intervals with different x-direction never share a track — prevents segment overlap.
- Reversed-for-layout edges: route along the same geometry but reverse the final point list so arrows point source->target.
- Same-layer edges: route through the channel below via both nodes' bottom ports. Self-loop: small orthogonal loop off the node's right side.
- Guarantee: no segment passes through any node rect (verify with `segmentIntersectsRect` on inflated rects, excluding the segment's own endpoints' nodes).

- [ ] Failing tests: simple A->B is 3-segment orthogonal path from A's bottom to B's top; all segments axis-aligned for every edge in spec example; **no segment intersects any non-endpoint node** (property test on seeded random graphs); two parallel edges in same channel get distinct tracks; bidirectional edge produces one path; determinism; perf targets still met with routing included.
- [ ] Implement; PASS; commit `feat: orthogonal edge routing with ports and channel tracks`.

### Task 10: SVG renderer

**Files:**
- Create: `src/render/DiagramSvg.tsx`, `src/render/NodeShape.tsx`, `src/render/EdgePath.tsx`, `src/render/theme.ts`
- Test: `src/render/render.test.tsx` (react-dom/server renderToStaticMarkup assertions)

**Interfaces (produces):**

```tsx
export interface DiagramSvgProps {
  layout: LayoutResult; edges: RoutedEdge[];
  transform?: { x: number; y: number; k: number };   // pan/zoom applied to inner <g>
  onNodePointerDown?: (id: string, e: React.PointerEvent) => void;
  svgRef?: React.Ref<SVGSVGElement>;
}
export function DiagramSvg(props: DiagramSvgProps): JSX.Element
```

Shapes (light theme, per-type accent colors from `theme.ts`): service = rounded rect; database = cylinder (ellipse cap); cache = rounded rect with lightning glyph; queue = rect with parallel-lines glyph; external = dashed rounded rect, gray; lambda = rounded rect with λ glyph. Type badge glyph in a small left icon square; label centered. Groups: light tinted rounded rect + label top-left, drawn under nodes. Edges: `<path>` with rounded bends (arc corners, r=8), arrowhead markers (both ends if bidirectional), label on white-backed text at labelPos. Defs: arrowhead marker, soft drop-shadow filter.

- [ ] Failing tests: renders one shape element per node with expected data-type attr; edge count matches; bidirectional edge has markers both ends; group frame present; label text appears.
- [ ] Implement; PASS; commit `feat: SVG renderer with typed node shapes`.

### Task 11: App shell — editor, render, zoom/pan/drag, errors

**Files:**
- Create/Modify: `src/app/App.tsx`, `src/app/useViewport.ts`, `src/app/useNodeDrag.ts`, `src/app/sample.ts`, `src/app/app.css`
- Test: `src/app/pipeline.test.ts` (pure pipeline function test)

**Interfaces (produces):**

```ts
// pipeline used by the App and tests
export function renderPipeline(text: string): { layout: LayoutResult; edges: RoutedEdge[]; errors: ParseError[] }
```

UI: left pane = textarea editor (monospace) preloaded with `sample.ts` DSL (the spec example extended with a group and styling); "Render Diagram" button; error list with line numbers below editor (keeps last good diagram). Right pane = canvas: wheel zoom (cursor-anchored, 0.2–4x), background drag pan, node drag via pointer events — dragged node's edges re-route live (`routeEdges` re-run with overridden position). Toolbar: Render, Fit, Export SVG, Export PNG.

- [ ] Failing test: `renderPipeline` on sample returns 0 errors, >0 nodes/edges; on bad input returns errors and empty layout.
- [ ] Implement app; test PASS; `npm run build` succeeds; commit `feat: app shell with editor, viewport, node drag`.

### Task 12: Export SVG + PNG

**Files:**
- Create: `src/app/exporter.ts`
- Modify: `src/app/App.tsx`
- Test: `src/app/exporter.test.ts`

**Interfaces (produces):**

```ts
export function svgMarkup(svg: SVGSVGElement, bounds: {width:number;height:number}): string // standalone, inlined font-family, white bg
export function downloadSvg(svg: SVGSVGElement, bounds: {width:number;height:number}): void
export function downloadPng(svg: SVGSVGElement, bounds: {width:number;height:number}, scale?: number): Promise<void> // default 2x via Image + canvas
```

- [ ] Failing tests (jsdom): `svgMarkup` output starts with `<svg`, contains xmlns and white background rect, excludes interactive transform.
- [ ] Implement; PASS; commit `feat: SVG and PNG export`.

### Task 13: Polish + verify end-to-end

**Files:**
- Modify: `src/app/app.css`, `src/render/theme.ts`, `README.md` (create)

- [ ] Light-theme polish pass (typography, spacing, subtle shadows, professional palette).
- [ ] `npm test` all green; `npm run build` clean; run `npm run dev`, load app, render sample, screenshot-verify layout quality (no overlaps, orthogonal edges, labels legible), test zoom/pan/drag/export by driving the browser.
- [ ] README with DSL reference.
- [ ] Commit `docs: README` / `style: theme polish`. Leave dev server running for the user.

## Self-Review Notes

- Spec coverage: DSL (T2), auto-create (T3), sizing (T4), cycles/layers (T5), crossing minimization + groups (T6), spacing/balance (T7), determinism+perf (T8/T9), no-node-intersection routing + ports + Manhattan (T9), shapes/arrowheads/theme (T10), editor/render button/zoom/pan/drag/errors (T11), export (T12), run locally (T13). Pluggability via `LayoutEngine` interface (T8).
- Type names cross-checked: `AcyclicEdge`, `OrderingResult`, `LayoutResult`, `RoutedEdge` used consistently.
