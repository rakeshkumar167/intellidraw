# Symmetric Layout Engine — Design

Date: 2026-07-03
Status: Approved for planning

## Goal

Add a second, user-selectable layout engine that enforces **local symmetry**
(each parent centered exactly over its children) while preserving the
non-overlap guarantee, and that maximizes **zero-bend vertical edges** through
placement alone. The existing layout must remain available unchanged, and the
engine mechanism must be modular so future engines plug in with minimal wiring.

## Decisions (from brainstorming)

- **Symmetry semantics:** local — a parent sits at the midpoint of its
  children; the diagram as a whole is not required to be mirror-symmetric.
- **Straight arrows:** "straight" means a single vertical orthogonal segment.
  The orthogonal router (`src/routing/orthogonal.ts`) is unchanged;
  straightness comes purely from vertically aligning connected nodes.
  Misaligned edges keep today's Manhattan bends.
- **Algorithm:** tree-skeleton symmetric placement (Reingold–Tilford adapted
  to a layered DAG over a primary-parent spanning forest). Brandes–Köpf and
  weighted-objective approaches were considered and rejected: both produce
  only approximate centering, and the user's requirement is exact
  parent-over-children symmetry.
- **UI:** toolbar dropdown; changing it re-renders immediately; choice
  persisted in `localStorage`; default remains the current engine.

## Architecture

### Engine registry

`src/layout/index.ts` keeps the existing `LayoutEngine` interface and
`LayoutResult` contract untouched and adds:

```ts
export type LayoutEngineId = 'classic' | 'symmetric';
export const layoutEngines: Record<LayoutEngineId, { label: string; create(): LayoutEngine }> = {
  classic:   { label: 'Classic',   create: () => new SugiyamaLayout() },
  symmetric: { label: 'Symmetric', create: () => new SymmetricLayout() },
};
```

`renderPipeline(text)` gains an optional second parameter
(`engineId: LayoutEngineId = 'classic'`) and instantiates the engine from the
registry instead of hard-coding `SugiyamaLayout`. Because every engine returns
the same `LayoutResult`, the router, renderer, dragging, group frames, and
exporters need no changes. Adding a future engine = one class + one registry
entry.

### Shared stages

`SymmetricLayout` (new file `src/layout/symmetric.ts`) reuses the existing
pipeline stages exactly as `SugiyamaLayout` does:

1. `makeAcyclic` (cycles.ts)
2. `assignLayers` (layering.ts)
3. `orderLayers` (ordering.ts) — crossing minimization and group contiguity
   still apply.

It diverges only at coordinate assignment. The post-placement steps currently
inside `SugiyamaLayout.layout` — dummy-waypoint extraction, group-frame
computation, frame eviction, and bounds normalization — are extracted into
shared helpers in `src/layout/` used by both engines. This refactor must not
change `SugiyamaLayout` output (guarded by existing tests).

## Symmetric coordinate assignment

Operates on the dummy-expanded ordering (`OrderingResult`), so long edges
participate via their dummy chains and stay straight through intermediate
layers when their endpoints align.

1. **Primary-parent forest.** For each node (including dummies) with incoming
   segments, choose one primary parent: the parent whose index in its layer's
   ordering is nearest to the node's own index; ties broken by smaller node
   id. Nodes without parents are roots. Fully deterministic.
2. **Bottom-up extent pass.** Compute a per-subtree contour (leftmost/rightmost
   extent per layer). Children of the same parent are packed left-to-right in
   layer order using the existing `gapBetween` logic (which already encodes
   `NODE_GAP_X` and `GROUP_PAD`), and the parent's x-center is set to the
   exact midpoint between its first and last child's centers. A single child
   therefore aligns dead-center under its parent → zero-bend vertical edge.
3. **Sibling-subtree separation.** Adjacent subtrees are shifted apart until
   their contours respect minimum gaps at every shared layer. This guarantees
   non-overlap by construction.
4. **Symmetry yields to non-overlap.** If centering a parent would violate the
   gap to an already-placed node in its own layer (possible because layer
   ordering constrains left-to-right order across subtrees), the parent shifts
   the minimum distance needed. Non-overlap is the hard constraint; symmetry
   is best-effort within it.
5. **Roots / forests.** Multiple roots (and disconnected components) are
   packed side by side, each centered over its own subtree.
6. **Non-tree edges** (a multi-parent node's secondary parents, cross links)
   do not influence placement and keep Manhattan bends. Straightening them is
   an explicit non-goal of this iteration; a chain-straightening sweep is a
   possible follow-up.

Vertical placement (layer bands: `layerY`, `layerHeights`, `LAYER_GAP_Y`,
`MARGIN`) is identical to the classic engine.

## UI

- A `Layout` `<select>` in the toolbar in `App.tsx`, between Fit and the
  export buttons, populated from the `layoutEngines` registry.
- `engineId` React state; on change, re-run `renderPipeline(text, engineId)`
  immediately (same code path as the Render button) and persist to
  `localStorage` key `intellidraw.layoutEngine`.
- On startup, read the stored value; unknown or missing values fall back to
  `classic`, so out-of-the-box behavior is unchanged.
- Switching engines discards manual node-drag adjustments, exactly as
  pressing Render does today.

## Error handling

No new error paths. Parse errors short-circuit before layout as today.
`SymmetricLayout` accepts anything `buildGraph` produces — cycles,
multi-edges, self-loops, disconnected components — because the shared
upstream stages already normalize them.

## Testing

- **`src/layout/symmetric.test.ts`** (new):
  - fan-out parent's center equals midpoint of first/last child centers;
  - single-child chain is exactly vertically aligned across layers, and the
    routed edge is a single vertical segment;
  - multi-parent node centers under its primary parent per the selection rule;
  - non-overlap property test over randomly generated DAGs (reuse existing
    random-graph generators from the layout test suite);
  - determinism: identical input yields identical coordinates across runs;
  - group frames contain their members and eviction still applies.
- **`src/app/pipeline.test.ts`** (extended): `renderPipeline(text,
  'symmetric')` produces a valid scene; omitting the argument uses `classic`.
- **Regression:** all existing tests pass unchanged; the shared-helper
  refactor must leave `SugiyamaLayout` output byte-identical.

## Non-goals

- Chain-straightening sweep for non-tree edges (possible follow-up).
- Diagonal/curved edge rendering.
- Global mirror symmetry of the whole drawing.
- DSL directive for layout selection.
- Persisting manual drag positions across engine switches.
