import { describe, expect, it } from 'vitest';
import { parseRGB, hexToRGB, rgbToHex } from '../../shared/color-utils';

describe('parseRGB', () => {
  it('parses comma-separated rgb', () => {
    expect(parseRGB('rgb(255, 0, 128)')).toEqual([255, 0, 128]);
  });

  it('parses space-separated rgb (Chrome 90+)', () => {
    expect(parseRGB('rgb(255 0 128)')).toEqual([255, 0, 128]);
  });

  it('parses rgba comma', () => {
    expect(parseRGB('rgba(10, 20, 30, 0.5)')).toEqual([10, 20, 30]);
  });

  it('parses rgba space with slash', () => {
    expect(parseRGB('rgb(10 20 30 / 0.5)')).toEqual([10, 20, 30]);
  });

  it('returns null for non-rgb', () => {
    expect(parseRGB('red')).toBeNull();
    expect(parseRGB('#ff0000')).toBeNull();
  });
});

describe('hexToRGB', () => {
  it('converts 6-digit hex', () => {
    expect(hexToRGB('#ff0080')).toEqual([255, 0, 128]);
  });

  it('handles no hash', () => {
    expect(hexToRGB('ff0080')).toEqual([255, 0, 128]);
  });

  it('returns null for short hex', () => {
    expect(hexToRGB('#fff')).toBeNull();
  });
});

describe('rgbToHex', () => {
  it('converts comma-separated', () => {
    expect(rgbToHex('rgb(255, 0, 128)')).toBe('#ff0080');
  });

  it('converts space-separated', () => {
    expect(rgbToHex('rgb(255 0 128)')).toBe('#ff0080');
  });

  it('passes through non-rgb values', () => {
    expect(rgbToHex('red')).toBe('red');
  });
});
