import React, { useCallback, useEffect, useRef, useState } from 'react';
import { computeGroupFrames } from '../layout/index';
import { LayoutEngineId, isLayoutEngineId, layoutEngines } from '../layout/engines';
import { routeEdges } from '../routing/orthogonal';
import { DiagramSvg } from '../render/DiagramSvg';
import { downloadPng, downloadSvg } from './exporter';
import { PipelineResult, renderPipeline } from './pipeline';
import { SAMPLE_DSL } from './sample';
import { useNodeDrag } from './useNodeDrag';
import { useViewport } from './useViewport';
import './app.css';

const ENGINE_KEY = 'intellidraw.layoutEngine';
const engineIds = Object.keys(layoutEngines) as LayoutEngineId[];

function loadEngineId(): LayoutEngineId {
  try {
    const stored = localStorage.getItem(ENGINE_KEY);
    if (isLayoutEngineId(stored)) return stored;
  } catch {
    // Storage unavailable (private mode etc.) — fall through to default.
  }
  return 'classic';
}

export function App() {
  const [text, setText] = useState(SAMPLE_DSL);
  const [engineId, setEngineId] = useState<LayoutEngineId>(loadEngineId);
  const [scene, setScene] = useState<PipelineResult>(() => renderPipeline(SAMPLE_DSL, engineId));
  const [errors, setErrors] = useState(scene.errors);
  const [renderMs, setRenderMs] = useState<number | null>(null);

  const [paneWidth, setPaneWidth] = useState(400);

  const canvasRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const { transform, onBackgroundPointerDown, fit } = useViewport(canvasRef);

  const onSplitterPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      const startX = e.clientX;
      const startW = paneWidth;
      const max = Math.min(760, window.innerWidth - 320);
      const onMove = (ev: PointerEvent) =>
        setPaneWidth(Math.min(max, Math.max(260, startW + ev.clientX - startX)));
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [paneWidth],
  );

  const render = useCallback(
    (id: LayoutEngineId = engineId) => {
      const start = performance.now();
      const next = renderPipeline(text, id);
      setErrors(next.errors);
      if (next.errors.length === 0) {
        setRenderMs(performance.now() - start);
        setScene(next);
        fit(next.layout.width, next.layout.height);
      }
    },
    [text, fit, engineId],
  );

  const onEngineChange = useCallback(
    (id: LayoutEngineId) => {
      setEngineId(id);
      try {
        localStorage.setItem(ENGINE_KEY, id);
      } catch {
        // Persistence is best-effort.
      }
      render(id);
    },
    [render],
  );

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
          <button className="btn primary" onClick={() => render()} title="⌘⏎">
            Render Diagram
          </button>
          <button className="btn" onClick={() => fit(scene.layout.width, scene.layout.height)}>
            Fit
          </button>
          <div className="layout-toggle">
            <span>Layout</span>
            <div className="layout-toggle-track" role="radiogroup" aria-label="Layout engine">
              <span
                className="layout-toggle-thumb"
                style={{ transform: `translateX(${engineIds.indexOf(engineId) * 100}%)` }}
              />
              {engineIds.map((id) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={engineId === id}
                  className={`layout-toggle-option${engineId === id ? ' active' : ''}`}
                  onClick={() => onEngineChange(id)}
                >
                  {layoutEngines[id].label}
                </button>
              ))}
            </div>
          </div>
          <span className="divider" />
          <button
            className="btn"
            disabled={empty}
            onClick={() => svgRef.current && downloadSvg(svgRef.current, scene.layout)}
          >
            Export SVG
          </button>
          <button
            className="btn"
            disabled={empty}
            onClick={() => svgRef.current && void downloadPng(svgRef.current, scene.layout)}
          >
            Export PNG
          </button>
        </div>
      </header>

      <main className="workspace">
        <section className="editor-pane" style={{ width: paneWidth }}>
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

        <div
          className="splitter"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize editor pane"
          onPointerDown={onSplitterPointerDown}
        />

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
