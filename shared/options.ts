/**
 * User-configurable options stored in chrome.storage.sync.
 */

import { DEFAULT_CRAWL_CONFIG, SIMILARITY_THRESHOLD } from './constants';

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
  similarityThreshold: SIMILARITY_THRESHOLD,
  colorDistanceThreshold: 15,
  excludePatterns: [...DEFAULT_CRAWL_CONFIG.excludePatterns],
  skipComponents: [],
  maxCrawlPages: DEFAULT_CRAWL_CONFIG.maxPages,
  crawlDelayMs: DEFAULT_CRAWL_CONFIG.delayMs,
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

// --- Design Tokens (stored separately in chrome.storage.local due to size) ---

import type { DesignTokenSet } from '../lib/token-compliance';

const TOKEN_STORAGE_KEY = 'component-cop-design-tokens';

export async function loadDesignTokens(): Promise<DesignTokenSet | null> {
  try {
    const result = await chrome.storage.local.get(TOKEN_STORAGE_KEY);
    return result[TOKEN_STORAGE_KEY] ?? null;
  } catch {
    return null;
  }
}

export async function saveDesignTokens(tokens: DesignTokenSet | null): Promise<void> {
  if (tokens === null) {
    await chrome.storage.local.remove(TOKEN_STORAGE_KEY);
  } else {
    await chrome.storage.local.set({ [TOKEN_STORAGE_KEY]: tokens });
  }
}
