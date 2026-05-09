import { useMemo } from 'react';
import type { StoredComponent } from '../../../shared/types';
import { auditComplexity } from '../../../lib/complexity-score';
import { T } from '../theme';
import { CountBadge, EmptyState, SectionHeader, StatCard } from '../primitives';

const BAR_MAX_WIDTH = 180;

export function ComplexitySection({ components }: { components: StoredComponent[] }) {
  const audit = useMemo(() => auditComplexity(components), [components]);

  if (audit.results.length === 0) {
    return <EmptyState title="No components" description="Scan pages to see complexity scores." />;
  }

  const top = audit.results.slice(0, 25);

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
        <StatCard label="Average" value={audit.average} color={T.accent} />
        <StatCard label="Median" value={audit.median} color={T.green} />
        <StatCard label="Outliers (≥80)" value={audit.outliers.length} color={T.red} />
      </div>

      <SectionHeader>
        Top Complex Components <CountBadge count={top.length} />
      </SectionHeader>

      <div>
        {top.map((r) => (
          <div key={`${r.componentId}-${r.pagePath}`} style={{
            padding: '8px 12px', borderBottom: `1px solid ${T.borderLight}`,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: T.text, fontFamily: T.mono }}>
                  {r.name}
                </span>
                <span style={{ fontSize: 10, color: T.textDim }}>
                  {r.pagePath}
                </span>
              </div>
              {/* Mini bar chart */}
              <div style={{ display: 'flex', gap: 3, marginTop: 4 }}>
                <FactorBar label="D" value={r.breakdown.depth} color={T.accent} />
                <FactorBar label="C" value={r.breakdown.children} color={T.green} />
                <FactorBar label="P" value={r.breakdown.props} color={T.yellow} />
                <FactorBar label="A" value={r.breakdown.area} color={T.orange} />
              </div>
            </div>
            <ScoreBadge score={r.score} />
          </div>
        ))}
      </div>
    </div>
  );
}

function FactorBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      <span style={{ fontSize: 8, color: T.textDim, width: 8 }}>{label}</span>
      <div style={{
        height: 4, width: BAR_MAX_WIDTH * (value / 100), minWidth: 1,
        background: color, borderRadius: 2, opacity: 0.7,
      }} />
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 80 ? T.red : score >= 50 ? T.yellow : T.green;
  return (
    <span style={{
      fontSize: 13, fontWeight: 700, fontFamily: T.mono, color,
      minWidth: 32, textAlign: 'right',
    }}>
      {score}
    </span>
  );
}
