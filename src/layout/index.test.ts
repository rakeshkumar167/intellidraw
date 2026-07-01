import { describe, expect, test } from 'vitest';
import { parse } from '../dsl/parser';
import { buildGraph } from '../graph/model';
import { rectsIntersect } from './collision';
import { SugiyamaLayout } from './index';

const SPEC_SAMPLE = [
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
].join('\n');

const GROUPED = [
  'component API',
  'group Backend label="Backend" {',
  'component UserService',
  'component OrderService',
  '}',
  'component Standalone',
  'API -> UserService',
  'API -> OrderService',
  'API -> Standalone',
].join('\n');

describe('SugiyamaLayout', () => {
  test('spec sample: no node overlaps', () => {
    const layout = new SugiyamaLayout().layout(buildGraph(parse(SPEC_SAMPLE)));
    const rects = [...layout.nodes.values()];
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        expect(rectsIntersect(rects[i], rects[j])).toBe(false);
      }
    }
  });

  test('long edges expose dummy waypoints', () => {
    // A->B->C->D chain plus long edge A->D
    const layout = new SugiyamaLayout().layout(
      buildGraph(parse('A -> B\nB -> C\nC -> D\nA -> D')),
    );
    const long = layout.dummyWaypoints.get('e3');
    expect(long).toBeDefined();
    expect(long!.length).toBe(2);
  });

  test('cyclic input lays out without error and reports reversed edges', () => {
    const layout = new SugiyamaLayout().layout(buildGraph(parse('A -> B\nB -> C\nC -> A')));
    expect(layout.nodes.size).toBe(3);
    expect(layout.reversedEdgeIds.size).toBe(1);
  });

  test('group frame contains members and no outsiders', () => {
    const layout = new SugiyamaLayout().layout(buildGraph(parse(GROUPED)));
    const frame = layout.groups.find((g) => g.id === 'Backend')!;
    expect(frame).toBeDefined();
    for (const id of ['UserService', 'OrderService']) {
      const n = layout.nodes.get(id)!;
      expect(n.x).toBeGreaterThanOrEqual(frame.x);
      expect(n.y).toBeGreaterThanOrEqual(frame.y);
      expect(n.x + n.width).toBeLessThanOrEqual(frame.x + frame.width);
      expect(n.y + n.height).toBeLessThanOrEqual(frame.y + frame.height);
    }
    for (const id of ['API', 'Standalone']) {
      expect(rectsIntersect(layout.nodes.get(id)!, frame)).toBe(false);
    }
  });

  test('non-member on an intermediate layer is pushed out of the group frame', () => {
    // A and C are grouped but sit on layers 0 and 2; B connects them from
    // outside the group and would naturally land inside the frame.
    const layout = new SugiyamaLayout().layout(
      buildGraph(parse('group G {\ncomponent A\ncomponent C\n}\ncomponent B\nA -> B\nB -> C')),
    );
    const frame = layout.groups.find((g) => g.id === 'G')!;
    expect(rectsIntersect(layout.nodes.get('B')!, frame)).toBe(false);
  });

  test('identical input produces identical layout', () => {
    const a = new SugiyamaLayout().layout(buildGraph(parse(SPEC_SAMPLE)));
    const b = new SugiyamaLayout().layout(buildGraph(parse(SPEC_SAMPLE)));
    expect(a).toEqual(b);
  });

  test('canvas size covers all nodes', () => {
    const layout = new SugiyamaLayout().layout(buildGraph(parse(SPEC_SAMPLE)));
    for (const n of layout.nodes.values()) {
      expect(n.x + n.width).toBeLessThanOrEqual(layout.width);
      expect(n.y + n.height).toBeLessThanOrEqual(layout.height);
    }
  });
});
