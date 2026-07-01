import { describe, expect, test } from 'vitest';
import { GraphEdge } from '../graph/model';
import { AcyclicEdge, makeAcyclic } from './cycles';

const edge = (id: string, source: string, target: string): GraphEdge => ({
  id,
  source,
  target,
  bidirectional: false,
});

/** Kahn's algorithm succeeds iff the edge set is acyclic. */
function isAcyclic(nodeIds: string[], edges: AcyclicEdge[]): boolean {
  const indegree = new Map(nodeIds.map((n) => [n, 0]));
  for (const e of edges) indegree.set(e.target, (indegree.get(e.target) ?? 0) + 1);
  const queue = nodeIds.filter((n) => indegree.get(n) === 0);
  let visited = 0;
  while (queue.length > 0) {
    const n = queue.shift()!;
    visited++;
    for (const e of edges) {
      if (e.source !== n) continue;
      const d = indegree.get(e.target)! - 1;
      indegree.set(e.target, d);
      if (d === 0) queue.push(e.target);
    }
  }
  return visited === nodeIds.length;
}

describe('makeAcyclic', () => {
  test('leaves a DAG untouched', () => {
    const edges = [edge('e0', 'A', 'B'), edge('e1', 'B', 'C'), edge('e2', 'A', 'C')];
    const result = makeAcyclic(['A', 'B', 'C'], edges);
    expect(result.every((e) => !e.reversed)).toBe(true);
    expect(result).toHaveLength(3);
  });

  test('breaks a 2-cycle by reversing exactly one edge', () => {
    const result = makeAcyclic(['A', 'B'], [edge('e0', 'A', 'B'), edge('e1', 'B', 'A')]);
    expect(result.filter((e) => e.reversed)).toHaveLength(1);
    expect(isAcyclic(['A', 'B'], result)).toBe(true);
  });

  test('breaks a 3-cycle', () => {
    const nodes = ['A', 'B', 'C'];
    const result = makeAcyclic(nodes, [
      edge('e0', 'A', 'B'),
      edge('e1', 'B', 'C'),
      edge('e2', 'C', 'A'),
    ]);
    expect(isAcyclic(nodes, result)).toBe(true);
    expect(result.filter((e) => e.reversed)).toHaveLength(1);
  });

  test('reversed edges have endpoints swapped and keep edgeId', () => {
    const result = makeAcyclic(['A', 'B'], [edge('e0', 'A', 'B'), edge('e1', 'B', 'A')]);
    const rev = result.find((e) => e.reversed)!;
    const orig = rev.edgeId === 'e0' ? { s: 'A', t: 'B' } : { s: 'B', t: 'A' };
    expect(rev.source).toBe(orig.t);
    expect(rev.target).toBe(orig.s);
  });

  test('excludes self-loops', () => {
    const result = makeAcyclic(['A'], [edge('e0', 'A', 'A')]);
    expect(result).toHaveLength(0);
  });

  test('deterministic', () => {
    const nodes = ['A', 'B', 'C', 'D'];
    const edges = [
      edge('e0', 'A', 'B'),
      edge('e1', 'B', 'C'),
      edge('e2', 'C', 'D'),
      edge('e3', 'D', 'A'),
      edge('e4', 'C', 'A'),
    ];
    expect(makeAcyclic(nodes, edges)).toEqual(makeAcyclic(nodes, edges));
  });
});
