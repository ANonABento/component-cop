import { useCallback, useMemo, useState } from 'react';
import type { StoredComponent, StoredPage, StoredPattern } from '../../shared/types';
import { computeStyleDiff } from '../../lib/style-diff';
import { T } from './theme';
import { ActionButton, ColorSwatch, CountBadge, EmptyState, SectionHeader, SeverityBadge, SourceLink, StatCard, SearchInput } from './primitives';
import { aggregateColorStats, extractKeyStyles, shortenPath } from './helpers';
import { generateTokenMap } from '../../lib/token-generator';
import { computePropDiff } from '../../lib/prop-diff';
import { generateConsolidationSuggestion } from '../../lib/consolidation';

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
  const [tokenFormat, setTokenFormat] = useState<'css' | 'tailwind' | 'json'>('css');
  const [tokenCopied, setTokenCopied] = useState(false);

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

  const tokenMap = useMemo(() => generateTokenMap(colorStats), [colorStats]);

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
                              <div style={{ fontSize: 10, color: T.textDim, marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <SourceLink file={exemplar.sourceFile} line={exemplar.sourceLine} column={exemplar.sourceColumn} />
                                <span style={{ fontFamily: T.mono }}>
                                  {exemplar.styleCategories.slice(0, 4).join(' | ')}
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {/* Prop Diff (only for multi-variant patterns) */}
                      {pattern.variants.length > 1 && (
                        <PropDiffView variants={pattern.variants} componentById={componentById} />
                      )}

                      {/* Style Diff (only for multi-variant patterns) */}
                      {pattern.variants.length > 1 && (
                        <StyleDiffView variants={pattern.variants} componentById={componentById} />
                      )}

                      {/* Dependency Graph: which pages render which variant */}
                      {pattern.variants.length > 1 && (
                        <DependencyView variants={pattern.variants} componentById={componentById} />
                      )}

                      {/* Consolidation Suggestion */}
                      {pattern.variants.length > 1 && (
                        <ConsolidationBanner pattern={pattern} componentById={componentById} />
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

          {/* Design Token Extraction */}
          {tokenMap.tokens.length > 0 && (
            <>
              <div style={{ marginTop: 20 }}>
                <SectionHeader>
                  Proposed Design Tokens <CountBadge count={tokenMap.tokens.length} />
                </SectionHeader>
                <div style={{ fontSize: 11, color: T.textDim, marginBottom: 12, lineHeight: 1.5 }}>
                  Consolidated tokens with near-duplicates merged. Copy to replace hardcoded values.
                </div>
              </div>

              {/* Token list */}
              <div style={{ marginBottom: 12 }}>
                {tokenMap.tokens.slice(0, 20).map((token) => (
                  <div key={token.name} style={{
                    padding: '6px 12px', borderBottom: `1px solid ${T.borderLight}`,
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}>
                    <ColorSwatch hex={token.value} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 11, fontFamily: T.mono, color: T.accent, fontWeight: 600 }}>
                          --{token.name}
                        </span>
                        <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textDim }}>
                          {token.value}
                        </span>
                      </div>
                      <div style={{ fontSize: 10, color: T.textDim, marginTop: 1 }}>
                        {token.usedAs.join(', ')}
                        {token.merged.length > 0 && (
                          <span style={{ color: T.yellow }}> (merges {token.merged.join(', ')})</span>
                        )}
                      </div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 600, color: T.textMuted, fontFamily: T.mono }}>
                      {token.replacesCount}x
                    </span>
                  </div>
                ))}
              </div>

              {/* Export format selector + copy */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <select
                  value={tokenFormat}
                  onChange={(e) => setTokenFormat(e.target.value as typeof tokenFormat)}
                  style={{
                    padding: '5px 8px', borderRadius: T.radiusSm, fontSize: 10,
                    border: `1px solid ${T.border}`, background: T.bgSurface,
                    color: T.text, outline: 'none', fontFamily: 'inherit',
                  }}
                >
                  <option value="css">CSS Variables</option>
                  <option value="tailwind">Tailwind Config</option>
                  <option value="json">Token JSON</option>
                </select>
                <ActionButton
                  onClick={() => {
                    const text = tokenFormat === 'css' ? tokenMap.cssVariables
                      : tokenFormat === 'tailwind' ? tokenMap.tailwindConfig
                      : tokenMap.tokenJson;
                    navigator.clipboard.writeText(text).then(
                      () => { setTokenCopied(true); setTimeout(() => setTokenCopied(false), 2000); },
                      () => {},
                    );
                  }}
                  variant="secondary"
                  small
                >
                  {tokenCopied ? 'Copied!' : 'Copy'}
                </ActionButton>
              </div>

              <div style={{
                background: '#11111b', border: `1px solid ${T.borderLight}`,
                borderRadius: T.radiusSm, padding: 10, fontSize: 10, fontFamily: T.mono,
                maxHeight: 200, overflow: 'auto', whiteSpace: 'pre', color: '#a6adc8', lineHeight: 1.5,
              }}>
                {tokenFormat === 'css' ? tokenMap.cssVariables
                  : tokenFormat === 'tailwind' ? tokenMap.tailwindConfig
                  : tokenMap.tokenJson}
              </div>
            </>
          )}
        </>
      )}
    </div>
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

// ─── Prop Diff View ───

function PropDiffView({ variants, componentById }: {
  variants: StoredPattern['variants'];
  componentById: Map<number, StoredComponent>;
}) {
  const diffs = useMemo(() => {
    const variantProps = new Map<string, Record<string, unknown>>();
    for (const v of variants) {
      const exemplar = componentById.get(v.exemplarComponentId);
      if (exemplar?.props) variantProps.set(v.label, exemplar.props);
    }
    return computePropDiff(variantProps);
  }, [variants, componentById]);

  if (diffs.length === 0) return null;

  const nonShared = diffs.filter((d) => d.classification !== 'shared');
  if (nonShared.length === 0) return null;

  return (
    <div style={{ marginTop: 8, marginBottom: 4 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: T.textMuted, marginBottom: 6 }}>
        Prop Differences ({nonShared.length} props)
      </div>
      <div style={{
        background: T.bg, borderRadius: T.radiusSm,
        border: `1px solid ${T.borderLight}`, overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, fontFamily: T.mono }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${T.borderLight}` }}>
              <th style={{ padding: '4px 8px', textAlign: 'left', color: T.textDim, fontWeight: 600 }}>Prop</th>
              <th style={{ padding: '4px 8px', textAlign: 'left', color: T.textDim, fontWeight: 600, width: 60 }}>Type</th>
              {variants.map((v) => (
                <th key={v.variantId} style={{ padding: '4px 8px', textAlign: 'left', color: T.orange, fontWeight: 600 }}>
                  {v.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {nonShared.slice(0, 15).map((diff) => (
              <tr key={diff.key} style={{ borderBottom: `1px solid ${T.borderLight}` }}>
                <td style={{ padding: '3px 8px', color: T.accent }}>{diff.key}</td>
                <td style={{ padding: '3px 8px' }}>
                  <span style={{
                    fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 6,
                    background: diff.classification === 'unique' ? 'rgba(248, 113, 113, 0.12)' : 'rgba(251, 191, 36, 0.12)',
                    color: diff.classification === 'unique' ? T.red : T.yellow,
                  }}>
                    {diff.classification}
                  </span>
                </td>
                {variants.map((v) => {
                  const val = diff.values.get(v.label) ?? '';
                  const shortVal = val.length > 25 ? val.slice(0, 22) + '...' : val;
                  return (
                    <td key={v.variantId} style={{
                      padding: '3px 8px',
                      color: val === '(not set)' ? T.textDim : T.text,
                      fontStyle: val === '(not set)' ? 'italic' : 'normal',
                    }} title={val}>
                      {shortVal}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {nonShared.length > 15 && (
          <div style={{ padding: '4px 8px', fontSize: 10, color: T.textDim, textAlign: 'center' }}>
            +{nonShared.length - 15} more props
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Dependency View ───

function DependencyView({ variants, componentById }: {
  variants: StoredPattern['variants'];
  componentById: Map<number, StoredComponent>;
}) {
  const pageMap = useMemo(() => {
    const result: { label: string; pages: { path: string; count: number }[] }[] = [];
    for (const v of variants) {
      const pageCounts = new Map<string, number>();
      for (const id of v.componentIds) {
        const comp = componentById.get(id);
        if (comp) pageCounts.set(comp.pagePath, (pageCounts.get(comp.pagePath) ?? 0) + 1);
      }
      result.push({
        label: v.label,
        pages: Array.from(pageCounts.entries())
          .map(([path, count]) => ({ path, count }))
          .sort((a, b) => b.count - a.count),
      });
    }
    return result;
  }, [variants, componentById]);

  // Collect all unique pages across all variants
  const allPages = useMemo(() => {
    const set = new Set<string>();
    for (const v of pageMap) for (const p of v.pages) set.add(p.path);
    return Array.from(set).sort();
  }, [pageMap]);

  if (allPages.length === 0) return null;

  return (
    <div style={{ marginTop: 8, marginBottom: 4 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: T.textMuted, marginBottom: 6 }}>
        Page Usage ({allPages.length} pages)
      </div>
      <div style={{
        background: T.bg, borderRadius: T.radiusSm,
        border: `1px solid ${T.borderLight}`, overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, fontFamily: T.mono }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${T.borderLight}` }}>
              <th style={{ padding: '4px 8px', textAlign: 'left', color: T.textDim, fontWeight: 600 }}>Page</th>
              {pageMap.map((v) => (
                <th key={v.label} style={{ padding: '4px 8px', textAlign: 'center', color: T.orange, fontWeight: 600 }}>
                  {v.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allPages.slice(0, 15).map((pagePath) => (
              <tr key={pagePath} style={{ borderBottom: `1px solid ${T.borderLight}` }}>
                <td style={{ padding: '3px 8px', color: T.text, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    title={pagePath}>
                  {shortenPath(pagePath)}
                </td>
                {pageMap.map((v) => {
                  const entry = v.pages.find((p) => p.path === pagePath);
                  return (
                    <td key={v.label} style={{
                      padding: '3px 8px', textAlign: 'center',
                      color: entry ? T.green : T.textDim,
                      fontWeight: entry ? 600 : 400,
                    }}>
                      {entry ? entry.count : '—'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {allPages.length > 15 && (
          <div style={{ padding: '4px 8px', fontSize: 10, color: T.textDim, textAlign: 'center' }}>
            +{allPages.length - 15} more pages
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Consolidation Banner ───

const EFFORT_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  low: { bg: 'rgba(52, 211, 153, 0.12)', text: T.green, label: 'Quick win' },
  medium: { bg: 'rgba(251, 191, 36, 0.12)', text: T.yellow, label: 'Moderate' },
  high: { bg: 'rgba(248, 113, 113, 0.12)', text: T.red, label: 'Major refactor' },
};

function ConsolidationBanner({ pattern, componentById }: {
  pattern: StoredPattern;
  componentById: Map<number, StoredComponent>;
}) {
  const suggestion = useMemo(
    () => generateConsolidationSuggestion(pattern, componentById),
    [pattern, componentById],
  );

  if (!suggestion) return null;

  const effortStyle = EFFORT_COLORS[suggestion.effort] ?? EFFORT_COLORS.medium!;

  return (
    <div style={{
      marginTop: 8, padding: '10px 12px',
      background: 'rgba(129, 140, 248, 0.06)',
      border: `1px solid ${T.accentDim}`,
      borderRadius: T.radiusSm,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: T.accent }}>Suggestion</span>
        <span style={{
          fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 8,
          background: effortStyle.bg, color: effortStyle.text,
        }}>
          {effortStyle.label}
        </span>
      </div>
      <div style={{ fontSize: 11, color: T.text, lineHeight: 1.5 }}>
        {suggestion.suggestion}
      </div>
      {suggestion.propApi && (
        <div style={{
          marginTop: 6, padding: '4px 8px',
          background: T.bg, borderRadius: T.radiusSm,
          fontFamily: T.mono, fontSize: 10, color: T.accent,
        }}>
          {suggestion.propApi}
        </div>
      )}
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
        const keyStyles = extractKeyStyles(exemplar.computedStyles);
        xml += `    <exemplar_styles>${exemplar.styleCategories.join(' | ')}</exemplar_styles>\n`;
        xml += `    <computed_styles>\n`;
        for (const [prop, val] of Object.entries(keyStyles)) {
          xml += `      ${prop}: ${val}\n`;
        }
        xml += `    </computed_styles>\n`;
      }
      xml += '  </variant>\n';
    }

    // Include style diff between variants
    if (pattern.variants.length > 1) {
      const variantStyles = new Map<string, Record<string, string>>();
      for (const v of pattern.variants) {
        const exemplar = componentById.get(v.exemplarComponentId);
        if (exemplar) variantStyles.set(v.label, exemplar.computedStyles);
      }
      const diffs = computeStyleDiff(variantStyles);
      if (diffs.length > 0) {
        xml += `\n  <style_diff properties="${diffs.length}">\n`;
        for (const diff of diffs.slice(0, 20)) {
          xml += `    <property name="${diff.property}">\n`;
          for (const [label, val] of diff.values) {
            xml += `      ${label}: ${val}\n`;
          }
          xml += `    </property>\n`;
        }
        if (diffs.length > 20) xml += `    <!-- ... and ${diffs.length - 20} more properties -->\n`;
        xml += `  </style_diff>\n`;
      }
    }

    xml += '</pattern_group>\n\n';
    xml += '<instructions>\n';
    xml += `Analyze the "${pattern.name}" component pattern above.\n`;
    xml += '1. Read each variant\'s source files\n';
    xml += '2. Identify the canonical variant (most instances)\n';
    xml += '3. Compare the style_diff section to understand exact CSS differences\n';
    xml += '4. Generate migration code to consolidate non-canonical variants\n';
    xml += '5. Suggest a unified prop API if variants differ by size, color, or layout\n';
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
