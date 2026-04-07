/**
 * Background service worker.
 * Storage + relay, crawl orchestration, and message forwarding between
 * content scripts and DevTools panel.
 */

import {
  clearAllData,
  getAllComponents,
  getAllPages,
  getAllPatterns,
  storeScanResults,
  storePatterns,
  saveSnapshot,
  getAllSnapshots,
  deleteSnapshot,
  dismissPattern,
  restorePattern,
  getDismissedPatterns,
  clearDismissed,
} from '../shared/db';
import type { ScanSnapshot } from '../shared/scan-history';
import { loadOptions, type ComponentCopOptions } from '../shared/options';
import { computeSimilarity } from '../shared/similarity';
import { findNearDuplicateColors } from '../lib/color-distance';
import { variantLabel } from '../shared/variant-label';
import type {
  BackgroundToPanelMessage,
  ContentToBackgroundMessage,
  PanelToBackgroundMessage,
} from '../shared/messages';
import type {
  ColorSummary,
  ComponentData,
  CrawlConfig,
  CrawlProgress,
  CrawlStatus,
  HardcodedColor,
  ReactDetectionResult,
  ScanResult,
  SimilarityMatch,
  StoredPattern,
  PatternVariant,
} from '../shared/types';

// ─── Crawler state (lives in the background service worker) ───

interface CrawlerState {
  status: CrawlStatus;
  config: CrawlConfig;
  tabId: number;
  queue: string[];  // URLs to visit
  queued: Set<string>;  // O(1) dedup for queue
  visited: Set<string>;
  scannedCount: number;
  totalDiscovered: number;
  currentUrl: string | null;
  errors: string[];
  origin: string;  // restrict crawl to same origin
  currentScanId: number;  // monotonic ID for timeout/completion race prevention
}

let crawler: CrawlerState | null = null;
let cachedOptions: ComponentCopOptions | null = null;

async function getOptions(): Promise<ComponentCopOptions> {
  if (!cachedOptions) cachedOptions = await loadOptions();
  return cachedOptions;
}

// Invalidate cache when options change
try {
  chrome.storage.sync.onChanged.addListener(() => { cachedOptions = null; });
} catch {
  // storage.sync may not be available in all contexts
}

let pendingGotoListener: ((tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => void) | null = null;

const KEEPALIVE_ALARM = 'component-cop-keepalive';

/** Keep service worker alive during crawl by pinging every 25 seconds. */
function startKeepalive(): void {
  chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 25 / 60 });
}

function stopKeepalive(): void {
  chrome.alarms.clear(KEEPALIVE_ALARM);
}

export default defineBackground(() => {
  // Keepalive alarm handler — just existing keeps the worker from sleeping
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === KEEPALIVE_ALARM) {
      // No-op — the alarm callback itself is the keepalive
    }
  });

  // Track connected DevTools panels per tab
  const panelPorts = new Map<number, chrome.runtime.Port>();

  // ─── Handle messages from content scripts ───
  chrome.runtime.onMessage.addListener(
    (message: ContentToBackgroundMessage, sender, sendResponse) => {
      const tabId = sender.tab?.id;

      handleContentMessage(message, tabId).then(
        (response) => {
          if (response) sendResponse(response);
        },
        (err) => {
          console.error('[component-cop bg] Error handling message:', err);
        },
      );

      // Return true to indicate async response
      return true;
    },
  );

  // ─── Handle long-lived connections from DevTools panel ───
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'component-cop-panel') return;

    port.onMessage.addListener((msg: PanelToBackgroundMessage) => {
      handlePanelMessage(msg, port).catch((err) => {
        console.error('[component-cop bg] Error handling panel message:', err);
      });
    });

    port.onDisconnect.addListener(() => {
      // Clean up panel port tracking
      for (const [tabId, p] of panelPorts) {
        if (p === port) {
          panelPorts.delete(tabId);
          break;
        }
      }
    });
  });

  async function handleContentMessage(
    message: ContentToBackgroundMessage,
    tabId?: number,
  ): Promise<unknown> {
    switch (message.type) {
      case 'STORE_SCAN': {
        const scan = message.payload as ScanResult;
        const colorSummary = buildColorSummary(scan.hardcodedColors ?? [], (await getOptions()).colorDistanceThreshold);
        await storeScanResults(
          scan.pagePath,
          scan.pageTitle,
          scan.pageUrl,
          scan.components,
          scan.links,
          colorSummary,
        );
        // Recompute pattern groups after each scan
        await recomputePatterns();
        // Notify panel
        if (tabId) {
          sendToPanel(tabId, { type: 'SCAN_COMPLETE', payload: scan });
        }
        // If crawler is active and this scan is from the crawled tab, feed it new links
        if (crawler && crawler.status === 'crawling' && tabId === crawler.tabId) {
          onCrawlScanComplete(scan);
        }
        return { success: true };
      }

      case 'PICKER_SELECTED': {
        const component = message.payload as ComponentData;
        const matches = await findSimilarComponents(
          component.styleCategories,
          component.structureHash,
          component.componentName,
        );
        if (tabId) {
          sendToPanel(tabId, {
            type: 'ELEMENT_PICKED',
            payload: { component, matches },
          });
        }
        return { success: true };
      }

      case 'PICKER_CANCELLED': {
        if (tabId) {
          sendToPanel(tabId, { type: 'PICKER_CANCELLED' });
        }
        return undefined;
      }

      case 'NAVIGATE_STATUS': {
        const status = message.payload as { current: number; total: number };
        if (tabId) {
          sendToPanel(tabId, { type: 'NAVIGATE_STATUS', payload: status });
        }
        return undefined;
      }

      case 'FIND_SIMILAR': {
        const { styleCategories, structureHash } = message.payload as {
          styleCategories: string[];
          structureHash: string;
        };
        const matches = await findSimilarComponents(styleCategories, structureHash);
        return matches;
      }

      case 'GET_ALL_PAGES': {
        return getAllPages();
      }

      case 'GET_ALL_COMPONENTS': {
        return getAllComponents();
      }

      case 'GET_PATTERNS': {
        return getAllPatterns();
      }

      case 'CLEAR_ALL_DATA': {
        await clearAllData();
        if (tabId) sendToPanel(tabId, { type: 'DATA_CLEARED' });
        return { success: true };
      }

      case 'REACT_DETECTED': {
        const info = message.payload as ReactDetectionResult;
        if (tabId) {
          sendToPanel(tabId, { type: 'REACT_STATUS', payload: info });
          updateBadge(tabId, info);
        }
        return undefined;
      }

      default:
        return undefined;
    }
  }

  async function handlePanelMessage(
    msg: PanelToBackgroundMessage,
    port: chrome.runtime.Port,
  ): Promise<void> {
    switch (msg.type) {
      case 'PANEL_INIT': {
        panelPorts.set(msg.tabId, port);
        break;
      }

      case 'TRIGGER_SCAN': {
        // Tell content script to trigger scan in injected script
        try {
          const scanOpts = await getOptions();
          await chrome.tabs.sendMessage(msg.tabId, { type: 'START_SCAN', options: { skipComponents: scanOpts.skipComponents, excludePatterns: scanOpts.excludePatterns } });
        } catch {
          console.warn('[component-cop bg] Failed to send START_SCAN — tab or content script unavailable');
        }
        break;
      }

      case 'TRIGGER_PICKER': {
        try {
          await chrome.tabs.sendMessage(msg.tabId, { type: 'ENTER_PICKER_MODE' });
        } catch {
          console.warn('[component-cop bg] Failed to send ENTER_PICKER_MODE — tab or content script unavailable');
        }
        break;
      }

      case 'CANCEL_PICKER': {
        try {
          await chrome.tabs.sendMessage(msg.tabId, { type: 'EXIT_PICKER_MODE' });
        } catch {
          console.warn('[component-cop bg] Failed to send EXIT_PICKER_MODE — tab or content script unavailable');
        }
        break;
      }

      case 'NAVIGATE_SIMILAR': {
        try {
          await chrome.tabs.sendMessage(msg.tabId, { type: 'NAVIGATE_SIMILAR', payload: msg.target });
        } catch {
          console.warn('[component-cop bg] Failed to send NAVIGATE_SIMILAR');
        }
        break;
      }

      case 'NAVIGATE_NEXT': {
        try {
          await chrome.tabs.sendMessage(msg.tabId, { type: 'NAVIGATE_NEXT' });
        } catch { /* tab unavailable */ }
        break;
      }

      case 'NAVIGATE_PREV': {
        try {
          await chrome.tabs.sendMessage(msg.tabId, { type: 'NAVIGATE_PREV' });
        } catch { /* tab unavailable */ }
        break;
      }

      case 'NAVIGATE_EXIT': {
        try {
          await chrome.tabs.sendMessage(msg.tabId, { type: 'NAVIGATE_EXIT' });
        } catch { /* tab unavailable */ }
        break;
      }

      case 'GOTO_PAGE_AND_NAVIGATE': {
        // Navigate the tab to the target URL, then auto-trigger navigator after load
        const { tabId, url, target } = msg;
        try {
          // Remove any previous GOTO listener to prevent stacking
          if (pendingGotoListener) {
            chrome.tabs.onUpdated.removeListener(pendingGotoListener);
            pendingGotoListener = null;
          }
          await chrome.tabs.update(tabId, { url });
          // Wait for the page to finish loading, then trigger navigator
          const listener = (
            updatedTabId: number,
            changeInfo: chrome.tabs.TabChangeInfo,
          ) => {
            if (updatedTabId === tabId && changeInfo.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(listener);
              pendingGotoListener = null;
              // Small delay to let content script + injected script initialize
              setTimeout(async () => {
                try {
                  await chrome.tabs.sendMessage(tabId, {
                    type: 'NAVIGATE_SIMILAR',
                    payload: target,
                  });
                } catch {
                  console.warn('[component-cop bg] Failed to trigger navigator after page load');
                }
              }, 1500);
            }
          };
          pendingGotoListener = listener;
          chrome.tabs.onUpdated.addListener(listener);
          // Safety timeout: remove listener after 30s to prevent leaks
          setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(listener);
            if (pendingGotoListener === listener) pendingGotoListener = null;
          }, 30_000);
        } catch {
          console.warn('[component-cop bg] Failed to navigate tab');
        }
        break;
      }

      case 'GET_ALL_PAGES': {
        const pages = await getAllPages();
        safeSend(port, { type: 'ALL_PAGES', payload: pages });
        break;
      }

      case 'GET_ALL_COMPONENTS': {
        const components = await getAllComponents();
        safeSend(port, { type: 'ALL_COMPONENTS', payload: components });
        break;
      }

      case 'GET_PATTERNS': {
        const patterns = await getAllPatterns();
        safeSend(port, { type: 'ALL_PATTERNS', payload: patterns });
        break;
      }

      case 'TRIGGER_CRAWL': {
        await startCrawl(msg.tabId, msg.config);
        break;
      }

      case 'PAUSE_CRAWL': {
        pauseCrawl();
        break;
      }

      case 'RESUME_CRAWL': {
        resumeCrawl();
        break;
      }

      case 'STOP_CRAWL': {
        stopCrawl();
        break;
      }

      case 'CLEAR_ALL_DATA': {
        await clearAllData();
        safeSend(port, { type: 'DATA_CLEARED' });
        break;
      }

      case 'DISMISS_PATTERN': {
        await dismissPattern(msg.patternId, msg.reason);
        safeSend(port, { type: 'PATTERN_DISMISSED' });
        break;
      }

      case 'RESTORE_PATTERN': {
        await restorePattern(msg.patternId);
        safeSend(port, { type: 'PATTERN_RESTORED' });
        break;
      }

      case 'GET_DISMISSED': {
        const dismissed = await getDismissedPatterns();
        safeSend(port, { type: 'DISMISSED_PATTERNS', payload: dismissed });
        break;
      }

      case 'CLEAR_DISMISSED': {
        await clearDismissed();
        safeSend(port, { type: 'DISMISSED_CLEARED' });
        break;
      }

      case 'SAVE_SNAPSHOT': {
        // Build snapshot from current state
        const snapPages = await getAllPages();
        const snapComps = await getAllComponents();
        const snapPatterns = await getAllPatterns();
        const multiVariant = snapPatterns.filter((p) => p.variants.length > 1).length;

        // Aggregate color stats
        let hcColors = 0;
        let nearDups = 0;
        const seenDups = new Set<string>();
        for (const page of snapPages) {
          if (!page.colorSummary) continue;
          hcColors += page.colorSummary.topColors.length;
          for (const dup of page.colorSummary.nearDuplicates) {
            const key = [dup.a, dup.b].sort().join(':');
            if (!seenDups.has(key)) { seenDups.add(key); nearDups++; }
          }
        }

        const snapshotData: Omit<ScanSnapshot, 'id'> = {
          timestamp: Date.now(),
          label: msg.label,
          pagesScanned: snapPages.length,
          totalComponents: snapComps.length,
          patternGroups: snapPatterns.length,
          multiVariantPatterns: multiVariant,
          hardcodedColors: hcColors,
          nearDuplicateColors: nearDups,
          patternSummary: snapPatterns.map((p) => ({
            name: p.name,
            variantCount: p.variants.length,
            totalInstances: p.totalInstances,
          })),
        };
        const snapId = await saveSnapshot(snapshotData);
        safeSend(port, { type: 'SNAPSHOT_SAVED', id: snapId });
        break;
      }

      case 'GET_SNAPSHOTS': {
        const snapshots = await getAllSnapshots();
        safeSend(port, { type: 'ALL_SNAPSHOTS', payload: snapshots });
        break;
      }

      case 'DELETE_SNAPSHOT': {
        await deleteSnapshot(msg.id);
        safeSend(port, { type: 'SNAPSHOT_DELETED' });
        break;
      }

      case 'SET_BASELINE': {
        // Baseline ID stored in panel state, not in IDB (lightweight)
        safeSend(port, { type: 'BASELINE_SET', id: msg.id });
        break;
      }

      case 'CLEAR_BASELINE': {
        safeSend(port, { type: 'BASELINE_SET', id: null });
        break;
      }
    }
  }

  function safeSend(port: chrome.runtime.Port, msg: BackgroundToPanelMessage): void {
    try {
      port.postMessage(msg);
    } catch {
      // Port disconnected or context invalidated — panel will reconnect
    }
  }

  function sendToPanel(tabId: number, msg: BackgroundToPanelMessage): void {
    const port = panelPorts.get(tabId);
    if (port) {
      try {
        port.postMessage(msg);
      } catch {
        panelPorts.delete(tabId);
      }
    }
  }

  function updateBadge(tabId: number, info: ReactDetectionResult): void {
    // chrome.action requires "action" in manifest — guard for DevTools-only extensions
    if (!chrome.action?.setBadgeText) return;

    try {
      if (!info.found) {
        chrome.action.setBadgeText({ tabId, text: '' });
        chrome.action.setBadgeBackgroundColor({ tabId, color: '#888888' });
      } else if (info.mode === 'dev') {
        chrome.action.setBadgeText({ tabId, text: 'DEV' });
        chrome.action.setBadgeBackgroundColor({ tabId, color: '#22c55e' });
      } else {
        chrome.action.setBadgeText({ tabId, text: 'PROD' });
        chrome.action.setBadgeBackgroundColor({ tabId, color: '#eab308' });
      }
    } catch {
      // Tab may have been closed or context invalidated
    }
  }

  async function findSimilarComponents(
    styleCategories: string[],
    structureHash: string,
    componentName?: string,
  ): Promise<SimilarityMatch[]> {
    const options = await getOptions();
    const allComponents = await getAllComponents();
    const matches: SimilarityMatch[] = [];

    for (const comp of allComponents) {
      const { score, styleScore, structureScore } = computeSimilarity(
        styleCategories,
        structureHash,
        comp.styleCategories,
        comp.structureHash,
        componentName,
        comp.componentName,
      );

      if (score >= options.similarityThreshold) {
        matches.push({ component: comp, score, styleScore, structureScore });
      }
    }

    // Sort by score descending
    matches.sort((a, b) => b.score - a.score);
    return matches;
  }

  // ─── Color summary computation ───

  function buildColorSummary(colors: HardcodedColor[], colorDistanceThreshold: number): ColorSummary | null {
    if (colors.length === 0) return null;

    const byHex = new Map<string, { count: number; usedAs: Set<string>; severities: Set<HardcodedColor['severity']> }>();
    const byProperty = new Map<string, number>();

    for (const c of colors) {
      const hex = c.hexValue.toLowerCase();
      const existing = byHex.get(hex);
      if (existing) {
        existing.count++;
        existing.usedAs.add(c.property);
        existing.severities.add(c.severity);
      } else {
        byHex.set(hex, { count: 1, usedAs: new Set([c.property]), severities: new Set([c.severity]) });
      }
      byProperty.set(c.property, (byProperty.get(c.property) ?? 0) + 1);
    }

    const topColors = Array.from(byHex.entries())
      .map(([hex, data]) => ({ hex, count: data.count, usedAs: Array.from(data.usedAs), severities: Array.from(data.severities) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    const uniqueHexes = Array.from(byHex.keys());
    const nearDuplicates = findNearDuplicateColors(uniqueHexes, colorDistanceThreshold);

    return {
      uniqueColors: byHex.size,
      totalUsages: colors.length,
      byProperty: Object.fromEntries(byProperty),
      topColors,
      nearDuplicates,
    };
  }

  // ─── Pattern group computation ───

  async function recomputePatterns(): Promise<void> {
    const allComponents = await getAllComponents();
    if (allComponents.length === 0) return;

    // Group by component name
    const byName = new Map<string, typeof allComponents>();
    for (const comp of allComponents) {
      const existing = byName.get(comp.componentName) ?? [];
      existing.push(comp);
      byName.set(comp.componentName, existing);
    }

    const patterns: StoredPattern[] = [];

    for (const [name, comps] of byName) {
      // Skip singletons — only interested in components with 2+ instances
      if (comps.length < 2) continue;

      // Sub-cluster by style fingerprint → each unique fingerprint is a variant
      const byFingerprint = new Map<string, typeof comps>();
      for (const comp of comps) {
        const existing = byFingerprint.get(comp.styleFingerprint) ?? [];
        existing.push(comp);
        byFingerprint.set(comp.styleFingerprint, existing);
      }

      const variants: PatternVariant[] = [];
      let variantIdx = 0;
      for (const [, variantComps] of byFingerprint) {
        const label = byFingerprint.size > 1
          ? `Variant ${variantLabel(variantIdx)}`
          : 'Default';
        variants.push({
          variantId: `${name}-v${variantIdx}`,
          label,
          componentIds: variantComps.map((c) => c.id),
          exemplarComponentId: variantComps[0]!.id,
        });
        variantIdx++;
      }

      patterns.push({
        patternId: `pattern-${name}`,
        name,
        variants,
        totalInstances: comps.length,
        computedAt: Date.now(),
      });
    }

    // Sort: multi-variant patterns first, then by total instances
    patterns.sort((a, b) => {
      const aMulti = a.variants.length > 1 ? 1 : 0;
      const bMulti = b.variants.length > 1 ? 1 : 0;
      if (aMulti !== bMulti) return bMulti - aMulti;
      return b.totalInstances - a.totalInstances;
    });

    await storePatterns(patterns);
  }

  // ─── Crawler orchestration ───

  function getCrawlProgress(): CrawlProgress {
    if (!crawler) {
      return { status: 'idle', scannedCount: 0, totalDiscovered: 0, currentPath: null, errors: [] };
    }
    return {
      status: crawler.status,
      scannedCount: crawler.scannedCount,
      totalDiscovered: crawler.totalDiscovered,
      currentPath: crawler.currentUrl ? new URL(crawler.currentUrl).pathname : null,
      errors: crawler.errors.slice(-10), // Last 10 errors
    };
  }

  function broadcastCrawlProgress(): void {
    if (!crawler) return;
    sendToPanel(crawler.tabId, { type: 'CRAWL_PROGRESS', payload: getCrawlProgress() });
  }

  async function startCrawl(tabId: number, config: CrawlConfig): Promise<void> {
    // Get the current tab URL to determine origin
    let tabUrl: string;
    try {
      const tab = await chrome.tabs.get(tabId);
      tabUrl = tab.url ?? '';
    } catch {
      console.warn('[component-cop bg] Failed to get tab info for crawl');
      return;
    }

    if (!tabUrl || !tabUrl.startsWith('http')) {
      sendToPanel(tabId, {
        type: 'CRAWL_PROGRESS',
        payload: { status: 'error', scannedCount: 0, totalDiscovered: 0, currentPath: null, errors: ['Tab URL is not a valid HTTP page'] },
      });
      return;
    }

    const origin = new URL(tabUrl).origin;

    // Seed the queue: get all known page links from IndexedDB
    const existingPages = await getAllPages();
    const knownPaths = new Set(existingPages.map((p) => p.pagePath));
    const seedLinks = new Set<string>();

    for (const page of existingPages) {
      for (const link of page.links) {
        if (!knownPaths.has(link) && !isExcluded(link, config.excludePatterns)) {
          seedLinks.add(link);
        }
      }
    }

    // Also get links from the current page scan if we have it
    const currentPath = new URL(tabUrl).pathname;
    if (!knownPaths.has(currentPath)) {
      // Current page hasn't been scanned yet — scan it first
      seedLinks.add(currentPath);
    }

    // If no seed links, we need to scan the current page first to discover links
    const queue = Array.from(seedLinks).map((path) => `${origin}${path}`);

    if (queue.length === 0) {
      // Nothing to crawl — scan current page to discover links
      sendToPanel(tabId, {
        type: 'CRAWL_PROGRESS',
        payload: { status: 'done', scannedCount: 0, totalDiscovered: 0, currentPath: null, errors: ['No new pages to crawl. Scan more pages manually first.'] },
      });
      return;
    }

    startKeepalive();
    crawler = {
      status: 'crawling',
      config,
      tabId,
      queue,
      queued: new Set(queue),
      visited: new Set(existingPages.map((p) => `${origin}${p.pagePath}`)),
      scannedCount: 0,
      totalDiscovered: queue.length,
      currentUrl: null,
      errors: [],
      origin,
      currentScanId: 0,
    };

    broadcastCrawlProgress();
    crawlNext();
  }

  function pauseCrawl(): void {
    if (!crawler || crawler.status !== 'crawling') return;
    crawler.status = 'paused';
    broadcastCrawlProgress();
  }

  function resumeCrawl(): void {
    if (!crawler || crawler.status !== 'paused') return;
    crawler.status = 'crawling';
    broadcastCrawlProgress();
    crawlNext();
  }

  function stopCrawl(): void {
    if (!crawler) return;
    crawler.status = 'done';
    stopKeepalive();
    broadcastCrawlProgress();
    crawler = null;
  }

  function isExcluded(path: string, patterns: string[]): boolean {
    return patterns.some((pattern) => {
      if (pattern.endsWith('*')) {
        return path.startsWith(pattern.slice(0, -1));
      }
      return path === pattern;
    });
  }

  function crawlNext(): void {
    if (!crawler || crawler.status !== 'crawling') return;

    // Check limits
    if (crawler.scannedCount >= crawler.config.maxPages) {
      crawler.status = 'done';
    stopKeepalive();
      broadcastCrawlProgress();
      crawler = null;
      return;
    }

    // Find next unvisited URL
    let nextUrl: string | undefined;
    while (crawler.queue.length > 0) {
      const candidate = crawler.queue.shift()!;
      if (!crawler.visited.has(candidate)) {
        nextUrl = candidate;
        break;
      }
    }

    if (!nextUrl) {
      crawler.status = 'done';
    stopKeepalive();
      broadcastCrawlProgress();
      crawler = null;
      return;
    }

    crawler.currentUrl = nextUrl;
    crawler.visited.add(nextUrl);
    broadcastCrawlProgress();

    // Navigate the tab to this URL
    navigateAndScan(crawler.tabId, nextUrl);
  }

  function navigateAndScan(tabId: number, url: string): void {
    const listener = (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (updatedTabId !== tabId || changeInfo.status !== 'complete') return;
      chrome.tabs.onUpdated.removeListener(listener);

      // Delay to let content script + injected script initialize
      setTimeout(async () => {
        if (!crawler || crawler.status !== 'crawling') return;

        const crawlOpts = cachedOptions ?? await getOptions();
        chrome.tabs.sendMessage(tabId, { type: 'START_SCAN', options: { skipComponents: crawlOpts.skipComponents, excludePatterns: crawlOpts.excludePatterns } }).catch(() => {
          if (crawler) {
            crawler.errors.push(`Failed to trigger scan on ${url}`);
            crawler.currentUrl = null;
            broadcastCrawlProgress();
            setTimeout(crawlNext, crawler.config.delayMs);
          }
        });

        // Safety: if no scan result comes back within 15s, skip this page
        const scanId = crawler ? ++crawler.currentScanId : 0;
        setTimeout(() => {
          if (crawler && crawler.status === 'crawling' && crawler.currentScanId === scanId) {
            crawler.errors.push(`Timeout scanning ${new URL(url).pathname}`);
            crawler.currentUrl = null;
            crawler.scannedCount++;
            broadcastCrawlProgress();
            setTimeout(crawlNext, crawler.config.delayMs);
          }
        }, 15_000);
      }, 1500);
    };

    chrome.tabs.onUpdated.addListener(listener);
    // Safety: remove listener after 30s to prevent leaks
    setTimeout(() => chrome.tabs.onUpdated.removeListener(listener), 30_000);

    chrome.tabs.update(tabId, { url }).catch(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      if (crawler) {
        crawler.errors.push(`Failed to navigate to ${url}`);
        crawler.currentUrl = null;
        broadcastCrawlProgress();
        setTimeout(crawlNext, 500);
      }
    });
  }

  function onCrawlScanComplete(scan: ScanResult): void {
    if (!crawler || crawler.status !== 'crawling') return;

    crawler.currentScanId++; // Invalidate any pending timeout
    crawler.currentUrl = null;
    crawler.scannedCount++;

    // Add newly discovered links to the queue
    for (const link of scan.links) {
      if (isExcluded(link, crawler.config.excludePatterns)) continue;
      const fullUrl = `${crawler.origin}${link}`;
      if (!crawler.visited.has(fullUrl) && !crawler.queued.has(fullUrl)) {
        crawler.queue.push(fullUrl);
        crawler.queued.add(fullUrl);
        crawler.totalDiscovered++;
      }
    }

    broadcastCrawlProgress();

    // Continue to next page after configured delay
    setTimeout(crawlNext, crawler.config.delayMs);
  }

  // Stop crawling if the tab is closed
  chrome.tabs.onRemoved.addListener((tabId) => {
    if (crawler && crawler.tabId === tabId) {
      stopKeepalive();
      crawler = null;
    }
  });


  // ─── Keyboard shortcut commands ───
  chrome.commands.onCommand.addListener((command) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (!tabId) return;

      switch (command) {
        case 'trigger-scan':
          getOptions().then((opts) => {
            chrome.tabs.sendMessage(tabId, { type: 'START_SCAN', options: { skipComponents: opts.skipComponents, excludePatterns: opts.excludePatterns } }).catch(() => {});
          });
          break;
        case 'toggle-picker':
          chrome.tabs.sendMessage(tabId, { type: 'ENTER_PICKER_MODE' }).catch(() => {
            // Content script not loaded yet — ignore
          });
          break;
      }
    });
  });
  // Initialize DB schema on install
  chrome.runtime.onInstalled.addListener(() => {
    // The DB will be initialized on first access via getDB()
    console.log('[component-cop] Extension installed');
  });
});
