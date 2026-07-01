import { describe, expect, test } from 'vitest';
import { inflate, rectsIntersect, segmentIntersectsRect } from './collision';

const r = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

describe('rectsIntersect', () => {
  test('overlapping rects intersect', () => {
    expect(rectsIntersect(r(0, 0, 10, 10), r(5, 5, 10, 10))).toBe(true);
  });

  test('separated rects do not intersect', () => {
    expect(rectsIntersect(r(0, 0, 10, 10), r(20, 0, 10, 10))).toBe(false);
  });

  test('touching edges do not intersect without gap', () => {
    expect(rectsIntersect(r(0, 0, 10, 10), r(10, 0, 10, 10))).toBe(false);
  });

  test('gap makes nearby rects intersect', () => {
    expect(rectsIntersect(r(0, 0, 10, 10), r(12, 0, 10, 10), 5)).toBe(true);
  });
});

describe('segmentIntersectsRect', () => {
  const rect = r(10, 10, 20, 20);

  test('horizontal segment crossing the rect', () => {
    expect(segmentIntersectsRect(0, 20, 40, 20, rect)).toBe(true);
  });

  test('vertical segment crossing the rect', () => {
    expect(segmentIntersectsRect(20, 0, 20, 40, rect)).toBe(true);
  });

  test('horizontal segment above the rect misses', () => {
    expect(segmentIntersectsRect(0, 5, 40, 5, rect)).toBe(false);
  });

  test('vertical segment left of the rect misses', () => {
    expect(segmentIntersectsRect(5, 0, 5, 40, rect)).toBe(false);
  });

  test('segment ending at the rect border does not count as passing through', () => {
    expect(segmentIntersectsRect(20, 0, 20, 10, rect)).toBe(false);
  });
});

describe('inflate', () => {
  test('grows rect on all sides', () => {
    expect(inflate(r(10, 10, 20, 20), 5)).toEqual(r(5, 5, 30, 30));
  });
});
