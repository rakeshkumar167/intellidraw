import { describe, expect, test } from 'vitest';
import { rectsIntersect } from '../layout/collision';
import { renderPipeline } from './pipeline';
import { SAMPLE_DSL } from './sample';

describe('renderPipeline', () => {
  test('renders the bundled sample without errors', () => {
    const result = renderPipeline(SAMPLE_DSL);
    expect(result.errors).toEqual([]);
    expect(result.layout.nodes.size).toBeGreaterThan(5);
    expect(result.edges.length).toBeGreaterThan(5);
    expect(result.layout.groups.length).toBeGreaterThan(0);
  });

  test('bundled sample has no overlapping nodes even after frame eviction', () => {
    const { layout } = renderPipeline(SAMPLE_DSL);
    const nodes = [...layout.nodes.values()];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        expect(
          rectsIntersect(nodes[i], nodes[j]),
          `${nodes[i].id} overlaps ${nodes[j].id}`,
        ).toBe(false);
      }
    }
  });

  test('reports errors and an empty scene for invalid input', () => {
    const result = renderPipeline('component A type=nonsense\ngarbage line');
    expect(result.errors.length).toBe(2);
    expect(result.layout.nodes.size).toBe(0);
    expect(result.edges).toEqual([]);
  });

  test('empty input renders an empty scene without errors', () => {
    const result = renderPipeline('');
    expect(result.errors).toEqual([]);
    expect(result.layout.nodes.size).toBe(0);
  });

  test('symmetric engine renders the sample overlap-free', () => {
    const result = renderPipeline(SAMPLE_DSL, 'symmetric');
    expect(result.errors).toEqual([]);
    expect(result.layout.nodes.size).toBeGreaterThan(5);
    const nodes = [...result.layout.nodes.values()];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        expect(
          rectsIntersect(nodes[i], nodes[j]),
          `${nodes[i].id} overlaps ${nodes[j].id}`,
        ).toBe(false);
      }
    }
  });

  test('engine defaults to classic', () => {
    expect(renderPipeline(SAMPLE_DSL)).toEqual(renderPipeline(SAMPLE_DSL, 'classic'));
  });
});
