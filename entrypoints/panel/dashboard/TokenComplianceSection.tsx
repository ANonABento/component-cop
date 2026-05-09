import { useMemo, useState } from 'react';
import type { StoredComponent } from '../../../shared/types';
import { auditTokenCompliance } from '../../../lib/token-compliance';
import type { DesignTokenSet } from '../../../lib/token-compliance';
import { T } from '../theme';
import { CountBadge, EmptyState, SectionHeader, StatCard } from '../primitives';

export function TokenComplianceSection({ components, tokenSet }: {
  components: StoredComponent[];
  tokenSet: DesignTokenSet | null;
}) {
  const [filterCategory, setFilterCategory] = useState<string>('all');

  const audit = useMemo(() => {
    if (!tokenSet) return null;
    return auditTokenCompliance(components, tokenSet);
  }, [components, tokenSet]);

  if (!tokenSet) {
    return <EmptyState title="No design tokens configured" description="Add a token set in the Options page to check compliance." />;
  }

  if (!audit || audit.totalChecks === 0) {
    return <EmptyState title="No checks performed" description="Scan pages and define tokens to see compliance results." />;
  }

  const filtered = filterCategory === 'all'
    ? audit.violations
    : audit.violations.filter((v) => v.category === filterCategory);

  const gaugeColor = audit.compliancePercent >= 80 ? T.green
    : audit.compliancePercent >= 50 ? T.yellow
    : T.red;

  return (
    <div>
      {/* Compliance gauge */}
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 48, fontWeight: 800, color: gaugeColor, fontFamily: T.mono }}>
          {audit.compliancePercent}%
        </div>
        <div style={{ fontSize: 11, color: T.textMuted }}>
          {audit.compliantChecks} / {audit.totalChecks} checks compliant
        </div>
      </div>

      {/* Category breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 8, marginBottom: 16 }}>
        {audit.byCategory.map((cat) => (
          <StatCard key={cat.category} label={cat.category} value={cat.percent} color={
            cat.percent >= 80 ? T.green : cat.percent >= 50 ? T.yellow : T.red
          } />
        ))}
      </div>

      {/* Violations */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <SectionHeader>
          Violations <CountBadge count={filtered.length} />
        </SectionHeader>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          style={{
            padding: '4px 8px', borderRadius: T.radiusSm, fontSize: 10,
            border: `1px solid ${T.border}`, background: T.bgSurface,
            color: T.text, outline: 'none', fontFamily: 'inherit',
          }}
        >
          <option value="all">All categories</option>
          <option value="color">Color</option>
          <option value="spacing">Spacing</option>
          <option value="typography">Typography</option>
          <option value="border-radius">Border Radius</option>
        </select>
      </div>

      <div>
        {filtered.slice(0, 50).map((v, i) => (
          <div key={i} style={{
            padding: '8px 12px', borderBottom: `1px solid ${T.borderLight}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: T.text, fontFamily: T.mono }}>
                {v.componentName}
              </span>
              <span style={{
                fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 6,
                background: 'rgba(248, 113, 113, 0.12)', color: T.red,
              }}>
                {v.category}
              </span>
              <span style={{ fontSize: 10, color: T.textDim }}>{v.pagePath}</span>
            </div>
            <div style={{ fontSize: 10, marginTop: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: T.textMuted }}>{v.property}:</span>
              <span style={{ fontFamily: T.mono, color: T.red }}>{v.actual}</span>
              {v.nearestToken && (
                <>
                  <span style={{ color: T.textDim }}>→</span>
                  <span style={{ fontFamily: T.mono, color: T.green }}>
                    {v.nearestToken.name} ({v.nearestToken.value})
                  </span>
                </>
              )}
            </div>
          </div>
        ))}
        {filtered.length > 50 && (
          <div style={{ padding: '8px', fontSize: 10, color: T.textDim, textAlign: 'center' }}>
            +{filtered.length - 50} more violations
          </div>
        )}
      </div>
    </div>
  );
}
