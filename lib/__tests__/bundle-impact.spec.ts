import { describe, expect, it } from 'vitest';
import { estimateBundleImpact, formatBytes } from '../bundle-impact';
import type { StoredComponent, StoredPattern } from '../../shared/types';

function makeComponent(id: number, overrides: Partial<StoredComponent> = {}): StoredComponent {
  return {
    id,
    componentName: 'Comp',
    pagePath: '/test',
    styleFingerprint: 'fp',
    structureHash: 'sh',
    styleCategories: [],
    computedStyles: { color: 'red', 'font-size': '14px', padding: '8px' },
    domStructure: '(div(span))',
    props: { label: 'hello' },
    boundingRect: { x: 0, y: 0, width: 100, height: 50 },
    sourceFile: null,
    sourceLine: null,
    sourceColumn: null,
    domSelector: 'div',
    pageTitle: 'Test',
    pageUrl: 'https://example.test/test',
    visualHash: null,
    scanTimestamp: 1,
    scanSessionId: 'test',
    ...overrides,
  };
}

describe('estimateBundleImpact', () => {
  it('returns empty for single-variant patterns', () => {
    const pattern: StoredPattern = {
      patternId: 'p1', name: 'Btn', totalInstances: 3,
      variants: [{ variantId: 'v1', label: 'A', exemplarComponentId: 1, componentIds: [1, 2, 3] }],
    };
    const map = new Map([[1, makeComponent(1)]]);
    const result = estimateBundleImpact([pattern], map);
    expect(result.patterns).toHaveLength(0);
    expect(result.totalEstimatedSavings).toBe(0);
  });

  it('estimates savings for multi-variant patterns', () => {
    const pattern: StoredPattern = {
      patternId: 'p1', name: 'Btn', totalInstances: 10,
      variants: [
        { variantId: 'v1', label: 'A', exemplarComponentId: 1, componentIds: [1, 2, 3, 4, 5, 6, 7] },
        { variantId: 'v2', label: 'B', exemplarComponentId: 10, componentIds: [10, 11, 12] },
      ],
    };
    const comp = makeComponent(1);
    const map = new Map([[1, comp], [10, makeComponent(10)]]);
    const result = estimateBundleImpact([pattern], map);
    expect(result.patterns).toHaveLength(1);
    expect(result.patterns[0]!.redundantInstances).toBe(3); // 10 - 7
    expect(result.totalEstimatedSavings).toBeGreaterThan(0);
  });

  it('sorts by estimated savings descending', () => {
    const patterns: StoredPattern[] = [
      {
        patternId: 'p1', name: 'Small', totalInstances: 4,
        variants: [
          { variantId: 'v1', label: 'A', exemplarComponentId: 1, componentIds: [1, 2, 3] },
          { variantId: 'v2', label: 'B', exemplarComponentId: 4, componentIds: [4] },
        ],
      },
      {
        patternId: 'p2', name: 'Big', totalInstances: 20,
        variants: [
          { variantId: 'v1', label: 'A', exemplarComponentId: 10, componentIds: [10, 11] },
          { variantId: 'v2', label: 'B', exemplarComponentId: 20, componentIds: Array.from({ length: 18 }, (_, i) => 20 + i) },
        ],
      },
    ];
    const map = new Map<number, StoredComponent>();
    for (const p of patterns) for (const v of p.variants) map.set(v.exemplarComponentId, makeComponent(v.exemplarComponentId));
    const result = estimateBundleImpact(patterns, map);
    expect(result.patterns[0]!.patternName).toBe('Big');
    // Small: 4-3=1 redundant, Big: 20-18=2 redundant — but same size per instance so Big should be first
    // Actually both have same estimatedBytesPerInstance, so Big (2 redundant) > Small (1 redundant)
    expect(result.patterns[0]!.estimatedSavings).toBeGreaterThanOrEqual(result.patterns[1]!.estimatedSavings);
  });

  it('handles missing exemplar gracefully', () => {
    const pattern: StoredPattern = {
      patternId: 'p1', name: 'Ghost', totalInstances: 6,
      variants: [
        { variantId: 'v1', label: 'A', exemplarComponentId: 999, componentIds: [999, 998, 997, 996] },
        { variantId: 'v2', label: 'B', exemplarComponentId: 888, componentIds: [888, 887] },
      ],
    };
    const result = estimateBundleImpact([pattern], new Map());
    expect(result.patterns).toHaveLength(1);
    expect(result.patterns[0]!.estimatedBytesPerInstance).toBe(100); // fallback
  });
});

describe('formatBytes', () => {
  it('formats bytes', () => { expect(formatBytes(500)).toBe('500 B'); });
  it('formats KB', () => { expect(formatBytes(2048)).toBe('2.0 KB'); });
  it('formats MB', () => { expect(formatBytes(1_500_000)).toBe('1.4 MB'); });
});
