/**
 * Spacing Audit — detects inconsistent padding, margin, and border-radius
 * values across instances of the same component.
 *
 * Browser-agnostic: no DOM, no chrome.* APIs.
 */

import type { StoredComponent } from '../shared/types';

const SPACING_PROPERTIES = [
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'border-radius',
] as const;

export interface SpacingInconsistency {
  componentName: string;
  property: string;
  values: { value: string; count: number; pages: string[] }[];
}

export interface NearDuplicateSpacing {
  property: string;
  a: string;
  b: string;
  diffPx: number;
  componentName: string;
}

export interface SpacingAudit {
  inconsistencies: SpacingInconsistency[];
  nearDuplicates: NearDuplicateSpacing[];
  totalInconsistencies: number;
}

const NEAR_DUPLICATE_THRESHOLD_PX = 2;

function parsePx(value: string): number | null {
  const match = value.match(/^([\d.]+)px$/);
  return match ? Number.parseFloat(match[1]!) : null;
}

export function auditSpacing(components: StoredComponent[]): SpacingAudit {
  // Group components by name
  const byName = new Map<string, StoredComponent[]>();
  for (const comp of components) {
    const list = byName.get(comp.componentName) ?? [];
    list.push(comp);
    byName.set(comp.componentName, list);
  }

  const inconsistencies: SpacingInconsistency[] = [];
  const nearDuplicates: NearDuplicateSpacing[] = [];

  for (const [name, comps] of byName) {
    if (comps.length < 2) continue;

    for (const prop of SPACING_PROPERTIES) {
      const valueMap = new Map<string, { count: number; pages: Set<string> }>();

      for (const comp of comps) {
        const val = comp.computedStyles?.[prop];
        if (!val) continue;
        const entry = valueMap.get(val) ?? { count: 0, pages: new Set<string>() };
        entry.count++;
        entry.pages.add(comp.pagePath);
        valueMap.set(val, entry);
      }

      if (valueMap.size > 1) {
        const values = Array.from(valueMap.entries())
          .map(([value, { count, pages }]) => ({ value, count, pages: Array.from(pages) }))
          .sort((a, b) => b.count - a.count);

        inconsistencies.push({ componentName: name, property: prop, values });

        // Check for near-duplicate values
        const pxValues = values
          .map((v) => ({ ...v, px: parsePx(v.value) }))
          .filter((v): v is typeof v & { px: number } => v.px !== null)
          .sort((a, b) => a.px - b.px);

        for (let i = 0; i < pxValues.length - 1; i++) {
          const a = pxValues[i]!;
          const b = pxValues[i + 1]!;
          const diff = Math.abs(b.px - a.px);
          if (diff > 0 && diff <= NEAR_DUPLICATE_THRESHOLD_PX) {
            nearDuplicates.push({ property: prop, a: a.value, b: b.value, diffPx: diff, componentName: name });
          }
        }
      }
    }
  }

  // Sort by number of distinct values descending
  inconsistencies.sort((a, b) => b.values.length - a.values.length);

  return {
    inconsistencies,
    nearDuplicates,
    totalInconsistencies: inconsistencies.length,
  };
}
