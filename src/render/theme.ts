import { NodeType } from '../dsl/types';

/** Light "drafting desk" theme: paper canvas, ink text, muted type accents. */
export const theme = {
  canvas: '#faf9f6',
  gridDot: '#d9d7cf',
  ink: '#22304a',
  inkSoft: '#5b667e',
} as const;

export interface TypeStyle {
  /** node fill */
  fill: string;
  /** border + icon chip */
  accent: string;
  /** darker text-safe accent for captions */
  deep: string;
}

export const TYPE_STYLES: Record<NodeType, TypeStyle> = {
  service: { fill: '#eef1fc', accent: '#4a5fc9', deep: '#3647a3' },
  database: { fill: '#e7f4f2', accent: '#12796f', deep: '#0d5f57' },
  cache: { fill: '#fdf3e2', accent: '#c07f10', deep: '#92600a' },
  queue: { fill: '#f1edfb', accent: '#7857c8', deep: '#5c3fa5' },
  external: { fill: '#f4f5f7', accent: '#697586', deep: '#4d5766' },
  lambda: { fill: '#fdeee3', accent: '#c2560f', deep: '#9c440b' },
};

export const EDGE_COLOR = '#5f6b81';
export const EDGE_WIDTH = 1.5;
export const CORNER_RADIUS = 8;

export const FONT_STACK =
  "'Avenir Next', 'Segoe UI', 'Helvetica Neue', system-ui, sans-serif";
export const NODE_LABEL_SIZE = 13;
export const EDGE_LABEL_SIZE = 11;
export const GROUP_LABEL_SIZE = 11;

export const GROUP_FILL = 'rgba(74, 95, 201, 0.035)';
export const GROUP_STROKE = '#c7cddd';
export const GROUP_LABEL_COLOR = '#6a7590';
