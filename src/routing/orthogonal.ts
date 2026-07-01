import { Graph } from '../graph/model';
import { LayoutResult, PositionedNode } from '../layout/index';

export interface Point {
  x: number;
  y: number;
}

export interface RoutedEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  bidirectional: boolean;
  points: Point[];
  labelPos: Point;
}

const TRACK_GAP = 14;
const TRACK_CLEARANCE = 8;
const SELF_LOOP_EXTENT = 28;

interface Chain {
  edgeId: string;
  upper: PositionedNode;
  lower: PositionedNode;
  upperLayer: number;
  /** x per visited layer: [exit port, ...dummy centers, entry port]. */
  xs: number[];
}

interface Run {
  edgeId: string;
  minX: number;
  maxX: number;
}

/**
 * Manhattan routing over a layered layout. Edges leave the upper node's bottom
 * side and enter the lower node's top side through evenly distributed ports.
 * Horizontal movement happens only in inter-layer channels on assigned tracks,
 * so no segment can cross a node; long edges bend at their dummy waypoints.
 */
export function routeEdges(graph: Graph, layout: LayoutResult): RoutedEdge[] {
  const centerX = (n: PositionedNode) => n.x + n.width / 2;

  // Geometric orientation (upper -> lower) per edge; reversed edges flip back
  // at the end so point order always runs source -> target.
  const bottomWants = new Map<string, { edgeId: string; desired: number }[]>();
  const topWants = new Map<string, { edgeId: string; desired: number }[]>();

  const geometry = new Map<string, { upper: PositionedNode; lower: PositionedNode; waypoints: Point[] }>();
  for (const e of graph.edges) {
    if (e.source === e.target) continue;
    const reversed = layout.reversedEdgeIds.has(e.id);
    const upper = layout.nodes.get(reversed ? e.target : e.source)!;
    const lower = layout.nodes.get(reversed ? e.source : e.target)!;
    const waypoints = layout.dummyWaypoints.get(e.id) ?? [];
    geometry.set(e.id, { upper, lower, waypoints });

    const exitDesired = waypoints[0]?.x ?? centerX(lower);
    const entryDesired = waypoints.at(-1)?.x ?? centerX(upper);
    (bottomWants.get(upper.id) ?? bottomWants.set(upper.id, []).get(upper.id)!).push({
      edgeId: e.id,
      desired: exitDesired,
    });
    (topWants.get(lower.id) ?? topWants.set(lower.id, []).get(lower.id)!).push({
      edgeId: e.id,
      desired: entryDesired,
    });
  }

  // Evenly spaced ports along a node side, ordered by desired exit direction.
  const portX = (
    wants: Map<string, { edgeId: string; desired: number }[]>,
    nodeId: string,
    edgeId: string,
  ): number => {
    const node = layout.nodes.get(nodeId)!;
    const list = [...wants.get(nodeId)!].sort((a, b) => a.desired - b.desired || (a.edgeId < b.edgeId ? -1 : 1));
    const i = list.findIndex((w) => w.edgeId === edgeId);
    return node.x + (node.width * (i + 1)) / (list.length + 1);
  };

  // Build per-edge x chains and collect horizontal runs per channel.
  const chains: Chain[] = [];
  const channelRuns = new Map<number, Run[]>();
  for (const e of graph.edges) {
    const geo = geometry.get(e.id);
    if (!geo) continue;
    const { upper, lower, waypoints } = geo;
    const xs = [
      portX(bottomWants, upper.id, e.id),
      ...waypoints.map((w) => w.x),
      portX(topWants, lower.id, e.id),
    ];
    const upperLayer = layout.layerOf.get(upper.id)!;
    chains.push({ edgeId: e.id, upper, lower, upperLayer, xs });
    for (let hop = 0; hop + 1 < xs.length; hop++) {
      if (xs[hop] !== xs[hop + 1]) {
        const channel = upperLayer + hop;
        (channelRuns.get(channel) ?? channelRuns.set(channel, []).get(channel)!).push({
          edgeId: e.id,
          minX: Math.min(xs[hop], xs[hop + 1]),
          maxX: Math.max(xs[hop], xs[hop + 1]),
        });
      }
    }
  }

  // Greedy interval scheduling: overlapping runs in one channel take
  // different tracks, centered vertically inside the channel.
  const trackYOf = new Map<string, number>(); // `${channel}:${edgeId}` -> y
  for (const [channel, runs] of channelRuns) {
    runs.sort((a, b) => a.minX - b.minX || a.maxX - b.maxX || (a.edgeId < b.edgeId ? -1 : 1));
    const trackEnds: number[] = [];
    const assignment: [Run, number][] = [];
    for (const run of runs) {
      let track = trackEnds.findIndex((end) => end + TRACK_CLEARANCE <= run.minX);
      if (track === -1) {
        track = trackEnds.length;
        trackEnds.push(run.maxX);
      } else {
        trackEnds[track] = run.maxX;
      }
      assignment.push([run, track]);
    }
    const top = layout.layerY[channel] + layout.layerHeights[channel];
    const height = (layout.layerY[channel + 1] ?? top + TRACK_GAP * 2) - top;
    const n = trackEnds.length;
    const gap = Math.min(TRACK_GAP, height / (n + 1));
    const startY = top + (height - (n - 1) * gap) / 2;
    for (const [run, track] of assignment) {
      trackYOf.set(`${channel}:${run.edgeId}`, startY + track * gap);
    }
  }

  const routed: RoutedEdge[] = [];
  for (const e of graph.edges) {
    let points: Point[];
    if (e.source === e.target) {
      points = selfLoop(layout.nodes.get(e.source)!);
    } else {
      const chain = chains.find((c) => c.edgeId === e.id)!;
      points = buildPath(chain, trackYOf);
      if (layout.reversedEdgeIds.has(e.id)) points.reverse();
    }
    const edge: RoutedEdge = {
      id: e.id,
      source: e.source,
      target: e.target,
      bidirectional: e.bidirectional,
      points,
      labelPos: labelPosition(points),
    };
    if (e.label !== undefined) edge.label = e.label;
    routed.push(edge);
  }
  return routed;
}

function buildPath(chain: Chain, trackYOf: Map<string, number>): Point[] {
  const { upper, lower, upperLayer, xs } = chain;
  const raw: Point[] = [{ x: xs[0], y: upper.y + upper.height }];
  let x = xs[0];
  for (let hop = 0; hop + 1 < xs.length; hop++) {
    const next = xs[hop + 1];
    if (next !== x) {
      const y = trackYOf.get(`${upperLayer + hop}:${chain.edgeId}`)!;
      raw.push({ x, y }, { x: next, y });
      x = next;
    }
  }
  raw.push({ x, y: lower.y });
  return simplify(raw);
}

/** Drop duplicate points and merge collinear segments. */
function simplify(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out.at(-1);
    if (last && last.x === p.x && last.y === p.y) continue;
    const prev = out.at(-2);
    if (last && prev) {
      const collinear =
        (prev.x === last.x && last.x === p.x) || (prev.y === last.y && last.y === p.y);
      if (collinear) {
        out[out.length - 1] = p;
        continue;
      }
    }
    out.push(p);
  }
  return out;
}

function selfLoop(n: PositionedNode): Point[] {
  const xr = n.x + n.width;
  const y1 = n.y + n.height / 3;
  const y2 = n.y + (2 * n.height) / 3;
  return [
    { x: xr, y: y1 },
    { x: xr + SELF_LOOP_EXTENT, y: y1 },
    { x: xr + SELF_LOOP_EXTENT, y: y2 },
    { x: xr, y: y2 },
  ];
}

function labelPosition(points: Point[]): Point {
  let best = 0;
  let bestLen = -1;
  for (let i = 1; i < points.length; i++) {
    const len =
      Math.abs(points[i].x - points[i - 1].x) + Math.abs(points[i].y - points[i - 1].y);
    if (len > bestLen) {
      bestLen = len;
      best = i;
    }
  }
  return {
    x: (points[best - 1].x + points[best].x) / 2,
    y: (points[best - 1].y + points[best].y) / 2,
  };
}
