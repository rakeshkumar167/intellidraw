import { OrderingNode, OrderingResult } from './ordering';

export const NODE_GAP_X = 48;
export const LAYER_GAP_Y = 96;
export const GROUP_PAD = 28;
export const MARGIN = 40;
export const DUMMY_WIDTH = 8;

const REFINE_SWEEPS = 6;

/** Horizontal gap between adjacent nodes, honoring group frame padding. */
export function gapBetween(a: OrderingNode, b: OrderingNode): number {
  if (a.group !== undefined && a.group === b.group) return NODE_GAP_X;
  let gap = NODE_GAP_X;
  if (a.group !== undefined) gap += GROUP_PAD;
  if (b.group !== undefined) gap += GROUP_PAD;
  return gap;
}

export interface Positioned {
  x: number;
  y: number;
}

export interface CoordinateResult {
  /** Top-left of each node rect (dummy nodes included, at DUMMY_WIDTH x 0). */
  pos: Map<string, Positioned>;
  layerY: number[];
  layerHeights: number[];
  width: number;
  height: number;
}

/**
 * Coordinate assignment in "u-space": within a layer, the ordering plus
 * minimum-gap constraints reduce to `u_i = center_i - e_i` being
 * non-decreasing, where e_i is the cumulative minimal center offset. Nodes are
 * placed at their median-of-neighbors target in priority order (dummy chains
 * first, then high-degree nodes), clamped by already-placed peers. Six fixed
 * alternating sweeps; fully deterministic.
 */
export function assignCoordinates(
  ordering: OrderingResult,
  sizes: Map<string, { width: number; height: number }>,
): CoordinateResult {
  const { layers, segments } = ordering;

  const widthOf = (n: OrderingNode) => (n.isDummy ? DUMMY_WIDTH : sizes.get(n.id)!.width);
  const heightOf = (n: OrderingNode) => (n.isDummy ? 0 : sizes.get(n.id)!.height);

  // Vertical placement: stacked layer bands.
  const layerHeights = layers.map((layer) => Math.max(0, ...layer.map(heightOf)));
  const layerY: number[] = [];
  let y = MARGIN;
  for (let l = 0; l < layers.length; l++) {
    layerY.push(y);
    y += layerHeights[l] + LAYER_GAP_Y;
  }

  // e_i: minimal feasible center of node i relative to node 0's center.
  const offsets = layers.map((layer) => {
    const e: number[] = [0];
    for (let i = 1; i < layer.length; i++) {
      e.push(
        e[i - 1] +
          widthOf(layer[i - 1]) / 2 +
          gapBetween(layer[i - 1], layer[i]) +
          widthOf(layer[i]) / 2,
      );
    }
    return e;
  });

  // Initial centers: minimal packing from x = 0.
  const center = new Map<string, number>();
  for (let l = 0; l < layers.length; l++) {
    layers[l].forEach((n, i) => center.set(n.id, offsets[l][i]));
  }

  // Neighbor centers for refinement targets.
  const up = new Map<string, string[]>();
  const down = new Map<string, string[]>();
  for (const s of segments) {
    (down.get(s.source) ?? down.set(s.source, []).get(s.source)!).push(s.target);
    (up.get(s.target) ?? up.set(s.target, []).get(s.target)!).push(s.source);
  }
  const degree = (id: string) => (up.get(id)?.length ?? 0) + (down.get(id)?.length ?? 0);

  const median = (values: number[]): number | undefined => {
    if (values.length === 0) return undefined;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };

  const refineLayer = (l: number, dir: 'down' | 'up' | 'both') => {
    const layer = layers[l];
    if (layer.length === 0) return;
    const e = offsets[l];

    // Priority: dummies form straight long-edge chains, so they win; then degree.
    const order = layer
      .map((n, i) => ({ n, i, priority: n.isDummy ? Number.MAX_SAFE_INTEGER : degree(n.id) }))
      .sort((a, b) => b.priority - a.priority || a.i - b.i);

    const placedU: (number | undefined)[] = layer.map(() => undefined);
    for (const { n, i } of order) {
      const neighborIds =
        dir === 'down'
          ? up.get(n.id) ?? []
          : dir === 'up'
            ? down.get(n.id) ?? []
            : [...(up.get(n.id) ?? []), ...(down.get(n.id) ?? [])];
      const target = median(neighborIds.map((m) => center.get(m)!)) ?? center.get(n.id)!;
      let u = target - e[i];
      for (let j = 0; j < i; j++) {
        if (placedU[j] !== undefined) u = Math.max(u, placedU[j]!);
      }
      for (let j = i + 1; j < layer.length; j++) {
        if (placedU[j] !== undefined) u = Math.min(u, placedU[j]!);
      }
      placedU[i] = u;
    }
    layer.forEach((n, i) => center.set(n.id, placedU[i]! + e[i]));
  };

  for (let sweep = 0; sweep < REFINE_SWEEPS; sweep++) {
    if (sweep % 2 === 0) {
      for (let l = 1; l < layers.length; l++) refineLayer(l, 'down');
    } else {
      for (let l = layers.length - 2; l >= 0; l--) refineLayer(l, 'up');
    }
  }
  // Final balancing pass against both neighbor directions.
  for (let l = 0; l < layers.length; l++) refineLayer(l, 'both');

  // Translate so the leftmost node border sits at MARGIN.
  let minLeft = Infinity;
  let maxRight = -Infinity;
  for (let l = 0; l < layers.length; l++) {
    for (const n of layers[l]) {
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
