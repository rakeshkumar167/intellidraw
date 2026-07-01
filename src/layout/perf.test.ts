import { describe, expect, test } from 'vitest';
import { routeEdges } from '../routing/orthogonal';
import { syntheticGraph } from './synthetic';
import { SugiyamaLayout } from './index';

describe('layout performance', () => {
  const cases: [number, number][] = [
    [100, 100],
    [500, 500],
    [1000, 2000],
  ];

  for (const [n, budgetMs] of cases) {
    test(`${n} nodes under ${budgetMs}ms (layout + routing)`, () => {
      const graph = syntheticGraph(n);
      const warmGraph = syntheticGraph(50);
      routeEdges(warmGraph, new SugiyamaLayout().layout(warmGraph)); // warm up JIT

      // Best of 3 to shrug off CI/parallel-suite scheduling noise.
      let best = Infinity;
      let layoutSize = 0;
      let edgeCount = 0;
      for (let run = 0; run < 3; run++) {
        const start = performance.now();
        const layout = new SugiyamaLayout().layout(graph);
        const edges = routeEdges(graph, layout);
        best = Math.min(best, performance.now() - start);
        layoutSize = layout.nodes.size;
        edgeCount = edges.length;
      }
      expect(layoutSize).toBe(n);
      expect(edgeCount).toBe(graph.edges.length);
      expect(best).toBeLessThan(budgetMs);
    });
  }
});
