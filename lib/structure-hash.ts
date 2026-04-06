import { MAX_DOM_DEPTH } from '../shared/constants';
import { simpleHash } from '../shared/hash';

/**
 * Compute a structure hash for a component.
 * Includes: component name, DOM tree serialization, child count,
 * interactive element presence, and text content signal.
 */
export function computeStructureHash(
  componentName: string,
  element: HTMLElement,
): string {
  const structure = serializeDOMStructure(element, MAX_DOM_DEPTH);
  const childCount = element.children.length;
  const hasInteractive =
    element.querySelector('button, a, input, select, textarea') !== null;
  const hasText = (element.textContent?.trim().length ?? 0) > 0;

  const input = [
    componentName,
    structure,
    `children:${childCount}`,
    `interactive:${hasInteractive}`,
    `text:${hasText ? 'yes' : 'no'}`,
  ].join('|');

  return simpleHash(input);
}

/**
 * Serialize the DOM tree structure to a string representation.
 * e.g., "div(span(svg,text),button(span))"
 */
function serializeDOMStructure(
  element: HTMLElement,
  maxDepth: number,
  depth = 0,
): string {
  if (depth >= maxDepth) return '';

  const tag = element.tagName.toLowerCase();
  const role = element.getAttribute('role') ?? '';
  const roleStr = role ? `[${role}]` : '';

  const childStructures = Array.from(element.children)
    .map((child) => serializeDOMStructure(child as HTMLElement, maxDepth, depth + 1))
    .filter(Boolean)
    .join(',');

  return `${tag}${roleStr}(${childStructures})`;
}

