import { describe, expect, test } from 'vitest';
import { parse } from '../dsl/parser';
import { buildGraph, Graph } from '../graph/model';
import { SugiyamaLayout } from '../layout/index';
import { inflate, segmentIntersectsRect } from '../layout/collision';
import { syntheticGraph } from '../layout/perf.test';
import { RoutedEdge, routeEdges } from './orthogonal';

function route(dsl: string) {
  const graph = buildGraph(parse(dsl));
  const layout = new SugiyamaLayout().layout(graph);
  return { graph, layout, edges: routeEdges(graph, layout) };
}

function expectAxisAligned(e: RoutedEdge) {
  for (let i = 1; i < e.points.length; i++) {
    const dx = e.points[i].x - e.points[i - 1].x;
    const dy = e.points[i].y - e.points[i - 1].y;
    expect(dx === 0 || dy === 0).toBe(true);
    expect(dx !== 0 || dy !== 0).toBe(true);
  }
}

function expectNoNodeHits(graph: Graph, layout: ReturnType<SugiyamaLayout['layout']>, edges: RoutedEdge[]) {
  for (const e of edges) {
    for (let i = 1; i < e.points.length; i++) {
      const [a, b] = [e.points[i - 1], e.points[i]];
      for (const n of layout.nodes.values()) {
        if (n.id === e.source || n.id === e.target) continue;
        // Inflated slightly negatively to tolerate border-adjacent runs.
        expect(segmentIntersectsRect(a.x, a.y, b.x, b.y, inflate(n, -0.5))).toBe(false);
      }
    }
  }
}

describe('routeEdges', () => {
  test('aligned A->B is a single straight vertical segment', () => {
    const { layout, edges } = route('A -> B');
    const [e] = edges;
    const a = layout.nodes.get('A')!;
    const b = layout.nodes.get('B')!;
    expect(e.points).toEqual([
      { x: a.x + a.width / 2, y: a.y + a.height },
      { x: b.x + b.width / 2, y: b.y },
    ]);
  });

  test('fan-out paths are orthogonal, start on source bottom and end on target top', () => {
    const { layout, edges } = route('A -> B\nA -> C');
    for (const e of edges) {
      expectAxisAligned(e);
      const src = layout.nodes.get(e.source)!;
      const dst = layout.nodes.get(e.target)!;
      expect(e.points[0].y).toBe(src.y + src.height);
      expect(e.points[0].x).toBeGreaterThan(src.x);
      expect(e.points[0].x).toBeLessThan(src.x + src.width);
      expect(e.points.at(-1)!.y).toBe(dst.y);
    }
  });

  test('overlapping horizontal runs in one channel get distinct tracks', () => {
    // X pattern that cannot be uncrossed: A->D and B->C with fixed extra edges
    // pinning the order (A->C, B->D also present makes K2,2).
    const { edges } = route('A -> C\nA -> D\nB -> C\nB -> D');
    const horizontals = edges.flatMap((e) => {
      const runs: { y: number; x1: number; x2: number }[] = [];
      for (let i = 1; i < e.points.length; i++) {
        if (e.points[i].y === e.points[i - 1].y) {
          runs.push({
            y: e.points[i].y,
            x1: Math.min(e.points[i].x, e.points[i - 1].x),
            x2: Math.max(e.points[i].x, e.points[i - 1].x),
          });
        }
      }
      return runs;
    });
    for (let i = 0; i < horizontals.length; i++) {
      for (let j = i + 1; j < horizontals.length; j++) {
        const a = horizontals[i];
        const b = horizontals[j];
        if (a.y === b.y) {
          const overlap = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
          expect(overlap).toBeLessThanOrEqual(0);
        }
      }
    }
  });

  test('no edge segment passes through a non-endpoint node (spec sample)', () => {
    const { graph, layout, edges } = route(
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
        'API -> NotificationService',
      ].join('\n'),
    );
    edges.forEach(expectAxisAligned);
    expectNoNodeHits(graph, layout, edges);
  });

  test('no edge segment passes through a non-endpoint node (synthetic 100)', () => {
    const graph = syntheticGraph(100);
    const layout = new SugiyamaLayout().layout(graph);
    const edges = routeEdges(graph, layout);
    edges.forEach(expectAxisAligned);
    expectNoNodeHits(graph, layout, edges);
  });

  test('cyclic edge routes with correct source/target endpoints', () => {
    const { layout, edges } = route('A -> B\nB -> C\nC -> A');
    const back = edges.find((e) => e.source === 'C' && e.target === 'A')!;
    expectAxisAligned(back);
    const c = layout.nodes.get('C')!;
    const a = layout.nodes.get('A')!;
    const first = back.points[0];
    const last = back.points.at(-1)!;
    // path must begin on C's border and end on A's border
    expect(first.y === c.y || first.y === c.y + c.height).toBe(true);
    expect(last.y === a.y || last.y === a.y + a.height).toBe(true);
  });

  test('self-loop is a small orthogonal loop on the node', () => {
    const { edges } = route('A -> A');
    const [e] = edges;
    expect(e.points.length).toBeGreaterThanOrEqual(4);
    expectAxisAligned(e);
  });

  test('bidirectional edge keeps its flag', () => {
    const { edges } = route('A <-> B : sync');
    expect(edges[0].bidirectional).toBe(true);
    expect(edges[0].label).toBe('sync');
  });

  test('label position sits on the path', () => {
    const { edges } = route('A -> B : HTTPS');
    expect(edges[0].labelPos).toBeDefined();
  });

  test('deterministic', () => {
    const dsl = 'A -> C\nA -> D\nB -> C\nB -> D\nC -> E';
    expect(route(dsl).edges).toEqual(route(dsl).edges);
  });
});
