/**
 * CI Report Generator — creates a structured JSON report from scan data.
 *
 * This module is browser-agnostic (no DOM, no chrome.* APIs) so it can be
 * used both in the extension panel and in a future headless CI runner.
 */

import type { StoredComponent, StoredPage, StoredPattern } from '../shared/types';
import type { AggregatedColorStats } from '../entrypoints/panel/helpers';

export interface CIReportThreshold {
  limit: number;
  actual: number;
  passed: boolean;
}

export interface CIReport {
  url: string;
  timestamp: string;
  passed: boolean;
  metrics: {
    pagesScanned: number;
    totalComponents: number;
    patternGroups: number;
    multiVariantPatterns: number;
    hardcodedColors: number;
    nearDuplicateColors: number;
  };
  thresholds: Record<string, CIReportThreshold>;
  patterns: {
    name: string;
    variantCount: number;
    totalInstances: number;
  }[];
  colorSummary: {
    uniqueColors: number;
    totalUsages: number;
    nearDuplicates: number;
  };
}

export interface CIThresholds {
  maxDuplicates?: number;
  maxHardcodedColors?: number;
  maxNearDuplicates?: number;
}

export function generateCIReport(
  url: string,
  pages: StoredPage[],
  components: StoredComponent[],
  patterns: StoredPattern[],
  colorStats: AggregatedColorStats,
  thresholds: CIThresholds = {},
): CIReport {
  const multiVariant = patterns.filter((p) => p.variants.length > 1);

  const checks: Record<string, CIReportThreshold> = {};
  let allPassed = true;

  if (thresholds.maxDuplicates !== undefined) {
    const passed = multiVariant.length <= thresholds.maxDuplicates;
    if (!passed) allPassed = false;
    checks.maxDuplicates = { limit: thresholds.maxDuplicates, actual: multiVariant.length, passed };
  }

  if (thresholds.maxHardcodedColors !== undefined) {
    const passed = colorStats.topColors.length <= thresholds.maxHardcodedColors;
    if (!passed) allPassed = false;
    checks.maxHardcodedColors = { limit: thresholds.maxHardcodedColors, actual: colorStats.topColors.length, passed };
  }

  if (thresholds.maxNearDuplicates !== undefined) {
    const passed = colorStats.nearDuplicates.length <= thresholds.maxNearDuplicates;
    if (!passed) allPassed = false;
    checks.maxNearDuplicates = { limit: thresholds.maxNearDuplicates, actual: colorStats.nearDuplicates.length, passed };
  }

  return {
    url,
    timestamp: new Date().toISOString(),
    passed: allPassed,
    metrics: {
      pagesScanned: pages.length,
      totalComponents: components.length,
      patternGroups: patterns.length,
      multiVariantPatterns: multiVariant.length,
      hardcodedColors: colorStats.topColors.length,
      nearDuplicateColors: colorStats.nearDuplicates.length,
    },
    thresholds: checks,
    patterns: patterns
      .filter((p) => p.variants.length > 1)
      .map((p) => ({
        name: p.name,
        variantCount: p.variants.length,
        totalInstances: p.totalInstances,
      })),
    colorSummary: {
      uniqueColors: colorStats.uniqueColors,
      totalUsages: colorStats.totalUsages,
      nearDuplicates: colorStats.nearDuplicates.length,
    },
  };
}

/**
 * Compare a CI report against a baseline and check for regressions.
 */
export function checkRegression(
  baseline: CIReport,
  current: CIReport,
): { regressed: boolean; regressions: string[] } {
  const regressions: string[] = [];

  if (current.metrics.multiVariantPatterns > baseline.metrics.multiVariantPatterns) {
    regressions.push(
      `Multi-variant patterns increased: ${baseline.metrics.multiVariantPatterns} → ${current.metrics.multiVariantPatterns}`,
    );
  }
  if (current.metrics.hardcodedColors > baseline.metrics.hardcodedColors) {
    regressions.push(
      `Hardcoded colors increased: ${baseline.metrics.hardcodedColors} → ${current.metrics.hardcodedColors}`,
    );
  }
  if (current.metrics.nearDuplicateColors > baseline.metrics.nearDuplicateColors) {
    regressions.push(
      `Near-duplicate colors increased: ${baseline.metrics.nearDuplicateColors} → ${current.metrics.nearDuplicateColors}`,
    );
  }

  return { regressed: regressions.length > 0, regressions };
}
