import { DEFAULT_CRAWL_CONFIG, MIN_ELEMENT_SIZE, SKIP_COMPONENT_NAMES, SKIP_FIBER_TAGS } from '../shared/constants';
import { isExcluded } from '../shared/url-utils';
import type { ScanOptions } from '../shared/messages';
import type {
  ComponentData,
  Fiber,
  FiberFunctionType,
  FiberRoot,
  HardcodedColor,
  ReactDetectionResult,
  ReactDevToolsHook,
  ScanResult,
} from '../shared/types';
import { buildCSSVarCache, detectHardcodedColors } from './color-detection';
import { computeStyleFingerprint, extractComputedStyles } from './fingerprint';
import { getFiberFromElement, findHostElement } from './fiber-utils';
import { generateSelector } from './selector';
import { computeStructureHash } from './structure-hash';

declare global {
  interface Window {
    __REACT_DEVTOOLS_GLOBAL_HOOK__?: ReactDevToolsHook;
  }
}

/** Common root container IDs used by React frameworks */
const ROOT_SELECTORS = ['#root', '#__next', '#app', '#__nuxt', '[data-reactroot]'];

/**
 * Detect React on the current page, version, and dev/prod mode.
 * Works with or without React DevTools installed.
 */
export function detectReact(): ReactDetectionResult {
  // Strategy 1: DevTools hook (most reliable when available)
  const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
  if (hook) {
    // Check renderers (may be populated even if empty initially)
    let version: string | null = null;
    if (hook.renderers.size > 0) {
      const renderer = hook.renderers.values().next().value;
      version = renderer?.version ?? null;
    }

    // Try finding roots via hook — even if renderers is empty, roots may exist
    const roots = findFiberRoots();
    if (roots.length > 0) {
      let hasDebugSource = false;
      walkFiberTree(roots[0]!.current, (fiber) => {
        if (fiber._debugSource) {
          hasDebugSource = true;
          return true;
        }
        return false;
      });
      return { found: true, version, mode: hasDebugSource ? 'dev' : 'prod' };
    }

    // Hook exists but no roots yet — still check DOM as fallback
  }

  // Strategy 2: Find fiber roots via DOM properties (no DevTools needed)
  const roots = findFiberRootsFromDOM();
  if (roots.length > 0) {
    let hasDebugSource = false;
    walkFiberTree(roots[0]!.current, (fiber) => {
      if (fiber._debugSource) {
        hasDebugSource = true;
        return true;
      }
      return false;
    });

    return { found: true, version: null, mode: hasDebugSource ? 'dev' : 'prod' };
  }

  return { found: false, version: null, mode: null };
}


/**
 * Check if a DOM element has any React internal properties (quick existence check).
 */
function hasReactInternals(element: Element): boolean {
  for (const key of Object.keys(element)) {
    if (
      key.startsWith('__reactFiber$') ||
      key.startsWith('__reactInternalInstance$') ||
      key.startsWith('__reactContainer$') ||
      key.startsWith('__reactProps$')
    ) {
      return true;
    }
  }
  // Also check legacy _reactRootContainer (ReactDOM.render)
  if ('_reactRootContainer' in element) return true;
  return false;
}

/**
 * Walk up the fiber tree from any fiber to find the FiberRoot.
 */
function findFiberRoot(fiber: Fiber): FiberRoot | null {
  let current: Fiber | null = fiber;
  while (current?.return) {
    current = current.return;
  }
  // The topmost fiber's stateNode is the FiberRoot
  if (current?.stateNode && 'current' in (current.stateNode as Record<string, unknown>)) {
    return current.stateNode as unknown as FiberRoot;
  }
  return null;
}

/**
 * Try to extract a FiberRoot from a DOM element.
 * Handles both __reactFiber$ (walk up) and _reactRootContainer (legacy).
 */
function extractFiberRoot(element: Element): FiberRoot | null {
  // React 18+ createRoot / fiber approach
  const fiber = getFiberFromElement(element);
  if (fiber) {
    return findFiberRoot(fiber);
  }

  // Legacy ReactDOM.render: _reactRootContainer
  const legacyRoot = (element as unknown as Record<string, unknown>)._reactRootContainer;
  if (legacyRoot && typeof legacyRoot === 'object' && '_internalRoot' in (legacyRoot as Record<string, unknown>)) {
    return (legacyRoot as Record<string, unknown>)._internalRoot as unknown as FiberRoot;
  }

  return null;
}

/**
 * Find React fiber roots by scanning DOM elements for React internal properties.
 */
function findFiberRootsFromDOM(): FiberRoot[] {
  const rootSet = new Set<FiberRoot>();

  // Check well-known root selectors
  for (const selector of ROOT_SELECTORS) {
    const el = document.querySelector(selector);
    if (!el) continue;

    const root = extractFiberRoot(el);
    if (root) {
      rootSet.add(root);
      continue;
    }

    // Check element's first few children
    for (const child of Array.from(el.children).slice(0, 10)) {
      const childRoot = extractFiberRoot(child);
      if (childRoot) rootSet.add(childRoot);
    }
  }

  // Fallback: check body's direct children
  if (rootSet.size === 0) {
    for (const child of document.body.children) {
      const root = extractFiberRoot(child);
      if (root) rootSet.add(root);
    }
  }

  // Last resort: breadth-first scan of first ~50 elements
  if (rootSet.size === 0) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    let count = 0;
    let node = walker.nextNode();
    while (node && count < 50) {
      if (hasReactInternals(node as Element)) {
        const root = extractFiberRoot(node as Element);
        if (root) {
          rootSet.add(root);
          break;
        }
      }
      node = walker.nextNode();
      count++;
    }
  }

  return Array.from(rootSet);
}

/**
 * Find all React fiber roots on the page.
 * Tries DevTools hook first, falls back to DOM scanning.
 */
export function findFiberRoots(): FiberRoot[] {
  const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
  if (hook) {
    const roots: FiberRoot[] = [];

    // Strategy 1a: getFiberRoots(rendererId) — official API
    if (hook.getFiberRoots && hook.renderers.size > 0) {
      for (const rendererId of hook.renderers.keys()) {
        try {
          const fiberRoots = hook.getFiberRoots(rendererId);
          if (fiberRoots) {
            fiberRoots.forEach((root) => roots.push(root));
          }
        } catch {
          // Some versions don't support this
        }
      }
      if (roots.length > 0) return roots;
    }

    // Strategy 1b: _fiberRoots (legacy/internal)
    if (hook._fiberRoots) {
      hook._fiberRoots.forEach((rootSet) => {
        rootSet.forEach((root) => roots.push(root));
      });
      if (roots.length > 0) return roots;
    }
  }

  // Strategy 2: DOM scanning
  return findFiberRootsFromDOM();
}

/**
 * Walk fiber tree iteratively (avoids stack overflow on deep trees).
 * Visitor returns true to skip children of the current fiber.
 */
export function walkFiberTree(
  root: Fiber,
  visitor: (fiber: Fiber, depth: number) => boolean | void,
): void {
  let current: Fiber | null = root;
  let depth = 0;

  while (current) {
    const skipChildren = visitor(current, depth);

    if (!skipChildren && current.child) {
      current = current.child;
      depth++;
      continue;
    }

    if (current === root) return;

    while (!current.sibling) {
      if (!current.return || current.return === root) return;
      current = current.return;
      depth--;
    }

    current = current.sibling;
  }
}

/**
 * Get component name from a fiber, with memo/forwardRef unwrapping.
 */
export function getComponentName(fiber: Fiber): string {
  const type = fiber.type;
  if (!type) return 'Anonymous';

  // Host component (HTML tag)
  if (typeof type === 'string') return type;

  const fnType = type as FiberFunctionType;

  // Direct name
  if (fnType.displayName) return fnType.displayName;
  if (fnType.name) return fnType.name;

  // React.memo / forwardRef unwrapping
  if (fnType.$$typeof) {
    const inner = fnType.render ?? fnType.type;
    if (inner?.displayName) return inner.displayName;
    if (inner?.name) return inner.name;
  }

  // Fiber tag-based fallback
  if (fiber.tag === 11) return 'ForwardRef';
  if (fiber.tag === 14 || fiber.tag === 15) return 'Memo';

  return 'Anonymous';
}

/**
 * Check if a fiber should be scanned. Returns the component name if scannable, null otherwise.
 */
function getScanName(fiber: Fiber, extraSkipNames?: Set<string>): string | null {
  if (SKIP_FIBER_TAGS.has(fiber.tag)) return null;

  const name = getComponentName(fiber);
  if (SKIP_COMPONENT_NAMES.has(name)) return null;
  if (extraSkipNames?.has(name)) return null;

  return name;
}


/**
 * Sanitize React props — circular-safe, depth-limited.
 */
export function sanitizeProps(
  props: Record<string, unknown> | null,
  maxDepth = 2,
): Record<string, unknown> {
  if (!props) return {};

  const seen = new WeakSet();

  function sanitize(value: unknown, depth: number): unknown {
    if (depth > maxDepth) return '[deep]';
    if (value === null || value === undefined) return value;
    if (typeof value === 'function') return `[fn:${(value as { name?: string }).name ?? 'anon'}]`;
    if (typeof value === 'symbol') return `[symbol:${value.description ?? ''}]`;

    if (typeof value === 'object') {
      if (value instanceof HTMLElement) return `[DOM:${value.tagName}]`;
      if (value instanceof Event) return '[Event]';

      const obj = value as Record<string, unknown>;
      if (seen.has(obj)) return '[circular]';
      seen.add(obj);

      if (Array.isArray(value)) {
        return value.length > 10
          ? `[Array(${value.length})]`
          : value.map((v) => sanitize(v, depth + 1));
      }

      // Skip React internals
      if ('$$typeof' in obj) return '[ReactElement]';
      if ('_owner' in obj) return '[ReactRef]';

      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj)) {
        if (k.startsWith('_') || k.startsWith('$$')) continue;
        result[k] = sanitize(v, depth + 1);
      }
      return result;
    }

    return value;
  }

  const { children: _children, ...rest } = props;
  return sanitize(rest, 0) as Record<string, unknown>;
}

/**
 * Scan the current page. Walks all fiber roots, extracts component data.
 */
export function scanPage(sessionId: string, options?: ScanOptions): ScanResult {
  const reactInfo = detectReact();
  const pagePath = location.pathname;
  const pageTitle = document.title;
  const pageUrl = location.href;
  const extraSkipNames = options?.skipComponents?.length
    ? new Set(options.skipComponents)
    : undefined;

  if (!reactInfo.found) {
    return {
      pagePath,
      pageTitle,
      pageUrl,
      components: [],
      links: discoverLinks(options?.excludePatterns),
      reactInfo,
      hardcodedColors: [],
    };
  }

  // Build CSS variable cache once per scan for color detection
  const cssVarCache = buildCSSVarCache();
  const hardcodedColors: HardcodedColor[] = [];
  const components: ComponentData[] = [];
  const roots = findFiberRoots();

  for (const root of roots) {
    walkFiberTree(root.current, (fiber) => {
      const componentName = getScanName(fiber, extraSkipNames);
      if (!componentName) return false;

      const element = findHostElement(fiber);
      if (!element) return false;

      // Skip tiny or invisible elements
      const rect = element.getBoundingClientRect();
      if (rect.width < MIN_ELEMENT_SIZE || rect.height < MIN_ELEMENT_SIZE) return false;

      const computed = getComputedStyle(element);
      if (
        computed.display === 'none' ||
        computed.visibility === 'hidden' ||
        computed.opacity === '0'
      ) {
        return false;
      }
      const computedStyles = extractComputedStyles(element, computed);
      const { fingerprint, categories } = computeStyleFingerprint(computedStyles);
      const structureHash = computeStructureHash(componentName, element);

      // Detect hardcoded colors on this component's element
      const colorFindings = detectHardcodedColors(element, cssVarCache);
      for (const finding of colorFindings) {
        hardcodedColors.push({ ...finding, componentName });
      }

      components.push({
        componentName,
        sourceFile: fiber._debugSource?.fileName ?? null,
        sourceLine: fiber._debugSource?.lineNumber ?? null,
        domSelector: generateSelector(element),
        pagePath,
        pageTitle,
        pageUrl,
        styleFingerprint: fingerprint,
        styleCategories: categories,
        structureHash,
        visualHash: null,
        computedStyles,
        domStructure: serializeQuick(element),
        props: sanitizeProps(fiber.memoizedProps),
        boundingRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        scanTimestamp: Date.now(),
        scanSessionId: sessionId,
      });

      return false;
    });
  }

  return {
    pagePath,
    pageTitle,
    pageUrl,
    components,
    links: discoverLinks(options?.excludePatterns),
    reactInfo,
    hardcodedColors,
  };
}

function serializeQuick(el: HTMLElement, depth = 0): string {
  if (depth >= 3) return '';
  const tag = el.tagName.toLowerCase();
  const kids = Array.from(el.children)
    .map((c) => serializeQuick(c as HTMLElement, depth + 1))
    .filter(Boolean)
    .join(',');
  return `${tag}(${kids})`;
}

/**
 * Discover same-origin navigable links on the page.
 * Uses the same exclude patterns as the crawler config (single source of truth).
 */
function discoverLinks(customExcludePatterns?: string[]): string[] {
  const links = new Set<string>();
  const anchors = document.querySelectorAll('a[href]');
  const origin = location.origin;
  const excludePatterns = customExcludePatterns ?? DEFAULT_CRAWL_CONFIG.excludePatterns;

  for (const a of anchors) {
    const href = (a as HTMLAnchorElement).href;
    if (!href.startsWith(origin)) continue;

    const url = new URL(href);
    const path = url.pathname;

    if (isExcluded(path, excludePatterns)) continue;

    links.add(path);
  }

  return Array.from(links);
}
