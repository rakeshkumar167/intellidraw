import { RoutedEdge } from '../routing/orthogonal';
import { CORNER_RADIUS, EDGE_COLOR, EDGE_LABEL_SIZE, EDGE_WIDTH, FONT_STACK, theme } from './theme';

/** Orthogonal polyline with arc-rounded bends. */
export function roundedPathD(points: { x: number; y: number }[]): string {
  if (points.length < 2) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];
    const inLen = Math.abs(curr.x - prev.x) + Math.abs(curr.y - prev.y);
    const outLen = Math.abs(next.x - curr.x) + Math.abs(next.y - curr.y);
    const r = Math.min(CORNER_RADIUS, inLen / 2, outLen / 2);
    const inDir = { x: Math.sign(curr.x - prev.x), y: Math.sign(curr.y - prev.y) };
    const outDir = { x: Math.sign(next.x - curr.x), y: Math.sign(next.y - curr.y) };
    d += ` L ${curr.x - inDir.x * r} ${curr.y - inDir.y * r}`;
    d += ` Q ${curr.x} ${curr.y} ${curr.x + outDir.x * r} ${curr.y + outDir.y * r}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

export function EdgePath({ edge }: { edge: RoutedEdge }) {
  return (
    <g data-edge-id={edge.id}>
      <path
        d={roundedPathD(edge.points)}
        fill="none"
        stroke={EDGE_COLOR}
        strokeWidth={EDGE_WIDTH}
        markerEnd="url(#arrowEnd)"
        markerStart={edge.bidirectional ? 'url(#arrowStart)' : undefined}
      />
      {edge.label !== undefined && (
        <g>
          <text
            x={edge.labelPos.x}
            y={edge.labelPos.y}
            textAnchor="middle"
            dominantBaseline="central"
            fontFamily={FONT_STACK}
            fontSize={EDGE_LABEL_SIZE}
            fontWeight={500}
            fill={theme.inkSoft}
            stroke="#faf9f6"
            strokeWidth={4}
            paintOrder="stroke"
          >
            {edge.label}
          </text>
        </g>
      )}
    </g>
  );
}
