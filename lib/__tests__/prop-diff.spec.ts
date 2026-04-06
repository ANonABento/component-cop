import { describe, it, expect } from 'vitest';
import { computePropDiff } from '../prop-diff';

describe('computePropDiff', () => {
  it('returns empty for single variant', () => {
    const result = computePropDiff(new Map([['A', { size: 'sm' }]]));
    expect(result).toEqual([]);
  });

  it('classifies shared props (same value across all)', () => {
    const result = computePropDiff(new Map([
      ['A', { disabled: false, label: 'Click' }],
      ['B', { disabled: false, label: 'Click' }],
    ]));
    const shared = result.filter((d) => d.classification === 'shared');
    expect(shared).toHaveLength(2);
  });

  it('classifies varied props (present in all, different values)', () => {
    const result = computePropDiff(new Map([
      ['A', { size: 'sm' }],
      ['B', { size: 'lg' }],
    ]));
    expect(result).toHaveLength(1);
    expect(result[0]!.classification).toBe('varied');
    expect(result[0]!.values.get('A')).toBe('"sm"');
    expect(result[0]!.values.get('B')).toBe('"lg"');
  });

  it('classifies unique props (not in all variants)', () => {
    const result = computePropDiff(new Map([
      ['A', { icon: 'star' }],
      ['B', { }],
    ]));
    const unique = result.filter((d) => d.classification === 'unique');
    expect(unique).toHaveLength(1);
    expect(unique[0]!.key).toBe('icon');
    expect(unique[0]!.values.get('B')).toBe('(not set)');
  });

  it('skips children, key, ref, and __ props', () => {
    const result = computePropDiff(new Map([
      ['A', { children: 'hi', key: '1', ref: {}, __internal: true, label: 'ok' }],
      ['B', { children: 'bye', key: '2', ref: {}, __internal: false, label: 'ok' }],
    ]));
    expect(result.map((d) => d.key)).toEqual(['label']);
  });

  it('sorts unique before varied before shared', () => {
    const result = computePropDiff(new Map([
      ['A', { shared: 1, varied: 'a', unique: true }],
      ['B', { shared: 1, varied: 'b' }],
    ]));
    expect(result[0]!.classification).toBe('unique');
    expect(result[1]!.classification).toBe('varied');
    expect(result[2]!.classification).toBe('shared');
  });

  it('serializes different value types', () => {
    const result = computePropDiff(new Map([
      ['A', { fn: () => {}, arr: [1, 2], obj: { a: 1, b: 2 }, num: 42, bool: true, nil: null }],
      ['B', { fn: () => {}, arr: [1], obj: {}, num: 0, bool: false, nil: null }],
    ]));
    const byKey = new Map(result.map((d) => [d.key, d]));
    expect(byKey.get('fn')!.values.get('A')).toBe('() => ...');
    expect(byKey.get('arr')!.values.get('A')).toBe('[2 items]');
    expect(byKey.get('obj')!.values.get('B')).toBe('{}');
    expect(byKey.get('num')!.values.get('A')).toBe('42');
    expect(byKey.get('bool')!.values.get('A')).toBe('true');
  });
});
