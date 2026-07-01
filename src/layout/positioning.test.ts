import { describe, expect, test } from 'vitest';
import { GraphNode } from '../graph/model';
import { measureNode } from './measure';
import { rectsIntersect } from './collision';
import { makeAcyclic } from './cycles';
import { assignLayers } from './layering';
import { orderLayers } from './ordering';
import { GROUP_PAD, NODE_GAP_X, LAYER_GAP_Y, assignCoordinates } from './positioning';

function node(id: string, group?: string): GraphNode {
  const n: GraphNode = { id, type: 'service', label: id, ...measureNode('service', id) };
  if (group !== undefined) n.group = group;
  return n;
}

/** mulberry32 — deterministic PRNG for reproducible "random" graphs. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pipeline(nodes: GraphNode[], rawEdges: { source: string; target: string }[]) {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const edges = rawEdges.map((e, i) => ({ ...e, id: `e${i}`, bidirectional: false }));
  const acyclic = makeAcyclic([...nodeMap.keys()], edges);
  const layerOf = assignLayers([...nodeMap.keys()], acyclic);
  const ordering = orderLayers(nodeMap, layerOf, acyclic);
  const sizes = new Map(nodes.map((n) => [n.id, { width: n.width, height: n.height }]));
  return { ordering, result: assignCoordinates(ordering, sizes), nodeMap, layerOf };
}

describe('assignCoordinates', () => {
  test('no node rects overlap on a seeded random graph', () => {
    const rand = mulberry32(42);
    const nodes = Array.from({ length: 40 }, (_, i) => node(`n${i}`));
    const rawEdges: { source: string; target: string }[] = [];
    for (let i = 0; i < 40; i++) {
      for (let j = i + 1; j < 40; j++) {
        if (rand() < 0.06) rawEdges.push({ source: `n${i}`, target: `n${j}` });
      }
    }
    const { result, nodeMap } = pipeline(nodes, rawEdges);
    const rects = [...nodeMap.values()].map((n) => ({
      x: result.pos.get(n.id)!.x,
      y: result.pos.get(n.id)!.y,
      width: n.width,
      height: n.height,
    }));
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        expect(rectsIntersect(rects[i], rects[j])).toBe(false);
      }
    }
  });

  test('same-layer nodes keep at least NODE_GAP_X between borders', () => {
    const { result, nodeMap, layerOf } = pipeline(
      [node('A'), node('B'), node('C'), node('D')],
      [
        { source: 'A', target: 'C' },
        { source: 'A', target: 'D' },
        { source: 'B', target: 'C' },
        { source: 'B', target: 'D' },
      ],
    );
    const byLayer = new Map<number, string[]>();
    for (const id of nodeMap.keys()) {
      const l = layerOf.get(id)!;
      byLayer.set(l, [...(byLayer.get(l) ?? []), id]);
    }
    for (const ids of byLayer.values()) {
      const sorted = ids
        .map((id) => ({ x: result.pos.get(id)!.x, w: nodeMap.get(id)!.width }))
        .sort((a, b) => a.x - b.x);
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i].x - (sorted[i - 1].x + sorted[i - 1].w)).toBeGreaterThanOrEqual(
          NODE_GAP_X - 0.01,
        );
      }
    }
  });

  test('single-child chain is perfectly straight', () => {
    const { result, nodeMap } = pipeline(
      [node('A'), node('LongNameService'), node('C')],
      [
        { source: 'A', target: 'LongNameService' },
        { source: 'LongNameService', target: 'C' },
      ],
    );
    const centers = ['A', 'LongNameService', 'C'].map(
      (id) => result.pos.get(id)!.x + nodeMap.get(id)!.width / 2,
    );
    expect(centers[1]).toBeCloseTo(centers[0], 5);
    expect(centers[2]).toBeCloseTo(centers[0], 5);
  });

  test('adjacent different groups get extra frame spacing', () => {
    const { result, nodeMap, layerOf } = pipeline(
      [node('P'), node('a', 'G1'), node('b', 'G2')],
      [
        { source: 'P', target: 'a' },
        { source: 'P', target: 'b' },
      ],
    );
    expect(layerOf.get('a')).toBe(layerOf.get('b'));
    const [left, right] = [
      { x: result.pos.get('a')!.x, w: nodeMap.get('a')!.width },
      { x: result.pos.get('b')!.x, w: nodeMap.get('b')!.width },
    ].sort((p, q) => p.x - q.x);
    expect(right.x - (left.x + left.w)).toBeGreaterThanOrEqual(NODE_GAP_X + 2 * GROUP_PAD - 0.01);
  });

  test('layers are separated vertically by at least LAYER_GAP_Y', () => {
    const { result } = pipeline(
      [node('A'), node('B')],
      [{ source: 'A', target: 'B' }],
    );
    expect(result.layerY[1]).toBeGreaterThanOrEqual(
      result.layerY[0] + result.layerHeights[0] + LAYER_GAP_Y - 0.01,
    );
  });

  test('deterministic', () => {
    const nodes = [node('A'), node('B'), node('C'), node('D')];
    const rawEdges = [
      { source: 'A', target: 'B' },
      { source: 'A', target: 'C' },
      { source: 'B', target: 'D' },
      { source: 'C', target: 'D' },
    ];
    expect(pipeline(nodes, rawEdges).result).toEqual(pipeline(nodes, rawEdges).result);
  });
});
