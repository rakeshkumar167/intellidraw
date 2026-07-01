import { Graph, GraphEdge, GraphNode } from '../graph/model';
import { measureNode } from './measure';

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Layered random DAG shaped like a real architecture: mostly short edges. */
export function syntheticGraph(nodeCount: number, seed = 7): Graph {
  const rand = mulberry32(seed);
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const layerSize = Math.ceil(Math.sqrt(nodeCount) * 1.5);

  for (let i = 0; i < nodeCount; i++) {
    const id = `svc${i}`;
    nodes.set(id, { id, type: 'service', label: id, ...measureNode('service', id) });
  }
  let e = 0;
  for (let i = 0; i < nodeCount; i++) {
    const outDegree = 1 + Math.floor(rand() * 2);
    for (let k = 0; k < outDegree; k++) {
      const maxSpan = rand() < 0.9 ? layerSize * 2 : layerSize * 5;
      const j = i + 1 + Math.floor(rand() * maxSpan);
      if (j < nodeCount) {
        edges.push({ id: `e${e++}`, source: `svc${i}`, target: `svc${j}`, bidirectional: false });
      }
    }
  }
  return { nodes, edges, groups: new Map() };
}
