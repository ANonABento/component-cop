/**
 * Scan History — stores scan snapshots for trend tracking and baseline diffing.
 *
 * Each snapshot captures a summary of the scan state at a point in time.
 * Stored in a separate IDB store to avoid bloating the main component data.
 */

export interface ScanSnapshot {
  id: number;
  timestamp: number;
  label: string; // e.g. "Manual scan", "Crawl complete", "Baseline"
  pagesScanned: number;
  totalComponents: number;
  patternGroups: number;
  multiVariantPatterns: number;
  hardcodedColors: number;
  nearDuplicateColors: number;
  /** Top-level pattern names + variant counts for diffing */
  patternSummary: PatternSnapshotEntry[];
}

export interface PatternSnapshotEntry {
  name: string;
  variantCount: number;
  totalInstances: number;
}

export interface BaselineDiff {
  addedPatterns: PatternSnapshotEntry[];
  removedPatterns: PatternSnapshotEntry[];
  changedPatterns: {
    name: string;
    oldVariants: number;
    newVariants: number;
    oldInstances: number;
    newInstances: number;
  }[];
  metrics: {
    label: string;
    baseline: number;
    current: number;
    delta: number;
  }[];
}

/**
 * Compare current snapshot against a baseline snapshot.
 */
export function computeBaselineDiff(
  baseline: ScanSnapshot,
  current: ScanSnapshot,
): BaselineDiff {
  const baseMap = new Map(baseline.patternSummary.map((p) => [p.name, p]));
  const currMap = new Map(current.patternSummary.map((p) => [p.name, p]));

  const addedPatterns: PatternSnapshotEntry[] = [];
  const removedPatterns: PatternSnapshotEntry[] = [];
  const changedPatterns: BaselineDiff['changedPatterns'] = [];

  for (const [name, curr] of currMap) {
    const base = baseMap.get(name);
    if (!base) {
      addedPatterns.push(curr);
    } else if (base.variantCount !== curr.variantCount || base.totalInstances !== curr.totalInstances) {
      changedPatterns.push({
        name,
        oldVariants: base.variantCount,
        newVariants: curr.variantCount,
        oldInstances: base.totalInstances,
        newInstances: curr.totalInstances,
      });
    }
  }

  for (const [name, base] of baseMap) {
    if (!currMap.has(name)) removedPatterns.push(base);
  }

  const metrics: BaselineDiff['metrics'] = [
    { label: 'Pages', baseline: baseline.pagesScanned, current: current.pagesScanned, delta: current.pagesScanned - baseline.pagesScanned },
    { label: 'Components', baseline: baseline.totalComponents, current: current.totalComponents, delta: current.totalComponents - baseline.totalComponents },
    { label: 'Pattern Groups', baseline: baseline.patternGroups, current: current.patternGroups, delta: current.patternGroups - baseline.patternGroups },
    { label: 'Multi-variant', baseline: baseline.multiVariantPatterns, current: current.multiVariantPatterns, delta: current.multiVariantPatterns - baseline.multiVariantPatterns },
    { label: 'HC Colors', baseline: baseline.hardcodedColors, current: current.hardcodedColors, delta: current.hardcodedColors - baseline.hardcodedColors },
    { label: 'Near-duplicate Colors', baseline: baseline.nearDuplicateColors, current: current.nearDuplicateColors, delta: current.nearDuplicateColors - baseline.nearDuplicateColors },
  ];

  return { addedPatterns, removedPatterns, changedPatterns, metrics };
}
