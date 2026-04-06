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
});
