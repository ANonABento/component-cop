import { useCallback, useMemo, useState } from 'react';
import type { ReactDetectionResult, SimilarityMatch } from '../../shared/types';
import { EXACT_MATCH_THRESHOLD, STRONG_MATCH_THRESHOLD } from '../../shared/constants';
import { T } from './theme';
import { ActionButton, ClickToCopy, CountBadge, EmptyState, PulsingDot, SectionHeader , SourceLink} from './primitives';
import { extractKeyStyles } from './helpers';

interface PickerResult {
  component: import('../../shared/types').ComponentData;
  matches: SimilarityMatch[];
}

export { type PickerResult };

export function PickerTab({ onPick, onCancel, picking, result, reactStatus, navStatus, onNavigateStart, onNavigateNext, onNavigatePrev, onNavigateExit, onGotoPage }: {
  onPick: () => void; onCancel: () => void; picking: boolean;
  result: PickerResult | null; reactStatus: ReactDetectionResult | null;
  navStatus: { current: number; total: number } | null;
  onNavigateStart: (target: { componentName: string; styleCategories: string[]; structureHash: string }) => void;
  onNavigateNext: () => void; onNavigatePrev: () => void; onNavigateExit: () => void;
  onGotoPage: (url: string, target: { componentName: string; styleCategories: string[]; structureHash: string }) => void;
}) {
  const disabled = !reactStatus?.found;
  const [copied, setCopied] = useState<'json' | 'llm' | false>(false);

  const generatePickerExport = useCallback(() => {
    if (!result) return '';
    return JSON.stringify({
      selected: {
        name: result.component.componentName,
        source: result.component.sourceFile
          ? `${result.component.sourceFile}:${result.component.sourceLine}` : null,
        page: result.component.pagePath,
        selector: result.component.domSelector,
        styleFingerprint: result.component.styleFingerprint,
        structureHash: result.component.structureHash,
        size: `${Math.round(result.component.boundingRect.width)}x${Math.round(result.component.boundingRect.height)}`,
        domStructure: result.component.domStructure,
        keyStyles: extractKeyStyles(result.component.computedStyles),
      },
      similarComponents: result.matches.map((m) => ({
        name: m.component.componentName,
        source: m.component.sourceFile
          ? `${m.component.sourceFile}:${m.component.sourceLine}` : null,
        page: m.component.pagePath,
        score: Math.round(m.score * 100),
        styleScore: Math.round(m.styleScore * 100),
        structureScore: Math.round(m.structureScore * 100),
        domStructure: m.component.domStructure,
        keyStyles: extractKeyStyles(m.component.computedStyles),
      })),
    }, null, 2);
  }, [result]);

  const generateLLMExport = useCallback(() => {
    if (!result) return '';
    const c = result.component;

    let output = '<component_audit>\n';
    output += `You are auditing a React application for component consistency and consolidation opportunities.\n`;
    output += `A user picked a component and the tool found ${result.matches.length} similar instances across scanned pages.\n\n`;

    output += '<selected_component>\n';
    output += `  name: ${c.componentName}\n`;
    output += `  source: ${c.sourceFile ? `${c.sourceFile}:${c.sourceLine}` : 'unknown'}\n`;
    output += `  page: ${c.pagePath}\n`;
    output += `  selector: ${c.domSelector}\n`;
    output += `  size: ${Math.round(c.boundingRect.width)}x${Math.round(c.boundingRect.height)}\n`;
    output += `  fingerprint: ${c.styleFingerprint}\n`;
    output += `  structure_hash: ${c.structureHash}\n\n`;
    output += '  <dom_structure>\n';
    for (const line of c.domStructure.split('\n')) {
      output += `    ${line}\n`;
    }
    output += '  </dom_structure>\n\n';
    output += '  <key_styles>\n';
    const styles = extractKeyStyles(c.computedStyles);
    for (const [prop, val] of Object.entries(styles)) {
      output += `    ${prop}: ${val}\n`;
    }
    output += '  </key_styles>\n';
    output += '</selected_component>\n\n';

    if (result.matches.length > 0) {
      output += '<similar_instances>\n';
      for (const match of result.matches) {
        const m = match.component;
        const pct = Math.round(match.score * 100);
        output += `  <instance similarity="${pct}%" style_score="${Math.round(match.styleScore * 100)}%" structure_score="${Math.round(match.structureScore * 100)}%">\n`;
        output += `    name: ${m.componentName}\n`;
        output += `    source: ${m.sourceFile ? `${m.sourceFile}:${m.sourceLine}` : 'unknown'}\n`;
        output += `    page: ${m.pagePath}\n`;
        output += `    selector: ${m.domSelector}\n`;
        output += `    size: ${Math.round(m.boundingRect.width)}x${Math.round(m.boundingRect.height)}\n`;
        output += `    fingerprint: ${m.styleFingerprint}\n`;
        output += `    structure_hash: ${m.structureHash}\n\n`;
        output += '    <dom_structure>\n';
        for (const line of m.domStructure.split('\n')) {
          output += `      ${line}\n`;
        }
        output += '    </dom_structure>\n\n';
        output += '    <key_styles>\n';
        const mStyles = extractKeyStyles(m.computedStyles);
        for (const [prop, val] of Object.entries(mStyles)) {
          output += `      ${prop}: ${val}\n`;
        }
        output += '    </key_styles>\n';
        output += '  </instance>\n\n';
      }
      output += '</similar_instances>\n\n';
    }

    output += '<instructions>\n';
    output += 'Analyze the selected component and its similar instances:\n\n';
    output += '1. **Consolidation check**: Are these the same logical component? Could they share a single implementation?\n';
    output += '2. **Style consistency**: Compare key_styles across instances. Flag any visual inconsistencies (different fonts, colors, spacing, borders).\n';
    output += '3. **Structure consistency**: Compare dom_structure trees. Are they using the same HTML patterns? Different nesting or element choices?\n';
    output += '4. **Hardcoded values**: Look for values that should be design tokens or shared constants (colors, sizes, spacing).\n';
    output += '5. **Recommendations**: For each inconsistency, suggest which variant should be canonical and what changes are needed.\n';
    output += '</instructions>\n';
    output += '</component_audit>\n';

    return output;
  }, [result]);

  const handleCopyJSON = useCallback(() => {
    const text = generatePickerExport();
    if (!text) return;
    navigator.clipboard.writeText(text).then(
      () => { setCopied('json'); setTimeout(() => setCopied(false), 2000); },
      () => {},
    );
  }, [generatePickerExport]);

  const handleCopyLLM = useCallback(() => {
    const text = generateLLMExport();
    if (!text) return;
    navigator.clipboard.writeText(text).then(
      () => { setCopied('llm'); setTimeout(() => setCopied(false), 2000); },
      () => {},
    );
  }, [generateLLMExport]);

  const handleDownloadExport = useCallback(() => {
    const text = generatePickerExport();
    if (!text) return;
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `picker-${result?.component.componentName ?? 'export'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [generatePickerExport, result]);

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
        {picking ? (
          <>
            <ActionButton onClick={onCancel} variant="danger">Cancel</ActionButton>
            <span style={{ fontSize: 12, color: T.accent, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
              <PulsingDot /> Click to lock, scroll/arrows to navigate, click to confirm
            </span>
          </>
        ) : (
          <ActionButton onClick={onPick} disabled={disabled}>Pick Element</ActionButton>
        )}
      </div>

      {!reactStatus?.found && (
        <EmptyState title="No React detected" description="Scan a page first to enable the picker." />
      )}

      {result && (
        <div>
          {/* Selected component card */}
          <div style={{
            background: 'rgba(99, 102, 241, 0.08)',
            border: '1px solid rgba(99, 102, 241, 0.2)',
            borderRadius: T.radius, padding: 14, marginBottom: 12,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={{ fontSize: 13, fontWeight: 700, color: T.accent, fontFamily: T.mono }}>
                  &lt;{result.component.componentName}&gt;
                </span>
                <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <SourceLink file={result.component.sourceFile} line={result.component.sourceLine} column={result.component.sourceColumn} />
                  <span>{Math.round(result.component.boundingRect.width)}x{Math.round(result.component.boundingRect.height)}</span>
                  <span>{result.component.pagePath}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <ActionButton onClick={handleCopyLLM} variant="secondary" small>
                  {copied === 'llm' ? 'Copied!' : 'Copy for LLM'}
                </ActionButton>
                <ActionButton onClick={handleCopyJSON} variant="ghost" small>
                  {copied === 'json' ? 'Copied!' : 'JSON'}
                </ActionButton>
                <ActionButton onClick={handleDownloadExport} variant="ghost" small>
                  DL
                </ActionButton>
              </div>
            </div>
          </div>

          {/* Navigation controls */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
            padding: '8px 12px', background: T.bgSurface, borderRadius: T.radiusSm,
            border: `1px solid ${T.borderLight}`,
          }}>
            {navStatus && navStatus.total > 0 ? (
              <>
                <span style={{ fontSize: 12, fontWeight: 700, color: T.green, fontFamily: T.mono }}>
                  {navStatus.current} / {navStatus.total}
                </span>
                <span style={{ fontSize: 11, color: T.textDim }}>on this page</span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                  <ActionButton onClick={onNavigatePrev} variant="ghost" small>Prev</ActionButton>
                  <ActionButton onClick={onNavigateNext} variant="ghost" small>Next</ActionButton>
                  <ActionButton onClick={onNavigateExit} variant="ghost" small>Stop</ActionButton>
                </div>
              </>
            ) : navStatus && navStatus.total === 0 ? (
              <>
                <span style={{ fontSize: 11, color: T.textDim }}>No matches on this page</span>
                <div style={{ marginLeft: 'auto' }}>
                  <ActionButton onClick={onNavigateExit} variant="ghost" small>Close</ActionButton>
                </div>
              </>
            ) : (
              <ActionButton
                onClick={() => onNavigateStart({
                  componentName: result.component.componentName,
                  styleCategories: result.component.styleCategories,
                  structureHash: result.component.structureHash,
                })}
                variant="secondary"
                small
              >
                Find on Page
              </ActionButton>
            )}
          </div>

          <SimilarMatchesByPage
            matches={result.matches}
            currentPagePath={result.component.pagePath}
            target={{
              componentName: result.component.componentName,
              styleCategories: result.component.styleCategories,
              structureHash: result.component.structureHash,
            }}
            onGotoPage={onGotoPage}
          />
        </div>
      )}

      {!result && !picking && (
        <div style={{ color: T.textMuted, fontSize: 12, lineHeight: 1.8, padding: '16px 0' }}>
          <p style={{ marginBottom: 8, fontWeight: 600, color: T.text }}>How to use the Picker:</p>
          <ol style={{ margin: 0, paddingLeft: 20 }}>
            <li><strong style={{ color: T.text }}>Hover</strong> to highlight elements</li>
            <li><strong style={{ color: T.text }}>Click</strong> to lock onto an element</li>
            <li><strong style={{ color: T.text }}>Scroll / Arrow keys</strong> to navigate the component tree</li>
            <li><strong style={{ color: T.text }}>Click again or Enter</strong> to confirm</li>
            <li><strong style={{ color: T.text }}>Esc</strong> to go back (unlock / cancel)</li>
          </ol>
        </div>
      )}
    </div>
  );
}

function MatchRow({ match }: { match: SimilarityMatch }) {
  const pct = Math.round(match.score * 100);
  let color: string;
  let label: string;
  if (match.score >= EXACT_MATCH_THRESHOLD) { color = T.green; label = 'Exact'; }
  else if (match.score >= STRONG_MATCH_THRESHOLD) { color = T.accent; label = 'Strong'; }
  else { color = T.yellow; label = 'Similar'; }

  return (
    <div style={{
      padding: '10px 0', borderBottom: `1px solid ${T.borderLight}`,
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: T.text, fontFamily: T.mono }}>
          {match.component.componentName}
        </span>
        <div style={{ fontSize: 10, color: T.textDim, marginTop: 2 }}>
          <SourceLink file={match.component.sourceFile} line={match.component.sourceLine} column={match.component.sourceColumn} />
          <span style={{ marginLeft: 8 }}>{match.component.pagePath}</span>
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
        <span style={{
          fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
          background: `${color}18`, color,
        }}>
          {label} {pct}%
        </span>
        <div style={{ fontSize: 9, color: T.textDim, marginTop: 3, fontFamily: T.mono }}>
          s:{Math.round(match.styleScore * 100)} d:{Math.round(match.structureScore * 100)}
        </div>
      </div>
    </div>
  );
}

// ─── Similar Matches by Page ───

function SimilarMatchesByPage({ matches, currentPagePath, target, onGotoPage }: {
  matches: SimilarityMatch[];
  currentPagePath: string;
  target: { componentName: string; styleCategories: string[]; structureHash: string };
  onGotoPage: (url: string, target: { componentName: string; styleCategories: string[]; structureHash: string }) => void;
}) {
  const { currentPageMatches, otherPageGroups, totalOtherPages } = useMemo(() => {
    const current: SimilarityMatch[] = [];
    const byPage = new Map<string, { url: string; matches: SimilarityMatch[] }>();

    for (const m of matches) {
      if (m.component.pagePath === currentPagePath) {
        current.push(m);
      } else {
        const key = m.component.pagePath;
        const existing = byPage.get(key);
        if (existing) {
          existing.matches.push(m);
        } else {
          byPage.set(key, { url: m.component.pageUrl, matches: [m] });
        }
      }
    }

    const groups = Array.from(byPage.entries())
      .map(([pagePath, data]) => ({ pagePath, ...data }))
      .sort((a, b) => b.matches.length - a.matches.length);

    return { currentPageMatches: current, otherPageGroups: groups, totalOtherPages: groups.length };
  }, [matches, currentPagePath]);

  if (matches.length === 0) {
    return <EmptyState title="No matches found" description="Try scanning more pages to build up the component database." />;
  }

  return (
    <div>
      {/* Current page matches */}
      <SectionHeader>
        This Page <CountBadge count={currentPageMatches.length} />
      </SectionHeader>
      {currentPageMatches.length === 0 ? (
        <div style={{ fontSize: 11, color: T.textDim, marginBottom: 16, padding: '8px 0' }}>
          No matches on the current page
        </div>
      ) : (
        <div style={{ marginBottom: 16 }}>
          {currentPageMatches.map((match) => (
            <MatchRow key={match.component.id} match={match} />
          ))}
        </div>
      )}

      {/* Other page matches */}
      {totalOtherPages > 0 && (
        <>
          <SectionHeader>
            Other Pages <CountBadge count={totalOtherPages} />
          </SectionHeader>
          {otherPageGroups.map((group) => (
            <div
              key={group.pagePath}
              style={{
                marginBottom: 12, background: T.bgSurface,
                border: `1px solid ${T.border}`, borderRadius: T.radius,
                overflow: 'hidden',
              }}
            >
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 12px', borderBottom: `1px solid ${T.borderLight}`,
              }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>
                    {group.pagePath}
                  </span>
                  <span style={{ fontSize: 10, color: T.textDim, marginLeft: 8 }}>
                    {group.matches.length} match{group.matches.length !== 1 ? 'es' : ''}
                  </span>
                </div>
                <ActionButton
                  onClick={() => onGotoPage(group.url, target)}
                  variant="secondary"
                  small
                >
                  Go &amp; Find
                </ActionButton>
              </div>
              <div style={{ padding: '0 12px' }}>
                {group.matches.map((match) => (
                  <MatchRow key={match.component.id} match={match} />
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

