import { describe, it, expect } from 'vitest';
import { generateCIReport, checkRegression, type CIReport } from '../../ci/ci-report';
import type { StoredPattern } from '../../shared/types';

function makePattern(name: string, variantCount: number): StoredPattern {
  return {
    patternId: name,
    name,
    totalInstances: variantCount * 3,
    computedAt: Date.now(),
    variants: Array.from({ length: variantCount }, (_, i) => ({
      variantId: `${name}-v${i}`,
      label: `V${i}`,
      componentIds: [i],
      exemplarComponentId: i,
    })),
  };
}

const emptyColorStats = { uniqueColors: 0, totalUsages: 0, topColors: [], nearDuplicates: [] };
function makeComponent(name: string, overrides: Partial<import('../../shared/types').StoredComponent> = {}): import('../../shared/types').StoredComponent {
  return {
    id: Math.floor(Math.random() * 10000),
    componentName: name,
    sourceFile: null,
    sourceLine: null,
    sourceColumn: null,
    domSelector: 'div',
    pagePath: '/',
    pageTitle: 'Test',
    pageUrl: 'http://localhost:3000',
    styleFingerprint: 'fp',
    styleCategories: [],
    structureHash: 'sh',
    visualHash: null,
    computedStyles: {},
    domStructure: '(div)',
    props: {},
    boundingRect: { x: 0, y: 0, width: 100, height: 100 },
    scanTimestamp: Date.now(),
    scanSessionId: 'test',
    ...overrides,
  };
}


describe('generateCIReport', () => {
  it('generates report with all metrics', () => {
    const report = generateCIReport(
      'http://localhost:3000',
      [{ pagePath: '/', pageTitle: 'Home', pageUrl: 'http://localhost:3000', componentCount: 5, scanTimestamp: Date.now(), links: [], colorSummary: null }],
      [],
      [makePattern('Button', 2), makePattern('Card', 1)],
      emptyColorStats,
    );
    expect(report.metrics.patternGroups).toBe(2);
    expect(report.metrics.multiVariantPatterns).toBe(1);
    expect(report.passed).toBe(true);
  });

  it('fails when multi-variant patterns exceed threshold', () => {
    const report = generateCIReport(
      'http://localhost:3000', [], [],
      [makePattern('Button', 3), makePattern('Card', 2)],
      emptyColorStats,
      { maxDuplicates: 1 },
    );
    expect(report.passed).toBe(false);
    expect(report.thresholds.maxDuplicates!.passed).toBe(false);
    expect(report.thresholds.maxDuplicates!.actual).toBe(2);
  });

  it('passes when within thresholds', () => {
    const report = generateCIReport(
      'http://localhost:3000', [], [],
      [makePattern('Button', 2)],
      { uniqueColors: 3, totalUsages: 10, topColors: [{ hex: '#f00', count: 5, usedAs: ['color'], severities: [] }], nearDuplicates: [] },
      { maxDuplicates: 5, maxHardcodedColors: 10, maxNearDuplicates: 5 },
    );
    expect(report.passed).toBe(true);
  });

  it('only includes multi-variant patterns in output', () => {
    const report = generateCIReport(
      'http://localhost:3000', [], [],
      [makePattern('Button', 3), makePattern('Single', 1)],
      emptyColorStats,
    );
    expect(report.patterns).toHaveLength(1);
    expect(report.patterns[0]!.name).toBe('Button');
  });

  it('checks maxComplexityOutliers threshold', () => {
    // Create a component with deep nesting to trigger high complexity
    const deepComp = makeComponent('DeepNest', {
      domStructure: '(x)'.repeat(35) + '(((((((((((())))))))))))', // 35+ root children, depth 12
      props: Object.fromEntries(Array.from({ length: 25 }, (_, i) => ['p' + i, i])),
      boundingRect: { x: 0, y: 0, width: 1000, height: 600 },
    });
    const report = generateCIReport(
      'http://localhost:3000', [], [deepComp], [],
      emptyColorStats,
      { maxComplexityOutliers: 0 },
    );
    expect(report.thresholds.maxComplexityOutliers).toBeDefined();
    expect(report.thresholds.maxComplexityOutliers!.passed).toBe(false);
  });

  it('checks maxA11yIssues threshold', () => {
    // img component without alt
    const imgComp = makeComponent('img', { props: {} });
    const report = generateCIReport(
      'http://localhost:3000', [], [imgComp], [],
      emptyColorStats,
      { maxA11yIssues: 0 },
    );
    expect(report.thresholds.maxA11yIssues).toBeDefined();
    expect(report.thresholds.maxA11yIssues!.passed).toBe(false);
    expect(report.thresholds.maxA11yIssues!.actual).toBeGreaterThan(0);
  });

  it('checks maxSpacingInconsistencies threshold', () => {
    const comp1 = makeComponent('Card', { pagePath: '/a', computedStyles: { 'padding-top': '8px' } });
    const comp2 = makeComponent('Card', { pagePath: '/b', computedStyles: { 'padding-top': '12px' } });
    const report = generateCIReport(
      'http://localhost:3000', [], [comp1, comp2], [],
      emptyColorStats,
      { maxSpacingInconsistencies: 0 },
    );
    expect(report.thresholds.maxSpacingInconsistencies).toBeDefined();
    expect(report.thresholds.maxSpacingInconsistencies!.passed).toBe(false);
  });

  it('checks maxZIndexCollisions threshold', () => {
    const comp1 = makeComponent('Modal', { computedStyles: { 'z-index': '100' } });
    const comp2 = makeComponent('Popover', { computedStyles: { 'z-index': '100' } });
    const report = generateCIReport(
      'http://localhost:3000', [], [comp1, comp2], [],
      emptyColorStats,
      { maxZIndexCollisions: 0 },
    );
    expect(report.thresholds.maxZIndexCollisions).toBeDefined();
    expect(report.thresholds.maxZIndexCollisions!.passed).toBe(false);
  });

  it('checks maxTypeCombinations threshold', () => {
    const comp1 = makeComponent('Title', { computedStyles: { 'font-family': 'Inter', 'font-size': '24px', 'font-weight': '700', 'line-height': '1.2', 'letter-spacing': '0px' } });
    const comp2 = makeComponent('Body', { computedStyles: { 'font-family': 'Inter', 'font-size': '14px', 'font-weight': '400', 'line-height': '1.5', 'letter-spacing': '0px' } });
    const report = generateCIReport(
      'http://localhost:3000', [], [comp1, comp2], [],
      emptyColorStats,
      { maxTypeCombinations: 1 },
    );
    expect(report.thresholds.maxTypeCombinations).toBeDefined();
    expect(report.thresholds.maxTypeCombinations!.passed).toBe(false);
    expect(report.thresholds.maxTypeCombinations!.actual).toBe(2);
  });

  it('passes all new thresholds when within limits', () => {
    const comp = makeComponent('Simple');
    const report = generateCIReport(
      'http://localhost:3000', [], [comp], [],
      emptyColorStats,
      { maxComplexityOutliers: 100, maxA11yIssues: 100, maxSpacingInconsistencies: 100, maxZIndexCollisions: 100, maxTypeCombinations: 100 },
    );
    expect(report.passed).toBe(true);
    for (const key of Object.keys(report.thresholds)) {
      expect(report.thresholds[key]!.passed).toBe(true);
    }
  });
});

describe('checkRegression', () => {
  const makeReport = (overrides: Partial<CIReport['metrics']> = {}): CIReport => ({
    url: 'http://localhost:3000',
    timestamp: new Date().toISOString(),
    passed: true,
    metrics: { pagesScanned: 5, totalComponents: 50, patternGroups: 10, multiVariantPatterns: 3, hardcodedColors: 8, nearDuplicateColors: 2, ...overrides },
    thresholds: {},
    patterns: [],
    colorSummary: { uniqueColors: 8, totalUsages: 40, nearDuplicates: 2 },
  });

  it('detects no regression for improved metrics', () => {
    const baseline = makeReport({ multiVariantPatterns: 5, hardcodedColors: 10 });
    const current = makeReport({ multiVariantPatterns: 3, hardcodedColors: 6 });
    const result = checkRegression(baseline, current);
    expect(result.regressed).toBe(false);
    expect(result.regressions).toHaveLength(0);
  });

  it('detects regression when metrics increase', () => {
    const baseline = makeReport({ multiVariantPatterns: 3 });
    const current = makeReport({ multiVariantPatterns: 5 });
    const result = checkRegression(baseline, current);
    expect(result.regressed).toBe(true);
    expect(result.regressions[0]).toContain('3');
    expect(result.regressions[0]).toContain('5');
  });

  it('detects multiple regressions', () => {
    const baseline = makeReport({ multiVariantPatterns: 3, hardcodedColors: 8, nearDuplicateColors: 2 });
    const current = makeReport({ multiVariantPatterns: 5, hardcodedColors: 12, nearDuplicateColors: 4 });
    const result = checkRegression(baseline, current);
    expect(result.regressions).toHaveLength(3);
  });

  it('detects regression in new metrics', () => {
    const baseline = makeReport({ complexityOutliers: 2, a11yIssues: 5, spacingInconsistencies: 3 });
    const current = makeReport({ complexityOutliers: 4, a11yIssues: 8, spacingInconsistencies: 6 });
    const result = checkRegression(baseline, current);
    expect(result.regressed).toBe(true);
    expect(result.regressions).toHaveLength(3);
    expect(result.regressions.some((r) => r.includes('Complexity'))).toBe(true);
    expect(result.regressions.some((r) => r.includes('A11y'))).toBe(true);
    expect(result.regressions.some((r) => r.includes('Spacing'))).toBe(true);
  });

  it('detects token compliance regression', () => {
    const baseline = makeReport({ tokenCompliancePercent: 85 });
    const current = makeReport({ tokenCompliancePercent: 70 });
    const result = checkRegression(baseline, current);
    expect(result.regressed).toBe(true);
    expect(result.regressions[0]).toContain('Token compliance decreased');
  });

  it('skips new metric comparison when not present in both reports', () => {
    const baseline = makeReport({ complexityOutliers: 5 });
    const current = makeReport({}); // no complexityOutliers
    const result = checkRegression(baseline, current);
    expect(result.regressed).toBe(false);
  });
});
