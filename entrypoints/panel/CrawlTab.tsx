import { useCallback, useMemo, useState } from 'react';
import type { CrawlConfig, CrawlProgress, ReactDetectionResult, StoredPage } from '../../shared/types';
import { DEFAULT_CRAWL_CONFIG } from '../../shared/constants';
import { T } from './theme';
import { ActionButton, EmptyState, PulsingDot, SectionHeader, StatCard } from './primitives';

export function CrawlTab({ onStart, onPause, onResume, onStop, progress, reactStatus, pages }: {
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
