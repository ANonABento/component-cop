import { useMemo } from 'react';
import type { StoredComponent } from '../../../shared/types';
import { auditZIndex } from '../../../lib/z-index-audit';
import { T } from '../theme';
import { CountBadge, EmptyState, SectionHeader, StatCard } from '../primitives';

export function ZIndexSection({ components }: { components: StoredComponent[] }) {
  const audit = useMemo(() => auditZIndex(components), [components]);

  if (audit.entries.length === 0) {
    return <EmptyState title="No z-index values" description="No components have explicit z-index set." />;
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
        <StatCard label="Unique Values" value={audit.uniqueValues} color={T.accent} />
        <StatCard label="Collisions" value={audit.collisions.length} color={T.orange} />
        <StatCard label="Extremes (>100)" value={audit.extremes.length} color={T.red} />
      </div>

      {/* Collisions */}
      {audit.collisions.length > 0 && (
        <>
          <SectionHeader>
            Z-Index Collisions <CountBadge count={audit.collisions.length} />
          </SectionHeader>
          <div style={{ marginBottom: 16 }}>
            {audit.collisions.map((col) => (
              <div key={col.zIndex} style={{
                padding: '8px 12px', borderBottom: `1px solid ${T.borderLight}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, fontFamily: T.mono, color: T.orange }}>
                    z-index: {col.zIndex}
                  </span>
                  <span style={{ fontSize: 10, color: T.textDim }}>
                    {col.components.length} components
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {col.components.map((c, i) => (
                    <span key={i} style={{
                      fontSize: 10, padding: '2px 6px', borderRadius: 6,
                      background: T.bgSurface, border: `1px solid ${T.borderLight}`,
                      color: T.text, fontFamily: T.mono,
                    }}>
                      {c.name}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Extreme values */}
      {audit.extremes.length > 0 && (
        <>
          <SectionHeader>
            Extreme Values <CountBadge count={audit.extremes.length} />
          </SectionHeader>
          <div style={{ marginBottom: 16 }}>
            {audit.extremes.map((e) => (
              <div key={`${e.componentId}-${e.pagePath}`} style={{
                padding: '6px 12px', borderBottom: `1px solid ${T.borderLight}`,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: T.text, fontFamily: T.mono }}>
                  {e.name}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: T.red, fontFamily: T.mono }}>
                  {e.zIndex}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Full z-index table */}
      <SectionHeader>
        All Z-Index Values <CountBadge count={audit.entries.length} />
      </SectionHeader>
      <div style={{
        background: T.bg, borderRadius: T.radiusSm,
        border: `1px solid ${T.borderLight}`, overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, fontFamily: T.mono }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${T.borderLight}` }}>
              <th style={{ padding: '4px 8px', textAlign: 'left', color: T.textDim, fontWeight: 600 }}>Component</th>
              <th style={{ padding: '4px 8px', textAlign: 'left', color: T.textDim, fontWeight: 600 }}>Page</th>
              <th style={{ padding: '4px 8px', textAlign: 'right', color: T.textDim, fontWeight: 600 }}>z-index</th>
            </tr>
          </thead>
          <tbody>
            {audit.entries.slice(0, 30).map((e) => (
              <tr key={`${e.componentId}-${e.pagePath}`} style={{ borderBottom: `1px solid ${T.borderLight}` }}>
                <td style={{ padding: '3px 8px', color: T.text }}>{e.name}</td>
                <td style={{ padding: '3px 8px', color: T.textDim, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.pagePath}
                </td>
                <td style={{
                  padding: '3px 8px', textAlign: 'right', fontWeight: 600,
                  color: Math.abs(e.zIndex) > 100 ? T.red : T.accent,
                }}>
                  {e.zIndex}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {audit.entries.length > 30 && (
          <div style={{ padding: '4px 8px', fontSize: 10, color: T.textDim, textAlign: 'center' }}>
            +{audit.entries.length - 30} more
          </div>
        )}
      </div>
    </div>
  );
}
