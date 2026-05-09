import { useMemo, useState } from 'react';
import type { StoredComponent, StoredPage, StoredPattern } from '../../shared/types';
import { EmptyState, StatCard } from './primitives';
import { aggregateColorStats } from './helpers';
import { T } from './theme';
import { PatternSection } from './dashboard/PatternSection';
import { ColorSection } from './dashboard/ColorSection';
import { ComplexitySection } from './dashboard/ComplexitySection';
import { TypographySection } from './dashboard/TypographySection';
import { SpacingSection } from './dashboard/SpacingSection';
import { ZIndexSection } from './dashboard/ZIndexSection';
import { A11ySection } from './dashboard/A11ySection';
import { TokenComplianceSection } from './dashboard/TokenComplianceSection';
import type { DesignTokenSet } from '../../lib/token-compliance';

/** Dashboard section definitions — extend this array to add new analysis sections. */
const SECTIONS = [
  { key: 'patterns', label: 'Pattern Groups' },
  { key: 'colors', label: 'Color Analysis' },
  { key: 'complexity', label: 'Complexity' },
  { key: 'typography', label: 'Typography' },
  { key: 'spacing', label: 'Spacing' },
  { key: 'zindex', label: 'Z-Index' },
  { key: 'a11y', label: 'Accessibility' },
  { key: 'tokens', label: 'Token Compliance' },
] as const;

type SectionKey = (typeof SECTIONS)[number]['key'];

export function DashboardTab({ pages, components, patterns, dismissed, onDismiss, onRestore, designTokens = null }: {
  pages: StoredPage[];
  components: StoredComponent[];
  patterns: StoredPattern[];
  dismissed: Set<string>;
  onDismiss: (patternId: string, reason: string) => void;
  onRestore: (patternId: string) => void;
  designTokens?: DesignTokenSet | null;
}) {
  const [activeSection, setActiveSection] = useState<SectionKey>('patterns');

  const uniqueColorCount = useMemo(() => {
    const seen = new Set<string>();
    for (const page of pages) {
      if (!page.colorSummary) continue;
      for (const tc of page.colorSummary.topColors) seen.add(tc.hex);
    }
    return seen.size;
  }, [pages]);

  const multiVariantCount = useMemo(
    () => patterns.filter((p) => p.variants.length > 1).length,
    [patterns],
  );

  const colorStats = useMemo(() => {
    if (activeSection !== 'colors') return null;
    const stats = aggregateColorStats(pages);
    return { ...stats, topColors: stats.topColors.slice(0, 30) };
  }, [pages, activeSection]);

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
        <StatCard label="HC Colors" value={uniqueColorCount} color={T.red} />
      </div>

      {/* Section pill bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, overflowX: 'auto' }}>
        {SECTIONS.map((s) => (
          <button key={s.key} onClick={() => setActiveSection(s.key)} style={{
            padding: '5px 12px', fontSize: 11, fontWeight: activeSection === s.key ? 600 : 400,
            background: activeSection === s.key ? T.bgActive : 'transparent',
            color: activeSection === s.key ? T.text : T.textMuted,
            border: `1px solid ${activeSection === s.key ? T.border : 'transparent'}`,
            borderRadius: T.radiusSm, cursor: 'pointer', fontFamily: 'inherit',
            whiteSpace: 'nowrap',
          }}>
            {s.label}
          </button>
        ))}
      </div>

      {/* Active section */}
      {activeSection === 'patterns' && (
        <PatternSection
          patterns={patterns}
          components={components}
          dismissed={dismissed}
          onDismiss={onDismiss}
          onRestore={onRestore}
        />
      )}
      {activeSection === 'colors' && colorStats && (
        <ColorSection colorStats={colorStats} />
      )}
      {activeSection === 'complexity' && (
        <ComplexitySection components={components} />
      )}
      {activeSection === 'typography' && (
        <TypographySection components={components} />
      )}
      {activeSection === 'spacing' && (
        <SpacingSection components={components} />
      )}
      {activeSection === 'zindex' && (
        <ZIndexSection components={components} />
      )}
      {activeSection === 'a11y' && (
        <A11ySection components={components} />
      )}
      {activeSection === 'tokens' && (
        <TokenComplianceSection components={components} tokenSet={designTokens} />
      )}
    </div>
  );
}
