import { describe, expect, test } from 'vitest';
import { svgMarkup } from './exporter';

const SVG_NS = 'http://www.w3.org/2000/svg';

function fakeDiagram(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  svg.setAttribute('style', 'background: rgb(250, 249, 246)');
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('transform', 'translate(120, -45) scale(1.7)');
  const rect = document.createElementNS(SVG_NS, 'rect');
  rect.setAttribute('data-node-id', 'A');
  g.appendChild(rect);
  svg.appendChild(g);
  return svg;
}

describe('svgMarkup', () => {
  test('produces standalone svg with xmlns and explicit size', () => {
    const out = svgMarkup(fakeDiagram(), { width: 640, height: 480 });
    expect(out.startsWith('<svg')).toBe(true);
    expect(out).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(out).toContain('width="640"');
    expect(out).toContain('viewBox="0 0 640 480"');
  });

  test('strips the interactive pan/zoom transform', () => {
    const out = svgMarkup(fakeDiagram(), { width: 100, height: 100 });
    expect(out).not.toContain('scale(1.7)');
  });

  test('includes an opaque background rect and keeps content', () => {
    const out = svgMarkup(fakeDiagram(), { width: 100, height: 100 });
    expect(out).toContain('data-export-bg');
    expect(out).toContain('data-node-id="A"');
  });
});
