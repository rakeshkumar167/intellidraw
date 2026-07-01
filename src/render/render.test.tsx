import { describe, expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse } from '../dsl/parser';
import { buildGraph } from '../graph/model';
import { SugiyamaLayout } from '../layout/index';
import { routeEdges } from '../routing/orthogonal';
import { DiagramSvg } from './DiagramSvg';

function renderDsl(dsl: string): string {
  const graph = buildGraph(parse(dsl));
  const layout = new SugiyamaLayout().layout(graph);
  const edges = routeEdges(graph, layout);
  return renderToStaticMarkup(<DiagramSvg layout={layout} edges={edges} />);
}

describe('DiagramSvg', () => {
  test('renders one shape element per node with its type', () => {
    const html = renderDsl('component A type=database\ncomponent B type=cache\nA -> B');
    expect(html.match(/data-node-type="database"/g)).toHaveLength(1);
    expect(html.match(/data-node-type="cache"/g)).toHaveLength(1);
  });

  test('renders every routed edge as a path', () => {
    const html = renderDsl('A -> B\nA -> C\nB -> D');
    expect(html.match(/data-edge-id=/g)).toHaveLength(3);
  });

  test('bidirectional edges carry markers on both ends', () => {
    const html = renderDsl('A <-> B');
    expect(html).toContain('marker-start');
    expect(html).toContain('marker-end');
  });

  test('directed edges only have an end marker', () => {
    const html = renderDsl('A -> B');
    expect(html).toContain('marker-end');
    expect(html).not.toContain('marker-start');
  });

  test('renders group frames with labels', () => {
    const html = renderDsl('group Backend label="Core Services" {\ncomponent A\n}\nA -> B');
    expect(html).toContain('data-group-id="Backend"');
    // group labels render in letterspaced small caps
    expect(html).toContain('CORE SERVICES');
  });

  test('renders node labels and edge labels', () => {
    const html = renderDsl('component API label="Public API"\nAPI -> B : HTTPS');
    expect(html).toContain('Public API');
    expect(html).toContain('HTTPS');
  });

  test('all six node types render', () => {
    const types = ['service', 'database', 'cache', 'queue', 'external', 'lambda'];
    const html = renderDsl(types.map((t, i) => `component N${i} type=${t}`).join('\n'));
    for (const t of types) expect(html).toContain(`data-node-type="${t}"`);
  });
});
