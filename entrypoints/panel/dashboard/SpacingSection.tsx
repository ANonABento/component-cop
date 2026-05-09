import { useMemo, useState } from 'react';
import type { StoredComponent } from '../../../shared/types';
import { auditSpacing } from '../../../lib/spacing-audit';
import { T } from '../theme';
import { CountBadge, EmptyState, SectionHeader, StatCard } from '../primitives';

export function SpacingSection({ components }: { components: StoredComponent[] }) {
  const audit = useMemo(() => auditSpacing(components), [components]);
  const [expanded, setExpanded] = useState<string | null>(null);

  if (audit.inconsistencies.length === 0) {
    return <EmptyState title="No spacing inconsistencies" description="All components use consistent spacing values." />;
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
        <StatCard label="Inconsistencies" value={audit.totalInconsistencies} color={T.orange} />
        <StatCard label="Near-Dup Values" value={audit.nearDuplicates.length} color={T.red} />
      </div>

      {/* Near-duplicate spacing pairs */}
      {audit.nearDuplicates.length > 0 && (
        <>
          <SectionHeader>
            Near-Duplicate Spacing <CountBadge count={audit.nearDuplicates.length} />
          </SectionHeader>
          <div style={{ marginBottom: 16 }}>
            {audit.nearDuplicates.map((dup, i) => (
              <div key={i} style={{
                padding: '6px 12px', borderBottom: `1px solid ${T.borderLight}`,
                display: 'flex', alignItems: 'center', gap: 8, fontSize: 11,
              }}>
                <span style={{ fontFamily: T.mono, color: T.accent }}>{dup.componentName}</span>
                <span style={{ color: T.textDim }}>{dup.property}:</span>
                <span style={{ fontFamily: T.mono, color: T.text }}>{dup.a}</span>
                <span style={{ color: T.textDim }}>vs</span>
                <span style={{ fontFamily: T.mono, color: T.text }}>{dup.b}</span>
                <span style={{ marginLeft: 'auto', fontSize: 10, color: T.yellow, fontWeight: 600, fontFamily: T.mono }}>
                  Δ{dup.diffPx}px
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Inconsistencies grouped by component */}
      <SectionHeader>
        Spacing Inconsistencies <CountBadge count={audit.inconsistencies.length} />
      </SectionHeader>
      <div>
        {audit.inconsistencies.slice(0, 30).map((inc) => {
          const key = `${inc.componentName}:${inc.property}`;
          const isExpanded = expanded === key;
          return (
            <div key={key} style={{
              borderBottom: `1px solid ${T.borderLight}`,
              background: isExpanded ? T.bgSurface : 'transparent',
            }}>
              <div
                onClick={() => setExpanded(isExpanded ? null : key)}
                style={{
                  padding: '8px 12px', cursor: 'pointer',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: T.text, fontFamily: T.mono }}>
                    {inc.componentName}
                  </span>
                  <span style={{ fontSize: 10, color: T.accent, fontFamily: T.mono }}>
                    {inc.property}
                  </span>
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 8,
                  background: 'rgba(251, 146, 60, 0.12)', color: T.orange,
                }}>
                  {inc.values.length} values
                </span>
              </div>
              {isExpanded && (
                <div style={{ padding: '0 12px 8px' }}>
                  {inc.values.map((v) => (
                    <div key={v.value} style={{
                      padding: '4px 8px', marginBottom: 2,
                      background: T.bg, borderRadius: T.radiusSm,
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                      <span style={{ fontSize: 11, fontFamily: T.mono, color: T.text }}>{v.value}</span>
                      <span style={{ fontSize: 10, color: T.textDim }}>
                        {v.count}x on {v.pages.join(', ')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
