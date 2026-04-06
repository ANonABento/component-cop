import { describe, it, expect } from 'vitest';
import { generateConsolidationSuggestion } from '../consolidation';
import type { StoredComponent, StoredPattern } from '../../shared/types';

function makeComponent(overrides: Partial<StoredComponent> = {}): StoredComponent {
  return {
    id: 1,
    componentName: 'Button',
    sourceFile: 'src/Button.tsx',
    sourceLine: 10,
    domSelector: 'button',
    pagePath: '/home',
    pageTitle: 'Home',
    pageUrl: 'http://localhost/home',
    styleFingerprint: 'fp1',
    styleCategories: ['text', 'bg'],
    structureHash: 'sh1',
    visualHash: null,
    computedStyles: {},
    domStructure: '<button>',
    props: {},
    boundingRect: { x: 0, y: 0, width: 100, height: 40 },
    scanTimestamp: Date.now(),
    scanSessionId: 's1',
    ...overrides,
  };
}

function makePattern(variants: { id: number; label: string; ids: number[] }[]): StoredPattern {
  return {
    patternId: 'p1',
    name: 'Button',
    totalInstances: variants.reduce((s, v) => s + v.ids.length, 0),
    computedAt: Date.now(),
    variants: variants.map((v) => ({
      variantId: `v${v.id}`,
      label: v.label,
      componentIds: v.ids,
      exemplarComponentId: v.ids[0]!,
    })),
  };
}

describe('generateConsolidationSuggestion', () => {
  it('returns null for single-variant patterns', () => {
    const pattern = makePattern([{ id: 1, label: 'A', ids: [1] }]);
    const map = new Map([[1, makeComponent({ id: 1 })]]);
    expect(generateConsolidationSuggestion(pattern, map)).toBeNull();
  });

  it('detects size-based variants', () => {
    const map = new Map([
      [1, makeComponent({ id: 1, computedStyles: { 'font-size': '12px', 'padding-top': '4px', 'padding-bottom': '4px', color: 'red' } })],
      [2, makeComponent({ id: 2, computedStyles: { 'font-size': '16px', 'padding-top': '8px', 'padding-bottom': '8px', color: 'red' } })],
    ]);
    const pattern = makePattern([
      { id: 1, label: 'A', ids: [1] },
      { id: 2, label: 'B', ids: [2] },
    ]);
    const result = generateConsolidationSuggestion(pattern, map)!;
    expect(result).not.toBeNull();
    expect(result.suggestion).toContain('size');
    expect(result.propApi).toContain('size');
    expect(result.effort).toBe('low');
  });

  it('detects color-based variants', () => {
    const map = new Map([
      [1, makeComponent({ id: 1, computedStyles: { color: 'red', 'background-color': '#ff0000', 'font-size': '14px' } })],
      [2, makeComponent({ id: 2, computedStyles: { color: 'blue', 'background-color': '#0000ff', 'font-size': '14px' } })],
    ]);
    const pattern = makePattern([
      { id: 1, label: 'Primary', ids: [1] },
      { id: 2, label: 'Secondary', ids: [2] },
    ]);
    const result = generateConsolidationSuggestion(pattern, map)!;
    expect(result.suggestion).toContain('color');
    expect(result.effort).toBe('low');
  });

  it('detects prop-shape differences', () => {
    const map = new Map([
      [1, makeComponent({ id: 1, props: { icon: 'star', label: 'Save' }, computedStyles: { color: 'red' } })],
      [2, makeComponent({ id: 2, props: { label: 'Cancel' }, computedStyles: { color: 'red' } })],
    ]);
    const pattern = makePattern([
      { id: 1, label: 'A', ids: [1] },
      { id: 2, label: 'B', ids: [2] },
    ]);
    const result = generateConsolidationSuggestion(pattern, map)!;
    expect(result.suggestion).toContain('prop');
    expect(result.effort).toBe('medium');
  });

  it('suggests high effort for many prop differences', () => {
    const map = new Map([
      [1, makeComponent({ id: 1, props: { a: 1, b: 2, c: 3, d: 4 }, computedStyles: {} })],
      [2, makeComponent({ id: 2, props: { e: 5, f: 6, g: 7, h: 8 }, computedStyles: {} })],
    ]);
    const pattern = makePattern([
      { id: 1, label: 'A', ids: [1] },
      { id: 2, label: 'B', ids: [2] },
    ]);
    const result = generateConsolidationSuggestion(pattern, map)!;
    expect(result.effort).toBe('high');
  });
});
