/**
 * Bundle Impact Estimation — estimates bytes saved by consolidating
 * duplicate component patterns.
 *
 * Heuristic: redundant instances × estimated component size.
 * Component size = CSS property count × 20 bytes + DOM structure length × 3 bytes + props JSON length.
 *
 * Browser-agnostic: no DOM, no chrome.* APIs.
 */

import type { StoredComponent, StoredPattern } from '../shared/types';

export interface BundleImpact {
  patternId: string;
  patternName: string;
  redundantInstances: number;
  estimatedBytesPerInstance: number;
  estimatedSavings: number;
}

export interface BundleImpactSummary {
  patterns: BundleImpact[];
  totalEstimatedSavings: number;
}

function estimateComponentSize(component: StoredComponent): number {
  const cssBytes = component.computedStyles
    ? Object.keys(component.computedStyles).length * 20
    : 0;
  const domBytes = (component.domStructure?.length ?? 0) * 3;
  const propsBytes = component.props
    ? JSON.stringify(component.props).length
    : 0;
  return cssBytes + domBytes + propsBytes;
}

export function estimateBundleImpact(
  patterns: StoredPattern[],
  componentById: Map<number, StoredComponent>,
): BundleImpactSummary {
  const results: BundleImpact[] = [];

  for (const pattern of patterns) {
    if (pattern.variants.length <= 1) continue;

    // Find the canonical variant (most instances)
    const canonical = pattern.variants.reduce((a, b) =>
      b.componentIds.length > a.componentIds.length ? b : a,
    );

    // Redundant = total instances minus canonical instances
    const redundantInstances = pattern.totalInstances - canonical.componentIds.length;
    if (redundantInstances <= 0) continue;

    // Estimate size from canonical exemplar
    const exemplar = componentById.get(canonical.exemplarComponentId);
    const estimatedBytesPerInstance = exemplar ? estimateComponentSize(exemplar) : 100;

    results.push({
      patternId: pattern.patternId,
      patternName: pattern.name,
      redundantInstances,
      estimatedBytesPerInstance,
      estimatedSavings: redundantInstances * estimatedBytesPerInstance,
    });
  }

  results.sort((a, b) => b.estimatedSavings - a.estimatedSavings);

  return {
    patterns: results,
    totalEstimatedSavings: results.reduce((sum, r) => sum + r.estimatedSavings, 0),
  };
}

/** Format bytes as human-readable string */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
