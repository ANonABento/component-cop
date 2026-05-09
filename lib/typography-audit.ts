/**
 * Typography Audit — analyses font usage across components to surface
 * unique type combinations, near-duplicate sizes, and the type scale.
 *
 * Browser-agnostic: no DOM, no chrome.* APIs.
 */

import type { StoredComponent } from '../shared/types';

export interface TypeCombination {
  family: string;
  size: string;
  weight: string;
  lineHeight: string;
  letterSpacing: string;
  count: number;
  components: string[];
}

export interface NearDuplicateSize {
  a: string;
  b: string;
  diffPx: number;
}

export interface TypeScaleEntry {
  size: string;
  sizePx: number;
  count: number;
}

export interface TypographyAudit {
  combinations: TypeCombination[];
  nearDuplicateSizes: NearDuplicateSize[];
  typeScale: TypeScaleEntry[];
  families: { family: string; count: number }[];
}

const NEAR_DUPLICATE_THRESHOLD_PX = 2;

function parsePx(value: string): number | null {
  const match = value.match(/^([\d.]+)px$/);
  return match ? Number.parseFloat(match[1]!) : null;
}

function comboKey(family: string, size: string, weight: string, lineHeight: string, letterSpacing: string): string {
  return `${family}|${size}|${weight}|${lineHeight}|${letterSpacing}`;
}

export function auditTypography(components: StoredComponent[]): TypographyAudit {
  const comboMap = new Map<string, TypeCombination>();
  const sizeMap = new Map<string, number>();
  const familyMap = new Map<string, number>();

  for (const comp of components) {
    const s = comp.computedStyles;
    if (!s) continue;

    const family = s['font-family'] ?? '';
    const size = s['font-size'] ?? '';
    const weight = s['font-weight'] ?? '';
    const lineHeight = s['line-height'] ?? '';
    const letterSpacing = s['letter-spacing'] ?? '';

    if (!family && !size) continue;

    const key = comboKey(family, size, weight, lineHeight, letterSpacing);
    const existing = comboMap.get(key);
    if (existing) {
      existing.count++;
      if (!existing.components.includes(comp.componentName)) existing.components.push(comp.componentName);
    } else {
      comboMap.set(key, { family, size, weight, lineHeight, letterSpacing, count: 1, components: [comp.componentName] });
    }

    if (size) sizeMap.set(size, (sizeMap.get(size) ?? 0) + 1);
    if (family) {
      const shortFamily = family.split(',')[0]!.trim().replace(/['"]/g, '');
      familyMap.set(shortFamily, (familyMap.get(shortFamily) ?? 0) + 1);
    }
  }

  // Sort combinations by count descending
  const combinations = Array.from(comboMap.values()).sort((a, b) => b.count - a.count);

  // Build type scale sorted by px value
  const typeScale: TypeScaleEntry[] = Array.from(sizeMap.entries())
    .map(([size, count]) => ({ size, sizePx: parsePx(size) ?? 0, count }))
    .filter((e) => e.sizePx > 0)
    .sort((a, b) => a.sizePx - b.sizePx);

  // Find near-duplicate sizes
  const nearDuplicateSizes: NearDuplicateSize[] = [];
  for (let i = 0; i < typeScale.length - 1; i++) {
    const a = typeScale[i]!;
    const b = typeScale[i + 1]!;
    const diff = Math.abs(b.sizePx - a.sizePx);
    if (diff > 0 && diff <= NEAR_DUPLICATE_THRESHOLD_PX) {
      nearDuplicateSizes.push({ a: a.size, b: b.size, diffPx: diff });
    }
  }

  // Font families sorted by count
  const families = Array.from(familyMap.entries())
    .map(([family, count]) => ({ family, count }))
    .sort((a, b) => b.count - a.count);

  return { combinations, nearDuplicateSizes, typeScale, families };
}
