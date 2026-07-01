import React, { useCallback, useRef } from 'react';

/**
 * Node dragging in diagram coordinates. Pointer deltas are divided by the
 * current zoom so nodes track the cursor at any scale.
 */
export function useNodeDrag(
  zoom: number,
  moveNode: (id: string, dx: number, dy: number) => void,
) {
  const drag = useRef<{ id: string; lastX: number; lastY: number } | null>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  return useCallback(
    (id: string, e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      drag.current = { id, lastX: e.clientX, lastY: e.clientY };
      const onMove = (ev: PointerEvent) => {
        const d = drag.current;
        if (!d) return;
        moveNode(d.id, (ev.clientX - d.lastX) / zoomRef.current, (ev.clientY - d.lastY) / zoomRef.current);
        d.lastX = ev.clientX;
        d.lastY = ev.clientY;
      };
      const onUp = () => {
        drag.current = null;
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [moveNode],
  );
}
