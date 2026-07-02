import { rectsIntersect } from './collision';
import type { GroupFrame, PositionedNode } from './index';
import { NODE_GAP_X } from './positioning';

const EVICT_GAP = 16;
const EVICT_PASSES = 3;

/**
 * Group contiguity is enforced per layer, so a non-member on an intermediate
 * layer can still land inside a group frame that spans layers. Push such
 * nodes out horizontally (toward the nearer frame edge), cascading within
 * their layer so spacing and order are preserved.
 */
export function evictFromFrames(
  nodes: Map<string, PositionedNode>,
  layerOf: Map<string, number>,
  computeFrames: () => GroupFrame[],
): void {
  const layerMates = (id: string): PositionedNode[] => {
    const layer = layerOf.get(id);
    return [...nodes.values()]
      .filter((n) => layerOf.get(n.id) === layer)
      .sort((a, b) => a.x - b.x || (a.id < b.id ? -1 : 1));
  };

  const pushLeft = (node: PositionedNode, newRight: number) => {
    if (node.x + node.width <= newRight) return;
    node.x = newRight - node.width;
    const mates = layerMates(node.id);
    const i = mates.findIndex((m) => m.id === node.id);
    if (i > 0) pushLeft(mates[i - 1], node.x - NODE_GAP_X);
  };

  const pushRight = (node: PositionedNode, newLeft: number) => {
    if (node.x >= newLeft) return;
    node.x = newLeft;
    const mates = layerMates(node.id);
    const i = mates.findIndex((m) => m.id === node.id);
    if (i >= 0 && i < mates.length - 1) pushRight(mates[i + 1], node.x + node.width + NODE_GAP_X);
  };

  for (let pass = 0; pass < EVICT_PASSES; pass++) {
    const frames = computeFrames();
    let moved = false;
    for (const f of frames) {
      const frameCenter = f.x + f.width / 2;
      const hits = [...nodes.values()].filter(
        (n) => n.group !== f.id && rectsIntersect(n, f, EVICT_GAP / 2),
      );
      // Evict per side in stacking order so evictees never land on each
      // other: leftward evictions go rightmost-first, each bounded by the
      // previous one; rightward evictions mirror that.
      const leftward = hits
        .filter((n) => n.x + n.width / 2 <= frameCenter)
        .sort((a, b) => b.x + b.width - (a.x + a.width) || (a.id < b.id ? -1 : 1));
      let rightBound = f.x - EVICT_GAP;
      for (const n of leftward) {
        pushLeft(n, rightBound);
        rightBound = n.x - NODE_GAP_X;
        moved = true;
      }
      const rightward = hits
        .filter((n) => n.x + n.width / 2 > frameCenter)
        .sort((a, b) => a.x - b.x || (a.id < b.id ? -1 : 1));
      let leftBound = f.x + f.width + EVICT_GAP;
      for (const n of rightward) {
        pushRight(n, leftBound);
        leftBound = n.x + n.width + NODE_GAP_X;
        moved = true;
      }
    }
    if (!moved) break;
  }
}
