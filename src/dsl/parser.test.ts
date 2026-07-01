import { describe, expect, test } from 'vitest';
import { parse } from './parser';

describe('components', () => {
  test('parses component with type', () => {
    const doc = parse('component API type=service');
    expect(doc.errors).toEqual([]);
    expect(doc.components).toEqual([
      { id: 'API', type: 'service', label: 'API', line: 1 },
    ]);
  });

  test('defaults type to service and label to id', () => {
    const doc = parse('component Billing');
    expect(doc.components[0]).toMatchObject({ id: 'Billing', type: 'service', label: 'Billing' });
  });

  test('parses quoted label with spaces and color', () => {
    const doc = parse('component API type=lambda label="Public API" color=#ffaa00');
    expect(doc.components[0]).toMatchObject({
      id: 'API',
      type: 'lambda',
      label: 'Public API',
      color: '#ffaa00',
    });
  });

  test('all node types accepted', () => {
    const types = ['service', 'database', 'cache', 'queue', 'external', 'lambda'];
    const doc = parse(types.map((t, i) => `component N${i} type=${t}`).join('\n'));
    expect(doc.errors).toEqual([]);
    expect(doc.components.map((c) => c.type)).toEqual(types);
  });
});

describe('edges', () => {
  test('parses directed edge with label', () => {
    const doc = parse('API -> UserService : HTTPS');
    expect(doc.edges).toEqual([
      { source: 'API', target: 'UserService', label: 'HTTPS', bidirectional: false, line: 1 },
    ]);
  });

  test('parses edge without label', () => {
    const doc = parse('A -> B');
    expect(doc.edges[0]).toMatchObject({ source: 'A', target: 'B', bidirectional: false });
    expect(doc.edges[0].label).toBeUndefined();
  });

  test('parses bidirectional edge', () => {
    const doc = parse('A <-> B : sync');
    expect(doc.edges[0]).toMatchObject({ source: 'A', target: 'B', bidirectional: true, label: 'sync' });
  });
});

describe('groups', () => {
  test('assigns group membership to nested components', () => {
    const doc = parse(
      [
        'group Backend label="Backend Services" {',
        '  component UserService type=service',
        '  component Kafka type=queue',
        '}',
        'component API',
      ].join('\n'),
    );
    expect(doc.errors).toEqual([]);
    expect(doc.groups).toEqual([{ id: 'Backend', label: 'Backend Services', line: 1 }]);
    expect(doc.components.find((c) => c.id === 'UserService')?.group).toBe('Backend');
    expect(doc.components.find((c) => c.id === 'Kafka')?.group).toBe('Backend');
    expect(doc.components.find((c) => c.id === 'API')?.group).toBeUndefined();
  });

  test('group label defaults to id', () => {
    const doc = parse('group Core {\n}');
    expect(doc.groups[0]).toMatchObject({ id: 'Core', label: 'Core' });
  });
});

describe('comments and blanks', () => {
  test('ignores comments and blank lines', () => {
    const doc = parse('# a comment\n\n// another\ncomponent A\n');
    expect(doc.errors).toEqual([]);
    expect(doc.components).toHaveLength(1);
  });
});

describe('errors', () => {
  test('unknown type', () => {
    const doc = parse('component A type=blob');
    expect(doc.errors).toEqual([{ line: 1, message: expect.stringContaining('blob') }]);
  });

  test('duplicate component id', () => {
    const doc = parse('component A\ncomponent A');
    expect(doc.errors[0]).toMatchObject({ line: 2 });
  });

  test('unclosed group', () => {
    const doc = parse('group G {\ncomponent A');
    expect(doc.errors.some((e) => /unclosed/i.test(e.message))).toBe(true);
  });

  test('stray closing brace', () => {
    const doc = parse('}');
    expect(doc.errors[0]).toMatchObject({ line: 1 });
  });

  test('nested group rejected', () => {
    const doc = parse('group A {\ngroup B {\n}\n}');
    expect(doc.errors.some((e) => /nested/i.test(e.message))).toBe(true);
  });

  test('unparseable line', () => {
    const doc = parse('component A\nwhat is this');
    expect(doc.errors[0]).toMatchObject({ line: 2 });
  });
});

describe('full spec example', () => {
  test('parses the requirements sample', () => {
    const doc = parse(
      [
        'component API type=service',
        'component UserService type=service',
        'component Redis type=cache',
        'component Aurora type=database',
        'component Kafka type=queue',
        '',
        'API -> UserService : HTTPS',
        'UserService -> Redis',
        'UserService -> Aurora',
        'UserService -> Kafka',
        'Kafka -> NotificationService',
      ].join('\n'),
    );
    expect(doc.errors).toEqual([]);
    expect(doc.components).toHaveLength(5);
    expect(doc.edges).toHaveLength(5);
  });
});
