/**
 * Check if a URL path matches any exclude pattern.
 * Patterns support trailing * for prefix matching.
 */
export function isExcluded(path: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => {
    if (pattern.endsWith('*')) return path.startsWith(pattern.slice(0, -1));
    return path === pattern;
  });
}
