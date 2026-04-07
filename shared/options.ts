/**
 * User-configurable options stored in chrome.storage.sync.
 */

export interface ComponentCopOptions {
  /** Similarity threshold for grouping components (0-1) */
  similarityThreshold: number;
  /** Color distance threshold for near-duplicate detection (CIE76) */
  colorDistanceThreshold: number;
  /** URL patterns to exclude from crawling */
  excludePatterns: string[];
  /** Component names to skip during scanning */
  skipComponents: string[];
  /** Max pages to crawl */
  maxCrawlPages: number;
  /** Delay between crawl page loads (ms) */
  crawlDelayMs: number;
}

export const DEFAULT_OPTIONS: ComponentCopOptions = {
  similarityThreshold: 0.7,
  colorDistanceThreshold: 15,
  excludePatterns: ['/auth/*', '/api/*', '/login', '/logout', '/sentry-tunnel'],
  skipComponents: [],
  maxCrawlPages: 100,
  crawlDelayMs: 1000,
};

const STORAGE_KEY = 'component-cop-options';

export async function loadOptions(): Promise<ComponentCopOptions> {
  try {
    const result = await chrome.storage.sync.get(STORAGE_KEY);
    return { ...DEFAULT_OPTIONS, ...result[STORAGE_KEY] };
  } catch {
    return DEFAULT_OPTIONS;
  }
}

export async function saveOptions(options: Partial<ComponentCopOptions>): Promise<void> {
  const current = await loadOptions();
  await chrome.storage.sync.set({ [STORAGE_KEY]: { ...current, ...options } });
}
