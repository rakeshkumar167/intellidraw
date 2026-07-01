import { describe, expect, test } from 'vitest';
import { parse } from '../dsl/parser';
import { buildGraph, predecessors, successors } from './model';

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

describe('buildGraph', () => {
  test('auto-creates undeclared edge endpoints as services', () => {
    const g = buildGraph(parse(SPEC_SAMPLE));
    const auto = g.nodes.get('NotificationService');
    expect(auto).toBeDefined();
    expect(auto).toMatchObject({ type: 'service', label: 'NotificationService' });
  });

  test('populates node sizes', () => {
    const g = buildGraph(parse(SPEC_SAMPLE));
    for (const node of g.nodes.values()) {
      expect(node.width).toBeGreaterThan(0);
      expect(node.height).toBeGreaterThan(0);
    }
  });

  test('preserves insertion order of nodes and edges', () => {
    const g = buildGraph(parse(SPEC_SAMPLE));
    expect([...g.nodes.keys()]).toEqual([
      'API',
      'UserService',
      'Redis',
      'Aurora',
      'Kafka',
      'NotificationService',
    ]);
    expect(g.edges.map((e) => e.id)).toEqual(['e0', 'e1', 'e2', 'e3', 'e4']);
  });

  test('carries groups and membership', () => {
    const g = buildGraph(parse('group G label="Grp" {\ncomponent A\n}\nA -> B'));
    expect(g.groups.get('G')).toEqual({ id: 'G', label: 'Grp' });
    expect(g.nodes.get('A')?.group).toBe('G');
    expect(g.nodes.get('B')?.group).toBeUndefined();
  });
});

describe('adjacency', () => {
  test('successors and predecessors', () => {
    const g = buildGraph(parse(SPEC_SAMPLE));
    expect(successors(g, 'UserService')).toEqual(['Redis', 'Aurora', 'Kafka']);
    expect(predecessors(g, 'UserService')).toEqual(['API']);
    expect(successors(g, 'NotificationService')).toEqual([]);
  });
});
