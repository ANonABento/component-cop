import { describe, expect, it } from 'vitest';
import { computeStyleFingerprint, sizeBucket } from '../fingerprint';

describe('computeStyleFingerprint', () => {
  it('produces consistent fingerprints for identical styles', () => {
    const styles = {
      color: 'rgb(0, 0, 0)',
      'background-color': 'rgb(255, 255, 255)',
      'border-color': 'rgb(200, 200, 200)',
      'font-family': 'Inter, sans-serif',
      'font-size': '14px',
      'font-weight': '400',
      display: 'flex',
      'border-radius': '8px',
      width: '200px',
      height: '100px',
      'padding-top': '8px',
      'padding-right': '12px',
      'padding-bottom': '8px',
      'padding-left': '12px',
    };

    const a = computeStyleFingerprint(styles);
    const b = computeStyleFingerprint(styles);

    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.categories).toEqual(b.categories);
  });

  it('produces different fingerprints for different colors', () => {
    const base = {
      color: 'rgb(0, 0, 0)',
      'background-color': 'rgb(255, 255, 255)',
      'border-color': 'transparent',
      'font-family': 'sans-serif',
      'font-size': '14px',
      'font-weight': '400',
      display: 'block',
      'border-radius': '0px',
      width: 'auto',
      height: 'auto',
      'padding-top': '0px',
      'padding-right': '0px',
      'padding-bottom': '0px',
      'padding-left': '0px',
    };

    const red = computeStyleFingerprint({
      ...base,
      'background-color': 'rgb(255, 0, 0)',
    });

    const blue = computeStyleFingerprint({
      ...base,
      'background-color': 'rgb(0, 0, 255)',
    });

    expect(red.fingerprint).not.toBe(blue.fingerprint);
  });

  it('buckets similar colors together', () => {
    const a = computeStyleFingerprint({
      color: 'rgb(59, 130, 246)',
      'background-color': '',
      'border-color': '',
      'font-family': '',
      'font-size': '',
      'font-weight': '',
      display: '',
      'border-radius': '',
      width: '',
      height: '',
      'padding-top': '',
      'padding-right': '',
      'padding-bottom': '',
      'padding-left': '',
    });

    const b = computeStyleFingerprint({
      color: 'rgb(58, 127, 245)',
      'background-color': '',
      'border-color': '',
      'font-family': '',
      'font-size': '',
      'font-weight': '',
      display: '',
      'border-radius': '',
      width: '',
      height: '',
      'padding-top': '',
      'padding-right': '',
      'padding-bottom': '',
      'padding-left': '',
    });

    // Both are blue → same color bucket → same fingerprint
    expect(a.categories[0]).toBe(b.categories[0]);
  });

  it('returns correct number of categories', () => {
    const result = computeStyleFingerprint({
      color: '',
      'background-color': '',
      'border-color': '',
      'font-family': '',
      'font-size': '',
      'font-weight': '',
      display: '',
      'border-radius': '',
      width: '',
      height: '',
      'padding-top': '',
      'padding-right': '',
      'padding-bottom': '',
      'padding-left': '',
    });

    // 3 colors + 3 font + 2 layout + 2 size + 1 spacing = 11
    expect(result.categories).toHaveLength(11);
  });
});

describe('sizeBucket', () => {
  it('classifies pixel values into buckets', () => {
    expect(sizeBucket('0px')).toBe('0');
    expect(sizeBucket('2px')).toBe('xs');
    expect(sizeBucket('6px')).toBe('sm');
    expect(sizeBucket('14px')).toBe('md');
    expect(sizeBucket('20px')).toBe('lg');
    expect(sizeBucket('32px')).toBe('xl');
    expect(sizeBucket('64px')).toBe('2xl');
  });

  it('handles non-numeric values', () => {
    expect(sizeBucket('auto')).toBe('auto');
  });
});
