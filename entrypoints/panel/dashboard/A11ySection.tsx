import { useMemo, useState } from 'react';
import type { StoredComponent } from '../../../shared/types';
import { auditA11y } from '../../../lib/a11y-audit';
import type { A11ySeverity } from '../../../lib/a11y-audit';
import { T } from '../theme';
import { CountBadge, EmptyState, SectionHeader, StatCard } from '../primitives';

const SEVERITY_STYLE: Record<A11ySeverity, { bg: string; text: string }> = {
  error: { bg: 'rgba(248, 113, 113, 0.12)', text: T.red },
  warning: { bg: 'rgba(251, 191, 36, 0.12)', text: T.yellow },
  info: { bg: 'rgba(129, 140, 248, 0.12)', text: T.accent },
};

export function A11ySection({ components }: { components: StoredComponent[] }) {
  const audit = useMemo(() => auditA11y(components), [components]);
  const [filterSeverity, setFilterSeverity] = useState<'all' | A11ySeverity>('all');

  if (audit.issues.length === 0) {
    return <EmptyState title="No accessibility issues" description="No common a11y issues detected in scanned components." />;
  }

  const filtered = filterSeverity === 'all'
    ? audit.issues
    : audit.issues.filter((i) => i.severity === filterSeverity);

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
        <StatCard label="Total Issues" value={audit.issues.length} color={T.accent} />
        <StatCard label="Errors" value={audit.errorCount} color={T.red} />
        <StatCard label="Warnings" value={audit.warningCount} color={T.yellow} />
        <StatCard label="Info" value={audit.infoCount} color={T.green} />
      </div>

      {/* Issue type breakdown */}
      <SectionHeader>
        Issues by Type <CountBadge count={audit.byType.length} />
      </SectionHeader>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {audit.byType.map((t) => (
          <span key={t.type} style={{
            fontSize: 10, padding: '3px 8px', borderRadius: 8,
            background: T.bgSurface, border: `1px solid ${T.borderLight}`,
            color: T.text, fontFamily: T.mono,
          }}>
            {t.type} ({t.count})
          </span>
        ))}
      </div>

      {/* Severity filter */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <SectionHeader>
          All Issues <CountBadge count={filtered.length} />
        </SectionHeader>
        <select
          value={filterSeverity}
          onChange={(e) => setFilterSeverity(e.target.value as typeof filterSeverity)}
          style={{
            padding: '4px 8px', borderRadius: T.radiusSm, fontSize: 10,
            border: `1px solid ${T.border}`, background: T.bgSurface,
            color: T.text, outline: 'none', fontFamily: 'inherit',
          }}
        >
          <option value="all">All severities</option>
          <option value="error">Errors</option>
          <option value="warning">Warnings</option>
          <option value="info">Info</option>
        </select>
      </div>

      <div>
        {filtered.slice(0, 50).map((issue, i) => {
          const style = SEVERITY_STYLE[issue.severity];
          return (
            <div key={i} style={{
              padding: '8px 12px', borderBottom: `1px solid ${T.borderLight}`,
              display: 'flex', alignItems: 'flex-start', gap: 8,
            }}>
              <span style={{
                fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 6,
                background: style.bg, color: style.text, flexShrink: 0, marginTop: 1,
              }}>
                {issue.severity}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: T.text, fontFamily: T.mono }}>
                    {issue.componentName}
                  </span>
                  <span style={{ fontSize: 10, color: T.textDim }}>{issue.pagePath}</span>
                </div>
                <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>
                  {issue.message}
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length > 50 && (
          <div style={{ padding: '8px', fontSize: 10, color: T.textDim, textAlign: 'center' }}>
            +{filtered.length - 50} more issues
          </div>
        )}
      </div>
    </div>
  );
}
