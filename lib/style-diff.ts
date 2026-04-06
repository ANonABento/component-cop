/**
 * Compute the CSS property differences between variant exemplars.
 * Returns only properties that differ across variants.
 */
export interface StyleDiffEntry {
  property: string;
  values: Map<string, string>; // variantId → value
}

/**
 * Given a map of variantId → computedStyles, return only the properties
 * where at least two variants differ.
 */
export function computeStyleDiff(
  variantStyles: Map<string, Record<string, string>>,
): StyleDiffEntry[] {
  if (variantStyles.size < 2) return [];

  const allProps = new Set<string>();
  for (const styles of variantStyles.values()) {
    for (const prop of Object.keys(styles)) {
      allProps.add(prop);
    }
  }

  const diffs: StyleDiffEntry[] = [];
  for (const prop of allProps) {
    const values = new Map<string, string>();
    const uniqueValues = new Set<string>();

    for (const [variantId, styles] of variantStyles) {
      const val = styles[prop] ?? '';
      values.set(variantId, val);
      uniqueValues.add(val);
    }

    if (uniqueValues.size > 1) {
      diffs.push({ property: prop, values });
    }
  }

  // Sort: layout props first, then colors, then typography, then alphabetical
  const priority = (prop: string): number => {
    if (/^(display|position|flex|grid|align|justify|gap|order)/.test(prop)) return 0;
    if (/^(width|height|min-|max-|padding|margin|inset|top|right|bottom|left)/.test(prop)) return 1;
    if (/^(color|background|border|outline|box-shadow)/.test(prop)) return 2;
    if (/^(font|letter|line-height|text|white-space)/.test(prop)) return 3;
    return 4;
  };

  diffs.sort((a, b) => {
    const pa = priority(a.property);
    const pb = priority(b.property);
    if (pa !== pb) return pa - pb;
    return a.property.localeCompare(b.property);
  });

  return diffs;
}
