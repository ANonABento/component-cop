import { describe, expect, it } from 'vitest';
import { auditComplexity, scoreComplexity } from '../complexity-score';
import type { StoredComponent } from '../../shared/types';

function makeComponent(overrides: Partial<StoredComponent> = {}): StoredComponent {
  return {
    id: 1,
    componentName: 'TestComponent',
    pagePath: '/test',
    styleFingerprint: 'fp',
    structureHash: 'sh',
    styleCategories: [],
    computedStyles: {},
    domStructure: '',
    props: {},
    boundingRect: { x: 0, y: 0, width: 100, height: 100 },
    sourceFile: null,
    sourceLine: null,
    sourceColumn: null,
    domSelector: 'div',
    pageTitle: 'Test',
    pageUrl: 'https://example.test/test',
    visualHash: null,
    scanTimestamp: 1,
    scanSessionId: 'test',
    ...overrides,
  };
}

describe('scoreComplexity', () => {
  it('returns 0 for minimal component', () => {
    const result = scoreComplexity(makeComponent({
      domStructure: '',
      props: {},
      boundingRect: { x: 0, y: 0, width: 0, height: 0 },
    }));
    expect(result.score).toBe(0);
  });

  it('scores DOM depth', () => {
    // depth 6 out of 12 max = 50% for depth factor
    const result = scoreComplexity(makeComponent({
      domStructure: '((((((a))))))',
      props: {},
      boundingRect: { x: 0, y: 0, width: 0, height: 0 },
    }));
    expect(result.breakdown.depth).toBe(50);
  });

  it('scores children count', () => {
    // 15 direct children out of 30 max = 50%
    const structure = '(a)'.repeat(15);
    const result = scoreComplexity(makeComponent({
      domStructure: structure,
      props: {},
      boundingRect: { x: 0, y: 0, width: 0, height: 0 },
    }));
    expect(result.breakdown.children).toBe(50);
  });

  it('scores prop count', () => {
    const props: Record<string, unknown> = {};
    for (let i = 0; i < 10; i++) props[`prop${i}`] = 'value';
    const result = scoreComplexity(makeComponent({
      domStructure: '',
      props,
      boundingRect: { x: 0, y: 0, width: 0, height: 0 },
    }));
    // 10/20 = 50%
    expect(result.breakdown.props).toBe(50);
  });

  it('scores area', () => {
    const result = scoreComplexity(makeComponent({
      domStructure: '',
      props: {},
      boundingRect: { x: 0, y: 0, width: 500, height: 500 },
    }));
    // 250000/500000 = 50%
    expect(result.breakdown.area).toBe(50);
  });

  it('caps at 100 for extreme values', () => {
    const props: Record<string, unknown> = {};
    for (let i = 0; i < 50; i++) props[`p${i}`] = 'v';
    const result = scoreComplexity(makeComponent({
      domStructure: '(' + '('.repeat(20) + 'a' + ')'.repeat(20) + ')' + '(b)'.repeat(60),
      props,
      boundingRect: { x: 0, y: 0, width: 1000, height: 1000 },
    }));
    expect(result.score).toBe(100);
  });

  it('handles null domStructure and boundingRect gracefully', () => {
    const result = scoreComplexity(makeComponent({
      domStructure: undefined as unknown as string,
      boundingRect: undefined,
      props: {},
    }));
    expect(result.score).toBe(0);
  });
});

describe('auditComplexity', () => {
  it('returns sorted results and computes stats', () => {
    const components = [
      makeComponent({ id: 1, domStructure: '(a)', props: { a: 1 }, boundingRect: { x: 0, y: 0, width: 50, height: 50 } }),
      makeComponent({ id: 2, domStructure: '((((((((((((a))))))))))))', props: {}, boundingRect: { x: 0, y: 0, width: 1000, height: 1000 } }),
    ];
    const audit = auditComplexity(components);
    expect(audit.results[0]!.componentId).toBe(2);
    expect(audit.results[1]!.componentId).toBe(1);
    expect(audit.average).toBeGreaterThan(0);
    expect(audit.median).toBeGreaterThan(0);
  });

  it('identifies outliers above threshold', () => {
    const simple = makeComponent({ id: 1, domStructure: '', props: {}, boundingRect: { x: 0, y: 0, width: 0, height: 0 } });
    const complex = makeComponent({
      id: 2,
      domStructure: '(' + '('.repeat(12) + 'x' + ')'.repeat(12) + ')' + '(c)'.repeat(30),
      props: Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`p${i}`, i])),
      boundingRect: { x: 0, y: 0, width: 800, height: 800 },
    });
    const audit = auditComplexity([simple, complex], 80);
    expect(audit.outliers.length).toBe(1);
    expect(audit.outliers[0]!.componentId).toBe(2);
  });
});
