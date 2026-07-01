import { theme } from '../render/theme';

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface ExportBounds {
  width: number;
  height: number;
}

/**
 * Standalone SVG markup of the current diagram: pan/zoom reset, explicit
 * size/viewBox, opaque paper background so exports look right anywhere.
 */
export function svgMarkup(svg: SVGSVGElement, bounds: ExportBounds): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', SVG_NS);
  clone.setAttribute('width', String(Math.ceil(bounds.width)));
  clone.setAttribute('height', String(Math.ceil(bounds.height)));
  clone.setAttribute('viewBox', `0 0 ${Math.ceil(bounds.width)} ${Math.ceil(bounds.height)}`);
  clone.removeAttribute('style');

  const content = clone.querySelector(':scope > g');
  content?.removeAttribute('transform');

  const bg = clone.ownerDocument.createElementNS(SVG_NS, 'rect');
  bg.setAttribute('data-export-bg', '');
  bg.setAttribute('width', '100%');
  bg.setAttribute('height', '100%');
  bg.setAttribute('fill', theme.canvas);
  clone.insertBefore(bg, content);

  return new XMLSerializer().serializeToString(clone);
}

function triggerDownload(url: string, filename: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
}

export function downloadSvg(svg: SVGSVGElement, bounds: ExportBounds): void {
  const blob = new Blob([svgMarkup(svg, bounds)], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, 'architecture.svg');
  URL.revokeObjectURL(url);
}

export function downloadPng(
  svg: SVGSVGElement,
  bounds: ExportBounds,
  scale: number = 2,
): Promise<void> {
  const markup = svgMarkup(svg, bounds);
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(bounds.width * scale);
      canvas.height = Math.ceil(bounds.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('canvas 2d context unavailable'));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('PNG encoding failed'));
          return;
        }
        const blobUrl = URL.createObjectURL(blob);
        triggerDownload(blobUrl, 'architecture.png');
        URL.revokeObjectURL(blobUrl);
        resolve();
      }, 'image/png');
    };
    img.onerror = () => reject(new Error('could not rasterize SVG'));
    img.src = url;
  });
}
