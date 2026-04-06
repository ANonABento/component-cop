/**
 * Prop Diff — compares prop shapes across component variants.
 *
 * For each pattern variant, examines the exemplar's props and
 * classifies each prop key as: shared (same across all), varied
 * (present in all but different values), or unique (only in some).
 */

export interface PropDiffEntry {
  key: string;
  classification: 'shared' | 'varied' | 'unique';
  /** variant label → prop value (serialized) */
  values: Map<string, string>;
}

/**
 * Compute a prop diff across variants.
 * @param variantProps Map of variantLabel → props object
 */
export function computePropDiff(
  variantProps: Map<string, Record<string, unknown>>,
): PropDiffEntry[] {
  if (variantProps.size < 2) return [];

  const labels = Array.from(variantProps.keys());
  const allKeys = new Set<string>();

  for (const props of variantProps.values()) {
    for (const key of Object.keys(props)) {
      // Skip internal React props and children (noisy)
      if (key === 'children' || key === 'key' || key === 'ref' || key.startsWith('__')) continue;
      allKeys.add(key);
    }
  }

  const entries: PropDiffEntry[] = [];

  for (const key of allKeys) {
    const values = new Map<string, string>();
    for (const label of labels) {
      const props = variantProps.get(label)!;
      const val = props[key];
      values.set(label, val !== undefined ? serializePropValue(val) : '(not set)');
    }

    const presentIn = labels.filter((l) => {
      const props = variantProps.get(l)!;
      return props[key] !== undefined;
    });

    let classification: PropDiffEntry['classification'];
    if (presentIn.length < labels.length) {
      classification = 'unique';
    } else {
      // Present in all — check if values are the same
      const serialized = new Set(presentIn.map((l) => values.get(l)!));
      classification = serialized.size === 1 ? 'shared' : 'varied';
    }

    entries.push({ key, classification, values });
  }

  // Sort: unique first (most interesting), then varied, then shared
  const order: Record<string, number> = { unique: 0, varied: 1, shared: 2 };
  entries.sort((a, b) => order[a.classification]! - order[b.classification]!);

  return entries;
}

function serializePropValue(val: unknown): string {
  if (val === null) return 'null';
  if (val === undefined) return 'undefined';
  if (typeof val === 'string') return `"${val}"`;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (typeof val === 'function') return '() => ...';
  if (Array.isArray(val)) return `[${val.length} items]`;
  if (typeof val === 'object') {
    const keys = Object.keys(val as Record<string, unknown>);
    if (keys.length === 0) return '{}';
    if (keys.length <= 3) return `{ ${keys.join(', ')} }`;
    return `{ ${keys.slice(0, 3).join(', ')}, +${keys.length - 3} }`;
  }
  return String(val);
}
