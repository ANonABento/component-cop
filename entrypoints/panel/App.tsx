import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  BackgroundToPanelMessage,
} from '../../shared/messages';
import type { CrawlConfig, CrawlProgress, DismissedPattern, ReactDetectionResult, ScanResult, StoredComponent, StoredPage, StoredPattern } from '../../shared/types';
import { T } from './theme';
import { HoverButton, MiniStat, ReactBadge, TabButton } from './primitives';
import { sendMsg } from './helpers';
import { ScanTab } from './ScanTab';
import { PickerTab, type PickerResult } from './PickerTab';
import { CrawlTab } from './CrawlTab';
import { DashboardTab } from './DashboardTab';
import { ExportTab } from './ExportTab';
import { HistoryTab } from './HistoryTab';
import type { ScanSnapshot } from '../../shared/scan-history';
import { loadDesignTokens } from '../../shared/options';
import type { DesignTokenSet } from '../../lib/token-compliance';

type Tab = 'scan' | 'picker' | 'crawl' | 'dashboard' | 'export' | 'history';

/** Max time to show the scanning spinner before auto-resetting (ms) */
const UI_SCAN_TIMEOUT_MS = 30_000;

// Inject keyframe animations once (not per-render)
const KEYFRAMES_INJECTED = (() => {
  if (typeof document === 'undefined') return false;
  const style = document.createElement('style');
  style.textContent = `
    @keyframes xray-spin { to { transform: rotate(360deg) } }
    @keyframes xray-pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.3 } }
  `;
  document.head.appendChild(style);
  return true;
})();

export function App() {
  // Reference to prevent tree-shaking
  void KEYFRAMES_INJECTED;
  const portRef = useRef<chrome.runtime.Port | null>(null);

  /** Guard + send helper — returns false if port/runtime unavailable. */
  const trySend = useCallback((msg: Parameters<typeof sendMsg>[1]): boolean => {
    if (!portRef.current || !chrome.runtime?.id) return false;
    sendMsg(portRef.current, msg);
    return true;
  }, []);
  const [tab, setTab] = useState<Tab>('scan');
  const [reactStatus, setReactStatus] = useState<ReactDetectionResult | null>(null);
  const [lastScan, setLastScan] = useState<ScanResult | null>(null);
  const [pages, setPages] = useState<StoredPage[]>([]);
  const [allComponents, setAllComponents] = useState<StoredComponent[]>([]);
  const [scanning, setScanning] = useState(false);
  const [picking, setPicking] = useState(false);
  const [pickerResult, setPickerResult] = useState<PickerResult | null>(null);
  const [patterns, setPatterns] = useState<StoredPattern[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [snapshots, setSnapshots] = useState<ScanSnapshot[]>([]);
  const [baselineId, setBaselineId] = useState<number | null>(null);
  const [designTokens, setDesignTokens] = useState<DesignTokenSet | null>(null);
  const [navStatus, setNavStatus] = useState<{ current: number; total: number } | null>(null);
  const [crawlProgress, setCrawlProgress] = useState<CrawlProgress | null>(null);
  const crawlProgressRef = useRef<CrawlProgress | null>(null);
  const [contextInvalidated, setContextInvalidated] = useState(false);

  // Load design tokens from storage
  useEffect(() => {
    loadDesignTokens().then(setDesignTokens);
    // Re-check when tab becomes visible (user may have changed tokens in Options)
    const onVisibility = () => { if (!document.hidden) loadDesignTokens().then(setDesignTokens); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const scanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let port: chrome.runtime.Port | null = null;
    let disposed = false;

    function connect() {
      if (disposed) return;
      if (!chrome.runtime?.id) {
        setContextInvalidated(true);
        return;
      }
      try {
        port = chrome.runtime.connect({ name: 'component-cop-panel' });
      } catch {
        setContextInvalidated(true);
        return;
      }
      portRef.current = port;
      const tabId = chrome.devtools.inspectedWindow.tabId;
      sendMsg(port, { type: 'PANEL_INIT', tabId });

      port.onMessage.addListener((msg: BackgroundToPanelMessage) => {
        switch (msg.type) {
          case 'REACT_STATUS':
            setReactStatus(msg.payload);
            break;
          case 'SCAN_COMPLETE':
            setLastScan(msg.payload);
            setScanning(false);
            if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
            if (portRef.current) {
              sendMsg(portRef.current, { type: 'GET_ALL_PAGES' });
              sendMsg(portRef.current, { type: 'GET_ALL_COMPONENTS' });
              sendMsg(portRef.current, { type: 'GET_PATTERNS' });
            }
            break;
          case 'ALL_PAGES':
            setPages(msg.payload);
            break;
          case 'ALL_COMPONENTS':
            setAllComponents(msg.payload);
            break;
          case 'ALL_PATTERNS':
            setPatterns(msg.payload);
            break;
          case 'ELEMENT_PICKED':
            setPicking(false);
            setPickerResult(msg.payload);
            setTab('picker');
            break;
          case 'PICKER_CANCELLED':
            setPicking(false);
            break;
          case 'NAVIGATE_STATUS':
            // {0, 0} means navigator exited — treat as no active navigation
            if (msg.payload.current === 0 && msg.payload.total === 0) {
              setNavStatus(null);
            } else {
              setNavStatus(msg.payload);
            }
            break;
          case 'CRAWL_PROGRESS': {
            const prev = crawlProgressRef.current;
            setCrawlProgress(msg.payload);
            crawlProgressRef.current = msg.payload;
            // Only refresh DB when scanned count actually changes or crawl finishes
            const countChanged = !prev || prev.scannedCount !== msg.payload.scannedCount;
            if (portRef.current && (msg.payload.status === 'done' || countChanged)) {
              sendMsg(portRef.current, { type: 'GET_ALL_PAGES' });
              sendMsg(portRef.current, { type: 'GET_ALL_COMPONENTS' });
              sendMsg(portRef.current, { type: 'GET_PATTERNS' });
            }
            break;
          }
          case 'DATA_CLEARED':
            setPages([]);
            setAllComponents([]);
            setPatterns([]);
            setDismissed(new Set());
            setLastScan(null);
            setPickerResult(null);
            setCrawlProgress(null);
            setSnapshots([]);
            setBaselineId(null);
            break;
          case 'DISMISSED_PATTERNS':
            setDismissed(new Set(msg.payload.map((d: DismissedPattern) => d.patternId)));
            break;
          case 'PATTERN_DISMISSED':
          case 'PATTERN_RESTORED':
          case 'DISMISSED_CLEARED':
            // Refresh dismissed set from IDB
            trySend({ type: 'GET_DISMISSED' });
            break;
          case 'ALL_SNAPSHOTS':
            setSnapshots(msg.payload);
            break;
          case 'SNAPSHOT_SAVED':
          case 'SNAPSHOT_DELETED':
            // Refresh snapshots list
            trySend({ type: 'GET_SNAPSHOTS' });
            break;
          case 'BASELINE_SET':
            setBaselineId(msg.id);
            break;
        }
      });

      port.onDisconnect.addListener(() => {
        portRef.current = null;
        if (!chrome.runtime?.id) {
          setContextInvalidated(true);
          return;
        }
        if (!disposed) setTimeout(connect, 1000);
      });

      sendMsg(port, { type: 'GET_ALL_PAGES' });
      sendMsg(port, { type: 'GET_ALL_COMPONENTS' });
      sendMsg(port, { type: 'GET_PATTERNS' });
      sendMsg(port, { type: 'GET_DISMISSED' });
      sendMsg(port, { type: 'GET_SNAPSHOTS' });

      // Load persisted baseline
      chrome.storage.local.get('baselineId').then((result) => {
        if (result.baselineId != null) setBaselineId(result.baselineId);
      }).catch(() => {});
    }

    connect();
    return () => {
      disposed = true;
      port?.disconnect();
      portRef.current = null;
      if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
    };
  }, []);

  const handleScan = useCallback(() => {
    setScanning(true);
    if (!trySend({ type: 'TRIGGER_SCAN', tabId: chrome.devtools.inspectedWindow.tabId })) {
      setScanning(false);
      return;
    }
    if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
    scanTimeoutRef.current = setTimeout(() => setScanning(false), UI_SCAN_TIMEOUT_MS);
  }, [trySend]);

  const handlePicker = useCallback(() => {
    if (trySend({ type: 'TRIGGER_PICKER', tabId: chrome.devtools.inspectedWindow.tabId })) {
      setPicking(true);
    }
  }, [trySend]);

  const handleCancelPicker = useCallback(() => {
    if (trySend({ type: 'CANCEL_PICKER', tabId: chrome.devtools.inspectedWindow.tabId })) {
      setPicking(false);
    }
  }, [trySend]);

  const handleNavigateStart = useCallback((target: { componentName: string; styleCategories: string[]; structureHash: string }) => {
    trySend({ type: 'NAVIGATE_SIMILAR', tabId: chrome.devtools.inspectedWindow.tabId, target });
  }, [trySend]);

  const handleNavigateNext = useCallback(() => {
    trySend({ type: 'NAVIGATE_NEXT', tabId: chrome.devtools.inspectedWindow.tabId });
  }, [trySend]);

  const handleNavigatePrev = useCallback(() => {
    trySend({ type: 'NAVIGATE_PREV', tabId: chrome.devtools.inspectedWindow.tabId });
  }, [trySend]);

  const handleNavigateExit = useCallback(() => {
    if (trySend({ type: 'NAVIGATE_EXIT', tabId: chrome.devtools.inspectedWindow.tabId })) {
      setNavStatus(null);
    }
  }, [trySend]);

  const handleGotoPageAndNavigate = useCallback((url: string, target: { componentName: string; styleCategories: string[]; structureHash: string }) => {
    if (trySend({ type: 'GOTO_PAGE_AND_NAVIGATE', tabId: chrome.devtools.inspectedWindow.tabId, url, target })) {
      setNavStatus(null);
    }
  }, [trySend]);

  const handleStartCrawl = useCallback((config: CrawlConfig) => {
    trySend({ type: 'TRIGGER_CRAWL', tabId: chrome.devtools.inspectedWindow.tabId, config });
  }, [trySend]);

  const handlePauseCrawl = useCallback(() => {
    trySend({ type: 'PAUSE_CRAWL', tabId: chrome.devtools.inspectedWindow.tabId });
  }, [trySend]);

  const handleStopCrawl = useCallback(() => {
    trySend({ type: 'STOP_CRAWL', tabId: chrome.devtools.inspectedWindow.tabId });
  }, [trySend]);

  const handleResumeCrawl = useCallback(() => {
    trySend({ type: 'RESUME_CRAWL', tabId: chrome.devtools.inspectedWindow.tabId });
  }, [trySend]);

  const handleClearData = useCallback(() => {
    trySend({ type: 'CLEAR_ALL_DATA' });
  }, [trySend]);

  if (contextInvalidated) {
    return (
      <div style={{
        height: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', textAlign: 'center',
        gap: 12, background: T.bg, color: T.text,
      }}>
        <div style={{ fontSize: 36, opacity: 0.3 }}>&#x26A0;</div>
        <h2 style={{ fontSize: 15, fontWeight: 600 }}>Extension Reloaded</h2>
        <p style={{ color: T.textMuted, fontSize: 12, maxWidth: 300, lineHeight: 1.5 }}>
          Close this DevTools panel and reopen it to reconnect.
        </p>
      </div>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'scan', label: 'Scan' },
    { key: 'picker', label: 'Picker' },
    { key: 'crawl', label: 'Crawl' },
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'export', label: 'Export' },
    { key: 'history', label: 'History' },
  ];

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: T.bg }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px', borderBottom: `1px solid ${T.border}`,
        background: T.bgSurface, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: T.accent, letterSpacing: '-0.3px' }}>
            Component Cop
          </span>
          <ReactBadge status={reactStatus} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <MiniStat label="components" value={allComponents.length} />
          <span style={{ color: T.textDim, fontSize: 10 }}>/</span>
          <MiniStat label="pages" value={pages.length} />
        </div>
      </div>

      {/* Tab bar */}
      <div style={{
        display: 'flex', borderBottom: `1px solid ${T.border}`,
        background: T.bgSurface, flexShrink: 0,
      }}>
        {tabs.map((t) => (
          <TabButton key={t.key} label={t.label} active={tab === t.key} onClick={() => setTab(t.key)} />
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {tab === 'scan' && (
          <ScanTab onScan={handleScan} scanning={scanning} lastScan={lastScan} reactStatus={reactStatus} />
        )}
        {tab === 'picker' && (
          <PickerTab
            onPick={handlePicker} onCancel={handleCancelPicker} picking={picking}
            result={pickerResult} reactStatus={reactStatus}
            navStatus={navStatus}
            onNavigateStart={handleNavigateStart} onNavigateNext={handleNavigateNext}
            onNavigatePrev={handleNavigatePrev} onNavigateExit={handleNavigateExit}
            onGotoPage={handleGotoPageAndNavigate}
          />
        )}
        {tab === 'crawl' && (
          <CrawlTab
            onStart={handleStartCrawl}
            onPause={handlePauseCrawl}
            onResume={handleResumeCrawl}
            onStop={handleStopCrawl}
            progress={crawlProgress}
            reactStatus={reactStatus}
            pages={pages}
          />
        )}
        {tab === 'dashboard' && (
          <DashboardTab pages={pages} components={allComponents} patterns={patterns} dismissed={dismissed} onDismiss={(id, reason) => { trySend({ type: 'DISMISS_PATTERN', patternId: id, reason }); }} onRestore={(id) => { trySend({ type: 'RESTORE_PATTERN', patternId: id }); }} designTokens={designTokens} />
        )}
        {tab === 'export' && (
          <ExportTab components={allComponents} pages={pages} patterns={patterns} />
        )}
        {tab === 'history' && (
          <HistoryTab
            snapshots={snapshots}
            baselineId={baselineId}
            onSave={(label) => { trySend({ type: 'SAVE_SNAPSHOT', label }); }}
            onDelete={(id) => { trySend({ type: 'DELETE_SNAPSHOT', id }); }}
            onSetBaseline={(id) => { setBaselineId(id); chrome.storage.local.set({ baselineId: id }); }}
            onClearBaseline={() => { setBaselineId(null); chrome.storage.local.remove('baselineId'); }}
          />
        )}
      </div>

      {/* Footer */}
      <div style={{
        borderTop: `1px solid ${T.border}`, padding: '8px 16px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexShrink: 0, background: T.bgSurface,
      }}>
        <span style={{ color: T.textDim, fontSize: 11 }}>v0.1.0</span>
        <HoverButton color={T.textDim} hoverColor={T.red} onClick={handleClearData}>
          Clear Data
        </HoverButton>
      </div>
    </div>
  );
}

