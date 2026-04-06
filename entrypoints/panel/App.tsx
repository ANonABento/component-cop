import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  BackgroundToPanelMessage,
  PanelToBackgroundMessage,
} from '../../shared/messages';
import type { ComponentData, CrawlConfig, CrawlProgress, DismissedPattern, ReactDetectionResult, ScanResult, SimilarityMatch, StoredComponent, StoredPage, StoredPattern } from '../../shared/types';
import { DEFAULT_CRAWL_CONFIG, EXACT_MATCH_THRESHOLD, STRONG_MATCH_THRESHOLD } from '../../shared/constants';
import { variantLabel } from '../../shared/variant-label';
import { computeStyleDiff, type StyleDiffEntry } from '../../lib/style-diff';

// ─── Design tokens (dark theme matching Chrome DevTools) ───
const T = {
  bg: '#1e1e2e',
  bgSurface: '#262637',
  bgHover: '#2e2e42',
  bgActive: '#363650',
  border: '#333348',
  borderLight: '#2a2a3d',
  text: '#e0e0e0',
  textMuted: '#8b8da0',
  textDim: '#6b6d80',
  accent: '#818cf8',
  accentDim: '#6366f1',
  green: '#34d399',
  yellow: '#fbbf24',
  red: '#f87171',
  orange: '#fb923c',
  mono: "'SF Mono', 'Fira Code', 'JetBrains Mono', Menlo, monospace",
  radius: 8,
  radiusSm: 6,
} as const;

type Tab = 'scan' | 'picker' | 'crawl' | 'dashboard' | 'export';

interface PickerResult {
  component: ComponentData;
  matches: SimilarityMatch[];
}

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
  const [navStatus, setNavStatus] = useState<{ current: number; total: number } | null>(null);
  const [crawlProgress, setCrawlProgress] = useState<CrawlProgress | null>(null);
  const crawlProgressRef = useRef<CrawlProgress | null>(null);
  const [contextInvalidated, setContextInvalidated] = useState(false);
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
            setLastScan(null);
            setPickerResult(null);
            setCrawlProgress(null);
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
    }

    connect();
    return () => {
      disposed = true;
      port?.disconnect();
      portRef.current = null;
    };
  }, []);

  const handleScan = useCallback(() => {
    if (!portRef.current || !chrome.runtime?.id) return;
    setScanning(true);
    try {
      sendMsg(portRef.current, {
        type: 'TRIGGER_SCAN',
        tabId: chrome.devtools.inspectedWindow.tabId,
      });
    } catch {
      setContextInvalidated(true);
      setScanning(false);
      return;
    }
    if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
    scanTimeoutRef.current = setTimeout(() => setScanning(false), 30_000);
  }, []);

  const handlePicker = useCallback(() => {
    if (!portRef.current || !chrome.runtime?.id) return;
    setPicking(true);
    sendMsg(portRef.current, {
      type: 'TRIGGER_PICKER',
      tabId: chrome.devtools.inspectedWindow.tabId,
    });
  }, []);

  const handleCancelPicker = useCallback(() => {
    if (!portRef.current || !chrome.runtime?.id) return;
    setPicking(false);
    sendMsg(portRef.current, {
      type: 'CANCEL_PICKER',
      tabId: chrome.devtools.inspectedWindow.tabId,
    });
  }, []);

  const handleNavigateStart = useCallback((target: { componentName: string; styleCategories: string[]; structureHash: string }) => {
    if (!portRef.current || !chrome.runtime?.id) return;
    sendMsg(portRef.current, {
      type: 'NAVIGATE_SIMILAR',
      tabId: chrome.devtools.inspectedWindow.tabId,
      target,
    });
  }, []);

  const handleNavigateNext = useCallback(() => {
    if (!portRef.current || !chrome.runtime?.id) return;
    sendMsg(portRef.current, {
      type: 'NAVIGATE_NEXT',
      tabId: chrome.devtools.inspectedWindow.tabId,
    });
  }, []);

  const handleNavigatePrev = useCallback(() => {
    if (!portRef.current || !chrome.runtime?.id) return;
    sendMsg(portRef.current, {
      type: 'NAVIGATE_PREV',
      tabId: chrome.devtools.inspectedWindow.tabId,
    });
  }, []);

  const handleNavigateExit = useCallback(() => {
    if (!portRef.current || !chrome.runtime?.id) return;
    setNavStatus(null);
    sendMsg(portRef.current, {
      type: 'NAVIGATE_EXIT',
      tabId: chrome.devtools.inspectedWindow.tabId,
    });
  }, []);

  const handleGotoPageAndNavigate = useCallback((url: string, target: { componentName: string; styleCategories: string[]; structureHash: string }) => {
    if (!portRef.current || !chrome.runtime?.id) return;
    setNavStatus(null);
    sendMsg(portRef.current, {
      type: 'GOTO_PAGE_AND_NAVIGATE',
      tabId: chrome.devtools.inspectedWindow.tabId,
      url,
      target,
    });
  }, []);

  const handleStartCrawl = useCallback((config: CrawlConfig) => {
    if (!portRef.current || !chrome.runtime?.id) return;
    sendMsg(portRef.current, {
      type: 'TRIGGER_CRAWL',
      tabId: chrome.devtools.inspectedWindow.tabId,
      config,
    });
  }, []);

  const handlePauseCrawl = useCallback(() => {
    if (!portRef.current || !chrome.runtime?.id) return;
    sendMsg(portRef.current, {
      type: 'PAUSE_CRAWL',
      tabId: chrome.devtools.inspectedWindow.tabId,
    });
  }, []);

  const handleStopCrawl = useCallback(() => {
    if (!portRef.current || !chrome.runtime?.id) return;
    sendMsg(portRef.current, {
      type: 'STOP_CRAWL',
      tabId: chrome.devtools.inspectedWindow.tabId,
    });
  }, []);

  const handleResumeCrawl = useCallback(() => {
    if (!portRef.current || !chrome.runtime?.id) return;
    sendMsg(portRef.current, {
      type: 'RESUME_CRAWL',
      tabId: chrome.devtools.inspectedWindow.tabId,
    });
  }, []);

  const handleClearData = useCallback(() => {
    if (!portRef.current || !chrome.runtime?.id) return;
    sendMsg(portRef.current, { type: 'CLEAR_ALL_DATA' });
  }, []);

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
          <DashboardTab pages={pages} components={allComponents} patterns={patterns} dismissed={dismissed} onDismiss={(id, reason) => portRef.current?.postMessage({ type: 'DISMISS_PATTERN', patternId: id, reason } satisfies PanelToBackgroundMessage)} onRestore={(id) => portRef.current?.postMessage({ type: 'RESTORE_PATTERN', patternId: id } satisfies PanelToBackgroundMessage)} />
        )}
        {tab === 'export' && (
          <ExportTab components={allComponents} pages={pages} patterns={patterns} />
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

// ─── Shared UI primitives ───

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <span style={{ fontSize: 11, color: T.textMuted }}>
      <strong style={{ color: T.text, fontWeight: 600 }}>{value.toLocaleString()}</strong>{' '}{label}
    </span>
  );
}

function ReactBadge({ status }: { status: ReactDetectionResult | null }) {
  if (!status) return <PillBadge color={T.textDim}>detecting...</PillBadge>;
  if (!status.found) return <PillBadge color={T.textDim}>no react</PillBadge>;
  if (status.mode === 'dev') {
    return <PillBadge color={T.green}>{status.version ?? 'React'} dev</PillBadge>;
  }
  return <PillBadge color={T.yellow}>{status.version ?? 'React'} prod</PillBadge>;
}

function PillBadge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 12,
      background: `${color}18`, color, letterSpacing: '0.3px', textTransform: 'uppercase',
    }}>
      {children}
    </span>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: '9px 0', border: 'none',
        borderBottom: active ? `2px solid ${T.accent}` : '2px solid transparent',
        background: active ? T.bgActive : 'transparent',
        color: active ? T.text : T.textMuted,
        cursor: 'pointer', fontSize: 12, fontWeight: active ? 600 : 400,
        transition: 'all 0.15s', fontFamily: 'inherit',
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = T.bgHover; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
    >
      {label}
    </button>
  );
}

function ActionButton({ children, onClick, disabled, variant = 'primary', small }: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'danger' | 'secondary' | 'ghost';
  small?: boolean;
}) {
  const colors = {
    primary: { bg: T.accentDim, hover: T.accent },
    danger: { bg: '#dc2626', hover: T.red },
    secondary: { bg: T.bgActive, hover: '#45456a' },
    ghost: { bg: 'transparent', hover: T.bgHover },
  };
  const c = colors[variant];

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: small ? '5px 10px' : '8px 16px',
        background: disabled ? T.bgActive : c.bg,
        color: disabled ? T.textDim : (variant === 'ghost' ? T.textMuted : '#fff'),
        border: variant === 'ghost' ? `1px solid ${T.border}` : 'none',
        borderRadius: T.radiusSm,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontWeight: 600, fontSize: small ? 11 : 12,
        fontFamily: 'inherit', transition: 'all 0.15s',
        display: 'inline-flex', alignItems: 'center', gap: 6,
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = c.hover; }}
      onMouseLeave={(e) => { if (!disabled) e.currentTarget.style.background = disabled ? T.bgActive : c.bg; }}
    >
      {children}
    </button>
  );
}

function HoverButton({ children, color, hoverColor, onClick }: {
  children: React.ReactNode; color: string; hoverColor: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'none', border: 'none', color, cursor: 'pointer',
        fontSize: 11, padding: '2px 6px', borderRadius: 4, transition: 'color 0.15s',
        fontFamily: 'inherit',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = hoverColor; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = color; }}
    >
      {children}
    </button>
  );
}

function SearchInput({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder: string;
}) {
  return (
    <input
      type="text"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: '100%', padding: '7px 10px',
        background: T.bgSurface, border: `1px solid ${T.border}`,
        borderRadius: T.radiusSm, color: T.text, fontSize: 12,
        outline: 'none', fontFamily: 'inherit',
      }}
      onFocus={(e) => { e.currentTarget.style.borderColor = T.accent; }}
      onBlur={(e) => { e.currentTarget.style.borderColor = T.border; }}
    />
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
      fontSize: 13, fontWeight: 600, color: T.text,
    }}>
      {children}
    </div>
  );
}

function CountBadge({ count }: { count: number }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 10,
      background: T.bgActive, color: T.textMuted,
    }}>
      {count}
    </span>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '40px 20px', color: T.textDim }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: T.textMuted, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 12, lineHeight: 1.5, maxWidth: 280, margin: '0 auto' }}>{description}</div>
    </div>
  );
}

function ClickToCopy({ text }: { text: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(
      () => { setStatus('copied'); setTimeout(() => setStatus('idle'), 1500); },
      () => { setStatus('failed'); setTimeout(() => setStatus('idle'), 2000); },
    );
  }, [text]);

  return (
    <span
      onClick={handleClick}
      style={{ cursor: 'pointer', borderBottom: `1px dashed ${T.textDim}`, transition: 'color 0.15s' }}
      title="Click to copy"
    >
      {status === 'copied' ? 'Copied!' : status === 'failed' ? 'Copy failed' : text}
    </span>
  );
}

function Spinner() {
  return (
    <span style={{
      display: 'inline-block', width: 12, height: 12,
      border: '2px solid rgba(255,255,255,0.2)', borderTopColor: '#fff',
      borderRadius: '50%', animation: 'xray-spin 0.6s linear infinite',
    }} />
  );
}

function PulsingDot() {
  return (
    <span style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      background: T.accent, animation: 'xray-pulse 1.5s ease-in-out infinite',
    }} />
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      padding: 12, background: T.bgSurface, border: `1px solid ${T.border}`,
      borderRadius: T.radius, textAlign: 'center',
    }}>
      <div style={{ fontSize: 22, fontWeight: 700, color, fontFamily: T.mono }}>
        {value.toLocaleString()}
      </div>
      <div style={{
        fontSize: 10, color: T.textDim, marginTop: 2,
        textTransform: 'uppercase', letterSpacing: '0.5px',
      }}>
        {label}
      </div>
    </div>
  );
}

// ─── Scan Tab ───

function ScanTab({ onScan, scanning, lastScan, reactStatus }: {
  onScan: () => void; scanning: boolean; lastScan: ScanResult | null; reactStatus: ReactDetectionResult | null;
}) {
  const [filter, setFilter] = useState('');
  const disabled = scanning || !reactStatus?.found;

  const filteredComponents = useMemo(() => {
    if (!lastScan) return [];
    if (!filter) return lastScan.components;
    const q = filter.toLowerCase();
    return lastScan.components.filter((c) =>
      c.componentName.toLowerCase().includes(q) ||
      (c.sourceFile ?? '').toLowerCase().includes(q)
    );
  }, [lastScan, filter]);

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
        <ActionButton onClick={onScan} disabled={disabled}>
          {scanning ? (<><Spinner /> Scanning...</>) : 'Scan Page'}
        </ActionButton>
        {reactStatus?.mode === 'prod' && (
          <span style={{ fontSize: 11, color: T.yellow, opacity: 0.8 }}>
            Prod build — names may be minified
          </span>
        )}
      </div>

      {!reactStatus?.found && (
        <EmptyState title="No React detected" description="Navigate to a page with a React app and reopen DevTools." />
      )}

      {lastScan && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div>
              <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{lastScan.pagePath}</span>
              <span style={{ fontSize: 11, color: T.textMuted, marginLeft: 8 }}>
                {lastScan.components.length} components
              </span>
            </div>
          </div>

          <div style={{ marginBottom: 10 }}>
            <SearchInput value={filter} onChange={setFilter} placeholder="Filter components..." />
          </div>

          <ComponentTable components={filteredComponents} />

          {lastScan.links.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <span style={{ fontSize: 11, color: T.textDim }}>
                {lastScan.links.length} navigable links discovered
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Component Table ───

function ComponentTable({ components }: { components: ComponentData[] }) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const handleCopyRow = useCallback((text: string, idx: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1500);
    }).catch(() => {
      console.warn('[component-cop] Clipboard write failed');
    });
  }, []);

  return (
    <div style={{ borderRadius: T.radius, border: `1px solid ${T.border}`, overflow: 'hidden' }}>
      <div style={{
        display: 'grid', gridTemplateColumns: '2fr 2fr 80px',
        background: T.bgSurface, padding: '8px 12px',
        fontSize: 10, fontWeight: 600, color: T.textDim,
        textTransform: 'uppercase', letterSpacing: '0.5px',
        borderBottom: `1px solid ${T.border}`,
      }}>
        <span>Component</span>
        <span>Source</span>
        <span style={{ textAlign: 'right' }}>Size</span>
      </div>

      <div style={{ maxHeight: 400, overflow: 'auto' }}>
        {components.map((comp, i) => {
          const source = comp.sourceFile
            ? `${shortenPath(comp.sourceFile)}:${comp.sourceLine}`
            : 'unknown';
          const isCopied = copiedIdx === i;

          return (
            <div
              key={`${comp.componentName}-${comp.domSelector}-${i}`}
              onClick={() => handleCopyRow(`${comp.componentName} ${source}`, i)}
              style={{
                display: 'grid', gridTemplateColumns: '2fr 2fr 80px',
                padding: '7px 12px', borderBottom: `1px solid ${T.borderLight}`,
                cursor: 'pointer', transition: 'background 0.1s',
                background: isCopied ? 'rgba(99,102,241,0.1)' : 'transparent',
              }}
              onMouseEnter={(e) => { if (!isCopied) e.currentTarget.style.background = T.bgHover; }}
              onMouseLeave={(e) => { if (!isCopied) e.currentTarget.style.background = 'transparent'; }}
              title="Click to copy"
            >
              <span style={{
                fontSize: 12, fontWeight: 500, color: T.text, fontFamily: T.mono,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {comp.componentName}
              </span>
              <span style={{
                fontSize: 11, color: isCopied ? T.green : T.textDim, fontFamily: T.mono,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {isCopied ? 'Copied!' : source}
              </span>
              <span style={{ fontSize: 11, color: T.textDim, textAlign: 'right', fontFamily: T.mono }}>
                {Math.round(comp.boundingRect.width)}x{Math.round(comp.boundingRect.height)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Picker Tab ───

function PickerTab({ onPick, onCancel, picking, result, reactStatus, navStatus, onNavigateStart, onNavigateNext, onNavigatePrev, onNavigateExit, onGotoPage }: {
  onPick: () => void; onCancel: () => void; picking: boolean;
  result: PickerResult | null; reactStatus: ReactDetectionResult | null;
  navStatus: { current: number; total: number } | null;
  onNavigateStart: (target: { componentName: string; styleCategories: string[]; structureHash: string }) => void;
  onNavigateNext: () => void; onNavigatePrev: () => void; onNavigateExit: () => void;
  onGotoPage: (url: string, target: { componentName: string; styleCategories: string[]; structureHash: string }) => void;
}) {
  const disabled = !reactStatus?.found;
  const [copied, setCopied] = useState<'json' | 'llm' | false>(false);

  const generatePickerExport = useCallback(() => {
    if (!result) return '';
    return JSON.stringify({
      selected: {
        name: result.component.componentName,
        source: result.component.sourceFile
          ? `${result.component.sourceFile}:${result.component.sourceLine}` : null,
        page: result.component.pagePath,
        selector: result.component.domSelector,
        styleFingerprint: result.component.styleFingerprint,
        structureHash: result.component.structureHash,
        size: `${Math.round(result.component.boundingRect.width)}x${Math.round(result.component.boundingRect.height)}`,
        domStructure: result.component.domStructure,
        keyStyles: extractKeyStyles(result.component.computedStyles),
      },
      similarComponents: result.matches.map((m) => ({
        name: m.component.componentName,
        source: m.component.sourceFile
          ? `${m.component.sourceFile}:${m.component.sourceLine}` : null,
        page: m.component.pagePath,
        score: Math.round(m.score * 100),
        styleScore: Math.round(m.styleScore * 100),
        structureScore: Math.round(m.structureScore * 100),
        domStructure: m.component.domStructure,
        keyStyles: extractKeyStyles(m.component.computedStyles),
      })),
    }, null, 2);
  }, [result]);

  const generateLLMExport = useCallback(() => {
    if (!result) return '';
    const c = result.component;

    let output = '<component_audit>\n';
    output += `You are auditing a React application for component consistency and consolidation opportunities.\n`;
    output += `A user picked a component and the tool found ${result.matches.length} similar instances across scanned pages.\n\n`;

    output += '<selected_component>\n';
    output += `  name: ${c.componentName}\n`;
    output += `  source: ${c.sourceFile ? `${c.sourceFile}:${c.sourceLine}` : 'unknown'}\n`;
    output += `  page: ${c.pagePath}\n`;
    output += `  selector: ${c.domSelector}\n`;
    output += `  size: ${Math.round(c.boundingRect.width)}x${Math.round(c.boundingRect.height)}\n`;
    output += `  fingerprint: ${c.styleFingerprint}\n`;
    output += `  structure_hash: ${c.structureHash}\n\n`;
    output += '  <dom_structure>\n';
    for (const line of c.domStructure.split('\n')) {
      output += `    ${line}\n`;
    }
    output += '  </dom_structure>\n\n';
    output += '  <key_styles>\n';
    const styles = extractKeyStyles(c.computedStyles);
    for (const [prop, val] of Object.entries(styles)) {
      output += `    ${prop}: ${val}\n`;
    }
    output += '  </key_styles>\n';
    output += '</selected_component>\n\n';

    if (result.matches.length > 0) {
      output += '<similar_instances>\n';
      for (const match of result.matches) {
        const m = match.component;
        const pct = Math.round(match.score * 100);
        output += `  <instance similarity="${pct}%" style_score="${Math.round(match.styleScore * 100)}%" structure_score="${Math.round(match.structureScore * 100)}%">\n`;
        output += `    name: ${m.componentName}\n`;
        output += `    source: ${m.sourceFile ? `${m.sourceFile}:${m.sourceLine}` : 'unknown'}\n`;
        output += `    page: ${m.pagePath}\n`;
        output += `    selector: ${m.domSelector}\n`;
        output += `    size: ${Math.round(m.boundingRect.width)}x${Math.round(m.boundingRect.height)}\n`;
        output += `    fingerprint: ${m.styleFingerprint}\n`;
        output += `    structure_hash: ${m.structureHash}\n\n`;
        output += '    <dom_structure>\n';
        for (const line of m.domStructure.split('\n')) {
          output += `      ${line}\n`;
        }
        output += '    </dom_structure>\n\n';
        output += '    <key_styles>\n';
        const mStyles = extractKeyStyles(m.computedStyles);
        for (const [prop, val] of Object.entries(mStyles)) {
          output += `      ${prop}: ${val}\n`;
        }
        output += '    </key_styles>\n';
        output += '  </instance>\n\n';
      }
      output += '</similar_instances>\n\n';
    }

    output += '<instructions>\n';
    output += 'Analyze the selected component and its similar instances:\n\n';
    output += '1. **Consolidation check**: Are these the same logical component? Could they share a single implementation?\n';
    output += '2. **Style consistency**: Compare key_styles across instances. Flag any visual inconsistencies (different fonts, colors, spacing, borders).\n';
    output += '3. **Structure consistency**: Compare dom_structure trees. Are they using the same HTML patterns? Different nesting or element choices?\n';
    output += '4. **Hardcoded values**: Look for values that should be design tokens or shared constants (colors, sizes, spacing).\n';
    output += '5. **Recommendations**: For each inconsistency, suggest which variant should be canonical and what changes are needed.\n';
    output += '</instructions>\n';
    output += '</component_audit>\n';

    return output;
  }, [result]);

  const handleCopyJSON = useCallback(() => {
    const text = generatePickerExport();
    if (!text) return;
    navigator.clipboard.writeText(text).then(
      () => { setCopied('json'); setTimeout(() => setCopied(false), 2000); },
      () => {},
    );
  }, [generatePickerExport]);

  const handleCopyLLM = useCallback(() => {
    const text = generateLLMExport();
    if (!text) return;
    navigator.clipboard.writeText(text).then(
      () => { setCopied('llm'); setTimeout(() => setCopied(false), 2000); },
      () => {},
    );
  }, [generateLLMExport]);

  const handleDownloadExport = useCallback(() => {
    const text = generatePickerExport();
    if (!text) return;
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `picker-${result?.component.componentName ?? 'export'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [generatePickerExport, result]);

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
        {picking ? (
          <>
            <ActionButton onClick={onCancel} variant="danger">Cancel</ActionButton>
            <span style={{ fontSize: 12, color: T.accent, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
              <PulsingDot /> Click to lock, scroll/arrows to navigate, click to confirm
            </span>
          </>
        ) : (
          <ActionButton onClick={onPick} disabled={disabled}>Pick Element</ActionButton>
        )}
      </div>

      {!reactStatus?.found && (
        <EmptyState title="No React detected" description="Scan a page first to enable the picker." />
      )}

      {result && (
        <div>
          {/* Selected component card */}
          <div style={{
            background: 'rgba(99, 102, 241, 0.08)',
            border: '1px solid rgba(99, 102, 241, 0.2)',
            borderRadius: T.radius, padding: 14, marginBottom: 12,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={{ fontSize: 13, fontWeight: 700, color: T.accent, fontFamily: T.mono }}>
                  &lt;{result.component.componentName}&gt;
                </span>
                <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <ClickToCopy text={result.component.sourceFile
                    ? `${shortenPath(result.component.sourceFile)}:${result.component.sourceLine}`
                    : 'source unknown'
                  } />
                  <span>{Math.round(result.component.boundingRect.width)}x{Math.round(result.component.boundingRect.height)}</span>
                  <span>{result.component.pagePath}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <ActionButton onClick={handleCopyLLM} variant="secondary" small>
                  {copied === 'llm' ? 'Copied!' : 'Copy for LLM'}
                </ActionButton>
                <ActionButton onClick={handleCopyJSON} variant="ghost" small>
                  {copied === 'json' ? 'Copied!' : 'JSON'}
                </ActionButton>
                <ActionButton onClick={handleDownloadExport} variant="ghost" small>
                  DL
                </ActionButton>
              </div>
            </div>
          </div>

          {/* Navigation controls */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
            padding: '8px 12px', background: T.bgSurface, borderRadius: T.radiusSm,
            border: `1px solid ${T.borderLight}`,
          }}>
            {navStatus && navStatus.total > 0 ? (
              <>
                <span style={{ fontSize: 12, fontWeight: 700, color: T.green, fontFamily: T.mono }}>
                  {navStatus.current} / {navStatus.total}
                </span>
                <span style={{ fontSize: 11, color: T.textDim }}>on this page</span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                  <ActionButton onClick={onNavigatePrev} variant="ghost" small>Prev</ActionButton>
                  <ActionButton onClick={onNavigateNext} variant="ghost" small>Next</ActionButton>
                  <ActionButton onClick={onNavigateExit} variant="ghost" small>Stop</ActionButton>
                </div>
              </>
            ) : navStatus && navStatus.total === 0 ? (
              <>
                <span style={{ fontSize: 11, color: T.textDim }}>No matches on this page</span>
                <div style={{ marginLeft: 'auto' }}>
                  <ActionButton onClick={onNavigateExit} variant="ghost" small>Close</ActionButton>
                </div>
              </>
            ) : (
              <ActionButton
                onClick={() => onNavigateStart({
                  componentName: result.component.componentName,
                  styleCategories: result.component.styleCategories,
                  structureHash: result.component.structureHash,
                })}
                variant="secondary"
                small
              >
                Find on Page
              </ActionButton>
            )}
          </div>

          <SimilarMatchesByPage
            matches={result.matches}
            currentPagePath={result.component.pagePath}
            target={{
              componentName: result.component.componentName,
              styleCategories: result.component.styleCategories,
              structureHash: result.component.structureHash,
            }}
            onGotoPage={onGotoPage}
          />
        </div>
      )}

      {!result && !picking && (
        <div style={{ color: T.textMuted, fontSize: 12, lineHeight: 1.8, padding: '16px 0' }}>
          <p style={{ marginBottom: 8, fontWeight: 600, color: T.text }}>How to use the Picker:</p>
          <ol style={{ margin: 0, paddingLeft: 20 }}>
            <li><strong style={{ color: T.text }}>Hover</strong> to highlight elements</li>
            <li><strong style={{ color: T.text }}>Click</strong> to lock onto an element</li>
            <li><strong style={{ color: T.text }}>Scroll / Arrow keys</strong> to navigate the component tree</li>
            <li><strong style={{ color: T.text }}>Click again or Enter</strong> to confirm</li>
            <li><strong style={{ color: T.text }}>Esc</strong> to go back (unlock / cancel)</li>
          </ol>
        </div>
      )}
    </div>
  );
}

function MatchRow({ match }: { match: SimilarityMatch }) {
  const pct = Math.round(match.score * 100);
  let color: string;
  let label: string;
  if (match.score >= EXACT_MATCH_THRESHOLD) { color = T.green; label = 'Exact'; }
  else if (match.score >= STRONG_MATCH_THRESHOLD) { color = T.accent; label = 'Strong'; }
  else { color = T.yellow; label = 'Similar'; }

  return (
    <div style={{
      padding: '10px 0', borderBottom: `1px solid ${T.borderLight}`,
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: T.text, fontFamily: T.mono }}>
          {match.component.componentName}
        </span>
        <div style={{ fontSize: 10, color: T.textDim, marginTop: 2 }}>
          <ClickToCopy text={match.component.sourceFile
            ? `${shortenPath(match.component.sourceFile)}:${match.component.sourceLine}` : 'unknown'
          } />
          <span style={{ marginLeft: 8 }}>{match.component.pagePath}</span>
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
        <span style={{
          fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
          background: `${color}18`, color,
        }}>
          {label} {pct}%
        </span>
        <div style={{ fontSize: 9, color: T.textDim, marginTop: 3, fontFamily: T.mono }}>
          s:{Math.round(match.styleScore * 100)} d:{Math.round(match.structureScore * 100)}
        </div>
      </div>
    </div>
  );
}

// ─── Similar Matches by Page ───

function SimilarMatchesByPage({ matches, currentPagePath, target, onGotoPage }: {
  matches: SimilarityMatch[];
  currentPagePath: string;
  target: { componentName: string; styleCategories: string[]; structureHash: string };
  onGotoPage: (url: string, target: { componentName: string; styleCategories: string[]; structureHash: string }) => void;
}) {
  const { currentPageMatches, otherPageGroups, totalOtherPages } = useMemo(() => {
    const current: SimilarityMatch[] = [];
    const byPage = new Map<string, { url: string; matches: SimilarityMatch[] }>();

    for (const m of matches) {
      if (m.component.pagePath === currentPagePath) {
        current.push(m);
      } else {
        const key = m.component.pagePath;
        const existing = byPage.get(key);
        if (existing) {
          existing.matches.push(m);
        } else {
          byPage.set(key, { url: m.component.pageUrl, matches: [m] });
        }
      }
    }

    const groups = Array.from(byPage.entries())
      .map(([pagePath, data]) => ({ pagePath, ...data }))
      .sort((a, b) => b.matches.length - a.matches.length);

    return { currentPageMatches: current, otherPageGroups: groups, totalOtherPages: groups.length };
  }, [matches, currentPagePath]);

  if (matches.length === 0) {
    return <EmptyState title="No matches found" description="Try scanning more pages to build up the component database." />;
  }

  return (
    <div>
      {/* Current page matches */}
      <SectionHeader>
        This Page <CountBadge count={currentPageMatches.length} />
      </SectionHeader>
      {currentPageMatches.length === 0 ? (
        <div style={{ fontSize: 11, color: T.textDim, marginBottom: 16, padding: '8px 0' }}>
          No matches on the current page
        </div>
      ) : (
        <div style={{ marginBottom: 16 }}>
          {currentPageMatches.map((match) => (
            <MatchRow key={match.component.id} match={match} />
          ))}
        </div>
      )}

      {/* Other page matches */}
      {totalOtherPages > 0 && (
        <>
          <SectionHeader>
            Other Pages <CountBadge count={totalOtherPages} />
          </SectionHeader>
          {otherPageGroups.map((group) => (
            <div
              key={group.pagePath}
              style={{
                marginBottom: 12, background: T.bgSurface,
                border: `1px solid ${T.border}`, borderRadius: T.radius,
                overflow: 'hidden',
              }}
            >
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 12px', borderBottom: `1px solid ${T.borderLight}`,
              }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>
                    {group.pagePath}
                  </span>
                  <span style={{ fontSize: 10, color: T.textDim, marginLeft: 8 }}>
                    {group.matches.length} match{group.matches.length !== 1 ? 'es' : ''}
                  </span>
                </div>
                <ActionButton
                  onClick={() => onGotoPage(group.url, target)}
                  variant="secondary"
                  small
                >
                  Go &amp; Find
                </ActionButton>
              </div>
              <div style={{ padding: '0 12px' }}>
                {group.matches.map((match) => (
                  <MatchRow key={match.component.id} match={match} />
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ─── Crawl Tab ───

function CrawlTab({ onStart, onPause, onResume, onStop, progress, reactStatus, pages }: {
  onStart: (config: CrawlConfig) => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  progress: CrawlProgress | null;
  reactStatus: ReactDetectionResult | null;
  pages: StoredPage[];
}) {
  const [maxPages, setMaxPages] = useState(DEFAULT_CRAWL_CONFIG.maxPages);
  const [delay, setDelay] = useState(DEFAULT_CRAWL_CONFIG.delayMs);
  const [excludeInput, setExcludeInput] = useState(DEFAULT_CRAWL_CONFIG.excludePatterns.join(', '));

  const isCrawling = progress?.status === 'crawling';
  const isPaused = progress?.status === 'paused';
  const isDone = progress?.status === 'done';
  const isIdle = !progress || progress.status === 'idle';
  const disabled = !reactStatus?.found;

  const handleStart = useCallback(() => {
    const excludePatterns = excludeInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    onStart({
      maxPages,
      delayMs: delay,
      excludePatterns,
      maxSamplesPerPattern: DEFAULT_CRAWL_CONFIG.maxSamplesPerPattern,
    });
  }, [maxPages, delay, excludeInput, onStart]);

  // Count unvisited links from known pages
  const knownPaths = useMemo(() => new Set(pages.map((p) => p.pagePath)), [pages]);
  const unvisitedLinks = useMemo(() => {
    const links = new Set<string>();
    for (const page of pages) {
      for (const link of page.links) {
        if (!knownPaths.has(link)) {
          links.add(link);
        }
      }
    }
    return links.size;
  }, [pages, knownPaths]);

  return (
    <div>
      {/* Status banner when crawling */}
      {(isCrawling || isPaused) && progress && (
        <div style={{
          padding: 14, marginBottom: 16, borderRadius: T.radius,
          background: isCrawling ? 'rgba(99, 102, 241, 0.08)' : 'rgba(251, 191, 36, 0.08)',
          border: `1px solid ${isCrawling ? 'rgba(99, 102, 241, 0.2)' : 'rgba(251, 191, 36, 0.2)'}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {isCrawling && <PulsingDot />}
              <span style={{ fontSize: 13, fontWeight: 700, color: isCrawling ? T.accent : T.yellow }}>
                {isCrawling ? 'Crawling...' : 'Paused'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {isCrawling && (
                <ActionButton onClick={onPause} variant="secondary" small>Pause</ActionButton>
              )}
              {isPaused && (
                <ActionButton onClick={onResume} variant="primary" small>Resume</ActionButton>
              )}
              <ActionButton onClick={onStop} variant="danger" small>Stop</ActionButton>
            </div>
          </div>

          {/* Progress bar */}
          <div style={{
            height: 6, borderRadius: 3, background: T.bgActive, overflow: 'hidden', marginBottom: 8,
          }}>
            <div style={{
              height: '100%', borderRadius: 3,
              background: isCrawling ? T.accent : T.yellow,
              width: progress.totalDiscovered > 0
                ? `${Math.round((progress.scannedCount / progress.totalDiscovered) * 100)}%`
                : '0%',
              transition: 'width 0.3s ease-out',
            }} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: T.textMuted }}>
            <span>
              <strong style={{ color: T.text }}>{progress.scannedCount}</strong> scanned
            </span>
            <span>
              <strong style={{ color: T.text }}>{progress.totalDiscovered}</strong> discovered
            </span>
            {progress.currentPath && (
              <span style={{ fontFamily: T.mono, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {progress.currentPath}
              </span>
            )}
          </div>

          {/* Errors */}
          {progress.errors.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 10, color: T.red }}>
              {progress.errors.slice(-3).map((err, i) => (
                <div key={i} style={{ opacity: 0.8 }}>{err}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Done banner */}
      {isDone && progress && progress.scannedCount > 0 && (
        <div style={{
          padding: 14, marginBottom: 16, borderRadius: T.radius,
          background: 'rgba(52, 211, 153, 0.08)',
          border: '1px solid rgba(52, 211, 153, 0.2)',
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.green, marginBottom: 4 }}>
            Crawl Complete
          </div>
          <div style={{ fontSize: 11, color: T.textMuted }}>
            Scanned <strong style={{ color: T.text }}>{progress.scannedCount}</strong> pages,
            discovered <strong style={{ color: T.text }}>{progress.totalDiscovered}</strong> total links.
            {progress.errors.length > 0 && (
              <span style={{ color: T.yellow }}> {progress.errors.length} errors.</span>
            )}
          </div>
        </div>
      )}

      {/* Config form (when idle or done) */}
      {(isIdle || isDone) && (
        <div>
          <SectionHeader>Crawl Configuration</SectionHeader>

          {/* Pre-crawl stats */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16,
          }}>
            <StatCard label="Pages Scanned" value={pages.length} color={T.accent} />
            <StatCard label="Unvisited Links" value={unvisitedLinks} color={unvisitedLinks > 0 ? T.green : T.textDim} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 11, color: T.textMuted, display: 'block', marginBottom: 4 }}>
                Max Pages
              </label>
              <input
                type="number"
                value={maxPages}
                onChange={(e) => setMaxPages(Number(e.target.value) || 10)}
                min={1}
                max={500}
                style={{
                  width: 120, padding: '7px 10px',
                  background: T.bgSurface, border: `1px solid ${T.border}`,
                  borderRadius: T.radiusSm, color: T.text, fontSize: 12,
                  outline: 'none', fontFamily: 'inherit',
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: 11, color: T.textMuted, display: 'block', marginBottom: 4 }}>
                Delay Between Pages (ms)
              </label>
              <input
                type="number"
                value={delay}
                onChange={(e) => setDelay(Number(e.target.value) || 500)}
                min={200}
                max={10000}
                step={100}
                style={{
                  width: 120, padding: '7px 10px',
                  background: T.bgSurface, border: `1px solid ${T.border}`,
                  borderRadius: T.radiusSm, color: T.text, fontSize: 12,
                  outline: 'none', fontFamily: 'inherit',
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: 11, color: T.textMuted, display: 'block', marginBottom: 4 }}>
                Exclude Patterns (comma-separated)
              </label>
              <input
                type="text"
                value={excludeInput}
                onChange={(e) => setExcludeInput(e.target.value)}
                placeholder="/auth/*, /api/*, /login"
                style={{
                  width: '100%', padding: '7px 10px',
                  background: T.bgSurface, border: `1px solid ${T.border}`,
                  borderRadius: T.radiusSm, color: T.text, fontSize: 12,
                  outline: 'none', fontFamily: 'inherit',
                }}
              />
            </div>
          </div>

          <ActionButton onClick={handleStart} disabled={disabled || unvisitedLinks === 0}>
            {unvisitedLinks === 0 ? 'No pages to crawl — scan first' : `Start Crawl (${unvisitedLinks} pages)`}
          </ActionButton>

          {!reactStatus?.found && (
            <div style={{ marginTop: 12 }}>
              <EmptyState title="No React detected" description="Navigate to a React app and scan a page first." />
            </div>
          )}

          {reactStatus?.found && unvisitedLinks === 0 && pages.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 11, color: T.textDim, lineHeight: 1.6 }}>
              All discovered links have been scanned. Scan more pages manually to discover new links,
              or click "Scan Page" on the Scan tab while navigating to new areas of the app.
            </div>
          )}
        </div>
      )}

      {/* How it works */}
      {isIdle && !isDone && (
        <div style={{ color: T.textMuted, fontSize: 12, lineHeight: 1.8, padding: '16px 0', borderTop: `1px solid ${T.border}`, marginTop: 16 }}>
          <p style={{ marginBottom: 8, fontWeight: 600, color: T.text }}>How the Crawler Works:</p>
          <ol style={{ margin: 0, paddingLeft: 20 }}>
            <li><strong style={{ color: T.text }}>Scan</strong> at least one page to seed the link queue</li>
            <li><strong style={{ color: T.text }}>Start Crawl</strong> to auto-navigate and scan discovered links</li>
            <li>The crawler stays on the <strong style={{ color: T.text }}>same origin</strong> and respects exclude patterns</li>
            <li>Results are stored in the <strong style={{ color: T.text }}>Dashboard</strong> and available for <strong style={{ color: T.text }}>Export</strong></li>
          </ol>
        </div>
      )}
    </div>
  );
}

// ─── Color Stats Aggregation ───

interface AggregatedColorStats {
  uniqueColors: number;
  totalUsages: number;
  topColors: { hex: string; count: number; usedAs: string[]; severities: string[] }[];
  nearDuplicates: { a: string; b: string; distance: number }[];
}

function aggregateColorStats(pages: StoredPage[]): AggregatedColorStats {
  const allColors = new Map<string, { count: number; usedAs: Set<string>; severities: Set<string> }>();
  const allDuplicates: { a: string; b: string; distance: number }[] = [];
  let totalUsages = 0;

  for (const page of pages) {
    if (!page.colorSummary) continue;
    totalUsages += page.colorSummary.totalUsages;
    for (const tc of page.colorSummary.topColors) {
      const existing = allColors.get(tc.hex);
      if (existing) {
        existing.count += tc.count;
        for (const u of tc.usedAs) existing.usedAs.add(u);
        for (const s of (tc.severities ?? [])) existing.severities.add(s);
      } else {
        allColors.set(tc.hex, { count: tc.count, usedAs: new Set(tc.usedAs), severities: new Set(tc.severities ?? []) });
      }
    }
    for (const dup of page.colorSummary.nearDuplicates) {
      if (!allDuplicates.some((d) => (d.a === dup.a && d.b === dup.b) || (d.a === dup.b && d.b === dup.a))) {
        allDuplicates.push(dup);
      }
    }
  }

  const topColors = Array.from(allColors.entries())
    .map(([hex, data]) => ({ hex, count: data.count, usedAs: Array.from(data.usedAs), severities: Array.from(data.severities) }))
    .sort((a, b) => b.count - a.count);

  return { uniqueColors: allColors.size, totalUsages, topColors, nearDuplicates: allDuplicates };
}

// ─── Dashboard Tab ───

function DashboardTab({ pages, components, patterns, dismissed, onDismiss, onRestore }: {
  pages: StoredPage[];
  components: StoredComponent[];
  patterns: StoredPattern[];
  dismissed: Set<string>;
  onDismiss: (patternId: string, reason: string) => void;
  onRestore: (patternId: string) => void;
}) {
  const [filter, setFilter] = useState('');
  const [showVariantsOnly, setShowVariantsOnly] = useState(false);
  const [showDismissed, setShowDismissed] = useState(false);
  const [expandedPattern, setExpandedPattern] = useState<string | null>(null);
  const [dashSection, setDashSection] = useState<'patterns' | 'colors'>('patterns');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'inline' | 'non-tailwind' | 'tw-arbitrary'>('all');

  // Component lookup by ID for pattern variant display
  const componentById = useMemo(() => {
    const map = new Map<number, StoredComponent>();
    for (const c of components) map.set(c.id, c);
    return map;
  }, [components]);

  const filteredPatterns = useMemo(() => {
    let result = patterns;
    if (!showDismissed) result = result.filter((p) => !dismissed.has(p.patternId));
    if (showVariantsOnly) result = result.filter((p) => p.variants.length > 1);
    if (filter) {
      const q = filter.toLowerCase();
      result = result.filter((p) => p.name.toLowerCase().includes(q));
    }
    return result;
  }, [patterns, filter, showVariantsOnly, dismissed, showDismissed]);

  const multiVariantCount = useMemo(
    () => patterns.filter((p) => p.variants.length > 1).length,
    [patterns],
  );

  const colorStats = useMemo(() => {
    const stats = aggregateColorStats(pages);
    return { ...stats, topColors: stats.topColors.slice(0, 30) };
  }, [pages]);

  const filteredTopColors = useMemo(() => {
    if (severityFilter === 'all') return colorStats.topColors;
    return colorStats.topColors.filter((c) => c.severities.includes(severityFilter));
  }, [colorStats.topColors, severityFilter]);

  if (components.length === 0) {
    return <EmptyState title="No data yet" description="Scan some pages first to see the dashboard." />;
  }

  return (
    <div>
      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
        <StatCard label="Components" value={components.length} color={T.accent} />
        <StatCard label="Pages" value={pages.length} color={T.green} />
        <StatCard label="With Variants" value={multiVariantCount} color={T.orange} />
        <StatCard label="HC Colors" value={colorStats.uniqueColors} color={T.red} />
      </div>

      {/* Section toggle */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
        {(['patterns', 'colors'] as const).map((s) => (
          <button key={s} onClick={() => setDashSection(s)} style={{
            padding: '5px 12px', fontSize: 11, fontWeight: dashSection === s ? 600 : 400,
            background: dashSection === s ? T.bgActive : 'transparent',
            color: dashSection === s ? T.text : T.textMuted,
            border: `1px solid ${dashSection === s ? T.border : 'transparent'}`,
            borderRadius: T.radiusSm, cursor: 'pointer', fontFamily: 'inherit',
          }}>
            {s === 'patterns' ? 'Pattern Groups' : 'Color Analysis'}
          </button>
        ))}
      </div>

      {/* Pattern Groups Section */}
      {dashSection === 'patterns' && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <SearchInput value={filter} onChange={setFilter} placeholder="Filter patterns..." />
            </div>
            <label style={{
              fontSize: 11, color: T.textMuted, display: 'flex', alignItems: 'center',
              gap: 4, cursor: 'pointer', whiteSpace: 'nowrap',
            }}>
              <input
                type="checkbox"
                checked={showVariantsOnly}
                onChange={(e) => setShowVariantsOnly(e.target.checked)}
                style={{ accentColor: T.accent }}
              />
              Variants only
            </label>
            <label style={{
              fontSize: 11, color: T.textMuted, display: 'flex', alignItems: 'center',
              gap: 4, cursor: 'pointer', whiteSpace: 'nowrap',
            }}>
              <input
                type="checkbox"
                checked={showDismissed}
                onChange={(e) => setShowDismissed(e.target.checked)}
                style={{ accentColor: T.accent }}
              />
              Show dismissed ({dismissed.size})
            </label>
          </div>

          <SectionHeader>
            Pattern Groups <CountBadge count={filteredPatterns.length} />
          </SectionHeader>

          <div>
            {filteredPatterns.map((pattern) => {
              const isExpanded = expandedPattern === pattern.patternId;
              return (
                <div key={pattern.patternId} style={{
                  marginBottom: 4, background: isExpanded ? T.bgSurface : 'transparent',
                  border: isExpanded ? `1px solid ${T.border}` : 'none',
                  borderRadius: isExpanded ? T.radius : 0,
                  overflow: 'hidden',
                }}>
                  <div
                    onClick={() => setExpandedPattern(isExpanded ? null : pattern.patternId)}
                    style={{
                      padding: '10px 12px', cursor: 'pointer',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      borderBottom: isExpanded ? `1px solid ${T.borderLight}` : `1px solid ${T.borderLight}`,
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: T.text, fontFamily: T.mono }}>
                        {pattern.name}
                      </span>
                      <span style={{ fontSize: 10, color: T.textDim, marginLeft: 8 }}>
                        {pattern.totalInstances} instances
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {pattern.variants.length > 1 && (
                        <span style={{
                          fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 10,
                          background: 'rgba(251, 146, 60, 0.12)', color: T.orange,
                        }}>
                          {pattern.variants.length} variants
                        </span>
                      )}
                      <span style={{ fontSize: 10, color: T.textDim }}>
                        {isExpanded ? '\u25B2' : '\u25BC'}
                      </span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div style={{ padding: 12 }}>
                      {pattern.variants.map((variant) => {
                        const exemplar = componentById.get(variant.exemplarComponentId);
                        const uniquePages = new Set(
                          variant.componentIds.map((id) => componentById.get(id)?.pagePath).filter(Boolean),
                        );
                        return (
                          <div key={variant.variantId} style={{
                            padding: '8px 10px', marginBottom: 6,
                            background: T.bg, borderRadius: T.radiusSm,
                            border: `1px solid ${T.borderLight}`,
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 11, fontWeight: 600, color: T.text }}>
                                {variant.label}
                              </span>
                              <span style={{ fontSize: 10, color: T.textDim }}>
                                {variant.componentIds.length} instances, {uniquePages.size} pages
                              </span>
                            </div>
                            {exemplar && (
                              <div style={{ fontSize: 10, color: T.textDim, marginTop: 4, fontFamily: T.mono }}>
                                <ClickToCopy text={exemplar.sourceFile
                                  ? `${shortenPath(exemplar.sourceFile)}:${exemplar.sourceLine}`
                                  : exemplar.domSelector
                                } />
                                <span style={{ marginLeft: 8 }}>
                                  {exemplar.styleCategories.slice(0, 4).join(' | ')}
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {/* Style Diff (only for multi-variant patterns) */}
                      {pattern.variants.length > 1 && (
                        <StyleDiffView variants={pattern.variants} componentById={componentById} />
                      )}

                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                        <CopyPatternForLLM pattern={pattern} componentById={componentById} />
                        {dismissed.has(pattern.patternId) ? (
                          <button
                            onClick={() => onRestore(pattern.patternId)}
                            style={{
                              padding: '4px 10px', fontSize: 10, fontWeight: 600,
                              background: 'rgba(52, 211, 153, 0.12)', color: T.green,
                              border: `1px solid ${T.green}33`, borderRadius: T.radiusSm,
                              cursor: 'pointer', fontFamily: 'inherit',
                            }}
                          >
                            Restore
                          </button>
                        ) : (
                          <button
                            onClick={() => onDismiss(pattern.patternId, 'intentional')}
                            style={{
                              padding: '4px 10px', fontSize: 10, fontWeight: 600,
                              background: 'rgba(107, 109, 128, 0.12)', color: T.textMuted,
                              border: `1px solid ${T.border}`, borderRadius: T.radiusSm,
                              cursor: 'pointer', fontFamily: 'inherit',
                            }}
                          >
                            Dismiss
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Color Analysis Section */}
      {dashSection === 'colors' && (
        <>
          {colorStats.uniqueColors === 0 ? (
            <EmptyState title="No hardcoded colors detected" description="Colors set via CSS variables or Tailwind utility classes are not flagged." />
          ) : (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
                <StatCard label="Unique Colors" value={colorStats.uniqueColors} color={T.red} />
                <StatCard label="Total Usages" value={colorStats.totalUsages} color={T.yellow} />
              </div>

              {/* Near duplicates */}
              {colorStats.nearDuplicates.length > 0 && (
                <>
                  <SectionHeader>
                    Near-Duplicate Colors <CountBadge count={colorStats.nearDuplicates.length} />
                  </SectionHeader>
                  <div style={{ marginBottom: 16 }}>
                    {colorStats.nearDuplicates.map((dup, i) => (
                      <div key={i} style={{
                        padding: '8px 12px', borderBottom: `1px solid ${T.borderLight}`,
                        display: 'flex', alignItems: 'center', gap: 10,
                      }}>
                        <ColorSwatch hex={dup.a} />
                        <span style={{ fontSize: 11, fontFamily: T.mono, color: T.textMuted }}>{dup.a}</span>
                        <span style={{ fontSize: 10, color: T.textDim }}>vs</span>
                        <ColorSwatch hex={dup.b} />
                        <span style={{ fontSize: 11, fontFamily: T.mono, color: T.textMuted }}>{dup.b}</span>
                        <span style={{
                          marginLeft: 'auto', fontSize: 10, color: T.yellow,
                          fontWeight: 600, fontFamily: T.mono,
                        }}>
                          dist: {dup.distance.toFixed(1)}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Top colors with severity filter */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <SectionHeader>
                  Top Hardcoded Colors <CountBadge count={filteredTopColors.length} />
                </SectionHeader>
                <select
                  value={severityFilter}
                  onChange={(e) => setSeverityFilter(e.target.value as typeof severityFilter)}
                  style={{
                    padding: '4px 8px', borderRadius: T.radiusSm, fontSize: 10,
                    border: `1px solid ${T.border}`, background: T.bgSurface,
                    color: T.text, outline: 'none', fontFamily: 'inherit',
                  }}
                >
                  <option value="all">All severities</option>
                  <option value="inline">Inline styles</option>
                  <option value="non-tailwind">Non-Tailwind</option>
                  <option value="tw-arbitrary">TW arbitrary</option>
                </select>
              </div>
              <div>
                {filteredTopColors.map((c, i) => (
                  <div key={i} style={{
                    padding: '8px 12px', borderBottom: `1px solid ${T.borderLight}`,
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}>
                    <ColorSwatch hex={c.hex} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 11, fontFamily: T.mono, color: T.text }}>{c.hex}</span>
                        {c.severities.map((s) => (
                          <SeverityBadge key={s} severity={s} />
                        ))}
                      </div>
                      <div style={{ fontSize: 10, color: T.textDim, marginTop: 1 }}>
                        {c.usedAs.join(', ')}
                      </div>
                    </div>
                    <span style={{
                      fontSize: 11, fontWeight: 600, color: T.textMuted, fontFamily: T.mono,
                    }}>
                      {c.count}x
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ColorSwatch({ hex }: { hex: string }) {
  return (
    <span style={{
      display: 'inline-block', width: 16, height: 16, borderRadius: 4,
      background: hex, border: '1px solid rgba(255,255,255,0.15)', flexShrink: 0,
    }} />
  );
}

const SEVERITY_COLORS: Record<string, { bg: string; text: string }> = {
  inline: { bg: 'rgba(248, 113, 113, 0.12)', text: T.red },
  'non-tailwind': { bg: 'rgba(251, 191, 36, 0.12)', text: T.yellow },
  'tw-arbitrary': { bg: 'rgba(129, 140, 248, 0.12)', text: T.accent },
};

function SeverityBadge({ severity }: { severity: string }) {
  const colors = SEVERITY_COLORS[severity] ?? { bg: 'rgba(255,255,255,0.06)', text: T.textDim };
  return (
    <span style={{
      fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 8,
      background: colors.bg, color: colors.text, whiteSpace: 'nowrap',
    }}>
      {severity}
    </span>
  );
}


// ─── Style Diff View ───

function StyleDiffView({ variants, componentById }: {
  variants: StoredPattern['variants'];
  componentById: Map<number, StoredComponent>;
}) {
  const diffs = useMemo(() => {
    const variantStyles = new Map<string, Record<string, string>>();
    for (const v of variants) {
      const exemplar = componentById.get(v.exemplarComponentId);
      if (exemplar?.computedStyles) {
        variantStyles.set(v.variantId, exemplar.computedStyles);
      }
    }
    return computeStyleDiff(variantStyles);
  }, [variants, componentById]);

  const variantLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const v of variants) map.set(v.variantId, v.label);
    return map;
  }, [variants]);

  if (diffs.length === 0) return null;

  return (
    <div style={{ marginTop: 8, marginBottom: 4 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: T.textMuted, marginBottom: 6 }}>
        Style Differences ({diffs.length} properties)
      </div>
      <div style={{
        background: T.bg, borderRadius: T.radiusSm,
        border: `1px solid ${T.borderLight}`, overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, fontFamily: T.mono }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${T.borderLight}` }}>
              <th style={{ padding: '4px 8px', textAlign: 'left', color: T.textDim, fontWeight: 600 }}>Property</th>
              {variants.map((v) => (
                <th key={v.variantId} style={{ padding: '4px 8px', textAlign: 'left', color: T.orange, fontWeight: 600 }}>
                  {variantLabels.get(v.variantId) ?? v.variantId}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {diffs.slice(0, 20).map((diff) => (
              <tr key={diff.property} style={{ borderBottom: `1px solid ${T.borderLight}` }}>
                <td style={{ padding: '3px 8px', color: T.accent }}>{diff.property}</td>
                {variants.map((v) => {
                  const val = diff.values.get(v.variantId) ?? '';
                  const shortVal = val.length > 30 ? val.slice(0, 27) + '...' : val;
                  return (
                    <td key={v.variantId} style={{ padding: '3px 8px', color: T.text }} title={val}>
                      {shortVal}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {diffs.length > 20 && (
          <div style={{ padding: '4px 8px', fontSize: 10, color: T.textDim, textAlign: 'center' }}>
            +{diffs.length - 20} more properties
          </div>
        )}
      </div>
    </div>
  );
}

function CopyPatternForLLM({ pattern, componentById }: {
  pattern: StoredPattern;
  componentById: Map<number, StoredComponent>;
}) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  const handleCopy = useCallback(() => {
    let xml = `<pattern_group name="${pattern.name}" instances="${pattern.totalInstances}">\n`;
    for (const variant of pattern.variants) {
      const exemplar = componentById.get(variant.exemplarComponentId);
      xml += `  <variant label="${variant.label}" instances="${variant.componentIds.length}">\n`;
      for (const id of variant.componentIds.slice(0, 5)) {
        const comp = componentById.get(id);
        if (comp) {
          xml += `    <instance file="${comp.sourceFile ?? 'unknown'}" line="${comp.sourceLine ?? '?'}" page="${comp.pagePath}" />\n`;
        }
      }
      if (variant.componentIds.length > 5) xml += `    <!-- ... and ${variant.componentIds.length - 5} more -->\n`;
      if (exemplar) {
        xml += `    <exemplar_styles>${exemplar.styleCategories.join(' | ')}</exemplar_styles>\n`;
      }
      xml += '  </variant>\n';
    }
    xml += '</pattern_group>\n\n';
    xml += '<instructions>\n';
    xml += `Analyze the "${pattern.name}" component pattern above.\n`;
    xml += '1. Read each variant\'s source files\n';
    xml += '2. Identify the canonical variant (most instances)\n';
    xml += '3. Generate migration code to consolidate non-canonical variants\n';
    xml += '</instructions>\n';

    navigator.clipboard.writeText(xml).then(
      () => { setStatus('copied'); setTimeout(() => setStatus('idle'), 2000); },
      () => { setStatus('failed'); setTimeout(() => setStatus('idle'), 2000); },
    );
  }, [pattern, componentById]);

  return (
    <button onClick={handleCopy} style={{
      marginTop: 6, padding: '5px 10px', fontSize: 10, fontWeight: 600,
      background: status === 'copied' ? 'rgba(52, 211, 153, 0.12)' : status === 'failed' ? 'rgba(248, 113, 113, 0.12)' : 'rgba(129, 140, 248, 0.08)',
      color: status === 'copied' ? T.green : status === 'failed' ? T.red : T.accent,
      border: `1px solid ${status === 'copied' ? T.green : status === 'failed' ? T.red : T.accentDim}`,
      borderRadius: T.radiusSm, cursor: 'pointer', fontFamily: 'inherit',
      width: '100%',
    }}>
      {status === 'copied' ? 'Copied!' : status === 'failed' ? 'Copy failed' : 'Copy for LLM'}
    </button>
  );
}

// ─── Export Tab ───

function ExportTab({ components, pages, patterns }: { components: StoredComponent[]; pages: StoredPage[]; patterns: StoredPattern[] }) {
  const [format, setFormat] = useState<'json' | 'llm'>('json');
  const [copied, setCopied] = useState(false);

  // Aggregate color stats across all pages
  const colorStats = useMemo(() => aggregateColorStats(pages), [pages]);

  const generateExport = useCallback(() => {
    if (format === 'json') {
      return JSON.stringify({
        meta: {
          exportDate: new Date().toISOString(),
          toolVersion: '0.1.0',
          pagesScanned: pages.length,
          totalComponents: components.length,
          patternGroups: patterns.length,
          hardcodedColors: colorStats.topColors.length,
        },
        components: components.map((c) => ({
          name: c.componentName,
          source: c.sourceFile ? `${c.sourceFile}:${c.sourceLine}` : null,
          page: c.pagePath,
          styleFingerprint: c.styleFingerprint,
          structureHash: c.structureHash,
          size: `${Math.round(c.boundingRect.width)}x${Math.round(c.boundingRect.height)}`,
        })),
        pages: pages.map((p) => ({
          path: p.pagePath,
          componentCount: p.componentCount,
          scannedAt: new Date(p.scanTimestamp).toISOString(),
          colorSummary: p.colorSummary ? {
            uniqueColors: p.colorSummary.uniqueColors,
            totalUsages: p.colorSummary.totalUsages,
            nearDuplicates: p.colorSummary.nearDuplicates.length,
          } : null,
        })),
        patterns: patterns.map((p) => ({
          name: p.name,
          totalInstances: p.totalInstances,
          variants: p.variants.map((v) => ({ label: v.label, instances: v.componentIds.length })),
        })),
        colorAudit: {
          nearDuplicates: colorStats.nearDuplicates,
          topHardcoded: colorStats.topColors.slice(0, 20).map((c) => ({
            hex: c.hex, count: c.count, usedAs: c.usedAs, severities: c.severities,
          })),
        },
      }, null, 2);
    }

    const groups = groupByName(components);
    const multiVariantGroups = groups.filter((g) => {
      const fps = new Set(g.components.map((c) => c.styleFingerprint));
      return fps.size > 1;
    });

    let output = '<audit_context>\n';
    output += 'You are auditing a React codebase. Below is a component pattern analysis.\n';
    output += `Pages scanned: ${pages.length}\n`;
    output += `Total components: ${components.length}\n`;
    output += `Pattern groups with variants: ${multiVariantGroups.length}\n`;
    output += `Hardcoded colors found: ${colorStats.topColors.length}\n`;
    output += `Near-duplicate color pairs: ${colorStats.nearDuplicates.length}\n`;
    output += '</audit_context>\n\n';

    for (const group of multiVariantGroups) {
      output += `<pattern_group name="${group.name}" instances="${group.components.length}">\n`;
      const byFingerprint = new Map<string, StoredComponent[]>();
      for (const comp of group.components) {
        const existing = byFingerprint.get(comp.styleFingerprint) ?? [];
        existing.push(comp);
        byFingerprint.set(comp.styleFingerprint, existing);
      }
      let variantIdx = 0;
      for (const [, comps] of byFingerprint) {
        output += `  <variant label="${variantLabel(variantIdx)}" instances="${comps.length}">\n`;
        for (const c of comps.slice(0, 3)) {
          output += `    <instance file="${c.sourceFile ?? 'unknown'}" line="${c.sourceLine ?? '?'}" page="${c.pagePath}" />\n`;
        }
        if (comps.length > 3) output += `    <!-- ... and ${comps.length - 3} more -->\n`;
        output += '  </variant>\n';
        variantIdx++;
      }
      output += '</pattern_group>\n\n';
    }

    // Color audit section
    if (colorStats.nearDuplicates.length > 0 || colorStats.topColors.length > 0) {
      output += '<color_audit>\n';
      if (colorStats.nearDuplicates.length > 0) {
        output += '  <near_duplicates>\n';
        for (const dup of colorStats.nearDuplicates) {
          output += `    <pair a="${dup.a}" b="${dup.b}" distance="${dup.distance.toFixed(1)}" />\n`;
        }
        output += '  </near_duplicates>\n';
      }
      if (colorStats.topColors.length > 0) {
        output += '  <hardcoded_colors>\n';
        for (const c of colorStats.topColors.slice(0, 15)) {
          output += `    <color hex="${c.hex}" count="${c.count}" used_as="${c.usedAs.join(', ')}" severity="${c.severities.join(', ')}" />\n`;
        }
        output += '  </hardcoded_colors>\n';
      }
      output += '</color_audit>\n\n';
    }

    output += '<instructions>\n';
    output += 'For each pattern group with multiple variants:\n';
    output += '1. Identify the canonical variant (most instances)\n';
    output += '2. Read each non-canonical instance file\n';
    output += '3. Generate migration code to consolidate into the canonical pattern\n';
    if (colorStats.nearDuplicates.length > 0) {
      output += '\nFor near-duplicate colors:\n';
      output += '4. Pick one canonical color from each pair and replace the other\n';
    }
    if (colorStats.topColors.some((c) => c.severities.includes('inline'))) {
      output += '\nFor inline hardcoded colors:\n';
      output += '5. Extract inline color styles to Tailwind utility classes or CSS variables\n';
    }
    output += '</instructions>\n';

    return output;
  }, [format, components, pages, patterns, colorStats]);

  const preview = useMemo(() => generateExport(), [generateExport]);

  const handleCopy = useCallback(() => {
    const text = generateExport();
    navigator.clipboard.writeText(text).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 2000); },
      () => { /* clipboard unavailable — silent fail, user can use download */ },
    );
  }, [generateExport]);

  const handleDownload = useCallback(() => {
    const text = generateExport();
    const ext = format === 'json' ? 'json' : 'xml';
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `component-cop-export.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }, [generateExport, format]);

  if (components.length === 0) {
    return <EmptyState title="Nothing to export" description="Scan some pages first to generate export data." />;
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value as 'json' | 'llm')}
          style={{
            padding: '7px 10px', borderRadius: T.radiusSm,
            border: `1px solid ${T.border}`, background: T.bgSurface,
            color: T.text, fontSize: 12, outline: 'none', fontFamily: 'inherit',
          }}
        >
          <option value="json">JSON</option>
          <option value="llm">LLM Prompt (XML)</option>
        </select>
        <ActionButton onClick={handleCopy} variant="secondary">
          {copied ? 'Copied!' : 'Copy'}
        </ActionButton>
        <ActionButton onClick={handleDownload} variant="ghost">
          Download
        </ActionButton>
      </div>

      <div style={{
        background: '#11111b', border: `1px solid ${T.borderLight}`,
        borderRadius: T.radius, padding: 14, fontSize: 11, fontFamily: T.mono,
        maxHeight: 500, overflow: 'auto', whiteSpace: 'pre-wrap',
        color: '#a6adc8', lineHeight: 1.6, tabSize: 2,
      }}>
        {preview}
      </div>
    </div>
  );
}

// ─── Helpers ───

function sendMsg(port: chrome.runtime.Port, msg: PanelToBackgroundMessage): void {
  if (!chrome.runtime?.id) return;
  try { port.postMessage(msg); } catch { /* stale port */ }
}

function shortenPath(path: string): string {
  const parts = path.split('/');
  if (parts.length <= 3) return path;
  return '.../' + parts.slice(-3).join('/');
}

function groupByName(components: StoredComponent[]): { name: string; components: StoredComponent[] }[] {
  const map = new Map<string, StoredComponent[]>();
  for (const c of components) {
    const existing = map.get(c.componentName) ?? [];
    existing.push(c);
    map.set(c.componentName, existing);
  }
  return Array.from(map.entries())
    .map(([name, comps]) => ({ name, components: comps }))
    .sort((a, b) => b.components.length - a.components.length);
}

/** Extract the most visually-meaningful CSS properties for LLM comparison. */
const KEY_STYLE_PROPS = [
  'font-family', 'font-size', 'font-weight', 'color', 'background-color',
  'border-width', 'border-style', 'border-color', 'border-radius',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'display', 'width', 'height', 'box-shadow', 'line-height',
] as const;

function extractKeyStyles(computedStyles: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const prop of KEY_STYLE_PROPS) {
    const val = computedStyles[prop];
    if (val && val !== 'none' && val !== 'normal' && val !== 'auto' && val !== '0px') {
      out[prop] = val;
    }
  }
  return out;
}
