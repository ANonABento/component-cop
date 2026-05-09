import { describe, expect, it } from 'vitest';
import { auditZIndex } from '../z-index-audit';
import type { StoredComponent } from '../../shared/types';

function makeComp(id: number, name: string, zIndex: string | undefined, pagePath = '/test'): StoredComponent {
  return {
    id, componentName: name, pagePath, styleFingerprint: 'fp', structureHash: 'sh',
    styleCategories: [], computedStyles: zIndex ? { 'z-index': zIndex } : {},
    domStructure: '', props: {}, boundingRect: { x: 0, y: 0, width: 100, height: 50 },
    sourceFile: null, sourceLine: null, sourceColumn: null, domSelector: 'div',
    pageTitle: 'Test', pageUrl: 'https://example.test/test', visualHash: null,
    scanTimestamp: 1, scanSessionId: 'test',
  };
}

describe('auditZIndex', () => {
  it('returns empty for components without z-index', () => {
    const result = auditZIndex([makeComp(1, 'Btn', undefined)]);
    expect(result.entries).toHaveLength(0);
  });

  it('skips auto z-index', () => {
    const result = auditZIndex([makeComp(1, 'Btn', 'auto')]);
    expect(result.entries).toHaveLength(0);
  });

  it('collects numeric z-index values', () => {
    const result = auditZIndex([
      makeComp(1, 'Modal', '50'),
      makeComp(2, 'Toast', '100'),
    ]);
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]!.zIndex).toBe(100); // sorted desc
    expect(result.uniqueValues).toBe(2);
  });

  it('detects collisions between different component names', () => {
    const result = auditZIndex([
      makeComp(1, 'Modal', '50'),
      makeComp(2, 'Dropdown', '50'),
    ]);
    expect(result.collisions).toHaveLength(1);
    expect(result.collisions[0]!.zIndex).toBe(50);
    expect(result.collisions[0]!.components).toHaveLength(2);
  });

  it('does not flag same-name same-z-index as collision', () => {
    const result = auditZIndex([
      makeComp(1, 'Modal', '50', '/page1'),
      makeComp(2, 'Modal', '50', '/page2'),
    ]);
    expect(result.collisions).toHaveLength(0);
  });

  it('flags extreme values above 100', () => {
    const result = auditZIndex([
      makeComp(1, 'Overlay', '9999'),
      makeComp(2, 'Btn', '1'),
    ]);
    expect(result.extremes).toHaveLength(1);
    expect(result.extremes[0]!.name).toBe('Overlay');
  });
});
