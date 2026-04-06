import { describe, it, expect } from 'vitest';
import { computeBaselineDiff, type ScanSnapshot } from '../../shared/scan-history';

function makeSnapshot(overrides: Partial<ScanSnapshot> = {}): ScanSnapshot {
  return {
    id: 1,
    timestamp: Date.now(),
    label: 'Test',
    pagesScanned: 5,
    totalComponents: 50,
    patternGroups: 10,
    multiVariantPatterns: 3,
    hardcodedColors: 8,
    nearDuplicateColors: 2,
    patternSummary: [],
    ...overrides,
  };
}

describe('computeBaselineDiff', () => {
  it('detects no changes for identical snapshots', () => {
    const snap = makeSnapshot({
      patternSummary: [{ name: 'Button', variantCount: 2, totalInstances: 10 }],
    });
    const diff = computeBaselineDiff(snap, snap);
    expect(diff.addedPatterns).toHaveLength(0);
    expect(diff.removedPatterns).toHaveLength(0);
    expect(diff.changedPatterns).toHaveLength(0);
    expect(diff.metrics.every((m) => m.delta === 0)).toBe(true);
  });

  it('detects added patterns', () => {
    const baseline = makeSnapshot({ patternSummary: [] });
    const current = makeSnapshot({
      patternSummary: [{ name: 'Card', variantCount: 2, totalInstances: 5 }],
    });
    const diff = computeBaselineDiff(baseline, current);
    expect(diff.addedPatterns).toHaveLength(1);
    expect(diff.addedPatterns[0]!.name).toBe('Card');
  });

  it('detects removed patterns', () => {
    const baseline = makeSnapshot({
      patternSummary: [{ name: 'Button', variantCount: 2, totalInstances: 10 }],
    });
    const current = makeSnapshot({ patternSummary: [] });
    const diff = computeBaselineDiff(baseline, current);
    expect(diff.removedPatterns).toHaveLength(1);
    expect(diff.removedPatterns[0]!.name).toBe('Button');
  });

  it('detects changed patterns', () => {
    const baseline = makeSnapshot({
      patternSummary: [{ name: 'Button', variantCount: 2, totalInstances: 10 }],
    });
    const current = makeSnapshot({
      patternSummary: [{ name: 'Button', variantCount: 3, totalInstances: 15 }],
    });
    const diff = computeBaselineDiff(baseline, current);
    expect(diff.changedPatterns).toHaveLength(1);
    expect(diff.changedPatterns[0]!.newVariants).toBe(3);
    expect(diff.changedPatterns[0]!.oldVariants).toBe(2);
  });

  it('computes metric deltas correctly', () => {
    const baseline = makeSnapshot({ totalComponents: 50, hardcodedColors: 10 });
    const current = makeSnapshot({ totalComponents: 38, hardcodedColors: 6 });
    const diff = computeBaselineDiff(baseline, current);
    const components = diff.metrics.find((m) => m.label === 'Components')!;
    expect(components.delta).toBe(-12);
    const colors = diff.metrics.find((m) => m.label === 'HC Colors')!;
    expect(colors.delta).toBe(-4);
  });
});
