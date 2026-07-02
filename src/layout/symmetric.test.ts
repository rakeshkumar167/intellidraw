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
