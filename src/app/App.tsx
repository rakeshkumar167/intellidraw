import React, { useCallback, useEffect, useRef, useState } from 'react';
import { computeGroupFrames } from '../layout/index';
import { routeEdges } from '../routing/orthogonal';
import { DiagramSvg } from '../render/DiagramSvg';
import { PipelineResult, renderPipeline } from './pipeline';
import { SAMPLE_DSL } from './sample';
import { useNodeDrag } from './useNodeDrag';
import { useViewport } from './useViewport';
import './app.css';

export function App() {
  const [text, setText] = useState(SAMPLE_DSL);
  const [scene, setScene] = useState<PipelineResult>(() => renderPipeline(SAMPLE_DSL));
  const [errors, setErrors] = useState(scene.errors);
  const [renderMs, setRenderMs] = useState<number | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const { transform, onBackgroundPointerDown, fit } = useViewport(canvasRef);

  const render = useCallback(() => {
    const start = performance.now();
    const next = renderPipeline(text);
    setErrors(next.errors);
    if (next.errors.length === 0) {
      setRenderMs(performance.now() - start);
      setScene(next);
      fit(next.layout.width, next.layout.height);
    }
  }, [text, fit]);

  // Fit the initial sample once the canvas has a size.
  useEffect(() => {
    fit(scene.layout.width, scene.layout.height);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const moveNode = useCallback((id: string, dx: number, dy: number) => {
    setScene((s) => {
      const node = s.layout.nodes.get(id);
      if (!node) return s;
      const nodes = new Map(s.layout.nodes);
      nodes.set(id, { ...node, x: node.x + dx, y: node.y + dy });
      const layout = {
        ...s.layout,
        nodes,
        groups: computeGroupFrames(s.graph.groups, nodes),
      };
      return { ...s, layout, edges: routeEdges(s.graph, layout) };
    });
  }, []);

  const onNodePointerDown = useNodeDrag(transform.k, moveNode);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      render();
    }
  };

  const empty = scene.layout.nodes.size === 0;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <BrandMark />
          <div>
            <div className="brand-name">IntelliDraw</div>
            <div className="brand-tag">deterministic architecture diagrams</div>
          </div>
        </div>
        <div className="actions">
          <button className="btn primary" onClick={render} title="⌘⏎">
            Render Diagram
          </button>
          <button className="btn" onClick={() => fit(scene.layout.width, scene.layout.height)}>
            Fit
          </button>
          <span className="divider" />
          <button className="btn" data-export="svg" disabled>
            Export SVG
          </button>
          <button className="btn" data-export="png" disabled>
            Export PNG
          </button>
        </div>
      </header>

      <main className="workspace">
        <section className="editor-pane">
          <textarea
            className="editor"
            spellCheck={false}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            aria-label="Architecture DSL editor"
          />
          {errors.length > 0 && (
            <ul className="errors" role="alert">
              {errors.map((err, i) => (
                <li key={i}>
                  <span className="err-line">L{err.line}</span> {err.message}
                </li>
              ))}
            </ul>
          )}
          <footer className="statusbar">
            <span>
              {scene.layout.nodes.size} nodes · {scene.edges.length} edges
            </span>
            {renderMs !== null && <span>{renderMs.toFixed(1)} ms</span>}
          </footer>
        </section>

        <section className="canvas" ref={canvasRef}>
          <DiagramSvg
            layout={scene.layout}
            edges={scene.edges}
            transform={transform}
            onNodePointerDown={onNodePointerDown}
            onBackgroundPointerDown={onBackgroundPointerDown}
            svgRef={svgRef}
          />
          {empty && (
            <div className="empty-hint">
              Describe components and edges on the left, then press <b>Render Diagram</b>.
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function BrandMark() {
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
      <rect x="3" y="3" width="10" height="8" rx="2.5" fill="#22304a" />
      <rect x="17" y="19" width="10" height="8" rx="2.5" fill="#4a5fc9" />
      <path d="M 8 11 V 17 H 22 V 19" fill="none" stroke="#5f6b81" strokeWidth="1.8" />
    </svg>
  );
}
