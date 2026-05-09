/**
 * Accessibility Quick-Scan — analyses stored component data for common
 * accessibility issues without requiring DOM access.
 *
 * Checks:
 * 1. Components named "img" or with img-like names without alt prop
 * 2. Input/select/textarea components without label/aria-label/aria-labelledby
 * 3. Button/anchor components without text content or aria-label
 * 4. Color contrast issues (foreground vs background from computed styles)
 * 5. Very small touch targets (< 44×44px)
 *
 * Browser-agnostic: no DOM, no chrome.* APIs.
 */

import type { StoredComponent } from '../shared/types';
import { parseRGB as parseRGBShared } from '../shared/color-utils';

export type A11ySeverity = 'error' | 'warning' | 'info';

export interface A11yIssue {
  type: string;
  severity: A11ySeverity;
  componentName: string;
  componentId: number;
  pagePath: string;
  message: string;
}

export interface A11yAudit {
  issues: A11yIssue[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
  byType: { type: string; count: number }[];
}

const IMG_NAMES = new Set(['img', 'image', 'avatar', 'thumbnail', 'icon', 'logo']);
const INPUT_NAMES = new Set(['input', 'select', 'textarea', 'textfield', 'datepicker', 'combobox']);
const BUTTON_NAMES = new Set(['button', 'btn', 'iconbutton', 'link', 'anchor']);

const MIN_TOUCH_SIZE = 44;

function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(fg: string, bg: string): number | null {
  const fgRGB = parseRGBShared(fg);
  const bgRGB = parseRGBShared(bg);
  if (!fgRGB || !bgRGB) return null;
  const l1 = relativeLuminance(fgRGB[0], fgRGB[1], fgRGB[2]);
  const l2 = relativeLuminance(bgRGB[0], bgRGB[1], bgRGB[2]);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function isLargeText(styles: Record<string, string>): boolean {
  const size = styles['font-size'];
  if (!size) return false;
  const px = Number.parseFloat(size);
  const weight = styles['font-weight'];
  const isBold = weight === '700' || weight === '800' || weight === '900' || weight === 'bold';
  // WCAG: large text = 18pt (24px) or 14pt bold (18.67px)
  return px >= 24 || (isBold && px >= 18.67);
}

export function auditA11y(components: StoredComponent[]): A11yAudit {
  const issues: A11yIssue[] = [];

  for (const comp of components) {
    const lowerName = comp.componentName.toLowerCase();
    const props = comp.props ?? {};
    const styles = comp.computedStyles ?? {};
    const rect = comp.boundingRect;

    // Check 1: Images without alt
    if (IMG_NAMES.has(lowerName) || lowerName.includes('image') || lowerName.includes('img')) {
      if (!props.alt && !props['aria-label'] && !props['aria-labelledby']) {
        issues.push({
          type: 'missing-alt',
          severity: 'error',
          componentName: comp.componentName,
          componentId: comp.id,
          pagePath: comp.pagePath,
          message: `Image component "${comp.componentName}" is missing an alt attribute`,
        });
      }
    }

    // Check 2: Inputs without labels
    if (INPUT_NAMES.has(lowerName) || lowerName.includes('input') || lowerName.includes('field')) {
      if (!props['aria-label'] && !props['aria-labelledby'] && !props.label && !props.id) {
        issues.push({
          type: 'missing-label',
          severity: 'error',
          componentName: comp.componentName,
          componentId: comp.id,
          pagePath: comp.pagePath,
          message: `Input component "${comp.componentName}" has no label, aria-label, or aria-labelledby`,
        });
      }
    }

    // Check 3: Buttons without accessible text
    if (BUTTON_NAMES.has(lowerName) || lowerName.includes('button') || lowerName.includes('btn')) {
      if (!props['aria-label'] && !props.title && !props.children && !props.label) {
        issues.push({
          type: 'missing-button-text',
          severity: 'warning',
          componentName: comp.componentName,
          componentId: comp.id,
          pagePath: comp.pagePath,
          message: `Button component "${comp.componentName}" may lack accessible text`,
        });
      }
    }

    // Check 4: Color contrast
    if (styles.color && styles['background-color']) {
      const ratio = contrastRatio(styles.color, styles['background-color']);
      if (ratio !== null) {
        const threshold = isLargeText(styles) ? 3 : 4.5;
        if (ratio < threshold) {
          issues.push({
            type: 'low-contrast',
            severity: 'warning',
            componentName: comp.componentName,
            componentId: comp.id,
            pagePath: comp.pagePath,
            message: `Contrast ratio ${ratio.toFixed(1)}:1 is below WCAG AA ${threshold}:1 threshold`,
          });
        }
      }
    }

    // Check 5: Small touch targets
    if (rect && (BUTTON_NAMES.has(lowerName) || lowerName.includes('button') || lowerName.includes('link'))) {
      if (rect.width > 0 && rect.height > 0 && (rect.width < MIN_TOUCH_SIZE || rect.height < MIN_TOUCH_SIZE)) {
        issues.push({
          type: 'small-touch-target',
          severity: 'info',
          componentName: comp.componentName,
          componentId: comp.id,
          pagePath: comp.pagePath,
          message: `Touch target ${Math.round(rect.width)}×${Math.round(rect.height)}px is below ${MIN_TOUCH_SIZE}px minimum`,
        });
      }
    }
  }

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const infoCount = issues.filter((i) => i.severity === 'info').length;

  // Group by type
  const typeMap = new Map<string, number>();
  for (const issue of issues) typeMap.set(issue.type, (typeMap.get(issue.type) ?? 0) + 1);
  const byType = Array.from(typeMap.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  return { issues, errorCount, warningCount, infoCount, byType };
}
