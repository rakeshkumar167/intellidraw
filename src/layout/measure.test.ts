import { describe, expect, test } from 'vitest';
import { MIN_NODE_HEIGHT, MIN_NODE_WIDTH, measureNode, measureText } from './measure';

describe('measureText', () => {
  test('longer text measures wider', () => {
    expect(measureText('NotificationService')).toBeGreaterThan(measureText('API'));
  });

  test('deterministic', () => {
    expect(measureText('UserService')).toBe(measureText('UserService'));
  });

  test('empty string is zero', () => {
    expect(measureText('')).toBe(0);
  });
});

describe('measureNode', () => {
  test('respects minimum size', () => {
    const { width, height } = measureNode('service', 'A');
    expect(width).toBeGreaterThanOrEqual(MIN_NODE_WIDTH);
    expect(height).toBeGreaterThanOrEqual(MIN_NODE_HEIGHT);
  });

  test('long label widens the node', () => {
    const short = measureNode('service', 'API');
    const long = measureNode('service', 'A Very Long Component Label Indeed');
    expect(long.width).toBeGreaterThan(short.width);
  });

  test('database is taller than service for the cylinder cap', () => {
    expect(measureNode('database', 'X').height).toBeGreaterThan(measureNode('service', 'X').height);
  });

  test('deterministic', () => {
    expect(measureNode('queue', 'Kafka')).toEqual(measureNode('queue', 'Kafka'));
  });
});
