import type { Fiber } from '../shared/types';

/**
 * Get the fiber instance from a DOM element via React's internal properties.
 * React 16+ attaches __reactFiber$ or __reactInternalInstance$ to DOM nodes.
 * React 18+ createRoot attaches __reactContainer$ on the root container.
 */
export function getFiberFromElement(element: Element): Fiber | null {
  const record = element as unknown as Record<string, Fiber>;
  for (const key of Object.keys(element)) {
    if (
      key.startsWith('__reactFiber$') ||
      key.startsWith('__reactInternalInstance$') ||
      key.startsWith('__reactContainer$')
    ) {
      return record[key] ?? null;
    }
  }
  return null;
}

/**
 * Find the nearest HTMLElement for a fiber (itself or first host child).
 */
export function findHostElement(fiber: Fiber): HTMLElement | null {
  if (fiber.stateNode instanceof HTMLElement) return fiber.stateNode;
  return findHostElementDown(fiber);
}

function findHostElementDown(fiber: Fiber): HTMLElement | null {
  const stack: Fiber[] = [];
  if (fiber.child) stack.push(fiber.child);
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current.stateNode instanceof HTMLElement) return current.stateNode;
    // Push sibling first so child is processed first (depth-first)
    if (current.sibling) stack.push(current.sibling);
    if (current.child) stack.push(current.child);
  }
  return null;
}
