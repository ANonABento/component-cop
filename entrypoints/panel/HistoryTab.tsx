import { useCallback, useMemo, useState } from 'react';
import type { ScanSnapshot } from '../../shared/scan-history';
import { computeBaselineDiff, type BaselineDiff } from '../../shared/scan-history';
import { T } from './theme';
import { ActionButton, EmptyState, SectionHeader, CountBadge } from './primitives';

export function HistoryTab({ snapshots, baselineId, onSave, onDelete, onSetBaseline, onClearBaseline }: {
  snapshots: ScanSnapshot[];
  baselineId: number | null;
  onSave: (label: string) => void;
  onDelete: (id: number) => void;
  onSetBaseline: (id: number) => void;
  onClearBaseline: () => void;
}) {
  const [saveLabel, setSaveLabel] = useState('');

  const baseline = useMemo(
    () => baselineId ? snapshots.find((s) => s.id === baselineId) ?? null : null,
    [snapshots, baselineId],
  );

  const latestSnapshot = snapshots[0] ?? null;

  const baselineDiff = useMemo(() => {
    if (!baseline || !latestSnapshot || baseline.id === latestSnapshot.id) return null;
    return computeBaselineDiff(baseline, latestSnapshot);
  }, [baseline, latestSnapshot]);

  const handleSave = useCallback(() => {
    const label = saveLabel.trim() || `Snapshot ${new Date().toLocaleDateString()}`;
    onSave(label);
    setSaveLabel('');
  }, [saveLabel, onSave]);

  return (
    <div>
      {/* Save snapshot */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <input
          type="text"
          value={saveLabel}
          onChange={(e) => setSaveLabel(e.target.value)}
          placeholder="Snapshot label (optional)"
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          style={{
            flex: 1, padding: '7px 10px', borderRadius: T.radiusSm,
            border: `1px solid ${T.border}`, background: T.bgSurface,
            color: T.text, fontSize: 12, outline: 'none', fontFamily: 'inherit',
          }}
        />
        <ActionButton onClick={handleSave} variant="primary">
          Save Snapshot
        </ActionButton>
      </div>

      {/* Baseline Diff */}
      {baselineDiff && baseline && (
        <div style={{ marginBottom: 16 }}>
          <SectionHeader>
            Changes vs Baseline <span style={{ fontSize: 10, color: T.textDim, fontWeight: 400 }}>
              ({baseline.label} — {new Date(baseline.timestamp).toLocaleDateString()})
            </span>
          </SectionHeader>
          <BaselineDiffView diff={baselineDiff} />
        </div>
      )}

      {/* Trend sparkline (simple text-based) */}
      {snapshots.length >= 2 && (
        <div style={{ marginBottom: 16 }}>
          <SectionHeader>Trend</SectionHeader>
          <TrendView snapshots={snapshots} />
        </div>
      )}

      {/* Snapshot list */}
      <SectionHeader>
        Scan History <CountBadge count={snapshots.length} />
      </SectionHeader>

      {snapshots.length === 0 ? (
        <EmptyState
          title="No snapshots yet"
          description="Save a snapshot after scanning to start tracking trends."
        />
      ) : (
        <div>
          {snapshots.map((snap) => (
            <div key={snap.id} style={{
              padding: '10px 12px', borderBottom: `1px solid ${T.borderLight}`,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{snap.label}</span>
                  {baselineId === snap.id && (
                    <span style={{
                      fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 8,
                      background: 'rgba(129, 140, 248, 0.12)', color: T.accent,
                    }}>
                      baseline
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 10, color: T.textDim, marginTop: 2 }}>
                  {new Date(snap.timestamp).toLocaleString()} · {snap.pagesScanned} pages · {snap.totalComponents} components · {snap.multiVariantPatterns} multi-variant
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {baselineId === snap.id ? (
                  <MiniButton color={T.accent} onClick={onClearBaseline}>Unset</MiniButton>
                ) : (
                  <MiniButton color={T.textMuted} onClick={() => onSetBaseline(snap.id)}>Set Baseline</MiniButton>
                )}
                <MiniButton color={T.red} onClick={() => onDelete(snap.id)}>Delete</MiniButton>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MiniButton({ children, color, onClick }: { children: string; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: '3px 8px', fontSize: 9, fontWeight: 600,
      background: 'transparent', color,
      border: `1px solid ${color}33`, borderRadius: T.radiusSm,
      cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
    }}>
      {children}
    </button>
  );
}

function BaselineDiffView({ diff }: { diff: BaselineDiff }) {
  return (
    <div>
      {/* Metric deltas */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 10,
      }}>
        {diff.metrics.map((m) => (
          <div key={m.label} style={{
            padding: '6px 10px', borderRadius: T.radiusSm,
            background: T.bgSurface, border: `1px solid ${T.borderLight}`,
          }}>
            <div style={{ fontSize: 9, color: T.textDim, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {m.label}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 2 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{m.current}</span>
              <DeltaBadge delta={m.delta} inverted={m.label === 'HC Colors' || m.label === 'Multi-variant' || m.label === 'Near-duplicate Colors'} />
            </div>
          </div>
        ))}
      </div>

      {/* Pattern changes */}
      {(diff.addedPatterns.length > 0 || diff.removedPatterns.length > 0 || diff.changedPatterns.length > 0) && (
        <div style={{
          background: T.bg, borderRadius: T.radiusSm,
          border: `1px solid ${T.borderLight}`, overflow: 'hidden', fontSize: 10,
        }}>
          {diff.addedPatterns.map((p) => (
            <div key={p.name} style={{ padding: '4px 10px', borderBottom: `1px solid ${T.borderLight}`, color: T.red }}>
              + {p.name} ({p.variantCount} variants, {p.totalInstances} instances)
            </div>
          ))}
          {diff.removedPatterns.map((p) => (
            <div key={p.name} style={{ padding: '4px 10px', borderBottom: `1px solid ${T.borderLight}`, color: T.green }}>
              - {p.name} (removed)
            </div>
          ))}
          {diff.changedPatterns.map((p) => (
            <div key={p.name} style={{ padding: '4px 10px', borderBottom: `1px solid ${T.borderLight}`, color: T.yellow }}>
              ~ {p.name}: {p.oldVariants}→{p.newVariants} variants, {p.oldInstances}→{p.newInstances} instances
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DeltaBadge({ delta, inverted }: { delta: number; inverted: boolean }) {
  if (delta === 0) return <span style={{ fontSize: 10, color: T.textDim }}>—</span>;
  // For metrics like HC Colors, going down is good (green), up is bad (red)
  const isPositive = inverted ? delta < 0 : delta > 0;
  const color = isPositive ? T.green : T.red;
  return (
    <span style={{ fontSize: 10, fontWeight: 600, color }}>
      {delta > 0 ? '+' : ''}{delta}
    </span>
  );
}

function TrendView({ snapshots }: { snapshots: ScanSnapshot[] }) {
  // Show last 10 snapshots, oldest first
  const recent = useMemo(() => [...snapshots].reverse().slice(-10), [snapshots]);

  const metrics = [
    { key: 'multiVariantPatterns' as const, label: 'Multi-variant', color: T.orange },
    { key: 'hardcodedColors' as const, label: 'HC Colors', color: T.red },
    { key: 'totalComponents' as const, label: 'Components', color: T.accent },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {metrics.map((metric) => {
        const values = recent.map((s) => s[metric.key]);
        const max = Math.max(...values, 1);
        return (
          <div key={metric.key}>
            <div style={{ fontSize: 10, color: T.textDim, marginBottom: 3 }}>{metric.label}</div>
            <div style={{ display: 'flex', alignItems: 'end', gap: 2, height: 32 }}>
              {values.map((val, i) => (
                <div key={i} title={`${recent[i]!.label}: ${val}`} style={{
                  flex: 1, background: metric.color,
                  height: `${Math.max(2, (val / max) * 100)}%`,
                  borderRadius: '2px 2px 0 0', opacity: 0.7,
                  minWidth: 4,
                }} />
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: T.textDim, marginTop: 2 }}>
              <span>{values[0]}</span>
              <span>{values[values.length - 1]}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
