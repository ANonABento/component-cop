/** Minimal Fiber type for the properties we access */
export interface Fiber {
  tag: number;
  type: FiberType;
  key: string | null;
  child: Fiber | null;
  sibling: Fiber | null;
  return: Fiber | null;
  stateNode: Element | null;
  memoizedProps: Record<string, unknown> | null;
  _debugSource?: {
    fileName: string;
    lineNumber: number;
    columnNumber?: number;
  } | null;
}

export type FiberType =
  | string // HostComponent tag name
  | FiberFunctionType
  | null;

export interface FiberFunctionType {
  name?: string;
  displayName?: string;
  $$typeof?: symbol;
  render?: FiberFunctionType;
  type?: FiberFunctionType;
}

export interface FiberRoot {
  current: Fiber;
}

export interface ReactDevToolsHook {
  renderers: Map<number, { version?: string }>;
  _fiberRoots?: Set<Set<FiberRoot>>;
  getFiberRoots?: (rendererId: number) => Set<FiberRoot>;
  onCommitFiberRoot?: (...args: unknown[]) => void;
}

export interface DOMRectJSON {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ComponentData {
  componentName: string;
  sourceFile: string | null;
  sourceLine: number | null;
  domSelector: string;
  pagePath: string;
  pageTitle: string;
  pageUrl: string;
  styleFingerprint: string;
  styleCategories: string[];
  structureHash: string;
  visualHash: string | null;
  computedStyles: Record<string, string>;
  domStructure: string;
  props: Record<string, unknown>;
  boundingRect: DOMRectJSON;
  scanTimestamp: number;
  scanSessionId: string;
}

export interface StoredComponent extends ComponentData {
  id: number;
}

export interface StoredPage {
  pagePath: string;
  pageTitle: string;
  pageUrl: string;
  componentCount: number;
  scanTimestamp: number;
  links: string[];
  colorSummary: ColorSummary | null;
}

export interface StoredPattern {
  patternId: string;
  name: string;
  variants: PatternVariant[];
  totalInstances: number;
  computedAt: number;
}

export interface PatternVariant {
  variantId: string;
  label: string;
  componentIds: number[];
  exemplarComponentId: number;
}

export interface HardcodedColor {
  property: string;
  value: string;
  hexValue: string;
  element: string;
  componentName: string | null;
  severity: 'inline' | 'non-tailwind' | 'tw-arbitrary';
}

export interface ColorSummary {
  uniqueColors: number;
  totalUsages: number;
  byProperty: Record<string, number>;
  topColors: { hex: string; count: number; usedAs: string[]; severities: HardcodedColor['severity'][] }[];
  nearDuplicates: { a: string; b: string; distance: number }[];
}

export interface ScanResult {
  pagePath: string;
  pageTitle: string;
  pageUrl: string;
  components: ComponentData[];
  links: string[];
  reactInfo: ReactDetectionResult;
  hardcodedColors: HardcodedColor[];
}

export interface ReactDetectionResult {
  found: boolean;
  version: string | null;
  mode: 'dev' | 'prod' | null;
}

export interface SimilarityMatch {
  component: StoredComponent;
  score: number;
  styleScore: number;
  structureScore: number;
}

export interface CrawlConfig {
  maxPages: number;
  delayMs: number;
  excludePatterns: string[];
  maxSamplesPerPattern: number;
}

export type CrawlStatus = 'idle' | 'crawling' | 'paused' | 'done' | 'error';

export interface CrawlProgress {
  status: CrawlStatus;
  scannedCount: number;
  totalDiscovered: number;
  currentPath: string | null;
  errors: string[];
}

export interface DismissedPattern {
  patternId: string;
  reason: string;
  dismissedAt: number;
}
