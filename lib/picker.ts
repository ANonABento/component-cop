/**
 * Picker overlay — renders a highlight box over hovered elements,
 * finds the nearest React fiber, and reports the selected component.
 *
 * Supports level navigation: after first click, scroll or arrow keys
 * to traverse up/down the fiber/DOM tree. Click again or Enter to confirm.
 */

import type { ComponentData, Fiber } from '../shared/types';
import { MIN_ELEMENT_SIZE } from '../shared/constants';
import { computeStyleFingerprint, extractComputedStyles } from './fingerprint';
import { getFiberFromElement, findHostElement } from './fiber-utils';
import { computeStructureHash } from './structure-hash';
import { generateSelector } from './selector';
import { getComponentName, sanitizeProps } from './scanner';

const OVERLAY_ID = '__react-xray-picker-overlay__';
const TOOLTIP_ID = '__react-xray-picker-tooltip__';

export type PickerCallback = (component: ComponentData) => void;
export type PickerCancelCallback = () => void;

/** A level in the fiber ancestor chain with its associated DOM element. */
interface FiberLevel {
  fiber: Fiber;
  element: HTMLElement;
  name: string;
}

/**
 * Create and manage the picker mode overlay with level navigation.
 *
 * Flow:
 * 1. Hover → highlight element under cursor
 * 2. Click → lock to that element, build ancestor chain
 * 3. Scroll/ArrowUp/ArrowDown → navigate levels (parent ↑, child ↓)
 * 4. Click or Enter → confirm selection
 * 5. Esc → if locked, unlock back to hover; if hovering, cancel picker
 */
export class Picker {
  private overlay: HTMLDivElement | null = null;
  private tooltip: HTMLDivElement | null = null;
  private active = false;
  private onPick: PickerCallback | null = null;
  private onCancel: PickerCancelCallback | null = null;
  private currentElement: HTMLElement | null = null;

  // Level navigation state
  private locked = false;
  private levels: FiberLevel[] = [];
  private levelIndex = 0;

  // Bound handlers for cleanup
  private handleMouseMove = this._onMouseMove.bind(this);
  private handleClick = this._onClick.bind(this);
  private handleKeyDown = this._onKeyDown.bind(this);
  private handleWheel = this._onWheel.bind(this);

  enter(onPick: PickerCallback, onCancel?: PickerCancelCallback): void {
    if (this.active) return;
    this.active = true;
    this.onPick = onPick;
    this.onCancel = onCancel ?? null;

    this.createOverlay();
    this.createTooltip();

    document.addEventListener('mousemove', this.handleMouseMove, true);
    document.addEventListener('click', this.handleClick, true);
    document.addEventListener('keydown', this.handleKeyDown, true);
    document.addEventListener('wheel', this.handleWheel, { capture: true, passive: false });
  }

  exit(): void {
    if (!this.active) return;
    this.active = false;
    this.onPick = null;
    this.onCancel = null;
    this.currentElement = null;
    this.locked = false;
    this.levels = [];
    this.levelIndex = 0;

    document.removeEventListener('mousemove', this.handleMouseMove, true);
    document.removeEventListener('click', this.handleClick, true);
    document.removeEventListener('keydown', this.handleKeyDown, true);
    document.removeEventListener('wheel', this.handleWheel, { capture: true } as EventListenerOptions);

    this.removeOverlay();
    this.removeTooltip();
  }

  private unlock(): void {
    this.locked = false;
    this.levels = [];
    this.levelIndex = 0;
    // Switch overlay back to blue (hover mode)
    if (this.overlay) {
      this.overlay.style.border = '2px solid #3b82f6';
      this.overlay.style.background = 'rgba(59, 130, 246, 0.1)';
    }
  }

  private createOverlay(): void {
    if (document.getElementById(OVERLAY_ID)) return;
    const el = document.createElement('div');
    el.id = OVERLAY_ID;
    Object.assign(el.style, {
      position: 'fixed',
      pointerEvents: 'none',
      zIndex: '2147483647',
      border: '2px solid #3b82f6',
      background: 'rgba(59, 130, 246, 0.1)',
      borderRadius: '3px',
      transition: 'all 0.05s ease-out',
      display: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(el);
    this.overlay = el;
  }

  private createTooltip(): void {
    if (document.getElementById(TOOLTIP_ID)) return;
    const el = document.createElement('div');
    el.id = TOOLTIP_ID;
    Object.assign(el.style, {
      position: 'fixed',
      pointerEvents: 'none',
      zIndex: '2147483647',
      background: '#1e1e2e',
      color: '#cdd6f4',
      padding: '4px 8px',
      borderRadius: '4px',
      fontSize: '11px',
      fontFamily: 'monospace',
      whiteSpace: 'nowrap',
      boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      display: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(el);
    this.tooltip = el;
  }

  private removeOverlay(): void {
    document.getElementById(OVERLAY_ID)?.remove();
    this.overlay = null;
  }

  private removeTooltip(): void {
    document.getElementById(TOOLTIP_ID)?.remove();
    this.tooltip = null;
  }

  private _onMouseMove(e: MouseEvent): void {
    // Ignore mouse movement when locked (navigating levels)
    if (this.locked) return;

    const target = document.elementFromPoint(e.clientX, e.clientY);
    if (!target || !(target instanceof HTMLElement)) return;
    if (target.id === OVERLAY_ID || target.id === TOOLTIP_ID) return;

    this.currentElement = target;
    this.updateHighlight(target);
  }

  private _onClick(e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    if (this.locked) {
      // Second click → confirm selection at current level
      this.confirmSelection();
      return;
    }

    // First click → lock and build level chain
    if (!this.currentElement) {
      const cancel = this.onCancel;
      this.exit();
      cancel?.();
      return;
    }

    this.lockToElement(this.currentElement);
  }

  private _onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      if (this.locked) {
        // Esc while locked → back to hover mode
        this.unlock();
        return;
      }
      // Esc while hovering → cancel picker
      const cancel = this.onCancel;
      this.exit();
      cancel?.();
      return;
    }

    if (!this.locked) return;

    if (e.key === 'Enter') {
      e.preventDefault();
      this.confirmSelection();
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.navigateLevel(1); // toward parent (higher index in levels array)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.navigateLevel(-1); // toward child (lower index in levels array)
    }
  }

  private _onWheel(e: WheelEvent): void {
    if (!this.locked) return;
    e.preventDefault();
    e.stopPropagation();
    // Scroll up → parent (lower index), scroll down → child (higher index)
    const direction = e.deltaY > 0 ? -1 : 1;
    this.navigateLevel(direction);
  }

  /** Lock onto an element and build the ancestor fiber chain. */
  private lockToElement(element: HTMLElement): void {
    this.locked = true;
    this.levels = buildFiberLevels(element);
    // Start at the deepest level (the clicked element itself, index 0)
    this.levelIndex = 0;

    // Switch overlay to purple to indicate locked mode
    if (this.overlay) {
      this.overlay.style.border = '2px solid #8b5cf6';
      this.overlay.style.background = 'rgba(139, 92, 246, 0.1)';
    }

    this.updateLevelHighlight();
  }

  /** Move up or down in the level chain. */
  private navigateLevel(delta: number): void {
    if (this.levels.length === 0) return;
    const newIndex = Math.max(0, Math.min(this.levels.length - 1, this.levelIndex + delta));
    if (newIndex === this.levelIndex) return;
    this.levelIndex = newIndex;
    this.updateLevelHighlight();
  }

  /** Update overlay and tooltip to match the current level. */
  private updateLevelHighlight(): void {
    const level = this.levels[this.levelIndex];
    if (!level) return;

    const rect = level.element.getBoundingClientRect();
    if (this.overlay) {
      Object.assign(this.overlay.style, {
        display: 'block',
        top: `${rect.top}px`,
        left: `${rect.left}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      });
    }

    if (this.tooltip) {
      const totalLevels = this.levels.length;
      const sizeText = `${Math.round(rect.width)}x${Math.round(rect.height)}`;
      // levelIndex 0 = deepest (clicked), show as depth 1; root = depth N
      this.tooltip.textContent = `<${level.name}> ${sizeText} [depth ${this.levelIndex + 1}/${totalLevels}] scroll/arrows to navigate`;
      this.tooltip.style.display = 'block';
      this.positionTooltip(rect);
    }
  }

  /** Update overlay and tooltip for hover mode. */
  private updateHighlight(target: HTMLElement): void {
    const rect = target.getBoundingClientRect();

    if (this.overlay) {
      Object.assign(this.overlay.style, {
        display: 'block',
        top: `${rect.top}px`,
        left: `${rect.left}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      });
    }

    const fiber = getFiberFromElement(target);
    const name = fiber ? getComponentName(fiber) : target.tagName.toLowerCase();

    if (this.tooltip) {
      this.tooltip.textContent = `<${name}> ${Math.round(rect.width)}x${Math.round(rect.height)}`;
      this.tooltip.style.display = 'block';
      this.positionTooltip(rect);
    }
  }

  private positionTooltip(rect: DOMRect): void {
    if (!this.tooltip) return;
    const tooltipY = rect.top > 30 ? rect.top - 24 : rect.bottom + 4;
    const tooltipWidth = this.tooltip.offsetWidth;
    const maxLeft = window.innerWidth - tooltipWidth - 4;
    const clampedLeft = Math.max(4, Math.min(rect.left, maxLeft));
    this.tooltip.style.top = `${tooltipY}px`;
    this.tooltip.style.left = `${clampedLeft}px`;
  }

  /** Confirm selection at the current level and fire callback. */
  private confirmSelection(): void {
    const level = this.levels[this.levelIndex];
    if (!level || !this.onPick) {
      const cancel = this.onCancel;
      this.exit();
      cancel?.();
      return;
    }

    const component = buildComponentDataFromFiber(level.fiber, level.element);
    if (component) {
      this.onPick(component);
    }
    this.exit();
  }
}

// ─── Fiber Utilities ───

/**
 * Build an ordered array of fiber levels from the clicked element up to the root.
 * Index 0 = deepest (clicked element), last = highest ancestor component.
 * Each level has the fiber, its associated DOM element, and display name.
 */
function buildFiberLevels(element: HTMLElement): FiberLevel[] {
  const levels: FiberLevel[] = [];
  const seen = new Set<Fiber>();

  // Start with the host fiber for the clicked element
  const hostFiber = getFiberFromElement(element);

  // Always include the clicked DOM element itself as level 0
  levels.push({
    fiber: hostFiber ?? createSyntheticFiber(element),
    element,
    name: hostFiber ? getComponentName(hostFiber) : element.tagName.toLowerCase(),
  });

  if (hostFiber) {
    seen.add(hostFiber);
  }

  // Walk up the fiber tree to build ancestor levels
  let current = hostFiber?.return ?? null;
  while (current) {
    if (seen.has(current)) break;
    seen.add(current);

    const name = getComponentName(current);
    // Find the DOM element for this fiber
    const hostEl = findHostElement(current);

    if (hostEl && isPickableFiber(current) && name !== 'Anonymous') {
      levels.push({ fiber: current, element: hostEl, name });
    }

    current = current.return;
  }

  return levels;
}

/** Check if a fiber should appear as a navigable level (components + host elements). */
function isPickableFiber(fiber: Fiber): boolean {
  return (
    fiber.tag === 0 ||  // FunctionComponent
    fiber.tag === 1 ||  // ClassComponent
    fiber.tag === 5 ||  // HostComponent (div, span, table, etc.)
    fiber.tag === 11 || // ForwardRef
    fiber.tag === 14 || // MemoComponent
    fiber.tag === 15    // SimpleMemoComponent
  );
}

/** Create a minimal synthetic fiber for DOM elements without a real fiber. */
function createSyntheticFiber(element: HTMLElement): Fiber {
  return {
    tag: 5,
    type: element.tagName.toLowerCase(),
    key: null,
    child: null,
    sibling: null,
    return: null,
    stateNode: element,
    memoizedProps: null,
    _debugSource: null,
  };
}

/**
 * Build ComponentData from a specific fiber + element (used by level navigation).
 */
function buildComponentDataFromFiber(fiber: Fiber, element: HTMLElement): ComponentData | null {
  const rect = element.getBoundingClientRect();
  if (rect.width < MIN_ELEMENT_SIZE || rect.height < MIN_ELEMENT_SIZE) return null;

  const componentName = getComponentName(fiber);
  const computed = getComputedStyle(element);
  const computedStyles = extractComputedStyles(element, computed);
  const { fingerprint, categories } = computeStyleFingerprint(computedStyles);
  const structureHash = computeStructureHash(componentName, element);

  return {
    componentName,
    sourceFile: fiber._debugSource?.fileName ?? null,
    sourceLine: fiber._debugSource?.lineNumber ?? null,
    domSelector: generateSelector(element),
    pagePath: location.pathname,
    pageTitle: document.title,
    pageUrl: location.href,
    styleFingerprint: fingerprint,
    styleCategories: categories,
    structureHash,
    visualHash: null,
    computedStyles,
    domStructure: serializeRich(element),
    props: sanitizeProps(fiber.memoizedProps),
    boundingRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    scanTimestamp: Date.now(),
    scanSessionId: `pick-${Date.now()}`,
  };
}

// ─── Rich DOM Serialization (picker-specific) ───

const MAX_RICH_DEPTH = 8;
const MAX_CHILDREN_SHOWN = 5;
const MAX_TEXT_LENGTH = 60;

/** Attributes worth capturing for LLM analysis. */
const USEFUL_ATTRS = ['class', 'role', 'type', 'href', 'aria-label', 'data-testid', 'name', 'placeholder'];

/**
 * Serialize a DOM subtree into a human/LLM-readable indented tree.
 * Captures tag + key attributes + text content + child structure.
 *
 * Example output:
 *   table.data-table[role="grid"]
 *     thead
 *       tr
 *         th "Name"
 *         th "Email"
 *         th "Status"
 *     tbody
 *       tr
 *         td "John Doe"
 *         td "john@example.com"
 *         td.badge "Active"
 *       ... +47 more tr
 */
function serializeRich(el: HTMLElement, depth = 0): string {
  if (depth >= MAX_RICH_DEPTH) return `${'  '.repeat(depth)}...`;

  const indent = '  '.repeat(depth);
  const tag = el.tagName.toLowerCase();

  // Build attribute annotations
  const attrs: string[] = [];
  for (const attr of USEFUL_ATTRS) {
    const val = el.getAttribute(attr);
    if (val) {
      if (attr === 'class') {
        // Show first 3 class names as .className notation
        const classes = val.trim().split(/\s+/).slice(0, 3);
        attrs.push(classes.map((c) => `.${c}`).join(''));
      } else {
        attrs.push(`[${attr}="${truncate(val, 30)}"]`);
      }
    }
  }
  const attrStr = attrs.join('');

  // Capture text content for leaf-like elements
  const textContent = getDirectText(el);
  const textStr = textContent ? ` "${truncate(textContent, MAX_TEXT_LENGTH)}"` : '';

  const header = `${indent}${tag}${attrStr}${textStr}`;

  const children = Array.from(el.children) as HTMLElement[];
  if (children.length === 0) return header;

  const lines = [header];

  // Show up to MAX_CHILDREN_SHOWN, then summarize the rest
  const shown = children.slice(0, MAX_CHILDREN_SHOWN);
  const remaining = children.length - shown.length;

  for (const child of shown) {
    lines.push(serializeRich(child, depth + 1));
  }

  if (remaining > 0) {
    // Summarize: what kind of elements are the remaining ones
    const remainingTag = children[MAX_CHILDREN_SHOWN]?.tagName.toLowerCase() ?? 'element';
    lines.push(`${'  '.repeat(depth + 1)}... +${remaining} more ${remainingTag}`);
  }

  return lines.join('\n');
}

/** Get direct text content of an element (not children's text). */
function getDirectText(el: HTMLElement): string {
  let text = '';
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += (node.textContent ?? '').trim();
    }
  }
  return text;
}

function truncate(str: string, max: number): string {
  return str.length > max ? `${str.slice(0, max)}...` : str;
}
