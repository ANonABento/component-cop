/**
 * Design Token Compliance — checks component styles against a
 * user-defined token set and reports violations with nearest-token suggestions.
 *
 * Browser-agnostic: no DOM, no chrome.* APIs.
 */

import type { StoredComponent } from '../shared/types';
import { rgbToHex as sharedRgbToHex } from '../shared/color-utils';

export interface DesignTokenSet {
  colors?: Record<string, string>;
  spacing?: Record<string, string>;
  typography?: {
    fontSizes?: Record<string, string>;
    fontFamilies?: Record<string, string>;
    fontWeights?: Record<string, string>;
  };
  borderRadius?: Record<string, string>;
}

export interface TokenViolation {
  componentName: string;
  componentId: number;
  pagePath: string;
  property: string;
  actual: string;
  category: 'color' | 'spacing' | 'typography' | 'border-radius';
  nearestToken?: { name: string; value: string };
}

export interface TokenComplianceAudit {
  violations: TokenViolation[];
  totalChecks: number;
  compliantChecks: number;
  compliancePercent: number;
  byCategory: { category: string; violations: number; total: number; percent: number }[];
}

const COLOR_PROPS = ['color', 'background-color', 'border-color'] as const;
const SPACING_PROPS = ['padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left'] as const;
const FONT_SIZE_PROP = 'font-size';
const FONT_FAMILY_PROP = 'font-family';
const FONT_WEIGHT_PROP = 'font-weight';
const BORDER_RADIUS_PROP = 'border-radius';

function normalizeColor(value: string): string | null {
  if (value.startsWith('#')) {
    const clean = value.replace('#', '').toLowerCase();
    if (clean.length === 3) return `#${clean[0]}${clean[0]}${clean[1]}${clean[1]}${clean[2]}${clean[2]}`;
    return `#${clean}`;
  }
  if (value.startsWith('rgb')) {
    const hex = sharedRgbToHex(value);
    return hex === value ? null : hex; // sharedRgbToHex returns input on parse failure
  }
  return null;
}

function findNearestToken(value: string, tokens: Record<string, string>): { name: string; value: string } | undefined {
  // Simple: exact match first, then first token (no distance calc for non-colors)
  for (const [name, tokenVal] of Object.entries(tokens)) {
    if (tokenVal === value) return { name, value: tokenVal };
  }
  // For colors, try normalized match
  const normalized = normalizeColor(value);
  if (normalized) {
    for (const [name, tokenVal] of Object.entries(tokens)) {
      if (normalizeColor(tokenVal) === normalized) return { name, value: tokenVal };
    }
  }
  // Return first token as suggestion
  const first = Object.entries(tokens)[0];
  return first ? { name: first[0], value: first[1] } : undefined;
}

function isTokenValue(value: string, tokens: Record<string, string>): boolean {
  const tokenValues = Object.values(tokens);
  if (tokenValues.includes(value)) return true;
  const normalized = normalizeColor(value);
  if (normalized) {
    return tokenValues.some((tv) => normalizeColor(tv) === normalized);
  }
  return false;
}

export function auditTokenCompliance(
  components: StoredComponent[],
  tokenSet: DesignTokenSet,
): TokenComplianceAudit {
  const violations: TokenViolation[] = [];
  let totalChecks = 0;
  let compliantChecks = 0;

  const categoryStats = new Map<string, { violations: number; total: number }>();
  const trackCategory = (cat: string, isCompliant: boolean) => {
    const stat = categoryStats.get(cat) ?? { violations: 0, total: 0 };
    stat.total++;
    if (!isCompliant) stat.violations++;
    categoryStats.set(cat, stat);
  };

  for (const comp of components) {
    const styles = comp.computedStyles ?? {};

    // Color checks
    if (tokenSet.colors) {
      for (const prop of COLOR_PROPS) {
        const val = styles[prop];
        if (!val || val === 'transparent' || val === 'rgba(0, 0, 0, 0)') continue;
        totalChecks++;
        const compliant = isTokenValue(val, tokenSet.colors);
        trackCategory('color', compliant);
        if (compliant) { compliantChecks++; continue; }
        violations.push({
          componentName: comp.componentName, componentId: comp.id, pagePath: comp.pagePath,
          property: prop, actual: val, category: 'color',
          nearestToken: findNearestToken(val, tokenSet.colors),
        });
      }
    }

    // Spacing checks
    if (tokenSet.spacing) {
      for (const prop of SPACING_PROPS) {
        const val = styles[prop];
        if (!val || val === '0px') continue;
        totalChecks++;
        const compliant = isTokenValue(val, tokenSet.spacing);
        trackCategory('spacing', compliant);
        if (compliant) { compliantChecks++; continue; }
        violations.push({
          componentName: comp.componentName, componentId: comp.id, pagePath: comp.pagePath,
          property: prop, actual: val, category: 'spacing',
          nearestToken: findNearestToken(val, tokenSet.spacing),
        });
      }
    }

    // Typography checks
    if (tokenSet.typography?.fontSizes) {
      const val = styles[FONT_SIZE_PROP];
      if (val) {
        totalChecks++;
        const compliant = isTokenValue(val, tokenSet.typography.fontSizes);
        trackCategory('typography', compliant);
        if (compliant) compliantChecks++;
        else violations.push({
          componentName: comp.componentName, componentId: comp.id, pagePath: comp.pagePath,
          property: FONT_SIZE_PROP, actual: val, category: 'typography',
          nearestToken: findNearestToken(val, tokenSet.typography.fontSizes),
        });
      }
    }

    if (tokenSet.typography?.fontFamilies) {
      const val = styles[FONT_FAMILY_PROP];
      if (val) {
        totalChecks++;
        const compliant = isTokenValue(val, tokenSet.typography.fontFamilies);
        trackCategory('typography', compliant);
        if (compliant) compliantChecks++;
        else violations.push({
          componentName: comp.componentName, componentId: comp.id, pagePath: comp.pagePath,
          property: FONT_FAMILY_PROP, actual: val, category: 'typography',
          nearestToken: findNearestToken(val, tokenSet.typography.fontFamilies),
        });
      }
    }

    if (tokenSet.typography?.fontWeights) {
      const val = styles[FONT_WEIGHT_PROP];
      if (val) {
        totalChecks++;
        const compliant = isTokenValue(val, tokenSet.typography.fontWeights);
        trackCategory('typography', compliant);
        if (compliant) compliantChecks++;
        else violations.push({
          componentName: comp.componentName, componentId: comp.id, pagePath: comp.pagePath,
          property: FONT_WEIGHT_PROP, actual: val, category: 'typography',
          nearestToken: findNearestToken(val, tokenSet.typography.fontWeights),
        });
      }
    }

    // Border radius checks
    if (tokenSet.borderRadius) {
      const val = styles[BORDER_RADIUS_PROP];
      if (val && val !== '0px') {
        totalChecks++;
        const compliant = isTokenValue(val, tokenSet.borderRadius);
        trackCategory('border-radius', compliant);
        if (compliant) compliantChecks++;
        else violations.push({
          componentName: comp.componentName, componentId: comp.id, pagePath: comp.pagePath,
          property: BORDER_RADIUS_PROP, actual: val, category: 'border-radius',
          nearestToken: findNearestToken(val, tokenSet.borderRadius),
        });
      }
    }
  }

  const compliancePercent = totalChecks > 0 ? Math.round((compliantChecks / totalChecks) * 100) : 100;

  const byCategory = Array.from(categoryStats.entries())
    .map(([category, stat]) => ({
      category,
      violations: stat.violations,
      total: stat.total,
      percent: stat.total > 0 ? Math.round(((stat.total - stat.violations) / stat.total) * 100) : 100,
    }))
    .sort((a, b) => a.percent - b.percent);

  return { violations, totalChecks, compliantChecks, compliancePercent, byCategory };
}
