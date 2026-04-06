import type { PanelToBackgroundMessage } from '../../shared/messages';
import type { StoredComponent, StoredPage } from '../../shared/types';

export function sendMsg(port: chrome.runtime.Port, msg: PanelToBackgroundMessage): void {
  if (!chrome.runtime?.id) return;
  try { port.postMessage(msg); } catch { /* stale port */ }
}

export function shortenPath(path: string): string {
  const parts = path.split('/');
  if (parts.length <= 3) return path;
  return '.../' + parts.slice(-3).join('/');
}

export function groupByName(components: StoredComponent[]): { name: string; components: StoredComponent[] }[] {
  const map = new Map<string, StoredComponent[]>();
  for (const c of components) {
    const existing = map.get(c.componentName) ?? [];
    existing.push(c);
    map.set(c.componentName, existing);
  }
  return Array.from(map.entries())
    .map(([name, comps]) => ({ name, components: comps }))
    .sort((a, b) => b.components.length - a.components.length);
}

/** Extract the most visually-meaningful CSS properties for LLM comparison. */
const KEY_STYLE_PROPS = [
  'font-family', 'font-size', 'font-weight', 'color', 'background-color',
  'border-width', 'border-style', 'border-color', 'border-radius',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'display', 'width', 'height', 'box-shadow', 'line-height',
] as const;

export function extractKeyStyles(computedStyles: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const prop of KEY_STYLE_PROPS) {
    const val = computedStyles[prop];
    if (val && val !== 'none' && val !== 'normal' && val !== 'auto' && val !== '0px') {
      out[prop] = val;
    }
  }
  return out;
}

export interface AggregatedColorStats {
  uniqueColors: number;
  totalUsages: number;
  topColors: { hex: string; count: number; usedAs: string[]; severities: string[] }[];
  nearDuplicates: { a: string; b: string; distance: number }[];
}

export function aggregateColorStats(pages: StoredPage[]): AggregatedColorStats {
  const allColors = new Map<string, { count: number; usedAs: Set<string>; severities: Set<string> }>();
  const allDuplicates: { a: string; b: string; distance: number }[] = [];
  let totalUsages = 0;

  for (const page of pages) {
    if (!page.colorSummary) continue;
    totalUsages += page.colorSummary.totalUsages;
    for (const tc of page.colorSummary.topColors) {
      const existing = allColors.get(tc.hex);
      if (existing) {
        existing.count += tc.count;
        for (const u of tc.usedAs) existing.usedAs.add(u);
        for (const s of (tc.severities ?? [])) existing.severities.add(s);
      } else {
        allColors.set(tc.hex, { count: tc.count, usedAs: new Set(tc.usedAs), severities: new Set(tc.severities ?? []) });
      }
    }
    for (const dup of page.colorSummary.nearDuplicates) {
      if (!allDuplicates.some((d) => (d.a === dup.a && d.b === dup.b) || (d.a === dup.b && d.b === dup.a))) {
        allDuplicates.push(dup);
      }
    }
  }

  const topColors = Array.from(allColors.entries())
    .map(([hex, data]) => ({ hex, count: data.count, usedAs: Array.from(data.usedAs), severities: Array.from(data.severities) }))
    .sort((a, b) => b.count - a.count);

  return { uniqueColors: allColors.size, totalUsages, topColors, nearDuplicates: allDuplicates };
}
