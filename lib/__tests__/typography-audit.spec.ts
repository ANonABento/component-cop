import { describe, expect, it } from 'vitest';
import { auditTypography } from '../typography-audit';
import type { StoredComponent } from '../../shared/types';

function makeComp(id: number, styles: Record<string, string>): StoredComponent {
  return {
    id, componentName: `Comp${id}`, pagePath: '/test', styleFingerprint: 'fp',
    structureHash: 'sh', styleCategories: [], computedStyles: styles,
    domStructure: '', props: {}, boundingRect: { x: 0, y: 0, width: 100, height: 50 },
    sourceFile: null, sourceLine: null, sourceColumn: null, domSelector: 'div',
    pageTitle: 'Test', pageUrl: 'https://example.test/test', visualHash: null,
    scanTimestamp: 1, scanSessionId: 'test',
  };
}

describe('auditTypography', () => {
  it('returns empty for components without font info', () => {
    const result = auditTypography([makeComp(1, {})]);
    expect(result.combinations).toHaveLength(0);
    expect(result.typeScale).toHaveLength(0);
  });

  it('groups identical type combinations', () => {
    const styles = { 'font-family': 'Inter', 'font-size': '14px', 'font-weight': '400', 'line-height': '20px', 'letter-spacing': 'normal' };
    const result = auditTypography([makeComp(1, styles), makeComp(2, styles)]);
    expect(result.combinations).toHaveLength(1);
    expect(result.combinations[0]!.count).toBe(2);
  });

  it('separates different type combinations', () => {
    const result = auditTypography([
      makeComp(1, { 'font-family': 'Inter', 'font-size': '14px', 'font-weight': '400', 'line-height': '20px', 'letter-spacing': 'normal' }),
      makeComp(2, { 'font-family': 'Inter', 'font-size': '16px', 'font-weight': '600', 'line-height': '24px', 'letter-spacing': 'normal' }),
    ]);
    expect(result.combinations).toHaveLength(2);
  });

  it('detects near-duplicate sizes', () => {
    const result = auditTypography([
      makeComp(1, { 'font-family': 'Inter', 'font-size': '14px' }),
      makeComp(2, { 'font-family': 'Inter', 'font-size': '15px' }),
    ]);
    expect(result.nearDuplicateSizes).toHaveLength(1);
    expect(result.nearDuplicateSizes[0]!.diffPx).toBe(1);
  });

  it('does not flag sizes more than 2px apart as near-duplicate', () => {
    const result = auditTypography([
      makeComp(1, { 'font-family': 'Inter', 'font-size': '14px' }),
      makeComp(2, { 'font-family': 'Inter', 'font-size': '18px' }),
    ]);
    expect(result.nearDuplicateSizes).toHaveLength(0);
  });

  it('builds type scale sorted by px value', () => {
    const result = auditTypography([
      makeComp(1, { 'font-family': 'Inter', 'font-size': '24px' }),
      makeComp(2, { 'font-family': 'Inter', 'font-size': '12px' }),
      makeComp(3, { 'font-family': 'Inter', 'font-size': '16px' }),
    ]);
    expect(result.typeScale.map((e) => e.sizePx)).toEqual([12, 16, 24]);
  });

  it('extracts font families', () => {
    const result = auditTypography([
      makeComp(1, { 'font-family': '"Inter", sans-serif', 'font-size': '14px' }),
      makeComp(2, { 'font-family': 'Roboto, sans-serif', 'font-size': '14px' }),
      makeComp(3, { 'font-family': '"Inter", sans-serif', 'font-size': '16px' }),
    ]);
    expect(result.families).toHaveLength(2);
    expect(result.families[0]!.family).toBe('Inter');
    expect(result.families[0]!.count).toBe(2);
  });

  it('tracks component names per combination', () => {
    const result = auditTypography([
      makeComp(1, { 'font-family': 'Inter', 'font-size': '14px' }),
      { ...makeComp(2, { 'font-family': 'Inter', 'font-size': '14px' }), componentName: 'OtherComp' },
    ]);
    expect(result.combinations[0]!.components).toEqual(['Comp1', 'OtherComp']);
  });
});
