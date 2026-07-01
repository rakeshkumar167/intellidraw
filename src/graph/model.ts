import { NodeType, ParsedDocument } from '../dsl/types';
import { measureNode } from '../layout/measure';

export interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  color?: string;
  group?: string;
  width: number;
  height: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  bidirectional: boolean;
}

export interface GraphGroup {
  id: string;
  label: string;
}

export interface Graph {
  nodes: Map<string, GraphNode>;
  edges: GraphEdge[];
  groups: Map<string, GraphGroup>;
}

export function buildGraph(doc: ParsedDocument): Graph {
  const nodes = new Map<string, GraphNode>();
  const groups = new Map<string, GraphGroup>();

  for (const g of doc.groups) {
    groups.set(g.id, { id: g.id, label: g.label });
  }

  for (const c of doc.components) {
    const node: GraphNode = {
      id: c.id,
      type: c.type,
      label: c.label,
      ...measureNode(c.type, c.label),
    };
    if (c.color !== undefined) node.color = c.color;
    if (c.group !== undefined) node.group = c.group;
    nodes.set(c.id, node);
  }

  const edges: GraphEdge[] = doc.edges.map((e, i) => {
    for (const endpoint of [e.source, e.target]) {
      if (!nodes.has(endpoint)) {
        nodes.set(endpoint, {
          id: endpoint,
          type: 'service',
          label: endpoint,
          ...measureNode('service', endpoint),
        });
      }
    }
    const edge: GraphEdge = {
      id: `e${i}`,
      source: e.source,
      target: e.target,
      bidirectional: e.bidirectional,
    };
    if (e.label !== undefined) edge.label = e.label;
    return edge;
  });

  return { nodes, edges, groups };
}

export function successors(g: Graph, id: string): string[] {
  return g.edges.filter((e) => e.source === id).map((e) => e.target);
}

export function predecessors(g: Graph, id: string): string[] {
  return g.edges.filter((e) => e.target === id).map((e) => e.source);
}
