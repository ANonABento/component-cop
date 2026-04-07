import { describe, it, expect } from 'vitest';
import { generateTokenMap } from '../token-generator';
import type { AggregatedColorStats } from '../../entrypoints/panel/helpers';

function makeStats(overrides: Partial<AggregatedColorStats> = {}): AggregatedColorStats {
  return {
    uniqueColors: 0,
    totalUsages: 0,
    topColors: [],
    nearDuplicates: [],
    ...overrides,
  };
}

describe('generateTokenMap', () => {
  it('returns empty tokens for empty stats', () => {
    const result = generateTokenMap(makeStats());
    expect(result.tokens).toEqual([]);
    expect(result.cssVariables).toBe(':root {\n\n}');
    expect(result.tokenJson).toBe('[]');
  });

  it('creates a token per unique color', () => {
    const result = generateTokenMap(makeStats({
      topColors: [
        { hex: '#ff0000', count: 5, usedAs: ['color'], severities: ['inline'] },
        { hex: '#0000ff', count: 3, usedAs: ['background-color'], severities: ['non-tailwind'] },
      ],
    }));
    expect(result.tokens).toHaveLength(2);
    expect(result.tokens[0]!.value).toBe('#ff0000');
    expect(result.tokens[0]!.replacesCount).toBe(5);
    expect(result.tokens[1]!.value).toBe('#0000ff');
  });

  it('sorts tokens by usage count descending', () => {
    const result = generateTokenMap(makeStats({
      topColors: [
        { hex: '#aaaaaa', count: 2, usedAs: ['color'], severities: [] },
        { hex: '#bbbbbb', count: 10, usedAs: ['color'], severities: [] },
      ],
    }));
    expect(result.tokens[0]!.value).toBe('#bbbbbb');
    expect(result.tokens[1]!.value).toBe('#aaaaaa');
  });

  it('merges near-duplicate colors via union-find', () => {
    const result = generateTokenMap(makeStats({
      topColors: [
        { hex: '#ff0000', count: 5, usedAs: ['color'], severities: [] },
        { hex: '#fe0101', count: 2, usedAs: ['color'], severities: [] },
      ],
      nearDuplicates: [{ a: '#ff0000', b: '#fe0101', distance: 1.5 }],
    }));
    expect(result.tokens).toHaveLength(1);
    expect(result.tokens[0]!.value).toBe('#ff0000');
    expect(result.tokens[0]!.merged).toEqual(['#fe0101']);
    expect(result.tokens[0]!.replacesCount).toBe(7);
  });

  it('keeps the more-used color as canonical in merges', () => {
    const result = generateTokenMap(makeStats({
      topColors: [
        { hex: '#aaa000', count: 1, usedAs: ['border-color'], severities: [] },
        { hex: '#aab000', count: 8, usedAs: ['border-color'], severities: [] },
      ],
      nearDuplicates: [{ a: '#aaa000', b: '#aab000', distance: 3.0 }],
    }));
    expect(result.tokens[0]!.value).toBe('#aab000');
    expect(result.tokens[0]!.merged).toEqual(['#aaa000']);
  });

  it('classifies token names by usage context', () => {
    const result = generateTokenMap(makeStats({
      topColors: [
        { hex: '#ffffff', count: 1, usedAs: ['background-color'], severities: [] },
        { hex: '#000000', count: 1, usedAs: ['border-color'], severities: [] },
        { hex: '#333333', count: 1, usedAs: ['color'], severities: [] },
      ],
    }));
    const names = result.tokens.map((t) => t.name);
    // #ffffff lightness=1.0 → lightest, #000000 → darkest, #333333 lightness=0.2 → darkest
    expect(names).toContain('bg-lightest');
    expect(names).toContain('border-darkest');
    expect(names).toContain('text-darkest');
  });

  it('generates valid CSS variables output', () => {
    const result = generateTokenMap(makeStats({
      topColors: [
        { hex: '#ff0000', count: 3, usedAs: ['color'], severities: [] },
      ],
    }));
    expect(result.cssVariables).toContain(':root {');
    // #ff0000 lightness=0.299 → dark
    expect(result.cssVariables).toContain('--text-dark: #ff0000');
    expect(result.cssVariables).toContain('}');
  });

  it('generates tailwind config with var() references', () => {
    const result = generateTokenMap(makeStats({
      topColors: [
        { hex: '#ff0000', count: 3, usedAs: ['color'], severities: [] },
      ],
    }));
    expect(result.tailwindConfig).toContain('var(--text-dark)');
    expect(result.tailwindConfig).toContain('tailwind.config.ts');
  });

  it('generates valid JSON token output', () => {
    const result = generateTokenMap(makeStats({
      topColors: [
        { hex: '#ff0000', count: 3, usedAs: ['color'], severities: [] },
      ],
    }));
    const parsed = JSON.parse(result.tokenJson);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe('text-dark');
    expect(parsed[0].value).toBe('#ff0000');
  });

  it('adds merge comments in CSS variables output', () => {
    const result = generateTokenMap(makeStats({
      topColors: [
        { hex: '#ff0000', count: 5, usedAs: ['color'], severities: [] },
        { hex: '#fe0101', count: 2, usedAs: ['color'], severities: [] },
      ],
      nearDuplicates: [{ a: '#ff0000', b: '#fe0101', distance: 1.5 }],
    }));
    expect(result.cssVariables).toContain('/* replaces #fe0101 */');
  });

  it('handles transitive near-duplicate chains', () => {
    const result = generateTokenMap(makeStats({
      topColors: [
        { hex: '#ff0000', count: 5, usedAs: ['color'], severities: [] },
        { hex: '#fe0101', count: 2, usedAs: ['color'], severities: [] },
        { hex: '#fd0202', count: 1, usedAs: ['color'], severities: [] },
      ],
      nearDuplicates: [
        { a: '#ff0000', b: '#fe0101', distance: 1.5 },
        { a: '#fe0101', b: '#fd0202', distance: 1.2 },
      ],
    }));
    expect(result.tokens).toHaveLength(1);
    expect(result.tokens[0]!.value).toBe('#ff0000');
    expect(result.tokens[0]!.merged).toHaveLength(2);
    expect(result.tokens[0]!.replacesCount).toBe(8);
  });
});
