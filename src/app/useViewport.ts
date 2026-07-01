import React, { useCallback, useEffect, useRef, useState } from 'react';

export interface Transform {
  x: number;
  y: number;
  k: number;
}

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 4;

/**
 * Cursor-anchored wheel zoom + background drag panning. The wheel listener is
 * attached natively (non-passive) so preventDefault works in every browser.
 */
export function useViewport(containerRef: React.RefObject<HTMLElement>) {
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, k: 1 });
  const pan = useRef<{ startX: number; startY: number; origin: Transform } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      setTransform((t) => {
        const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, t.k * Math.exp(-e.deltaY * 0.0018)));
        return {
          k,
          x: cx - ((cx - t.x) * k) / t.k,
          y: cy - ((cy - t.y) * k) / t.k,
        };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [containerRef]);

  const onBackgroundPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    pan.current = { startX: e.clientX, startY: e.clientY, origin: transform };
    const onMove = (ev: PointerEvent) => {
      const p = pan.current;
      if (!p) return;
      setTransform({
        k: p.origin.k,
        x: p.origin.x + (ev.clientX - p.startX),
        y: p.origin.y + (ev.clientY - p.startY),
      });
    };
    const onUp = () => {
      pan.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [transform]);

  const fit = useCallback(
    (contentWidth: number, contentHeight: number) => {
      const el = containerRef.current;
      if (!el || contentWidth <= 0 || contentHeight <= 0) return;
      const rect = el.getBoundingClientRect();
      const k = Math.min(
        MAX_ZOOM,
        Math.max(MIN_ZOOM, Math.min(rect.width / contentWidth, rect.height / contentHeight) * 0.94),
      );
      setTransform({
        k,
        x: (rect.width - contentWidth * k) / 2,
        y: (rect.height - contentHeight * k) / 2,
      });
    },
    [containerRef],
  );

  return { transform, onBackgroundPointerDown, fit };
}
