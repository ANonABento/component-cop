import { hexToRGB as hexToRGBShared } from '../shared/color-utils';
/**
 * CIE76 color distance between two hex colors.
 * Converts hex → RGB → Lab, then Euclidean distance in Lab space.
 */
export function colorDistance(hexA: string, hexB: string): number {
  const labA = hexToLab(hexA);
  const labB = hexToLab(hexB);
  if (!labA || !labB) return Infinity;

  return Math.sqrt(
    (labA[0] - labB[0]) ** 2 +
    (labA[1] - labB[1]) ** 2 +
    (labA[2] - labB[2]) ** 2,
  );
}

const hexToRGB = hexToRGBShared;

function hexToLab(hex: string): [number, number, number] | null {
  const rgb = hexToRGB(hex);
  if (!rgb) return null;
  const xyz = rgbToXYZ(rgb);
  return xyzToLab(xyz);
}

function rgbToXYZ(rgb: [number, number, number]): [number, number, number] {
  let [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s > 0.04045 ? ((s + 0.055) / 1.055) ** 2.4 : s / 12.92;
  });

  r = r! * 100;
  g = g! * 100;
  b = b! * 100;

  return [
    r * 0.4124564 + g * 0.3575761 + b * 0.1804375,
    r * 0.2126729 + g * 0.7151522 + b * 0.0721750,
    r * 0.0193339 + g * 0.1191920 + b * 0.9503041,
  ];
}

function xyzToLab(xyz: [number, number, number]): [number, number, number] {
  // D65 reference white
  const ref = [95.047, 100.0, 108.883] as const;

  const f = (t: number): number => {
    return t > 0.008856 ? t ** (1 / 3) : 7.787 * t + 16 / 116;
  };

  const fx = f(xyz[0] / ref[0]);
  const fy = f(xyz[1] / ref[1]);
  const fz = f(xyz[2] / ref[2]);

  return [
    116 * fy - 16,
    500 * (fx - fy),
    200 * (fy - fz),
  ];
}

/**
 * Find near-duplicate color pairs from a list of hex values.
 * Pure function — no DOM dependency, safe for service worker.
 */
export function findNearDuplicateColors(
  hexColors: string[],
  maxDistance = 5,
): { a: string; b: string; distance: number }[] {
  const pairs: { a: string; b: string; distance: number }[] = [];
  for (let i = 0; i < hexColors.length; i++) {
    for (let j = i + 1; j < hexColors.length; j++) {
      const a = hexColors[i]!;
      const b = hexColors[j]!;
      if (a === b) continue;
      const dist = colorDistance(a, b);
      if (dist <= maxDistance) {
        pairs.push({ a, b, distance: dist });
      }
    }
  }
  return pairs;
}
