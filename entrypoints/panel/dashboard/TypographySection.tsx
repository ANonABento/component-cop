import { useMemo } from 'react';
import type { StoredComponent } from '../../../shared/types';
import { auditTypography } from '../../../lib/typography-audit';
import { T } from '../theme';
import { CountBadge, EmptyState, SectionHeader, StatCard } from '../primitives';

export function TypographySection({ components }: { components: StoredComponent[] }) {
  const audit = useMemo(() => auditTypography(components), [components]);

  if (audit.combinations.length === 0) {
    return <EmptyState title="No typography data" description="Scan pages to analyse font usage." />;
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
        <StatCard label="Type Combos" value={audit.combinations.length} color={T.accent} />
        <StatCard label="Font Families" value={audit.families.length} color={T.green} />
        <StatCard label="Scale Steps" value={audit.typeScale.length} color={T.yellow} />
        <StatCard label="Near-Dup Sizes" value={audit.nearDuplicateSizes.length} color={T.red} />
      </div>

      {/* Type scale visualization */}
      <SectionHeader>Type Scale</SectionHeader>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {audit.typeScale.map((entry) => (
          <div key={entry.size} style={{
            padding: '6px 10px', borderRadius: T.radiusSm,
            border: `1px solid ${T.borderLight}`, background: T.bgSurface,
            textAlign: 'center',
          }}>
            <div style={{ fontSize: entry.sizePx > 32 ? 32 : entry.sizePx, fontWeight: 600, color: T.text, lineHeight: 1.2 }}>
              Aa
            </div>
            <div style={{ fontSize: 9, color: T.textDim, marginTop: 4, fontFamily: T.mono }}>
              {entry.size} ({entry.count}x)
            </div>
          </div>
        ))}
      </div>

      {/* Near-duplicate sizes */}
      {audit.nearDuplicateSizes.length > 0 && (
        <>
          <SectionHeader>
            Near-Duplicate Sizes <CountBadge count={audit.nearDuplicateSizes.length} />
          </SectionHeader>
          <div style={{ marginBottom: 16 }}>
            {audit.nearDuplicateSizes.map((dup, i) => (
              <div key={i} style={{
                padding: '6px 12px', borderBottom: `1px solid ${T.borderLight}`,
                display: 'flex', alignItems: 'center', gap: 10, fontSize: 11,
              }}>
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

      {/* Font families */}
      <SectionHeader>
        Font Families <CountBadge count={audit.families.length} />
      </SectionHeader>
      <div style={{ marginBottom: 16 }}>
        {audit.families.map((f) => (
          <div key={f.family} style={{
            padding: '6px 12px', borderBottom: `1px solid ${T.borderLight}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: T.text }}>{f.family}</span>
            <span style={{ fontSize: 10, color: T.textMuted, fontFamily: T.mono }}>{f.count}x</span>
          </div>
        ))}
      </div>

      {/* Combination table */}
      <SectionHeader>
        Type Combinations <CountBadge count={audit.combinations.length} />
      </SectionHeader>
      <div style={{
        background: T.bg, borderRadius: T.radiusSm,
        border: `1px solid ${T.borderLight}`, overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, fontFamily: T.mono }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${T.borderLight}` }}>
              <th style={{ padding: '4px 8px', textAlign: 'left', color: T.textDim, fontWeight: 600 }}>Family</th>
              <th style={{ padding: '4px 8px', textAlign: 'left', color: T.textDim, fontWeight: 600 }}>Size</th>
              <th style={{ padding: '4px 8px', textAlign: 'left', color: T.textDim, fontWeight: 600 }}>Weight</th>
              <th style={{ padding: '4px 8px', textAlign: 'left', color: T.textDim, fontWeight: 600 }}>LH</th>
              <th style={{ padding: '4px 8px', textAlign: 'right', color: T.textDim, fontWeight: 600 }}>Count</th>
            </tr>
          </thead>
          <tbody>
            {audit.combinations.slice(0, 30).map((c, i) => {
              const shortFamily = c.family.split(',')[0]?.trim().replace(/['"]/g, '') ?? c.family;
              return (
                <tr key={i} style={{ borderBottom: `1px solid ${T.borderLight}` }}>
                  <td style={{ padding: '3px 8px', color: T.text, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {shortFamily}
                  </td>
                  <td style={{ padding: '3px 8px', color: T.accent }}>{c.size}</td>
                  <td style={{ padding: '3px 8px', color: T.text }}>{c.weight}</td>
                  <td style={{ padding: '3px 8px', color: T.textMuted }}>{c.lineHeight}</td>
                  <td style={{ padding: '3px 8px', textAlign: 'right', color: T.textMuted, fontWeight: 600 }}>{c.count}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {audit.combinations.length > 30 && (
          <div style={{ padding: '4px 8px', fontSize: 10, color: T.textDim, textAlign: 'center' }}>
            +{audit.combinations.length - 30} more
          </div>
        )}
      </div>
    </div>
  );
}
