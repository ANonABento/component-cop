/**
 * Parse an RGB/RGBA string into [r, g, b] tuple.
 * Handles both comma-separated and space-separated formats.
 */
export function parseRGB(value: string): [number, number, number] | null {
  // Comma-separated: rgb(255, 0, 0) or rgba(255, 0, 0, 1)
  // Space-separated: rgb(255 0 0) or rgb(255 0 0 / 0.5)
  const match = value.match(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/**
 * Convert a hex color string to [r, g, b] tuple.
 */
export function hexToRGB(hex: string): [number, number, number] | null {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return null;
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

/**
 * Convert an RGB/RGBA string to hex.
 * Handles both comma-separated and space-separated formats.
 */
export function rgbToHex(rgb: string): string {
  const parsed = parseRGB(rgb);
  if (!parsed) return rgb;
  const [r, g, b] = parsed;
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}
