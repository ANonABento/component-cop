/**
 * Z-Index Audit — surfaces z-index usage, collisions, and extreme values.
 *
 * Browser-agnostic: no DOM, no chrome.* APIs.
 */

import type { StoredComponent } from '../shared/types';

export interface ZIndexEntry {
  componentId: number;
  name: string;
  zIndex: number;
  pagePath: string;
}

export interface ZIndexCollision {
  zIndex: number;
  components: { name: string; pagePath: string }[];
}

export interface ZIndexAudit {
  entries: ZIndexEntry[];
  collisions: ZIndexCollision[];
  extremes: ZIndexEntry[];
  uniqueValues: number;
}

const EXTREME_THRESHOLD = 100;

export function auditZIndex(components: StoredComponent[]): ZIndexAudit {
  const entries: ZIndexEntry[] = [];

  for (const comp of components) {
    const raw = comp.computedStyles?.['z-index'];
    if (!raw || raw === 'auto') continue;
    const zIndex = Number.parseInt(raw, 10);
    if (Number.isNaN(zIndex)) continue;
    entries.push({ componentId: comp.id, name: comp.componentName, zIndex, pagePath: comp.pagePath });
  }

  entries.sort((a, b) => b.zIndex - a.zIndex);

  // Group by z-index value
  const byValue = new Map<number, { name: string; pagePath: string }[]>();
  for (const e of entries) {
    const list = byValue.get(e.zIndex) ?? [];
    list.push({ name: e.name, pagePath: e.pagePath });
    byValue.set(e.zIndex, list);
  }

  const collisions: ZIndexCollision[] = [];
  for (const [zIndex, comps] of byValue) {
    // Collision = same z-index used by different component names
    const uniqueNames = new Set(comps.map((c) => c.name));
    if (uniqueNames.size > 1) {
      collisions.push({ zIndex, components: comps });
    }
  }
  collisions.sort((a, b) => b.zIndex - a.zIndex);

  const extremes = entries.filter((e) => Math.abs(e.zIndex) > EXTREME_THRESHOLD);

  return {
    entries,
    collisions,
    extremes,
    uniqueValues: byValue.size,
  };
}
