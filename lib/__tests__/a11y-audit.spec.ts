import { describe, expect, it } from 'vitest';
import { auditA11y } from '../a11y-audit';
import type { StoredComponent } from '../../shared/types';

function makeComp(id: number, name: string, overrides: Partial<StoredComponent> = {}): StoredComponent {
  return {
    id, componentName: name, pagePath: '/test', styleFingerprint: 'fp', structureHash: 'sh',
    styleCategories: [], computedStyles: {}, domStructure: '', props: {},
    boundingRect: { x: 0, y: 0, width: 100, height: 50 },
    sourceFile: null, sourceLine: null, sourceColumn: null, domSelector: 'div',
    pageTitle: 'Test', pageUrl: 'https://example.test/test', visualHash: null,
    scanTimestamp: 1, scanSessionId: 'test',
    ...overrides,
  };
}

describe('auditA11y', () => {
  it('flags image without alt', () => {
    const result = auditA11y([makeComp(1, 'img')]);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]!.type).toBe('missing-alt');
    expect(result.errorCount).toBe(1);
  });

  it('does not flag image with alt', () => {
    const result = auditA11y([makeComp(1, 'Avatar', { props: { alt: 'User avatar' } })]);
    expect(result.issues.filter((i) => i.type === 'missing-alt')).toHaveLength(0);
  });

  it('flags input without label', () => {
    const result = auditA11y([makeComp(1, 'Input')]);
    expect(result.issues.some((i) => i.type === 'missing-label')).toBe(true);
  });

  it('does not flag input with aria-label', () => {
    const result = auditA11y([makeComp(1, 'TextField', { props: { 'aria-label': 'Email' } })]);
    expect(result.issues.filter((i) => i.type === 'missing-label')).toHaveLength(0);
  });

  it('flags button without accessible text', () => {
    const result = auditA11y([makeComp(1, 'IconButton')]);
    expect(result.issues.some((i) => i.type === 'missing-button-text')).toBe(true);
  });

  it('does not flag button with aria-label', () => {
    const result = auditA11y([makeComp(1, 'Button', { props: { 'aria-label': 'Close' } })]);
    expect(result.issues.filter((i) => i.type === 'missing-button-text')).toHaveLength(0);
  });

  it('flags low contrast ratio', () => {
    const result = auditA11y([makeComp(1, 'Text', {
      computedStyles: {
        color: 'rgb(150, 150, 150)',
        'background-color': 'rgb(200, 200, 200)',
      },
    })]);
    expect(result.issues.some((i) => i.type === 'low-contrast')).toBe(true);
  });

  it('does not flag sufficient contrast', () => {
    const result = auditA11y([makeComp(1, 'Text', {
      computedStyles: {
        color: 'rgb(0, 0, 0)',
        'background-color': 'rgb(255, 255, 255)',
      },
    })]);
    expect(result.issues.filter((i) => i.type === 'low-contrast')).toHaveLength(0);
  });

  it('uses large text threshold for big fonts', () => {
    const result = auditA11y([makeComp(1, 'Heading', {
      computedStyles: {
        color: 'rgb(160, 160, 160)',
        'background-color': 'rgb(200, 200, 200)',
        'font-size': '24px',
        'font-weight': '400',
      },
    })]);
    // Ratio ~1.6:1 — below 3:1 large text threshold
    expect(result.issues.some((i) => i.type === 'low-contrast')).toBe(true);
  });

  it('flags small touch targets on buttons', () => {
    const result = auditA11y([makeComp(1, 'Button', {
      props: { 'aria-label': 'X' },
      boundingRect: { x: 0, y: 0, width: 20, height: 20 },
    })]);
    expect(result.issues.some((i) => i.type === 'small-touch-target')).toBe(true);
    expect(result.infoCount).toBe(1);
  });

  it('groups issues by type', () => {
    const result = auditA11y([
      makeComp(1, 'img'),
      makeComp(2, 'Image'),
    ]);
    expect(result.byType.find((t) => t.type === 'missing-alt')!.count).toBe(2);
  });

  it('returns empty for clean components', () => {
    const result = auditA11y([makeComp(1, 'Card')]);
    expect(result.issues).toHaveLength(0);
  });
});
