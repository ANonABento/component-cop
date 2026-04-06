import { describe, expect, it } from 'vitest';
import { colorDistance, findNearDuplicateColors } from '../color-distance';

describe('colorDistance', () => {
  it('returns 0 for identical colors', () => {
    expect(colorDistance('#3b82f6', '#3b82f6')).toBe(0);
  });

  it('returns small distance for similar colors', () => {
    // Very similar blues
    const dist = colorDistance('#3b82f6', '#3a81f5');
    expect(dist).toBeLessThan(5);
  });

  it('returns large distance for different colors', () => {
    // Red vs blue
    const dist = colorDistance('#ef4444', '#3b82f6');
    expect(dist).toBeGreaterThan(30);
  });

  it('returns large distance for black vs white', () => {
    const dist = colorDistance('#000000', '#ffffff');
    expect(dist).toBeGreaterThan(90);
  });

  it('handles invalid hex gracefully', () => {
    expect(colorDistance('invalid', '#000000')).toBe(Infinity);
  });
});

describe('findNearDuplicateColors', () => {
  it('finds near-duplicate pairs within threshold', () => {
    const pairs = findNearDuplicateColors(['#3b82f6', '#3a81f5', '#ef4444'], 5);
    expect(pairs.length).toBe(1);
    expect(pairs[0]!.a).toBe('#3b82f6');
    expect(pairs[0]!.b).toBe('#3a81f5');
    expect(pairs[0]!.distance).toBeLessThan(5);
  });

  it('returns empty for all-different colors', () => {
    const pairs = findNearDuplicateColors(['#ff0000', '#00ff00', '#0000ff'], 5);
    expect(pairs).toEqual([]);
  });

  it('skips identical hex values', () => {
    const pairs = findNearDuplicateColors(['#3b82f6', '#3b82f6'], 5);
    expect(pairs).toEqual([]);
  });

  it('returns empty for empty input', () => {
    expect(findNearDuplicateColors([], 5)).toEqual([]);
  });
});
