import { describe, expect, test } from 'vitest';
import { AcyclicEdge } from './cycles';
import { assignLayers } from './layering';

const edge = (source: string, target: string, edgeId = `${source}-${target}`): AcyclicEdge => ({
  source,
  target,
  edgeId,
  reversed: false,
});

describe('assignLayers', () => {
  test('chain gets consecutive layers', () => {
    const layers = assignLayers(['A', 'B', 'C'], [edge('A', 'B'), edge('B', 'C')]);
    expect(layers.get('A')).toBe(0);
    expect(layers.get('B')).toBe(1);
    expect(layers.get('C')).toBe(2);
  });

  test('diamond', () => {
    const layers = assignLayers(
      ['A', 'B', 'C', 'D'],
      [edge('A', 'B'), edge('A', 'C'), edge('B', 'D'), edge('C', 'D')],
    );
    expect(layers.get('A')).toBe(0);
    expect(layers.get('B')).toBe(1);
    expect(layers.get('C')).toBe(1);
    expect(layers.get('D')).toBe(2);
  });

  test('every edge points to a strictly lower layer', () => {
    const nodes = ['A', 'B', 'C', 'D', 'E'];
    const edges = [edge('A', 'B'), edge('A', 'D'), edge('B', 'C'), edge('D', 'E'), edge('C', 'E')];
    const layers = assignLayers(nodes, edges);
    for (const e of edges) {
      expect(layers.get(e.target)!).toBeGreaterThan(layers.get(e.source)!);
    }
  });

  test('pull-up moves a lone source next to its target', () => {
    // A->B->C->D is the long chain; X->D would sit at layer 0 under longest-path
    // but should be pulled down to layer 2 (just above D at 3).
    const layers = assignLayers(
      ['A', 'B', 'C', 'D', 'X'],
      [edge('A', 'B'), edge('B', 'C'), edge('C', 'D'), edge('X', 'D')],
    );
    expect(layers.get('D')).toBe(3);
    expect(layers.get('X')).toBe(2);
  });

  test('disconnected node lands on layer 0', () => {
    const layers = assignLayers(['A', 'B', 'Lonely'], [edge('A', 'B')]);
    expect(layers.get('Lonely')).toBe(0);
  });

  test('layers are contiguous from 0', () => {
    const layers = assignLayers(['A', 'B', 'C'], [edge('A', 'B'), edge('B', 'C')]);
    const values = [...new Set(layers.values())].sort((a, b) => a - b);
    expect(values).toEqual([0, 1, 2]);
  });
});
