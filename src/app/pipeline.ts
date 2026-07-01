import { parse } from '../dsl/parser';
import { ParseError } from '../dsl/types';
import { Graph, buildGraph } from '../graph/model';
import { LayoutResult, SugiyamaLayout } from '../layout/index';
import { RoutedEdge, routeEdges } from '../routing/orthogonal';

export interface PipelineResult {
  graph: Graph;
  layout: LayoutResult;
  edges: RoutedEdge[];
  errors: ParseError[];
}

const EMPTY_GRAPH: Graph = { nodes: new Map(), edges: [], groups: new Map() };

function emptyLayout(): LayoutResult {
  return {
    nodes: new Map(),
    groups: [],
    layerY: [],
    layerHeights: [],
    dummyWaypoints: new Map(),
    reversedEdgeIds: new Set(),
    layerOf: new Map(),
    width: 0,
    height: 0,
  };
}

export function renderPipeline(text: string): PipelineResult {
  const doc = parse(text);
  if (doc.errors.length > 0) {
    return { graph: EMPTY_GRAPH, layout: emptyLayout(), edges: [], errors: doc.errors };
  }
  const graph = buildGraph(doc);
  const layout = new SugiyamaLayout().layout(graph);
  const edges = routeEdges(graph, layout);
  return { graph, layout, edges, errors: [] };
}
