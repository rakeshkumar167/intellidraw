export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function rectsIntersect(a: Rect, b: Rect, gap: number = 0): boolean {
  return (
    a.x < b.x + b.width + gap &&
    b.x < a.x + a.width + gap &&
    a.y < b.y + b.height + gap &&
    b.y < a.y + a.height + gap
  );
}

/**
 * Axis-aligned segment vs rect. Touching the border exactly does not count —
 * edge endpoints sit on node borders by design.
 */
export function segmentIntersectsRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  r: Rect,
): boolean {
  const left = r.x;
  const right = r.x + r.width;
  const top = r.y;
  const bottom = r.y + r.height;

  if (y1 === y2) {
    // horizontal
    if (y1 <= top || y1 >= bottom) return false;
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    return maxX > left && minX < right;
  }
  if (x1 === x2) {
    // vertical
    if (x1 <= left || x1 >= right) return false;
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    return maxY > top && minY < bottom;
  }
  throw new Error('segmentIntersectsRect only supports axis-aligned segments');
}

export function inflate(r: Rect, by: number): Rect {
  return { x: r.x - by, y: r.y - by, width: r.width + 2 * by, height: r.height + 2 * by };
}
