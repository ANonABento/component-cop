import { describe, expect, it } from 'vitest';
import { auditSpacing } from '../spacing-audit';
import type { StoredComponent } from '../../shared/types';

function makeComp(id: number, name: string, styles: Record<string, string>, pagePath = '/test'): StoredComponent {
  return {
    id, componentName: name, pagePath, styleFingerprint: 'fp', structureHash: 'sh',
    styleCategories: [], computedStyles: styles, domStructure: '', props: {},
    boundingRect: { x: 0, y: 0, width: 100, height: 50 },
    sourceFile: null, sourceLine: null, sourceColumn: null, domSelector: 'div',
    pageTitle: 'Test', pageUrl: 'https://example.test/test', visualHash: null,
    scanTimestamp: 1, scanSessionId: 'test',
  };
}

describe('auditSpacing', () => {
  it('returns empty for single-instance components', () => {
    const result = auditSpacing([makeComp(1, 'Btn', { 'padding-top': '8px' })]);
    expect(result.inconsistencies).toHaveLength(0);
  });

  it('returns empty when all instances match', () => {
    const result = auditSpacing([
      makeComp(1, 'Btn', { 'padding-top': '8px' }),
      makeComp(2, 'Btn', { 'padding-top': '8px' }),
    ]);
    expect(result.inconsistencies).toHaveLength(0);
  });

  it('detects inconsistent spacing', () => {
    const result = auditSpacing([
      makeComp(1, 'Btn', { 'padding-top': '8px' }, '/page1'),
      makeComp(2, 'Btn', { 'padding-top': '12px' }, '/page2'),
    ]);
    expect(result.inconsistencies).toHaveLength(1);
    expect(result.inconsistencies[0]!.componentName).toBe('Btn');
    expect(result.inconsistencies[0]!.property).toBe('padding-top');
    expect(result.inconsistencies[0]!.values).toHaveLength(2);
  });

  it('detects near-duplicate spacing values', () => {
    const result = auditSpacing([
      makeComp(1, 'Card', { 'margin-top': '16px' }),
      makeComp(2, 'Card', { 'margin-top': '17px' }),
    ]);
    expect(result.nearDuplicates).toHaveLength(1);
    expect(result.nearDuplicates[0]!.diffPx).toBe(1);
  });

  it('does not flag values more than 2px apart', () => {
    const result = auditSpacing([
      makeComp(1, 'Card', { 'padding-left': '8px' }),
      makeComp(2, 'Card', { 'padding-left': '16px' }),
    ]);
    expect(result.nearDuplicates).toHaveLength(0);
  });

  it('tracks pages for each value', () => {
    const result = auditSpacing([
      makeComp(1, 'Btn', { 'padding-top': '8px' }, '/home'),
      makeComp(2, 'Btn', { 'padding-top': '8px' }, '/about'),
      makeComp(3, 'Btn', { 'padding-top': '12px' }, '/contact'),
    ]);
    const inc = result.inconsistencies[0]!;
    const val8 = inc.values.find((v) => v.value === '8px')!;
    expect(val8.count).toBe(2);
    expect(val8.pages).toContain('/home');
    expect(val8.pages).toContain('/about');
  });

  it('handles multiple spacing properties', () => {
    const result = auditSpacing([
      makeComp(1, 'Box', { 'padding-top': '8px', 'margin-left': '4px' }),
      makeComp(2, 'Box', { 'padding-top': '12px', 'margin-left': '8px' }),
    ]);
    expect(result.inconsistencies).toHaveLength(2);
    expect(result.totalInconsistencies).toBe(2);
  });

  it('separates different component names', () => {
    const result = auditSpacing([
      makeComp(1, 'Btn', { 'padding-top': '8px' }),
      makeComp(2, 'Btn', { 'padding-top': '12px' }),
      makeComp(3, 'Card', { 'padding-top': '8px' }),
      makeComp(4, 'Card', { 'padding-top': '8px' }),
    ]);
    expect(result.inconsistencies).toHaveLength(1);
    expect(result.inconsistencies[0]!.componentName).toBe('Btn');
  });
});
