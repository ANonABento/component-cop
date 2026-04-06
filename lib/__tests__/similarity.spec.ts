import { describe, expect, it } from 'vitest';
import { computeSimilarity, structureSimilarity, styleSimilarity } from '../../shared/similarity';

describe('styleSimilarity', () => {
  it('returns 1 for identical category arrays', () => {
    const a = ['blue', 'white', 'sans', 'md', '400', 'flex'];
    expect(styleSimilarity(a, a)).toBe(1);
  });

  it('returns 0 for completely different arrays', () => {
    const a = ['blue', 'white', 'sans'];
    const b = ['red', 'black', 'mono'];
    expect(styleSimilarity(a, b)).toBe(0);
  });

  it('returns fraction for partial matches', () => {
    const a = ['blue', 'white', 'sans', 'md'];
    const b = ['blue', 'black', 'sans', 'lg'];
    expect(styleSimilarity(a, b)).toBe(0.5); // 2/4 match
  });

  it('handles empty arrays', () => {
    expect(styleSimilarity([], [])).toBe(0);
    expect(styleSimilarity(['a'], [])).toBe(0);
  });
});

describe('structureSimilarity', () => {
  it('returns 1 for matching hashes', () => {
    expect(structureSimilarity('abc123', 'abc123')).toBe(1);
  });

  it('returns 0.5 for same component name', () => {
    expect(structureSimilarity('abc', 'def', 'Button', 'Button')).toBe(0.5);
  });

  it('returns 0 for different everything', () => {
    expect(structureSimilarity('abc', 'def', 'Button', 'Card')).toBe(0);
  });

  it('does not match on generic names', () => {
    expect(structureSimilarity('abc', 'def', 'div', 'div')).toBe(0);
    expect(structureSimilarity('abc', 'def', 'Anonymous', 'Anonymous')).toBe(0);
  });
});

describe('computeSimilarity', () => {
  it('weights style at 55% and structure at 45%', () => {
    // Perfect style match, no structure match
    const cats = ['blue', 'white', 'sans'];
    const result = computeSimilarity(cats, 'hash-a', cats, 'hash-b');
    expect(result.styleScore).toBe(1);
    expect(result.structureScore).toBe(0);
    expect(result.score).toBeCloseTo(0.55, 2);
  });

  it('produces 1.0 for identical components', () => {
    const cats = ['blue', 'white'];
    const result = computeSimilarity(cats, 'same-hash', cats, 'same-hash');
    expect(result.score).toBe(1);
  });
});
