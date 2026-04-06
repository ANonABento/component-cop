/**
 * Component Navigator — Ctrl+F-style navigation for similar components.
 *
 * Scans the live DOM for elements matching a target fingerprint,
 * highlights them, and allows cycling through matches with prev/next.
 */

import type { Fiber } from '../shared/types';
import { MIN_ELEMENT_SIZE, SIMILARITY_THRESHOLD } from '../shared/constants';
import { computeStyleFingerprint, extractComputedStyles } from './fingerprint';
import { computeStructureHash } from './structure-hash';
import { computeSimilarity } from '../shared/similarity';
import { getComponentName, findFiberRoots, walkFiberTree } from './scanner';

const NAV_OVERLAY_ID = '__react-xray-nav-overlay__';
const NAV_DIM_CLASS = '__react-xray-nav-dimmed__';

export interface NavigatorTarget {
  componentName: string;
  styleCategories: string[];
  structureHash: string;
}

export interface NavigatorStatus {
  current: number;
  total: number;
}

export type NavigatorStatusCallback = (status: NavigatorStatus) => void;

interface MatchedElement {
  element: HTMLElement;
  score: number;
  name: string;
}

/**
 * Scans the current page for components similar to a target,
 * then allows Ctrl+F-style cycling through them.
 */
export class ComponentNavigator {
  private matches: MatchedElement[] = [];
  private currentIndex = -1;
  private active = false;
  private overlay: HTMLDivElement | null = null;
  private dimStyle: HTMLStyleElement | null = null;
  private onStatus: NavigatorStatusCallback | null = null;
  private handleKeyDown = this._onKeyDown.bind(this);

  /**
   * Start navigating: scan page for similar elements and jump to the first.
   */
  enter(target: NavigatorTarget, onStatus?: NavigatorStatusCallback): NavigatorStatus {
    this.exit();
    this.active = true;
    this.onStatus = onStatus ?? null;

    this.matches = findMatchesOnPage(target);
    this.createOverlay();
    this.injectDimStyle();

    document.addEventListener('keydown', this.handleKeyDown, true);

    if (this.matches.length > 0) {
      this.currentIndex = 0;
      this.highlightCurrent();
    }

    return this.getStatus();
  }

  next(): NavigatorStatus {
    if (!this.active || this.matches.length === 0) return this.getStatus();
    this.currentIndex = (this.currentIndex + 1) % this.matches.length;
    this.highlightCurrent();
    return this.getStatus();
  }

  prev(): NavigatorStatus {
    if (!this.active || this.matches.length === 0) return this.getStatus();
    this.currentIndex = (this.currentIndex - 1 + this.matches.length) % this.matches.length;
    this.highlightCurrent();
    return this.getStatus();
  }

  exit(): void {
    this.active = false;
    this.matches = [];
    this.currentIndex = -1;
    this.onStatus = null;

    document.removeEventListener('keydown', this.handleKeyDown, true);
    document.getElementById(NAV_OVERLAY_ID)?.remove();
    this.dimStyle?.remove();
    this.overlay = null;
    this.dimStyle = null;
  }

  getStatus(): NavigatorStatus {
    return {
      current: this.matches.length > 0 ? this.currentIndex + 1 : 0,
      total: this.matches.length,
    };
  }

  private _onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      const cb = this.onStatus;
      this.exit();
      cb?.({ current: 0, total: 0 });
      return;
    }
    // Ctrl/Cmd + G or Enter = next, Shift variant = prev
    if (e.key === 'Enter' || ((e.ctrlKey || e.metaKey) && e.key === 'g')) {
      e.preventDefault();
      const status = e.shiftKey ? this.prev() : this.next();
      this.onStatus?.(status);
    }
  }

  private createOverlay(): void {
    if (document.getElementById(NAV_OVERLAY_ID)) return;
    const el = document.createElement('div');
    el.id = NAV_OVERLAY_ID;
    Object.assign(el.style, {
      position: 'fixed',
      pointerEvents: 'none',
      zIndex: '2147483646',
      border: '3px solid #22c55e',
      background: 'rgba(34, 197, 94, 0.12)',
      borderRadius: '4px',
      transition: 'all 0.15s ease-out',
      display: 'none',
      boxShadow: '0 0 0 4px rgba(34, 197, 94, 0.2)',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(el);
    this.overlay = el;
  }

  private injectDimStyle(): void {
    if (this.dimStyle) return;
    const style = document.createElement('style');
    style.textContent = `.${NAV_DIM_CLASS} { opacity: 0.3 !important; transition: opacity 0.15s !important; }`;
    document.head.appendChild(style);
    this.dimStyle = style;
  }

  private highlightCurrent(): void {
    // Remove dim from all
    for (const match of this.matches) {
      match.element.classList.remove(NAV_DIM_CLASS);
    }

    const match = this.matches[this.currentIndex];
    if (!match || !this.overlay) return;

    // Dim non-current matches (subtle visual cue)
    for (let i = 0; i < this.matches.length; i++) {
      if (i !== this.currentIndex) {
        this.matches[i]!.element.classList.add(NAV_DIM_CLASS);
      }
    }

    // Scroll into view
    match.element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });

    // Position overlay after scroll settles
    requestAnimationFrame(() => {
      const rect = match.element.getBoundingClientRect();
      if (this.overlay) {
        Object.assign(this.overlay.style, {
          display: 'block',
          top: `${rect.top - 2}px`,
          left: `${rect.left - 2}px`,
          width: `${rect.width + 4}px`,
          height: `${rect.height + 4}px`,
        });
      }
    });
  }
}

// ─── DOM Scanning ───

/**
 * Walk the fiber tree on the current page and find elements similar to the target.
 */
function findMatchesOnPage(target: NavigatorTarget): MatchedElement[] {
  const roots = findFiberRoots();
  const matches: MatchedElement[] = [];
  const seenElements = new Set<HTMLElement>();

  for (const root of roots) {
    walkFiberTree(root.current, (fiber) => {
      const element = findVisibleHostElement(fiber);
      if (!element || seenElements.has(element)) return false;
      seenElements.add(element);

      const name = getComponentName(fiber);
      const computed = getComputedStyle(element);
      const computedStyles = extractComputedStyles(element, computed);
      const { categories } = computeStyleFingerprint(computedStyles);
      const structureHash = computeStructureHash(name, element);

      const { score } = computeSimilarity(
        target.styleCategories,
        target.structureHash,
        categories,
        structureHash,
        target.componentName,
        name,
      );

      if (score >= SIMILARITY_THRESHOLD) {
        matches.push({ element, score, name });
      }

      return false;
    });
  }

  // Sort by score descending, then by DOM position
  matches.sort((a, b) => {
    if (Math.abs(a.score - b.score) > 0.05) return b.score - a.score;
    // Same-ish score: sort by DOM position (top to bottom)
    const rectA = a.element.getBoundingClientRect();
    const rectB = b.element.getBoundingClientRect();
    return rectA.top - rectB.top || rectA.left - rectB.left;
  });

  return matches;
}

function findVisibleHostElement(fiber: Fiber): HTMLElement | null {
  // If this fiber has a stateNode that's visible, use it
  if (fiber.stateNode instanceof HTMLElement) {
    const el = fiber.stateNode;
    const rect = el.getBoundingClientRect();
    if (rect.width >= MIN_ELEMENT_SIZE && rect.height >= MIN_ELEMENT_SIZE) {
      return el;
    }
    return null;
  }

  // Walk down to find the first host child
  let child = fiber.child;
  while (child) {
    if (child.stateNode instanceof HTMLElement) {
      const el = child.stateNode;
      const rect = el.getBoundingClientRect();
      if (rect.width >= MIN_ELEMENT_SIZE && rect.height >= MIN_ELEMENT_SIZE) {
        return el;
      }
    }
    child = child.sibling;
  }
  return null;
}
