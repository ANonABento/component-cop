/**
 * CI Report Generator — creates a structured JSON report from scan data.
 *
 * This module is browser-agnostic (no DOM, no chrome.* APIs) so it can be
 * used both in the extension panel and in a future headless CI runner.
 */

import type { StoredComponent, StoredPage, StoredPattern } from '../shared/types';
import type { AggregatedColorStats } from '../shared/types';
import { auditComplexity } from '../lib/complexity-score';
import { auditTypography } from '../lib/typography-audit';
import { auditSpacing } from '../lib/spacing-audit';
import { auditZIndex } from '../lib/z-index-audit';
import { auditA11y } from '../lib/a11y-audit';
import { auditTokenCompliance } from '../lib/token-compliance';
import type { DesignTokenSet } from '../lib/token-compliance';

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
    complexityOutliers?: number;
    typeCombinations?: number;
    spacingInconsistencies?: number;
    zIndexCollisions?: number;
    a11yIssues?: number;
    tokenCompliancePercent?: number;
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
  maxComplexityOutliers?: number;
  maxTypeCombinations?: number;
  maxSpacingInconsistencies?: number;
  maxZIndexCollisions?: number;
  maxA11yIssues?: number;
  minTokenCompliance?: number;
}

export function generateCIReport(
  url: string,
  pages: StoredPage[],
  components: StoredComponent[],
  patterns: StoredPattern[],
  colorStats: AggregatedColorStats,
  thresholds: CIThresholds = {},
  tokenSet?: DesignTokenSet | null,
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

  if (thresholds.maxComplexityOutliers !== undefined) {
    const audit = auditComplexity(components);
    const passed = audit.outliers.length <= thresholds.maxComplexityOutliers;
    if (!passed) allPassed = false;
    checks.maxComplexityOutliers = { limit: thresholds.maxComplexityOutliers, actual: audit.outliers.length, passed };
  }

  if (thresholds.maxTypeCombinations !== undefined) {
    const audit = auditTypography(components);
    const passed = audit.combinations.length <= thresholds.maxTypeCombinations;
    if (!passed) allPassed = false;
    checks.maxTypeCombinations = { limit: thresholds.maxTypeCombinations, actual: audit.combinations.length, passed };
  }

  if (thresholds.maxSpacingInconsistencies !== undefined) {
    const audit = auditSpacing(components);
    const passed = audit.totalInconsistencies <= thresholds.maxSpacingInconsistencies;
    if (!passed) allPassed = false;
    checks.maxSpacingInconsistencies = { limit: thresholds.maxSpacingInconsistencies, actual: audit.totalInconsistencies, passed };
  }

  if (thresholds.maxZIndexCollisions !== undefined) {
    const audit = auditZIndex(components);
    const passed = audit.collisions.length <= thresholds.maxZIndexCollisions;
    if (!passed) allPassed = false;
    checks.maxZIndexCollisions = { limit: thresholds.maxZIndexCollisions, actual: audit.collisions.length, passed };
  }

  if (thresholds.maxA11yIssues !== undefined) {
    const audit = auditA11y(components);
    const passed = audit.issues.length <= thresholds.maxA11yIssues;
    if (!passed) allPassed = false;
    checks.maxA11yIssues = { limit: thresholds.maxA11yIssues, actual: audit.issues.length, passed };
  }

  if (thresholds.minTokenCompliance !== undefined && tokenSet) {
    const audit = auditTokenCompliance(components, tokenSet);
    const passed = audit.compliancePercent >= thresholds.minTokenCompliance;
    if (!passed) allPassed = false;
    checks.minTokenCompliance = { limit: thresholds.minTokenCompliance, actual: audit.compliancePercent, passed };
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
      ...(checks.maxComplexityOutliers && { complexityOutliers: checks.maxComplexityOutliers.actual }),
      ...(checks.maxTypeCombinations && { typeCombinations: checks.maxTypeCombinations.actual }),
      ...(checks.maxSpacingInconsistencies && { spacingInconsistencies: checks.maxSpacingInconsistencies.actual }),
      ...(checks.maxZIndexCollisions && { zIndexCollisions: checks.maxZIndexCollisions.actual }),
      ...(checks.maxA11yIssues && { a11yIssues: checks.maxA11yIssues.actual }),
      ...(checks.minTokenCompliance && { tokenCompliancePercent: checks.minTokenCompliance.actual }),
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

  // New metric regressions (only compare when both reports have the value)
  if (baseline.metrics.complexityOutliers !== undefined && current.metrics.complexityOutliers !== undefined
    && current.metrics.complexityOutliers > baseline.metrics.complexityOutliers) {
    regressions.push(`Complexity outliers increased: ${baseline.metrics.complexityOutliers} → ${current.metrics.complexityOutliers}`);
  }
  if (baseline.metrics.spacingInconsistencies !== undefined && current.metrics.spacingInconsistencies !== undefined
    && current.metrics.spacingInconsistencies > baseline.metrics.spacingInconsistencies) {
    regressions.push(`Spacing inconsistencies increased: ${baseline.metrics.spacingInconsistencies} → ${current.metrics.spacingInconsistencies}`);
  }
  if (baseline.metrics.a11yIssues !== undefined && current.metrics.a11yIssues !== undefined
    && current.metrics.a11yIssues > baseline.metrics.a11yIssues) {
    regressions.push(`A11y issues increased: ${baseline.metrics.a11yIssues} → ${current.metrics.a11yIssues}`);
  }
  if (baseline.metrics.tokenCompliancePercent !== undefined && current.metrics.tokenCompliancePercent !== undefined
    && current.metrics.tokenCompliancePercent < baseline.metrics.tokenCompliancePercent) {
    regressions.push(`Token compliance decreased: ${baseline.metrics.tokenCompliancePercent}% → ${current.metrics.tokenCompliancePercent}%`);
  }

  return { regressed: regressions.length > 0, regressions };
}
