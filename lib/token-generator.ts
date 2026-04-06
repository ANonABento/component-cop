/**
 * Design Token Generator
 *
 * From a color audit (hardcoded colors + near-duplicates), generates
 * a proposed token map that consolidates near-duplicate colors and
 * names tokens by their dominant usage context.
 */

import type { AggregatedColorStats } from '../entrypoints/panel/helpers';

export interface DesignToken {
  name: string;
  value: string;
  replacesCount: number;
  usedAs: string[];
  merged: string[]; // other hex values this token replaces (near-duplicates)
}

export interface TokenMap {
  tokens: DesignToken[];
  cssVariables: string;
  tailwindConfig: string;
  tokenJson: string;
}

/** Heuristic name from usage context (e.g., "color" + "background-color" → "bg-primary") */
function inferTokenName(hex: string, usedAs: string[], index: number): string {
  const category = classifyByUsage(usedAs);
  const shade = classifyByLightness(hex);
  const suffix = index > 0 ? `-${index + 1}` : '';
  return `${category}-${shade}${suffix}`;
}

function classifyByUsage(usedAs: string[]): string {
  const joined = usedAs.join(' ');
  if (joined.includes('background')) return 'bg';
  if (joined.includes('border')) return 'border';
  if (joined.includes('outline')) return 'outline';
  return 'text';
}

function classifyByLightness(hex: string): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return 'base';
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const lightness = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  if (lightness > 0.9) return 'lightest';
  if (lightness > 0.7) return 'light';
  if (lightness > 0.4) return 'base';
  if (lightness > 0.2) return 'dark';
  return 'darkest';
}

/**
 * Generate a design token map from aggregated color stats.
 * Merges near-duplicates into canonical tokens and names them by usage.
 */
export function generateTokenMap(stats: AggregatedColorStats): TokenMap {
  // Build a union-find to merge near-duplicate colors
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    if (!parent.has(x)) parent.set(x, x);
    if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!));
    return parent.get(x)!;
  };
  const union = (a: string, b: string, colorCounts: Map<string, number>): void => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA === rootB) return;
    // Keep the more-used color as canonical
    const countA = colorCounts.get(rootA) ?? 0;
    const countB = colorCounts.get(rootB) ?? 0;
    if (countA >= countB) {
      parent.set(rootB, rootA);
    } else {
      parent.set(rootA, rootB);
    }
  };

  // Count usages per hex
  const colorCounts = new Map<string, number>();
  const colorUsedAs = new Map<string, Set<string>>();
  for (const c of stats.topColors) {
    colorCounts.set(c.hex, c.count);
    colorUsedAs.set(c.hex, new Set(c.usedAs));
  }

  // Merge near-duplicates
  for (const dup of stats.nearDuplicates) {
    union(dup.a, dup.b, colorCounts);
  }

  // Group colors by canonical representative
  const groups = new Map<string, { hex: string; count: number; usedAs: Set<string>; merged: string[] }>();
  for (const c of stats.topColors) {
    const canonical = find(c.hex);
    const existing = groups.get(canonical);
    if (existing) {
      existing.count += c.count;
      for (const u of c.usedAs) existing.usedAs.add(u);
      if (c.hex !== canonical) existing.merged.push(c.hex);
    } else {
      groups.set(canonical, {
        hex: canonical,
        count: c.count,
        usedAs: new Set(c.usedAs),
        merged: c.hex !== canonical ? [c.hex] : [],
      });
    }
  }

  // Sort by usage count, generate names
  const sorted = Array.from(groups.values()).sort((a, b) => b.count - a.count);
  const nameCounters = new Map<string, number>();

  const tokens: DesignToken[] = sorted.map((group) => {
    const baseCategory = classifyByUsage(Array.from(group.usedAs));
    const shade = classifyByLightness(group.hex);
    const baseKey = `${baseCategory}-${shade}`;
    const count = nameCounters.get(baseKey) ?? 0;
    nameCounters.set(baseKey, count + 1);
    const name = inferTokenName(group.hex, Array.from(group.usedAs), count);

    return {
      name,
      value: group.hex,
      replacesCount: group.count,
      usedAs: Array.from(group.usedAs),
      merged: group.merged,
    };
  });

  // Generate output formats
  const cssVariables = tokens
    .map((t) => `  --${t.name}: ${t.value};${t.merged.length > 0 ? ` /* replaces ${t.merged.join(', ')} */` : ''}`)
    .join('\n');

  const tailwindColors: Record<string, string> = {};
  for (const t of tokens) {
    tailwindColors[t.name] = `var(--${t.name})`;
  }

  const tailwindConfig = `// tailwind.config.ts\nmodule.exports = {\n  theme: {\n    extend: {\n      colors: ${JSON.stringify(tailwindColors, null, 8).replace(/^/gm, '      ').trim()}\n    }\n  }\n}`;

  const tokenJson = JSON.stringify(
    tokens.map((t) => ({
      name: t.name,
      value: t.value,
      usedAs: t.usedAs,
      replaces: t.merged.length > 0 ? t.merged : undefined,
    })),
    null,
    2,
  );

  return {
    tokens,
    cssVariables: `:root {\n${cssVariables}\n}`,
    tailwindConfig,
    tokenJson,
  };
}
