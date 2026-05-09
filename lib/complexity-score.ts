/**
 * Component Complexity Score — rates each component 0-100 based on
 * DOM depth, child count, prop count, and element area.
 *
 * Browser-agnostic: no DOM, no chrome.* APIs.
 */

import type { StoredComponent } from '../shared/types';

export interface ComplexityResult {
  componentId: number;
  name: string;
  score: number;
  breakdown: {
    depth: number;
    children: number;
    props: number;
    area: number;
  };
  pagePath: string;
}

export interface ComplexityAudit {
  results: ComplexityResult[];
  outliers: ComplexityResult[];
  average: number;
  median: number;
}

/** Weights for each factor (must sum to 1) */
const WEIGHT_DEPTH = 0.25;
const WEIGHT_CHILDREN = 0.25;
const WEIGHT_PROPS = 0.25;
const WEIGHT_AREA = 0.25;

/** Normalization ceilings — values above these score 100 for that factor */
const MAX_DEPTH = 12;
const MAX_CHILDREN = 30;
const MAX_PROPS = 20;
const MAX_AREA = 500_000; // px²

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function countDepth(structure: string): number {
  let max = 0;
  let current = 0;
  for (const ch of structure) {
    if (ch === '(') { current++; if (current > max) max = current; }
    else if (ch === ')') { current--; }
  }
  return max;
}

function countChildren(structure: string): number {
  // Count direct children at root level: each '(' at depth 1
  let depth = 0;
  let count = 0;
  for (const ch of structure) {
    if (ch === '(') { depth++; if (depth === 1) count++; }
    else if (ch === ')') { depth--; }
  }
  return count;
}

export function scoreComplexity(component: StoredComponent): ComplexityResult {
  const depth = countDepth(component.domStructure ?? '');
  const children = countChildren(component.domStructure ?? '');
  const propCount = component.props ? Object.keys(component.props).length : 0;
  const rect = component.boundingRect;
  const area = rect ? rect.width * rect.height : 0;

  const depthScore = clamp01(depth / MAX_DEPTH) * 100;
  const childrenScore = clamp01(children / MAX_CHILDREN) * 100;
  const propsScore = clamp01(propCount / MAX_PROPS) * 100;
  const areaScore = clamp01(area / MAX_AREA) * 100;

  const score = Math.round(
    depthScore * WEIGHT_DEPTH +
    childrenScore * WEIGHT_CHILDREN +
    propsScore * WEIGHT_PROPS +
    areaScore * WEIGHT_AREA,
  );

  return {
    componentId: component.id,
    name: component.componentName,
    score,
    breakdown: {
      depth: Math.round(depthScore),
      children: Math.round(childrenScore),
      props: Math.round(propsScore),
      area: Math.round(areaScore),
    },
    pagePath: component.pagePath,
  };
}

export function auditComplexity(
  components: StoredComponent[],
  threshold = 80,
): ComplexityAudit {
  const results = components
    .map(scoreComplexity)
    .sort((a, b) => b.score - a.score);

  const outliers = results.filter((r) => r.score >= threshold);

  const scores = results.map((r) => r.score);
  const average = scores.length > 0
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : 0;

  const sorted = [...scores].sort((a, b) => a - b);
  const median = sorted.length > 0
    ? sorted.length % 2 === 1
      ? sorted[Math.floor(sorted.length / 2)]!
      : Math.round((sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2)
    : 0;

  return { results, outliers, average, median };
}
