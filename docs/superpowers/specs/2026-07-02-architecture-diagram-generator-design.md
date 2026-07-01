# Architecture Diagram Generator — Design

**Date:** 2026-07-02
**Status:** Approved (derived directly from user-provided requirements)

## Goal

A fully client-side web app that converts a text DSL describing software architecture
into a professional-looking diagram using deterministic graph algorithms — no AI, no
backend, no persistence. Light visual theme.

## Stack

- React 18 + TypeScript, Vite, Vitest for unit tests.
- Zero runtime dependencies beyond React. The layout engine is written from scratch.

## DSL

```
# comment
component API type=service label="Public API"
component Aurora type=database
group Backend label="Backend Services" {
  component UserService type=service
  component Kafka type=queue
}
API -> UserService : HTTPS
UserService <-> Redis : cache r/w
```

- `component <id> [type=<type>] [label="..."] [color=<css-color>]`
- Types: `service | database | cache | queue | external | lambda` (default `service`)
- `group <id> [label="..."] { ... }` — nestable one level is sufficient (flat groups)
- Edges: `A -> B`, `A <-> B` (bidirectional), optional `: label` suffix
- Nodes referenced in edges but never declared are auto-created with type `service`
- Comments: `#` or `//`; blank lines ignored
- Parse errors reported with line numbers in the UI; rendering aborts on error

## Module Architecture (each independently testable)

```
src/dsl/parser.ts        DSL text -> ParsedDocument (components, groups, edges) or errors
src/graph/model.ts       Graph model: nodes, edges, groups; adjacency helpers
src/layout/              Deterministic Sugiyama pipeline (pure functions)
  cycles.ts              Greedy cycle breaking (edges reversed for layout only)
  layering.ts            Longest-path layering + pull-up compaction
  ordering.ts            Dummy-node insertion; barycenter/median crossing minimization
                         with group-contiguity constraint (members stay adjacent per layer)
  positioning.ts         Barycenter coordinate assignment + overlap resolution,
                         consistent spacing, balanced alignment
  measure.ts             Content-based node sizing (canvas text metrics w/ fallback)
  collision.ts           Rect intersection / inflation utilities
  index.ts               LayoutEngine interface + Sugiyama implementation
                         (pluggable so radial/force-directed can be added later)
src/routing/orthogonal.ts Manhattan edge routing: side ports, inter-layer channels
                         with track assignment so segments never cross nodes,
                         dummy-chain waypoints for long edges, rounded bends
src/render/              SVG React components: node shapes (service rect, database
                         cylinder, cache, queue, external dashed, lambda), group
                         containers, edges with arrowheads, labels
src/app/                 App shell: editor pane, Render button, canvas with
                         zoom/pan/node-drag, SVG + PNG export
```

Data flow: `text --parser--> ParsedDocument --model--> Graph --layout--> PositionedGraph
--routing--> RoutedGraph --renderer--> SVG`. The renderer consumes only positioned/routed
geometry, so alternative layout engines plug in without renderer changes.

## Layout Engine

Sugiyama layered layout, top-to-bottom:

1. **Cycle breaking** — DFS-based greedy heuristic; reversed edges restored after layout.
2. **Layering** — longest-path, then compaction to reduce edge span.
3. **Crossing minimization** — insert dummy nodes for multi-layer edges; repeated
   down/up barycenter sweeps with median tie-breaking; deterministic (stable sorts,
   fixed iteration count, input order as final tie-break).
4. **Coordinate assignment** — barycenter-driven x placement with priority-based
   overlap resolution; group members packed contiguously; group padding reserved.
5. **Groups** — contiguity constraint during ordering; group frame drawn as padded
   bounding box of members; non-members never placed inside a group band.

## Edge Routing

Orthogonal (Manhattan) paths. Edges leave the source's bottom side and enter the
target's top side (reversed/flat edges handled with side ports). Ports are distributed
along the node side ordered by neighbor x to avoid crossings at the node. Horizontal
runs occur in the channel between layers; overlapping runs get separate tracks.
Long edges follow their dummy-node x waypoints. Self-loops and same-layer edges route
around node bounds. Result: no edge passes through a node rectangle.

## Interaction & Rendering

- SVG rendering, light theme, rounded corners, Inter/system typography, subtle shadows.
- Zoom (wheel), pan (drag background), node drag (edges re-route live for dragged node).
- Export: SVG (serialize) and PNG (SVG -> canvas at 2x).
- "Render Diagram" button re-parses and re-lays-out instantly; identical input =>
  identical layout.

## Performance

Targets: 100 nodes < 100 ms, 500 < 500 ms, 1000 < 2 s. Barycenter sweeps are
O(iterations x E); routing is per-channel sorting. A perf test exercises a generated
1000-node graph.

## Testing

Vitest unit tests per module: parser (syntax, errors, auto-create), cycles, layering,
ordering (crossing counts, determinism), positioning (no overlap, spacing), routing
(no node intersection), plus the performance test.

## Error Handling

Parse errors: listed under the editor with line numbers; last good diagram stays
visible. Unknown type => error. Duplicate component id => error. Empty input =>
empty canvas with hint.
