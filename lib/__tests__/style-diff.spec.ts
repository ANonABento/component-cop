import { describe, expect, it } from 'vitest';
import { computeStyleDiff } from '../style-diff';

describe('computeStyleDiff', () => {
  it('returns empty for single variant', () => {
    const styles = new Map([['v1', { color: 'red', padding: '8px' }]]);
    expect(computeStyleDiff(styles)).toEqual([]);
  });

  it('returns only differing properties', () => {
    const styles = new Map([
      ['v1', { color: 'red', padding: '8px', margin: '0px' }],
      ['v2', { color: 'blue', padding: '8px', margin: '4px' }],
    ]);
    const diffs = computeStyleDiff(styles);
    expect(diffs).toHaveLength(2);
    const props = diffs.map((d) => d.property);
    expect(props).toContain('color');
    expect(props).toContain('margin');
    expect(props).not.toContain('padding');
  });

  it('returns empty when all values match', () => {
    const styles = new Map([
      ['v1', { color: 'red', padding: '8px' }],
      ['v2', { color: 'red', padding: '8px' }],
    ]);
    expect(computeStyleDiff(styles)).toEqual([]);
  });

  it('handles three variants', () => {
    const styles = new Map([
      ['v1', { 'font-size': '14px', color: 'red' }],
      ['v2', { 'font-size': '16px', color: 'red' }],
      ['v3', { 'font-size': '14px', color: 'blue' }],
    ]);
    const diffs = computeStyleDiff(styles);
    expect(diffs).toHaveLength(2);
  });

  it('sorts layout properties before colors before typography', () => {
    const styles = new Map([
      ['v1', { 'font-size': '14px', color: 'red', display: 'flex', padding: '8px' }],
      ['v2', { 'font-size': '16px', color: 'blue', display: 'block', padding: '12px' }],
    ]);
    const diffs = computeStyleDiff(styles);
    const props = diffs.map((d) => d.property);
    // display (layout) should come before padding (box model), which comes before color, which comes before font-size
    expect(props.indexOf('display')).toBeLessThan(props.indexOf('padding'));
    expect(props.indexOf('padding')).toBeLessThan(props.indexOf('color'));
    expect(props.indexOf('color')).toBeLessThan(props.indexOf('font-size'));
  });

  it('includes values per variant in the diff entries', () => {
    const styles = new Map([
      ['v1', { color: 'red' }],
      ['v2', { color: 'blue' }],
    ]);
    const diffs = computeStyleDiff(styles);
    expect(diffs[0]!.values.get('v1')).toBe('red');
    expect(diffs[0]!.values.get('v2')).toBe('blue');
  });
});
