import { useMemo, useState } from 'react';
import type { AggregatedColorStats } from '../../../shared/types';
import { generateTokenMap } from '../../../lib/token-generator';
import { T } from '../theme';
import { ActionButton, ColorSwatch, CountBadge, EmptyState, SectionHeader, SeverityBadge, StatCard } from '../primitives';

export function ColorSection({ colorStats }: {
  colorStats: AggregatedColorStats;
}) {
  const [severityFilter, setSeverityFilter] = useState<'all' | 'inline' | 'non-tailwind' | 'tw-arbitrary'>('all');
  const [tokenFormat, setTokenFormat] = useState<'css' | 'tailwind' | 'json'>('css');
  const [tokenCopied, setTokenCopied] = useState(false);

  const tokenMap = useMemo(() => generateTokenMap(colorStats), [colorStats]);

  const filteredTopColors = useMemo(() => {
    if (severityFilter === 'all') return colorStats.topColors;
    return colorStats.topColors.filter((c) => c.severities.includes(severityFilter));
  }, [colorStats.topColors, severityFilter]);

  if (colorStats.uniqueColors === 0) {
    return <EmptyState title="No hardcoded colors detected" description="Colors set via CSS variables or Tailwind utility classes are not flagged." />;
  }

  return (
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
    </div>
  );
}
