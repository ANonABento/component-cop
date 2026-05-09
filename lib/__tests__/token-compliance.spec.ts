import { describe, expect, it } from 'vitest';
import { auditTokenCompliance } from '../token-compliance';
import type { StoredComponent } from '../../shared/types';
import type { DesignTokenSet } from '../token-compliance';

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

const tokens: DesignTokenSet = {
  colors: { primary: '#3b82f6', secondary: '#10b981', text: '#1f2937' },
  spacing: { sm: '8px', md: '16px', lg: '24px' },
  typography: {
    fontSizes: { sm: '12px', base: '14px', lg: '18px' },
    fontWeights: { normal: '400', bold: '700' },
  },
  borderRadius: { sm: '4px', md: '8px', full: '9999px' },
};

describe('auditTokenCompliance', () => {
  it('returns 100% for fully compliant components', () => {
    const result = auditTokenCompliance([
      makeComp(1, { color: '#1f2937', 'padding-top': '8px', 'font-size': '14px', 'font-weight': '400', 'border-radius': '4px' }),
    ], tokens);
    expect(result.compliancePercent).toBe(100);
    expect(result.violations).toHaveLength(0);
  });

  it('detects non-compliant color', () => {
    const result = auditTokenCompliance([
      makeComp(1, { color: '#ff0000' }),
    ], tokens);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]!.category).toBe('color');
    expect(result.violations[0]!.nearestToken).toBeDefined();
  });

  it('normalizes rgb to hex for matching', () => {
    const result = auditTokenCompliance([
      makeComp(1, { color: 'rgb(59, 130, 246)' }), // #3b82f6
    ], tokens);
    expect(result.violations.filter((v) => v.property === 'color')).toHaveLength(0);
  });

  it('detects non-compliant spacing', () => {
    const result = auditTokenCompliance([
      makeComp(1, { 'padding-top': '10px' }),
    ], tokens);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]!.category).toBe('spacing');
  });

  it('detects non-compliant font size', () => {
    const result = auditTokenCompliance([
      makeComp(1, { 'font-size': '15px' }),
    ], tokens);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]!.category).toBe('typography');
  });

  it('detects non-compliant border radius', () => {
    const result = auditTokenCompliance([
      makeComp(1, { 'border-radius': '6px' }),
    ], tokens);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]!.category).toBe('border-radius');
  });

  it('skips transparent colors and 0px spacing', () => {
    const result = auditTokenCompliance([
      makeComp(1, { color: 'transparent', 'background-color': 'rgba(0, 0, 0, 0)', 'padding-top': '0px', 'border-radius': '0px' }),
    ], tokens);
    expect(result.totalChecks).toBe(0);
  });

  it('calculates compliance percentage', () => {
    const result = auditTokenCompliance([
      makeComp(1, { color: '#1f2937', 'padding-top': '10px' }),
    ], tokens);
    expect(result.compliancePercent).toBe(50);
  });

  it('breaks down by category', () => {
    const result = auditTokenCompliance([
      makeComp(1, { color: '#ff0000', 'padding-top': '8px' }),
    ], tokens);
    const colorCat = result.byCategory.find((c) => c.category === 'color');
    expect(colorCat!.violations).toBe(1);
    const spacingCat = result.byCategory.find((c) => c.category === 'spacing');
    expect(spacingCat!.percent).toBe(100);
  });

  it('handles empty token set gracefully', () => {
    const result = auditTokenCompliance([
      makeComp(1, { color: '#ff0000', 'padding-top': '10px' }),
    ], {});
    expect(result.totalChecks).toBe(0);
    expect(result.compliancePercent).toBe(100);
  });
});
