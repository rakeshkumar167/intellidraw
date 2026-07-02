import { describe, expect, test } from 'vitest';
import { parse } from '../dsl/parser';
import { buildGraph } from '../graph/model';
import { routeEdges } from '../routing/orthogonal';
import { OrderingNode, OrderingResult } from './ordering';
import { rectsIntersect } from './collision';
import { LayoutResult } from './index';
import { buildPrimaryForest, SymmetricLayout } from './symmetric';

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
