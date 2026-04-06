/** CSS properties we extract from each component's computed styles */
export const STYLE_PROPERTIES = [
  'color',
  'background-color',
  'background-image',
  'font-family',
  'font-size',
  'font-weight',
  'line-height',
  'letter-spacing',
  'border-color',
  'border-width',
  'border-style',
  'border-radius',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'width',
  'height',
  'box-shadow',
  'opacity',
  'display',
] as const;

/** Fiber tags to skip (React internals, not visual components) */
export const SKIP_FIBER_TAGS = new Set([
  3, // HostRoot
  4, // HostPortal
  6, // HostText
  7, // Fragment
  8, // Mode (StrictMode)
  9, // ContextConsumer
  10, // ContextProvider
  12, // Profiler
  13, // SuspenseComponent
]);

/** Component names to skip (wrappers, not visual) */
export const SKIP_COMPONENT_NAMES = new Set([
  'Fragment',
  'Suspense',
  'StrictMode',
  'Profiler',
  'Provider',
  'Consumer',
  'Context',
  'ErrorBoundary',
  'Hydrate',
  // React Router internals
  'Router',
  'Routes',
  'Route',
  'Outlet',
  // Next.js internals
  'Head',
  'AppRouterContext',
  'PathnameContext',
  'LayoutRouter',
  'RenderFromTemplateContext',
]);

/** Minimum element dimensions to consider (skip tiny/invisible elements) */
export const MIN_ELEMENT_SIZE = 10;

/** Default similarity thresholds */
export const SIMILARITY_THRESHOLD = 0.7;
export const EXACT_MATCH_THRESHOLD = 0.95;
export const STRONG_MATCH_THRESHOLD = 0.85;

/** Style weight vs structure weight in similarity scoring */
export const STYLE_WEIGHT = 0.55;
export const STRUCTURE_WEIGHT = 0.45;

/** Default crawler config */
export const DEFAULT_CRAWL_CONFIG = {
  maxPages: 100,
  delayMs: 1000,
  excludePatterns: ['/auth/*', '/api/*', '/login', '/logout', '/sentry-tunnel'],
  maxSamplesPerPattern: 2,
} as const;

/** Max depth for DOM structure serialization */
export const MAX_DOM_DEPTH = 3;

/** Database name and version */
export const DB_NAME = 'react-xray';
export const DB_VERSION = 2;
