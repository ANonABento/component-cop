import { useCallback, useMemo, useState } from 'react';
import type { StoredComponent, StoredPage, StoredPattern } from '../../shared/types';
import { variantLabel } from '../../shared/variant-label';
import { T } from './theme';
import { ActionButton, EmptyState } from './primitives';
import { aggregateColorStats, groupByName } from './helpers';

export function ExportTab({ components, pages, patterns }: { components: StoredComponent[]; pages: StoredPage[]; patterns: StoredPattern[] }) {
  const [format, setFormat] = useState<'json' | 'llm'>('json');
  const [copied, setCopied] = useState(false);

  // Aggregate color stats across all pages
  const colorStats = useMemo(() => aggregateColorStats(pages), [pages]);

  const generateExport = useCallback(() => {
    if (format === 'json') {
      return JSON.stringify({
        meta: {
          exportDate: new Date().toISOString(),
          toolVersion: '0.1.0',
          pagesScanned: pages.length,
          totalComponents: components.length,
          patternGroups: patterns.length,
          hardcodedColors: colorStats.topColors.length,
        },
        components: components.map((c) => ({
          name: c.componentName,
          source: c.sourceFile ? `${c.sourceFile}:${c.sourceLine}` : null,
          page: c.pagePath,
          styleFingerprint: c.styleFingerprint,
          structureHash: c.structureHash,
          size: `${Math.round(c.boundingRect.width)}x${Math.round(c.boundingRect.height)}`,
        })),
        pages: pages.map((p) => ({
          path: p.pagePath,
          componentCount: p.componentCount,
          scannedAt: new Date(p.scanTimestamp).toISOString(),
          colorSummary: p.colorSummary ? {
            uniqueColors: p.colorSummary.uniqueColors,
            totalUsages: p.colorSummary.totalUsages,
            nearDuplicates: p.colorSummary.nearDuplicates.length,
          } : null,
        })),
        patterns: patterns.map((p) => ({
          name: p.name,
          totalInstances: p.totalInstances,
          variants: p.variants.map((v) => ({ label: v.label, instances: v.componentIds.length })),
        })),
        colorAudit: {
          nearDuplicates: colorStats.nearDuplicates,
          topHardcoded: colorStats.topColors.slice(0, 20).map((c) => ({
            hex: c.hex, count: c.count, usedAs: c.usedAs, severities: c.severities,
          })),
        },
      }, null, 2);
    }

    const groups = groupByName(components);
    const multiVariantGroups = groups.filter((g) => {
      const fps = new Set(g.components.map((c) => c.styleFingerprint));
      return fps.size > 1;
    });

    let output = '<audit_context>\n';
    output += 'You are auditing a React codebase. Below is a component pattern analysis.\n';
    output += `Pages scanned: ${pages.length}\n`;
    output += `Total components: ${components.length}\n`;
    output += `Pattern groups with variants: ${multiVariantGroups.length}\n`;
    output += `Hardcoded colors found: ${colorStats.topColors.length}\n`;
    output += `Near-duplicate color pairs: ${colorStats.nearDuplicates.length}\n`;
    output += '</audit_context>\n\n';

    for (const group of multiVariantGroups) {
      output += `<pattern_group name="${group.name}" instances="${group.components.length}">\n`;
      const byFingerprint = new Map<string, StoredComponent[]>();
      for (const comp of group.components) {
        const existing = byFingerprint.get(comp.styleFingerprint) ?? [];
        existing.push(comp);
        byFingerprint.set(comp.styleFingerprint, existing);
      }
      let variantIdx = 0;
      for (const [, comps] of byFingerprint) {
        output += `  <variant label="${variantLabel(variantIdx)}" instances="${comps.length}">\n`;
        for (const c of comps.slice(0, 3)) {
          output += `    <instance file="${c.sourceFile ?? 'unknown'}" line="${c.sourceLine ?? '?'}" page="${c.pagePath}" />\n`;
        }
        if (comps.length > 3) output += `    <!-- ... and ${comps.length - 3} more -->\n`;
        output += '  </variant>\n';
        variantIdx++;
      }
      output += '</pattern_group>\n\n';
    }

    // Color audit section
    if (colorStats.nearDuplicates.length > 0 || colorStats.topColors.length > 0) {
      output += '<color_audit>\n';
      if (colorStats.nearDuplicates.length > 0) {
        output += '  <near_duplicates>\n';
        for (const dup of colorStats.nearDuplicates) {
          output += `    <pair a="${dup.a}" b="${dup.b}" distance="${dup.distance.toFixed(1)}" />\n`;
        }
        output += '  </near_duplicates>\n';
      }
      if (colorStats.topColors.length > 0) {
        output += '  <hardcoded_colors>\n';
        for (const c of colorStats.topColors.slice(0, 15)) {
          output += `    <color hex="${c.hex}" count="${c.count}" used_as="${c.usedAs.join(', ')}" severity="${c.severities.join(', ')}" />\n`;
        }
        output += '  </hardcoded_colors>\n';
      }
      output += '</color_audit>\n\n';
    }

    output += '<instructions>\n';
    output += 'For each pattern group with multiple variants:\n';
    output += '1. Identify the canonical variant (most instances)\n';
    output += '2. Read each non-canonical instance file\n';
    output += '3. Generate migration code to consolidate into the canonical pattern\n';
    if (colorStats.nearDuplicates.length > 0) {
      output += '\nFor near-duplicate colors:\n';
      output += '4. Pick one canonical color from each pair and replace the other\n';
    }
    if (colorStats.topColors.some((c) => c.severities.includes('inline'))) {
      output += '\nFor inline hardcoded colors:\n';
      output += '5. Extract inline color styles to Tailwind utility classes or CSS variables\n';
    }
    output += '</instructions>\n';

    return output;
  }, [format, components, pages, patterns, colorStats]);

  const preview = useMemo(() => generateExport(), [generateExport]);

  const handleCopy = useCallback(() => {
    const text = generateExport();
    navigator.clipboard.writeText(text).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 2000); },
      () => { /* clipboard unavailable — silent fail, user can use download */ },
    );
  }, [generateExport]);

  const handleDownload = useCallback(() => {
    const text = generateExport();
    const ext = format === 'json' ? 'json' : 'xml';
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `component-cop-export.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }, [generateExport, format]);

  if (components.length === 0) {
    return <EmptyState title="Nothing to export" description="Scan some pages first to generate export data." />;
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value as 'json' | 'llm')}
          style={{
            padding: '7px 10px', borderRadius: T.radiusSm,
            border: `1px solid ${T.border}`, background: T.bgSurface,
            color: T.text, fontSize: 12, outline: 'none', fontFamily: 'inherit',
          }}
        >
          <option value="json">JSON</option>
          <option value="llm">LLM Prompt (XML)</option>
        </select>
        <ActionButton onClick={handleCopy} variant="secondary">
          {copied ? 'Copied!' : 'Copy'}
        </ActionButton>
        <ActionButton onClick={handleDownload} variant="ghost">
          Download
        </ActionButton>
      </div>

      <div style={{
        background: '#11111b', border: `1px solid ${T.borderLight}`,
        borderRadius: T.radius, padding: 14, fontSize: 11, fontFamily: T.mono,
        maxHeight: 500, overflow: 'auto', whiteSpace: 'pre-wrap',
        color: '#a6adc8', lineHeight: 1.6, tabSize: 2,
      }}>
        {preview}
      </div>
    </div>
  );
}
