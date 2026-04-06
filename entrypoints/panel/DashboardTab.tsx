import { useCallback, useMemo, useState } from 'react';
import type { StoredComponent, StoredPage, StoredPattern, PatternVariant } from '../../shared/types';
import { variantLabel } from '../../shared/variant-label';
import { computeStyleDiff, type StyleDiffEntry } from '../../lib/style-diff';
import { T } from './theme';
import { ActionButton, ClickToCopy, ColorSwatch, CountBadge, EmptyState, SectionHeader, SeverityBadge, StatCard, SearchInput } from './primitives';
import { aggregateColorStats, extractKeyStyles, shortenPath } from './helpers';

export function DashboardTab({ pages, components, patterns, dismissed, onDismiss, onRestore }: {
  pages: StoredPage[];
  components: StoredComponent[];
  patterns: StoredPattern[];
  dismissed: Set<string>;
  onDismiss: (patternId: string, reason: string) => void;
  onRestore: (patternId: string) => void;
}) {
  const [filter, setFilter] = useState('');
  const [showVariantsOnly, setShowVariantsOnly] = useState(false);
  const [showDismissed, setShowDismissed] = useState(false);
  const [expandedPattern, setExpandedPattern] = useState<string | null>(null);
  const [dashSection, setDashSection] = useState<'patterns' | 'colors'>('patterns');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'inline' | 'non-tailwind' | 'tw-arbitrary'>('all');

  // Component lookup by ID for pattern variant display
  const componentById = useMemo(() => {
    const map = new Map<number, StoredComponent>();
    for (const c of components) map.set(c.id, c);
    return map;
  }, [components]);

  const filteredPatterns = useMemo(() => {
    let result = patterns;
    if (!showDismissed) result = result.filter((p) => !dismissed.has(p.patternId));
    if (showVariantsOnly) result = result.filter((p) => p.variants.length > 1);
    if (filter) {
      const q = filter.toLowerCase();
      result = result.filter((p) => p.name.toLowerCase().includes(q));
    }
    return result;
  }, [patterns, filter, showVariantsOnly, dismissed, showDismissed]);

  const multiVariantCount = useMemo(
    () => patterns.filter((p) => p.variants.length > 1).length,
    [patterns],
  );

  const colorStats = useMemo(() => {
    const stats = aggregateColorStats(pages);
    return { ...stats, topColors: stats.topColors.slice(0, 30) };
  }, [pages]);

  const filteredTopColors = useMemo(() => {
    if (severityFilter === 'all') return colorStats.topColors;
    return colorStats.topColors.filter((c) => c.severities.includes(severityFilter));
  }, [colorStats.topColors, severityFilter]);

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
        <StatCard label="HC Colors" value={colorStats.uniqueColors} color={T.red} />
      </div>

      {/* Section toggle */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
        {(['patterns', 'colors'] as const).map((s) => (
          <button key={s} onClick={() => setDashSection(s)} style={{
            padding: '5px 12px', fontSize: 11, fontWeight: dashSection === s ? 600 : 400,
            background: dashSection === s ? T.bgActive : 'transparent',
            color: dashSection === s ? T.text : T.textMuted,
            border: `1px solid ${dashSection === s ? T.border : 'transparent'}`,
            borderRadius: T.radiusSm, cursor: 'pointer', fontFamily: 'inherit',
          }}>
            {s === 'patterns' ? 'Pattern Groups' : 'Color Analysis'}
          </button>
        ))}
      </div>

      {/* Pattern Groups Section */}
      {dashSection === 'patterns' && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <SearchInput value={filter} onChange={setFilter} placeholder="Filter patterns..." />
            </div>
            <label style={{
              fontSize: 11, color: T.textMuted, display: 'flex', alignItems: 'center',
              gap: 4, cursor: 'pointer', whiteSpace: 'nowrap',
            }}>
              <input
                type="checkbox"
                checked={showVariantsOnly}
                onChange={(e) => setShowVariantsOnly(e.target.checked)}
                style={{ accentColor: T.accent }}
              />
              Variants only
            </label>
            <label style={{
              fontSize: 11, color: T.textMuted, display: 'flex', alignItems: 'center',
              gap: 4, cursor: 'pointer', whiteSpace: 'nowrap',
            }}>
              <input
                type="checkbox"
                checked={showDismissed}
                onChange={(e) => setShowDismissed(e.target.checked)}
                style={{ accentColor: T.accent }}
              />
              Show dismissed ({dismissed.size})
            </label>
          </div>

          <SectionHeader>
            Pattern Groups <CountBadge count={filteredPatterns.length} />
          </SectionHeader>

          <div>
            {filteredPatterns.map((pattern) => {
              const isExpanded = expandedPattern === pattern.patternId;
              return (
                <div key={pattern.patternId} style={{
                  marginBottom: 4, background: isExpanded ? T.bgSurface : 'transparent',
                  border: isExpanded ? `1px solid ${T.border}` : 'none',
                  borderRadius: isExpanded ? T.radius : 0,
                  overflow: 'hidden',
                }}>
                  <div
                    onClick={() => setExpandedPattern(isExpanded ? null : pattern.patternId)}
                    style={{
                      padding: '10px 12px', cursor: 'pointer',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      borderBottom: isExpanded ? `1px solid ${T.borderLight}` : `1px solid ${T.borderLight}`,
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: T.text, fontFamily: T.mono }}>
                        {pattern.name}
                      </span>
                      <span style={{ fontSize: 10, color: T.textDim, marginLeft: 8 }}>
                        {pattern.totalInstances} instances
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {pattern.variants.length > 1 && (
                        <span style={{
                          fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 10,
                          background: 'rgba(251, 146, 60, 0.12)', color: T.orange,
                        }}>
                          {pattern.variants.length} variants
                        </span>
                      )}
                      <span style={{ fontSize: 10, color: T.textDim }}>
                        {isExpanded ? '\u25B2' : '\u25BC'}
                      </span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div style={{ padding: 12 }}>
                      {pattern.variants.map((variant) => {
                        const exemplar = componentById.get(variant.exemplarComponentId);
                        const uniquePages = new Set(
                          variant.componentIds.map((id) => componentById.get(id)?.pagePath).filter(Boolean),
                        );
                        return (
                          <div key={variant.variantId} style={{
                            padding: '8px 10px', marginBottom: 6,
                            background: T.bg, borderRadius: T.radiusSm,
                            border: `1px solid ${T.borderLight}`,
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 11, fontWeight: 600, color: T.text }}>
                                {variant.label}
                              </span>
                              <span style={{ fontSize: 10, color: T.textDim }}>
                                {variant.componentIds.length} instances, {uniquePages.size} pages
                              </span>
                            </div>
                            {exemplar && (
                              <div style={{ fontSize: 10, color: T.textDim, marginTop: 4, fontFamily: T.mono }}>
                                <ClickToCopy text={exemplar.sourceFile
                                  ? `${shortenPath(exemplar.sourceFile)}:${exemplar.sourceLine}`
                                  : exemplar.domSelector
                                } />
                                <span style={{ marginLeft: 8 }}>
                                  {exemplar.styleCategories.slice(0, 4).join(' | ')}
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {/* Style Diff (only for multi-variant patterns) */}
                      {pattern.variants.length > 1 && (
                        <StyleDiffView variants={pattern.variants} componentById={componentById} />
                      )}

                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                        <CopyPatternForLLM pattern={pattern} componentById={componentById} />
                        {dismissed.has(pattern.patternId) ? (
                          <button
                            onClick={() => onRestore(pattern.patternId)}
                            style={{
                              padding: '4px 10px', fontSize: 10, fontWeight: 600,
                              background: 'rgba(52, 211, 153, 0.12)', color: T.green,
                              border: `1px solid ${T.green}33`, borderRadius: T.radiusSm,
                              cursor: 'pointer', fontFamily: 'inherit',
                            }}
                          >
                            Restore
                          </button>
                        ) : (
                          <button
                            onClick={() => onDismiss(pattern.patternId, 'intentional')}
                            style={{
                              padding: '4px 10px', fontSize: 10, fontWeight: 600,
                              background: 'rgba(107, 109, 128, 0.12)', color: T.textMuted,
                              border: `1px solid ${T.border}`, borderRadius: T.radiusSm,
                              cursor: 'pointer', fontFamily: 'inherit',
                            }}
                          >
                            Dismiss
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Color Analysis Section */}
      {dashSection === 'colors' && (
        <>
          {colorStats.uniqueColors === 0 ? (
            <EmptyState title="No hardcoded colors detected" description="Colors set via CSS variables or Tailwind utility classes are not flagged." />
          ) : (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
                <StatCard label="Unique Colors" value={colorStats.uniqueColors} color={T.red} />
                <StatCard label="Total Usages" value={colorStats.totalUsages} color={T.yellow} />
              </div>

              {/* Near duplicates */}
              {colorStats.nearDuplicates.length > 0 && (
                <>
                  <SectionHeader>
                    Near-Duplicate Colors <CountBadge count={colorStats.nearDuplicates.length} />
                  </SectionHeader>
                  <div style={{ marginBottom: 16 }}>
                    {colorStats.nearDuplicates.map((dup, i) => (
                      <div key={i} style={{
                        padding: '8px 12px', borderBottom: `1px solid ${T.borderLight}`,
                        display: 'flex', alignItems: 'center', gap: 10,
                      }}>
                        <ColorSwatch hex={dup.a} />
                        <span style={{ fontSize: 11, fontFamily: T.mono, color: T.textMuted }}>{dup.a}</span>
                        <span style={{ fontSize: 10, color: T.textDim }}>vs</span>
                        <ColorSwatch hex={dup.b} />
                        <span style={{ fontSize: 11, fontFamily: T.mono, color: T.textMuted }}>{dup.b}</span>
                        <span style={{
                          marginLeft: 'auto', fontSize: 10, color: T.yellow,
                          fontWeight: 600, fontFamily: T.mono,
                        }}>
                          dist: {dup.distance.toFixed(1)}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Top colors with severity filter */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <SectionHeader>
                  Top Hardcoded Colors <CountBadge count={filteredTopColors.length} />
                </SectionHeader>
                <select
                  value={severityFilter}
                  onChange={(e) => setSeverityFilter(e.target.value as typeof severityFilter)}
                  style={{
                    padding: '4px 8px', borderRadius: T.radiusSm, fontSize: 10,
                    border: `1px solid ${T.border}`, background: T.bgSurface,
                    color: T.text, outline: 'none', fontFamily: 'inherit',
                  }}
                >
                  <option value="all">All severities</option>
                  <option value="inline">Inline styles</option>
                  <option value="non-tailwind">Non-Tailwind</option>
                  <option value="tw-arbitrary">TW arbitrary</option>
                </select>
              </div>
              <div>
                {filteredTopColors.map((c, i) => (
                  <div key={i} style={{
                    padding: '8px 12px', borderBottom: `1px solid ${T.borderLight}`,
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}>
                    <ColorSwatch hex={c.hex} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 11, fontFamily: T.mono, color: T.text }}>{c.hex}</span>
                        {c.severities.map((s) => (
                          <SeverityBadge key={s} severity={s} />
                        ))}
                      </div>
                      <div style={{ fontSize: 10, color: T.textDim, marginTop: 1 }}>
                        {c.usedAs.join(', ')}
                      </div>
                    </div>
                    <span style={{
                      fontSize: 11, fontWeight: 600, color: T.textMuted, fontFamily: T.mono,
                    }}>
                      {c.count}x
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ColorSwatch({ hex }: { hex: string }) {
  return (
    <span style={{
      display: 'inline-block', width: 16, height: 16, borderRadius: 4,
      background: hex, border: '1px solid rgba(255,255,255,0.15)', flexShrink: 0,
    }} />
  );
}

const SEVERITY_COLORS: Record<string, { bg: string; text: string }> = {
  inline: { bg: 'rgba(248, 113, 113, 0.12)', text: T.red },
  'non-tailwind': { bg: 'rgba(251, 191, 36, 0.12)', text: T.yellow },
  'tw-arbitrary': { bg: 'rgba(129, 140, 248, 0.12)', text: T.accent },
};

function SeverityBadge({ severity }: { severity: string }) {
  const colors = SEVERITY_COLORS[severity] ?? { bg: 'rgba(255,255,255,0.06)', text: T.textDim };
  return (
    <span style={{
      fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 8,
      background: colors.bg, color: colors.text, whiteSpace: 'nowrap',
    }}>
      {severity}
    </span>
  );
}


// ─── Style Diff View ───

function StyleDiffView({ variants, componentById }: {
  variants: StoredPattern['variants'];
  componentById: Map<number, StoredComponent>;
}) {
  const diffs = useMemo(() => {
    const variantStyles = new Map<string, Record<string, string>>();
    for (const v of variants) {
      const exemplar = componentById.get(v.exemplarComponentId);
      if (exemplar?.computedStyles) {
        variantStyles.set(v.variantId, exemplar.computedStyles);
      }
    }
    return computeStyleDiff(variantStyles);
  }, [variants, componentById]);

  const variantLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const v of variants) map.set(v.variantId, v.label);
    return map;
  }, [variants]);

  if (diffs.length === 0) return null;

  return (
    <div style={{ marginTop: 8, marginBottom: 4 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: T.textMuted, marginBottom: 6 }}>
        Style Differences ({diffs.length} properties)
      </div>
      <div style={{
        background: T.bg, borderRadius: T.radiusSm,
        border: `1px solid ${T.borderLight}`, overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, fontFamily: T.mono }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${T.borderLight}` }}>
              <th style={{ padding: '4px 8px', textAlign: 'left', color: T.textDim, fontWeight: 600 }}>Property</th>
              {variants.map((v) => (
                <th key={v.variantId} style={{ padding: '4px 8px', textAlign: 'left', color: T.orange, fontWeight: 600 }}>
                  {variantLabels.get(v.variantId) ?? v.variantId}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {diffs.slice(0, 20).map((diff) => (
              <tr key={diff.property} style={{ borderBottom: `1px solid ${T.borderLight}` }}>
                <td style={{ padding: '3px 8px', color: T.accent }}>{diff.property}</td>
                {variants.map((v) => {
                  const val = diff.values.get(v.variantId) ?? '';
                  const shortVal = val.length > 30 ? val.slice(0, 27) + '...' : val;
                  return (
                    <td key={v.variantId} style={{ padding: '3px 8px', color: T.text }} title={val}>
                      {shortVal}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {diffs.length > 20 && (
          <div style={{ padding: '4px 8px', fontSize: 10, color: T.textDim, textAlign: 'center' }}>
            +{diffs.length - 20} more properties
          </div>
        )}
      </div>
    </div>
  );
}

function CopyPatternForLLM({ pattern, componentById }: {
  pattern: StoredPattern;
  componentById: Map<number, StoredComponent>;
}) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  const handleCopy = useCallback(() => {
    let xml = `<pattern_group name="${pattern.name}" instances="${pattern.totalInstances}">\n`;
    for (const variant of pattern.variants) {
      const exemplar = componentById.get(variant.exemplarComponentId);
      xml += `  <variant label="${variant.label}" instances="${variant.componentIds.length}">\n`;
      for (const id of variant.componentIds.slice(0, 5)) {
        const comp = componentById.get(id);
        if (comp) {
          xml += `    <instance file="${comp.sourceFile ?? 'unknown'}" line="${comp.sourceLine ?? '?'}" page="${comp.pagePath}" />\n`;
        }
      }
      if (variant.componentIds.length > 5) xml += `    <!-- ... and ${variant.componentIds.length - 5} more -->\n`;
      if (exemplar) {
        xml += `    <exemplar_styles>${exemplar.styleCategories.join(' | ')}</exemplar_styles>\n`;
      }
      xml += '  </variant>\n';
    }
    xml += '</pattern_group>\n\n';
    xml += '<instructions>\n';
    xml += `Analyze the "${pattern.name}" component pattern above.\n`;
    xml += '1. Read each variant\'s source files\n';
    xml += '2. Identify the canonical variant (most instances)\n';
    xml += '3. Generate migration code to consolidate non-canonical variants\n';
    xml += '</instructions>\n';

    navigator.clipboard.writeText(xml).then(
      () => { setStatus('copied'); setTimeout(() => setStatus('idle'), 2000); },
      () => { setStatus('failed'); setTimeout(() => setStatus('idle'), 2000); },
    );
  }, [pattern, componentById]);

  return (
    <button onClick={handleCopy} style={{
      marginTop: 6, padding: '5px 10px', fontSize: 10, fontWeight: 600,
      background: status === 'copied' ? 'rgba(52, 211, 153, 0.12)' : status === 'failed' ? 'rgba(248, 113, 113, 0.12)' : 'rgba(129, 140, 248, 0.08)',
      color: status === 'copied' ? T.green : status === 'failed' ? T.red : T.accent,
      border: `1px solid ${status === 'copied' ? T.green : status === 'failed' ? T.red : T.accentDim}`,
      borderRadius: T.radiusSm, cursor: 'pointer', fontFamily: 'inherit',
      width: '100%',
    }}>
      {status === 'copied' ? 'Copied!' : status === 'failed' ? 'Copy failed' : 'Copy for LLM'}
    </button>
  );
}
