import { rgbToHex as rgbToHexShared } from '../shared/color-utils';
/** Color finding from a single element (no component context) */
export interface ElementColorFinding {
  property: string;
  value: string;
  hexValue: string;
  element: string;
  severity: 'inline' | 'non-tailwind' | 'tw-arbitrary';
}

const COLOR_PROPS = [
  'color',
  'background-color',
  'border-color',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'outline-color',
] as const;

const SKIP_VALUES = new Set([
  'transparent',
  'inherit',
  'currentcolor',
  'initial',
  'unset',
  '',
]);

/** Tailwind CSS property → class prefix mapping */
const PROP_TO_TW_PREFIX: Record<string, string[]> = {
  color: ['text-'],
  'background-color': ['bg-'],
  'border-color': ['border-'],
  'border-top-color': ['border-t-', 'border-'],
  'border-right-color': ['border-r-', 'border-'],
  'border-bottom-color': ['border-b-', 'border-'],
  'border-left-color': ['border-l-', 'border-'],
  'outline-color': ['outline-'],
};

const TW_COLOR_PATTERN = /^(text|bg|border|ring|outline|shadow|accent|fill|stroke)-/;

/**
 * Detect hardcoded colors on an element.
 * Tailwind-aware: doesn't flag colors set via Tailwind utility classes.
 */
export function detectHardcodedColors(
  element: HTMLElement,
  cssVarCache: Map<string, Set<string>>,
): ElementColorFinding[] {
  const computed = getComputedStyle(element);
  const findings: ElementColorFinding[] = [];
  const selector = element.tagName.toLowerCase();

  for (const prop of COLOR_PROPS) {
    const value = computed.getPropertyValue(prop);
    if (SKIP_VALUES.has(value.toLowerCase())) continue;

    const severity = classifyColorSeverity(element, prop, value, cssVarCache);
    if (!severity) continue;

    findings.push({
      property: prop,
      value,
      hexValue: rgbToHex(value),
      element: selector,
      severity,
    });
  }

  return findings;
}

function classifyColorSeverity(
  element: HTMLElement,
  prop: string,
  value: string,
  cssVarCache: Map<string, Set<string>>,
): ElementColorFinding['severity'] | null {
  // 1. CSS variable — not hardcoded
  if (checkIfFromCSSVariable(element, prop, cssVarCache)) return null;

  // 2. Inline style — highest severity
  if (element.style.getPropertyValue(prop)) return 'inline';

  // 3. Tailwind utility class
  const classList = Array.from(element.classList);
  const prefixes = PROP_TO_TW_PREFIX[prop] ?? [];

  for (const cls of classList) {
    if (prefixes.some((p) => cls.startsWith(p)) && TW_COLOR_PATTERN.test(cls)) {
      // Check for arbitrary value: text-[#ff0000]
      if (cls.includes('[') && cls.includes(']')) return 'tw-arbitrary';
      return null; // Standard Tailwind class — not hardcoded
    }
  }

  return 'non-tailwind';
}

/**
 * Build a CSS variable cache for fast lookups.
 * Map of "selector → set of properties that use var()".
 */
const COLOR_PROP_SET = new Set<string>(COLOR_PROPS);

export function buildCSSVarCache(): Map<string, Set<string>> {
  const cache = new Map<string, Set<string>>();

  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        if (!(rule instanceof CSSStyleRule)) continue;
        const propsWithVars = new Set<string>();
        for (let i = 0; i < rule.style.length; i++) {
          const prop = rule.style[i]!;
          // Only track color-related properties — skip layout, font, etc.
          if (!COLOR_PROP_SET.has(prop)) continue;
          const val = rule.style.getPropertyValue(prop);
          if (val.includes('var(')) propsWithVars.add(prop);
        }
        if (propsWithVars.size > 0) {
          cache.set(rule.selectorText, propsWithVars);
        }
      }
    } catch {
      // Cross-origin stylesheet, skip
    }
  }

  return cache;
}

function checkIfFromCSSVariable(
  element: HTMLElement,
  prop: string,
  cache: Map<string, Set<string>>,
): boolean {
  for (const [selector, varProps] of cache) {
    if (!varProps.has(prop)) continue;
    try {
      if (element.matches(selector)) return true;
    } catch {
      // Invalid selector, skip
    }
  }
  return false;
}

const rgbToHex = rgbToHexShared;

// findNearDuplicateColors is in color-distance.ts (no DOM dependency, safe for service worker)
