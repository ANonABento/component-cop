import type {
  ComponentData,
  CrawlConfig,
  CrawlProgress,
  ReactDetectionResult,
  ScanResult,
  SimilarityMatch,
} from './types';

// ─── Injected Script → Content Script (via window.postMessage) ───

export type InjectedToContentMessage =
  | { type: 'SCAN_RESULT'; payload: ScanResult }
  | { type: 'NAVIGATION'; payload: { path: string } }
  | { type: 'FIND_SIMILAR'; payload: { styleCategories: string[]; structureHash: string } }
  | { type: 'PICKER_SELECTED'; payload: ComponentData }
  | { type: 'PICKER_CANCELLED' }
  | { type: 'NAVIGATE_STATUS'; payload: { current: number; total: number } }
  | { type: 'REACT_DETECTED'; payload: ReactDetectionResult };

// ─── Content Script → Injected Script (via window.postMessage) ───

export interface ScanOptions {
  skipComponents?: string[];
  excludePatterns?: string[];
}

export type ContentToInjectedMessage =
  | { type: 'START_SCAN'; options?: ScanOptions }
  | { type: 'ENTER_PICKER_MODE' }
  | { type: 'EXIT_PICKER_MODE' }
  | { type: 'NAVIGATE_SIMILAR'; payload: { componentName: string; styleCategories: string[]; structureHash: string } }
  | { type: 'NAVIGATE_NEXT' }
  | { type: 'NAVIGATE_PREV' }
  | { type: 'NAVIGATE_EXIT' }
  | { type: 'SIMILAR_RESULTS'; payload: SimilarityMatch[] };

// ─── Content Script ↔ Background Service Worker (via chrome.runtime) ───

export type ContentToBackgroundMessage =
  | { type: 'STORE_SCAN'; payload: ScanResult }
  | { type: 'FIND_SIMILAR'; payload: { styleCategories: string[]; structureHash: string } }
  | { type: 'PICKER_SELECTED'; payload: ComponentData }
  | { type: 'PICKER_CANCELLED' }
  | { type: 'NAVIGATE_STATUS'; payload: { current: number; total: number } }
  | { type: 'GET_ALL_PAGES' }
  | { type: 'GET_ALL_COMPONENTS' }
  | { type: 'GET_PATTERNS' }
  | { type: 'CLEAR_ALL_DATA' }
  | { type: 'REACT_DETECTED'; payload: ReactDetectionResult };

// ─── DevTools Panel ↔ Background (via chrome.runtime.connect port) ───

export type PanelToBackgroundMessage =
  | { type: 'PANEL_INIT'; tabId: number }
  | { type: 'TRIGGER_SCAN'; tabId: number }
  | { type: 'TRIGGER_PICKER'; tabId: number }
  | { type: 'CANCEL_PICKER'; tabId: number }
  | { type: 'NAVIGATE_SIMILAR'; tabId: number; target: { componentName: string; styleCategories: string[]; structureHash: string } }
  | { type: 'NAVIGATE_NEXT'; tabId: number }
  | { type: 'NAVIGATE_PREV'; tabId: number }
  | { type: 'NAVIGATE_EXIT'; tabId: number }
  | { type: 'GOTO_PAGE_AND_NAVIGATE'; tabId: number; url: string; target: { componentName: string; styleCategories: string[]; structureHash: string } }
  | { type: 'TRIGGER_CRAWL'; tabId: number; config: CrawlConfig }
  | { type: 'PAUSE_CRAWL'; tabId: number }
  | { type: 'RESUME_CRAWL'; tabId: number }
  | { type: 'STOP_CRAWL'; tabId: number }
  | { type: 'GET_ALL_PAGES' }
  | { type: 'GET_ALL_COMPONENTS' }
  | { type: 'GET_PATTERNS' }
  | { type: 'CLEAR_ALL_DATA' }
  | { type: 'DISMISS_PATTERN'; patternId: string; reason: string }
  | { type: 'RESTORE_PATTERN'; patternId: string }
  | { type: 'GET_DISMISSED' }
  | { type: 'CLEAR_DISMISSED' }
  | { type: 'SAVE_SNAPSHOT'; label: string }
  | { type: 'GET_SNAPSHOTS' }
  | { type: 'DELETE_SNAPSHOT'; id: number }
  | { type: 'SET_BASELINE'; id: number }
  | { type: 'CLEAR_BASELINE' };

export type BackgroundToPanelMessage =
  | { type: 'SCAN_COMPLETE'; payload: ScanResult }
  | { type: 'ELEMENT_PICKED'; payload: { component: ComponentData; matches: SimilarityMatch[] } }
  | { type: 'PICKER_CANCELLED' }
  | { type: 'NAVIGATE_STATUS'; payload: { current: number; total: number } }
  | { type: 'CRAWL_PROGRESS'; payload: CrawlProgress }
  | { type: 'REACT_STATUS'; payload: ReactDetectionResult }
  | { type: 'ALL_PAGES'; payload: import('./types').StoredPage[] }
  | { type: 'ALL_COMPONENTS'; payload: import('./types').StoredComponent[] }
  | { type: 'ALL_PATTERNS'; payload: import('./types').StoredPattern[] }
  | { type: 'DATA_CLEARED' }
  | { type: 'DISMISSED_PATTERNS'; payload: import('./types').DismissedPattern[] }
  | { type: 'PATTERN_DISMISSED' }
  | { type: 'PATTERN_RESTORED' }
  | { type: 'DISMISSED_CLEARED' }
  | { type: 'SNAPSHOT_SAVED'; id: number }
  | { type: 'ALL_SNAPSHOTS'; payload: import('./scan-history').ScanSnapshot[] }
  | { type: 'SNAPSHOT_DELETED' }
  | { type: 'BASELINE_SET'; id: number | null };

// ─── Helpers ───

export const MESSAGE_SOURCE = 'react-xray-injected' as const;
export const CONTENT_SOURCE = 'react-xray-content' as const;

export interface WrappedPostMessage<T> {
  source: typeof MESSAGE_SOURCE | typeof CONTENT_SOURCE;
  message: T;
}

export function sendToContent(msg: InjectedToContentMessage): void {
  window.postMessage(
    { source: MESSAGE_SOURCE, message: msg } satisfies WrappedPostMessage<InjectedToContentMessage>,
    '*',
  );
}

