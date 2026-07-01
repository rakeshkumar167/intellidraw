import { describe, expect, test } from 'vitest';
import { GraphNode } from '../graph/model';
import { measureNode } from './measure';
import { AcyclicEdge } from './cycles';
import { OrderingNode, countCrossings, orderLayers } from './ordering';

function node(id: string, group?: string): GraphNode {
  const n: GraphNode = { id, type: 'service', label: id, ...measureNode('service', id) };
  if (group !== undefined) n.group = group;
  return n;
}

function nodeMap(...nodes: GraphNode[]): Map<string, GraphNode> {
  return new Map(nodes.map((n) => [n.id, n]));
}

const edge = (source: string, target: string, edgeId = `${source}-${target}`): AcyclicEdge => ({
  source,
  target,
  edgeId,
  reversed: false,
});

const onode = (id: string): OrderingNode => ({ id, layer: 0, isDummy: false });

describe('countCrossings', () => {
  test('counts one crossing for an X pattern', () => {
    const layers = [
      [onode('A'), onode('B')],
      [onode('C'), onode('D')],
    ];
    layers[1].forEach((n) => (n.layer = 1));
    expect(countCrossings(layers, [{ source: 'A', target: 'D' }, { source: 'B', target: 'C' }])).toBe(1);
    expect(countCrossings(layers, [{ source: 'A', target: 'C' }, { source: 'B', target: 'D' }])).toBe(0);
  });
});

describe('orderLayers', () => {
  test('uncrosses a two-layer X pattern', () => {
    const nodes = nodeMap(node('A'), node('B'), node('C'), node('D'));
    const layerOf = new Map([['A', 0], ['B', 0], ['C', 1], ['D', 1]]);
    const edges = [edge('A', 'D'), edge('B', 'C')];
    const result = orderLayers(nodes, layerOf, edges);
    expect(countCrossings(result.layers, result.segments)).toBe(0);
  });

  test('inserts dummy chain for a 3-span edge', () => {
    const nodes = nodeMap(node('A'), node('B'), node('C'), node('D'));
    const layerOf = new Map([['A', 0], ['B', 1], ['C', 2], ['D', 3]]);
    const edges = [edge('A', 'B'), edge('B', 'C'), edge('C', 'D'), edge('A', 'D', 'long')];
    const result = orderLayers(nodes, layerOf, edges);
    const dummies = result.layers.flat().filter((n) => n.isDummy);
    expect(dummies).toHaveLength(2);
    expect(dummies.every((d) => d.edgeId === 'long')).toBe(true);
    expect(dummies.map((d) => d.layer).sort()).toEqual([1, 2]);
    // chain connectivity: A -> d1 -> d2 -> D as segments
    const longSegs = result.segments.filter((s) => s.edgeId === 'long');
    expect(longSegs).toHaveLength(3);
  });

  test('keeps group members contiguous in every layer', () => {
    const nodes = nodeMap(
      node('P1'),
      node('P2'),
      node('g1a', 'G1'),
      node('g2a', 'G2'),
      node('g1b', 'G1'),
    );
    const layerOf = new Map([['P1', 0], ['P2', 0], ['g1a', 1], ['g2a', 1], ['g1b', 1]]);
    const edges = [edge('P1', 'g1a'), edge('P1', 'g1b'), edge('P2', 'g2a')];
    const result = orderLayers(nodes, layerOf, edges);
    const layer1 = result.layers[1].map((n) => nodes.get(n.id)?.group);
    const g1Positions = layer1.flatMap((g, i) => (g === 'G1' ? [i] : []));
    expect(g1Positions[1] - g1Positions[0]).toBe(1);
  });

  test('reduces crossings on a denser graph', () => {
    const nodes = nodeMap(...['A', 'B', 'C', 'X', 'Y', 'Z'].map((id) => node(id)));
    const layerOf = new Map([['A', 0], ['B', 0], ['C', 0], ['X', 1], ['Y', 1], ['Z', 1]]);
    // Perfect matching reversed: A->Z, B->Y, C->X has 3 crossings in input order.
    const edges = [edge('A', 'Z'), edge('B', 'Y'), edge('C', 'X')];
    const result = orderLayers(nodes, layerOf, edges);
    expect(countCrossings(result.layers, result.segments)).toBe(0);
  });

  test('deterministic', () => {
    const nodes = nodeMap(...['A', 'B', 'C', 'X', 'Y', 'Z'].map((id) => node(id)));
    const layerOf = new Map([['A', 0], ['B', 0], ['C', 0], ['X', 1], ['Y', 1], ['Z', 1]]);
    const edges = [edge('A', 'Z'), edge('B', 'Y'), edge('C', 'X'), edge('A', 'X')];
    expect(orderLayers(nodes, layerOf, edges)).toEqual(orderLayers(nodes, layerOf, edges));
  });
});
