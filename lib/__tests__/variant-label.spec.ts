import { describe, expect, it } from 'vitest';
import { variantLabel } from '../../shared/variant-label';

describe('variantLabel', () => {
  it('produces A-Z for 0-25', () => {
    expect(variantLabel(0)).toBe('A');
    expect(variantLabel(25)).toBe('Z');
  });

  it('produces AA for 26', () => {
    expect(variantLabel(26)).toBe('AA');
  });

  it('produces AB for 27', () => {
    expect(variantLabel(27)).toBe('AB');
  });

  it('produces AZ for 51', () => {
    expect(variantLabel(51)).toBe('AZ');
  });

  it('produces BA for 52', () => {
    expect(variantLabel(52)).toBe('BA');
  });
});
