/**
 * Consolidation Suggestions — generates concrete refactoring proposals
 * based on prop diffs, style diffs, and variant structure.
 */

import type { StoredComponent, StoredPattern } from '../shared/types';
import { computePropDiff, type PropDiffEntry } from './prop-diff';
import { computeStyleDiff, type StyleDiffEntry } from './style-diff';

export interface ConsolidationSuggestion {
  patternName: string;
  variantCount: number;
  totalInstances: number;
  /** Human-readable suggestion */
  suggestion: string;
  /** Concrete prop API recommendation */
  propApi: string | null;
  /** Estimated effort: low (prop toggle), medium (refactor), high (rewrite) */
  effort: 'low' | 'medium' | 'high';
  /** Which prop/style differences drive the suggestion */
  drivers: string[];
}

export function generateConsolidationSuggestion(
  pattern: StoredPattern,
  componentById: Map<number, StoredComponent>,
): ConsolidationSuggestion | null {
  if (pattern.variants.length < 2) return null;

  // Collect prop diffs
  const variantProps = new Map<string, Record<string, unknown>>();
  const variantStyles = new Map<string, Record<string, string>>();

  for (const v of pattern.variants) {
    const exemplar = componentById.get(v.exemplarComponentId);
    if (!exemplar) continue;
    variantProps.set(v.label, exemplar.props ?? {});
    variantStyles.set(v.label, exemplar.computedStyles ?? {});
  }

  const propDiffs = computePropDiff(variantProps);
  const styleDiffs = computeStyleDiff(variantStyles);

  const uniqueProps = propDiffs.filter((d) => d.classification === 'unique');
  const variedProps = propDiffs.filter((d) => d.classification === 'varied');

  const drivers: string[] = [];
  let suggestion = '';
  let propApi: string | null = null;
  let effort: ConsolidationSuggestion['effort'] = 'low';

  // Detect size-based differences
  const sizeStyleProps = styleDiffs.filter((d) =>
    /^(font-size|padding|height|width|min-|max-)/.test(d.property),
  );
  const colorStyleProps = styleDiffs.filter((d) =>
    /^(color|background|border-color|outline-color)/.test(d.property),
  );

  if (sizeStyleProps.length > 0 && sizeStyleProps.length >= styleDiffs.length * 0.4) {
    // Size-driven variants
    drivers.push(...sizeStyleProps.map((d) => d.property));
    const sizeValues = inferSizeScale(sizeStyleProps, pattern.variants.map((v) => v.label));
    suggestion = `These ${pattern.variants.length} variants differ primarily in sizing (${sizeStyleProps.map((d) => d.property).slice(0, 3).join(', ')}). `;
    suggestion += `Consolidate into a single component with a \`size\` prop.`;
    propApi = `size: ${sizeValues.map((s) => `"${s}"`).join(' | ')}`;
    effort = 'low';
  } else if (colorStyleProps.length > 0 && colorStyleProps.length >= styleDiffs.length * 0.4) {
    // Color-driven variants
    drivers.push(...colorStyleProps.map((d) => d.property));
    suggestion = `These ${pattern.variants.length} variants differ primarily in color (${colorStyleProps.map((d) => d.property).slice(0, 3).join(', ')}). `;
    suggestion += `Consolidate with a \`variant\` or \`colorScheme\` prop.`;
    propApi = `variant: ${pattern.variants.map((v) => `"${v.label.toLowerCase()}"`).join(' | ')}`;
    effort = 'low';
  } else if (uniqueProps.length > 0) {
    // Prop-shape differences
    drivers.push(...uniqueProps.map((d) => `prop:${d.key}`));
    if (uniqueProps.length <= 3) {
      suggestion = `Variants have different prop shapes: ${uniqueProps.map((d) => d.key).join(', ')} are not present in all variants. `;
      suggestion += `Make these optional props on the unified component.`;
      propApi = uniqueProps.map((d) => `${d.key}?: ...`).join('; ');
      effort = 'medium';
    } else {
      suggestion = `Variants differ in ${uniqueProps.length} props and ${styleDiffs.length} style properties. `;
      suggestion += `Consider whether these are truly the same component or should remain separate.`;
      effort = 'high';
    }
  } else if (styleDiffs.length > 0) {
    // Mixed style differences
    drivers.push(...styleDiffs.slice(0, 5).map((d) => d.property));
    suggestion = `${pattern.variants.length} variants differ in ${styleDiffs.length} CSS properties. `;
    if (styleDiffs.length <= 5) {
      suggestion += `A \`variant\` prop with CSS class mapping would consolidate these.`;
      propApi = `variant: ${pattern.variants.map((v) => `"${v.label.toLowerCase()}"`).join(' | ')}`;
      effort = 'low';
    } else {
      suggestion += `Significant style divergence — review if these should share a base component with variant-specific style overrides.`;
      effort = 'medium';
    }
  } else {
    // No meaningful diff detected
    suggestion = `${pattern.variants.length} variants found but no significant prop or style differences detected. `;
    suggestion += `These may be identical components used in different locations — consider deduplication.`;
    effort = 'low';
  }

  return {
    patternName: pattern.name,
    variantCount: pattern.variants.length,
    totalInstances: pattern.totalInstances,
    suggestion,
    propApi,
    effort,
    drivers,
  };
}

/** Infer size scale labels from numeric style values */
function inferSizeScale(sizeProps: StyleDiffEntry[], labels: string[]): string[] {
  // Try to order variants by their dominant size property
  const mainProp = sizeProps[0]!;
  const sizes = labels.map((label) => {
    const val = mainProp.values.get(label) ?? '0';
    const num = parseFloat(val);
    return { label, num: isNaN(num) ? 0 : num };
  });
  sizes.sort((a, b) => a.num - b.num);

  const scaleNames = ['xs', 'sm', 'md', 'lg', 'xl', '2xl'];
  if (sizes.length <= scaleNames.length) {
    // Center the scale around the middle
    const offset = Math.max(0, Math.floor((scaleNames.length - sizes.length) / 2));
    return sizes.map((_, i) => scaleNames[offset + i]!);
  }
  return sizes.map((_, i) => `size-${i + 1}`);
}
