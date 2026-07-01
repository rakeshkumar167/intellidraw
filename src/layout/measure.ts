import { NodeType } from '../dsl/types';

export const MIN_NODE_WIDTH = 120;
export const MIN_NODE_HEIGHT = 52;
export const NODE_FONT_SIZE = 13;

// Horizontal padding: 16px each side, plus a 26px icon square + 10px gap on the left.
const H_PADDING = 16 * 2 + 26 + 10;

// Deterministic width estimate for Inter/system-ui at 13px, in fractions of fontSize.
// Platform canvas metrics would break identical-input => identical-layout across machines.
const NARROW = /[iljftrI.,:;'|!()[\]{}]/;
const WIDE = /[mwMW@]/;
const UPPER = /[A-Z0-9]/;

export function measureText(text: string, fontSize: number = NODE_FONT_SIZE): number {
  let units = 0;
  for (const ch of text) {
    if (ch === ' ') units += 0.32;
    else if (NARROW.test(ch)) units += 0.3;
    else if (WIDE.test(ch)) units += 0.92;
    else if (UPPER.test(ch)) units += 0.68;
    else units += 0.55;
  }
  return Math.round(units * fontSize * 100) / 100;
}

export function measureNode(type: NodeType, label: string): { width: number; height: number } {
  const width = Math.max(MIN_NODE_WIDTH, Math.ceil(measureText(label) + H_PADDING));
  // Database cylinders and queues carry extra vertical chrome (ellipse cap / lane lines).
  const extra = type === 'database' ? 14 : type === 'queue' ? 6 : 0;
  return { width, height: MIN_NODE_HEIGHT + extra };
}
