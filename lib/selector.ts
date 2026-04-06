/**
 * Generate a stable CSS selector for an element.
 * Priority: data-testid > id > path with meaningful classes.
 */
export function generateSelector(element: HTMLElement): string {
  // 1. data-testid (most stable)
  const testId = element.getAttribute('data-testid');
  if (testId) return `[data-testid="${testId}"]`;

  // 2. ID (unique per page)
  if (element.id) return `#${CSS.escape(element.id)}`;

  // 3. Build path from root
  const parts: string[] = [];
  let current: HTMLElement | null = element;

  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase();

    // Add meaningful classes (skip Tailwind utility classes)
    const meaningfulClasses = Array.from(current.classList).filter(
      (cls) => !isTailwindUtilityClass(cls) && cls.length < 30,
    );
    if (meaningfulClasses.length > 0) {
      selector += '.' + meaningfulClasses.slice(0, 2).map(CSS.escape).join('.');
    }

    // Add nth-of-type for disambiguation
    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (s) => s.tagName === current!.tagName,
      );
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        selector += `:nth-of-type(${index})`;
      }
    }

    parts.unshift(selector);
    current = current.parentElement;

    // Stop at 4 levels — deeper selectors are fragile
    if (parts.length >= 4) break;
  }

  return parts.join(' > ');
}

function isTailwindUtilityClass(cls: string): boolean {
  return /^(flex|grid|p[xytblr]?-|m[xytblr]?-|w-|h-|text-|bg-|border-|rounded-|shadow-|font-|leading-|tracking-|gap-|space-|overflow-|z-|opacity-|transition-|duration-|ease-|cursor-|select-|sr-|not-|group|peer|dark:|hover:|focus:|active:|disabled:|sm:|md:|lg:|xl:|2xl:)/.test(
    cls,
  );
}
