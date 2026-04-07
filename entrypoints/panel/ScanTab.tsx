import { useCallback, useMemo, useState } from 'react';
import type { ComponentData, ReactDetectionResult, ScanResult } from '../../shared/types';
import { T } from './theme';
import { ActionButton, EmptyState, SearchInput, SourceLink, Spinner } from './primitives';

export function ScanTab({ onScan, scanning, lastScan, reactStatus }: {
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
          const isCopied = copiedIdx === i;
          const sourceStr = comp.sourceFile
            ? `${comp.sourceFile}:${comp.sourceLine ?? '?'}`
            : 'unknown';

          return (
            <div
              key={`${comp.componentName}-${comp.domSelector}-${i}`}
              style={{
                display: 'grid', gridTemplateColumns: '2fr 2fr 80px',
                padding: '7px 12px', borderBottom: `1px solid ${T.borderLight}`,
                transition: 'background 0.1s',
                background: isCopied ? 'rgba(99,102,241,0.1)' : 'transparent',
              }}
              onMouseEnter={(e) => { if (!isCopied) e.currentTarget.style.background = T.bgHover; }}
              onMouseLeave={(e) => { if (!isCopied) e.currentTarget.style.background = 'transparent'; }}
            >
              <span
                onClick={() => handleCopyRow(`${comp.componentName} ${sourceStr}`, i)}
                title="Click to copy"
                style={{
                  fontSize: 12, fontWeight: 500, color: T.text, fontFamily: T.mono,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  cursor: 'pointer',
                }}
              >
                {isCopied ? <span style={{ color: T.green }}>Copied!</span> : comp.componentName}
              </span>
              <SourceLink file={comp.sourceFile} line={comp.sourceLine} column={comp.sourceColumn} />
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
