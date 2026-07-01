import { describe, expect, test } from 'vitest';
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
});
