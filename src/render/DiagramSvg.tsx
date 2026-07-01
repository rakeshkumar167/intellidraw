import React from 'react';
import { LayoutResult } from '../layout/index';
import { RoutedEdge } from '../routing/orthogonal';
import { EdgePath } from './EdgePath';
import { NodeShape } from './NodeShape';
import {
  EDGE_COLOR,
  FONT_STACK,
  GROUP_FILL,
  GROUP_LABEL_COLOR,
  GROUP_LABEL_SIZE,
  GROUP_STROKE,
  theme,
} from './theme';

export interface DiagramSvgProps {
  layout: LayoutResult;
  edges: RoutedEdge[];
  transform?: { x: number; y: number; k: number };
  onNodePointerDown?: (id: string, e: React.PointerEvent) => void;
  onBackgroundPointerDown?: (e: React.PointerEvent) => void;
  onWheel?: (e: React.WheelEvent) => void;
  svgRef?: React.Ref<SVGSVGElement>;
}

const GRID_PAD = 2000;

export function DiagramSvg({
  layout,
  edges,
  transform,
  onNodePointerDown,
  onBackgroundPointerDown,
  onWheel,
  svgRef,
}: DiagramSvgProps) {
  const t = transform ?? { x: 0, y: 0, k: 1 };
  return (
    <svg
      ref={svgRef}
      width="100%"
      height="100%"
      style={{ display: 'block', background: theme.canvas, touchAction: 'none' }}
      onPointerDown={onBackgroundPointerDown}
      onWheel={onWheel}
      data-diagram-root
    >
      <defs>
        <marker
          id="arrowEnd"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7.5"
          markerHeight="7.5"
          orient="auto-start-reverse"
        >
          <path d="M 0.5 1 L 9 5 L 0.5 9 Z" fill={EDGE_COLOR} />
        </marker>
        <marker
          id="arrowStart"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7.5"
          markerHeight="7.5"
          orient="auto-start-reverse"
        >
          <path d="M 0.5 1 L 9 5 L 0.5 9 Z" fill={EDGE_COLOR} />
        </marker>
        <pattern id="dotGrid" width="22" height="22" patternUnits="userSpaceOnUse">
          <circle cx="1.2" cy="1.2" r="1.2" fill={theme.gridDot} />
        </pattern>
        <filter id="nodeShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1" stdDeviation="1.4" floodColor="#233252" floodOpacity="0.16" />
        </filter>
      </defs>

      <g transform={`translate(${t.x}, ${t.y}) scale(${t.k})`}>
        <rect
          x={-GRID_PAD}
          y={-GRID_PAD}
          width={layout.width + 2 * GRID_PAD}
          height={layout.height + 2 * GRID_PAD}
          fill="url(#dotGrid)"
          data-canvas-grid
        />

        {layout.groups.map((g) => (
          <g key={g.id} data-group-id={g.id}>
            <rect
              x={g.x}
              y={g.y}
              width={g.width}
              height={g.height}
              rx={14}
              fill={GROUP_FILL}
              stroke={GROUP_STROKE}
              strokeWidth={1.2}
            />
            <text
              x={g.x + 14}
              y={g.y + 17}
              fontFamily={FONT_STACK}
              fontSize={GROUP_LABEL_SIZE}
              fontWeight={700}
              letterSpacing="0.08em"
              fill={GROUP_LABEL_COLOR}
            >
              {g.label.toUpperCase()}
            </text>
          </g>
        ))}

        {edges.map((e) => (
          <EdgePath key={e.id} edge={e} />
        ))}

        {[...layout.nodes.values()].map((n) => (
          <NodeShape key={n.id} node={n} onPointerDown={onNodePointerDown} />
        ))}
      </g>
    </svg>
  );
}
