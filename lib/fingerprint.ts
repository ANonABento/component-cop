import { STYLE_PROPERTIES } from '../shared/constants';
import { simpleHash } from '../shared/hash';

/**
 * Categorical style fingerprint.
 * Buckets each CSS property into a category, then hashes the vector.
 * Returns both the hash (for fast lookup) and the category array (for slot-by-slot comparison).
 */
export function computeStyleFingerprint(styles: Record<string, string>): {
  fingerprint: string;
  categories: string[];
} {
  const categories: string[] = [];

  // Colors → nearest bucket
  categories.push(colorBucket(styles['color'] ?? ''));
  categories.push(colorBucket(styles['background-color'] ?? ''));
  categories.push(colorBucket(styles['border-color'] ?? ''));

  // Font
  categories.push(fontFamilyBucket(styles['font-family'] ?? ''));
  categories.push(sizeBucket(styles['font-size'] ?? ''));
  categories.push(styles['font-weight'] ?? '');

  // Layout
  categories.push(styles['display'] ?? '');
  categories.push(sizeBucket(styles['border-radius'] ?? ''));

  // Size
  categories.push(dimensionBucket(styles['width'] ?? ''));
  categories.push(dimensionBucket(styles['height'] ?? ''));

  // Spacing — combined padding bucket
  categories.push(
    spacingBucket(
      styles['padding-top'] ?? '',
      styles['padding-right'] ?? '',
      styles['padding-bottom'] ?? '',
      styles['padding-left'] ?? '',
    ),
  );

  const fingerprint = simpleHash(categories.join('|'));
  return { fingerprint, categories };
}

/**
 * Extract computed styles for the key properties.
 */
export function extractComputedStyles(
  element: HTMLElement,
  computed?: CSSStyleDeclaration,
): Record<string, string> {
  const styles = computed ?? getComputedStyle(element);
  const result: Record<string, string> = {};
  for (const prop of STYLE_PROPERTIES) {
    result[prop] = styles.getPropertyValue(prop);
  }
  return result;
}

// ─── Bucketing functions ───

function colorBucket(value: string): string {
  if (!value || value === 'transparent' || value === 'inherit' || value === 'currentcolor') {
    return 'none';
  }
  const rgb = parseRGB(value);
  if (!rgb) return value.slice(0, 20);

  const [r, g, b] = rgb;

  // Grayscale detection
  if (Math.abs(r - g) < 10 && Math.abs(g - b) < 10) {
    const avg = (r + g + b) / 3;
    if (avg < 30) return 'black';
    if (avg < 80) return 'gray-dark';
    if (avg < 160) return 'gray-mid';
    if (avg < 220) return 'gray-light';
    return 'white';
  }

  // Hue-based bucketing
  const hue = rgbToHue(r, g, b);
  if (hue < 15 || hue >= 345) return 'red';
  if (hue < 45) return 'orange';
  if (hue < 75) return 'yellow';
  if (hue < 165) return 'green';
  if (hue < 195) return 'cyan';
  if (hue < 255) return 'blue';
  if (hue < 285) return 'purple';
  return 'pink';
}

function fontFamilyBucket(value: string): string {
  const lower = value.toLowerCase();
  if (lower.includes('mono') || lower.includes('courier') || lower.includes('consolas')) {
    return 'mono';
  }
  // Check sans-serif first — a stack like "Georgia, sans-serif" should bucket as sans
  if (lower.includes('sans-serif')) return 'sans';
  // Pure serif stacks (no sans-serif fallback)
  if (lower.includes('serif') || lower.includes('georgia') || lower.includes('times')) {
    return 'serif';
  }
  return 'sans';
}

export function sizeBucket(value: string): string {
  const px = parseFloat(value);
  if (Number.isNaN(px)) return value.slice(0, 10);
  if (px === 0) return '0';
  if (px <= 4) return 'xs';
  if (px <= 8) return 'sm';
  if (px <= 16) return 'md';
  if (px <= 24) return 'lg';
  if (px <= 48) return 'xl';
  return '2xl';
}

function dimensionBucket(value: string): string {
  if (value === 'auto' || value === '' || value === 'none') return 'auto';
  if (value.endsWith('%')) {
    const pct = parseFloat(value);
    if (pct >= 100) return 'full';
    if (pct >= 50) return 'half+';
    return 'partial';
  }
  const px = parseFloat(value);
  if (Number.isNaN(px)) return value.slice(0, 10);
  if (px <= 32) return 'tiny';
  if (px <= 100) return 'small';
  if (px <= 300) return 'medium';
  if (px <= 600) return 'large';
  return 'xlarge';
}

function spacingBucket(top: string, right: string, bottom: string, left: string): string {
  const t = parseFloat(top) || 0;
  const r = parseFloat(right) || 0;
  const b = parseFloat(bottom) || 0;
  const l = parseFloat(left) || 0;
  const avg = (t + r + b + l) / 4;

  if (avg === 0) return 'none';
  if (avg <= 4) return 'tight';
  if (avg <= 8) return 'compact';
  if (avg <= 16) return 'normal';
  if (avg <= 32) return 'spacious';
  return 'wide';
}

// ─── Color parsing helpers ───

function parseRGB(value: string): [number, number, number] | null {
  // Comma-separated: rgb(r, g, b) or rgba(r, g, b, a)
  const commaMatch = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (commaMatch) {
    return [Number(commaMatch[1]), Number(commaMatch[2]), Number(commaMatch[3])];
  }
  // Space-separated (modern): rgb(r g b) or rgb(r g b / a)
  const spaceMatch = value.match(/rgba?\(\s*(\d+)\s+(\d+)\s+(\d+)/);
  if (spaceMatch) {
    return [Number(spaceMatch[1]), Number(spaceMatch[2]), Number(spaceMatch[3])];
  }
  return null;
}

function rgbToHue(r: number, g: number, b: number): number {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;

  if (d === 0) return 0;

  let hue: number;
  if (max === rn) {
    hue = ((gn - bn) / d) % 6;
  } else if (max === gn) {
    hue = (bn - rn) / d + 2;
  } else {
    hue = (rn - gn) / d + 4;
  }

  hue = Math.round(hue * 60);
  if (hue < 0) hue += 360;
  return hue;
}

