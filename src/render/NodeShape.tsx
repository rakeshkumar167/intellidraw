import React from 'react';
import { PositionedNode } from '../layout/index';
import { NodeType } from '../dsl/types';
import { FONT_STACK, NODE_LABEL_SIZE, TYPE_STYLES, theme } from './theme';

const CHIP = 22;
const CHIP_MARGIN = 12;

interface Props {
  node: PositionedNode;
  onPointerDown?: (id: string, e: React.PointerEvent) => void;
}

/** Icon glyph drawn inside the type chip, in a 10x10 box centered at 0,0. */
function Glyph({ type }: { type: NodeType }) {
  const s = { stroke: '#fff', strokeWidth: 1.6, fill: 'none', strokeLinecap: 'round' as const };
  switch (type) {
    case 'service':
      return (
        <g {...s}>
          <circle r={2.4} />
          {[0, 60, 120, 180, 240, 300].map((deg) => (
            <line
              key={deg}
              x1={3.6 * Math.cos((deg * Math.PI) / 180)}
              y1={3.6 * Math.sin((deg * Math.PI) / 180)}
              x2={5.1 * Math.cos((deg * Math.PI) / 180)}
              y2={5.1 * Math.sin((deg * Math.PI) / 180)}
            />
          ))}
        </g>
      );
    case 'database':
      return (
        <g {...s}>
          <ellipse cx={0} cy={-3.2} rx={4.4} ry={1.7} />
          <path d="M -4.4 -3.2 V 3.2 A 4.4 1.7 0 0 0 4.4 3.2 V -3.2" />
        </g>
      );
    case 'cache':
      return <path d="M 1.4 -5 L -3 0.8 H 0 L -1.4 5 L 3 -0.8 H 0 Z" fill="#fff" stroke="none" />;
    case 'queue':
      return (
        <g {...s}>
          <line x1={-4} y1={-3} x2={4} y2={-3} />
          <line x1={-4} y1={0} x2={4} y2={0} />
          <line x1={-4} y1={3} x2={4} y2={3} />
        </g>
      );
    case 'external':
      return (
        <g {...s}>
          <path d="M 0.5 -4.5 H 4.5 V -0.5" />
          <line x1={4.5} y1={-4.5} x2={-1} y2={1} />
          <path d="M 1.5 -1.5 V 4 H -4.5 V -2 H 0" opacity={0.75} />
        </g>
      );
    case 'lambda':
      return (
        <text
          y={4}
          textAnchor="middle"
          fontSize={11}
          fontFamily={FONT_STACK}
          fill="#fff"
          stroke="none"
          fontWeight={600}
        >
          λ
        </text>
      );
  }
}

/** Body outline per type; database gets a real cylinder, external a dashed box. */
function Body({ node }: { node: PositionedNode }) {
  const style = TYPE_STYLES[node.type];
  const fill = node.color ?? style.fill;
  const common = {
    fill,
    stroke: style.accent,
    strokeWidth: 1.2,
  };
  const { width: w, height: h } = node;

  if (node.type === 'database') {
    const ry = 8;
    return (
      <g>
        <path
          d={`M 0 ${ry} A ${w / 2} ${ry} 0 0 1 ${w} ${ry} V ${h - ry} A ${w / 2} ${ry} 0 0 1 0 ${h - ry} Z`}
          {...common}
        />
        <path
          d={`M 0 ${ry} A ${w / 2} ${ry} 0 0 0 ${w} ${ry}`}
          fill="none"
          stroke={style.accent}
          strokeWidth={1.2}
        />
      </g>
    );
  }
  if (node.type === 'queue') {
    return (
      <g>
        <rect width={w} height={h} rx={6} {...common} />
        <line x1={10} y1={h - 8} x2={w - 10} y2={h - 8} stroke={style.accent} strokeWidth={1} opacity={0.45} />
        <line x1={10} y1={h - 5} x2={w - 10} y2={h - 5} stroke={style.accent} strokeWidth={1} opacity={0.25} />
      </g>
    );
  }
  if (node.type === 'external') {
    return <rect width={w} height={h} rx={10} {...common} strokeDasharray="5 4" />;
  }
  return <rect width={w} height={h} rx={10} {...common} />;
}

export function NodeShape({ node, onPointerDown }: Props) {
  const style = TYPE_STYLES[node.type];
  const chipY = node.height / 2 - CHIP / 2 + (node.type === 'database' ? 3 : 0);
  const labelX = CHIP_MARGIN + CHIP + (node.width - CHIP_MARGIN - CHIP) / 2;

  return (
    <g
      data-node-id={node.id}
      data-node-type={node.type}
      transform={`translate(${node.x}, ${node.y})`}
      onPointerDown={onPointerDown ? (e) => onPointerDown(node.id, e) : undefined}
      style={onPointerDown ? { cursor: 'grab' } : undefined}
      filter="url(#nodeShadow)"
    >
      <Body node={node} />
      <g transform={`translate(${CHIP_MARGIN + CHIP / 2}, ${chipY + CHIP / 2})`}>
        <rect x={-CHIP / 2} y={-CHIP / 2} width={CHIP} height={CHIP} rx={6} fill={style.accent} />
        <Glyph type={node.type} />
      </g>
      <text
        x={labelX}
        y={node.height / 2 + (node.type === 'database' ? 3 : 0)}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily={FONT_STACK}
        fontSize={NODE_LABEL_SIZE}
        fontWeight={600}
        fill={theme.ink}
      >
        {node.label}
      </text>
    </g>
  );
}
