import { useCallback, useEffect, useMemo, useState } from 'react';
import type { StoredComponent, StoredPage, StoredPattern } from '../../shared/types';
import { variantLabel } from '../../shared/variant-label';
import { T } from './theme';
import { ActionButton, EmptyState } from './primitives';
import { aggregateColorStats, groupByName } from './helpers';

export function ExportTab({ components, pages, patterns }: { components: StoredComponent[]; pages: StoredPage[]; patterns: StoredPattern[] }) {
  const [format, setFormat] = useState<'json' | 'llm' | 'markdown'>('json');
  const [copied, setCopied] = useState(false);
  const [issueUrl, setIssueUrl] = useState('');

  // Aggregate color stats across all pages
  const colorStats = useMemo(() => aggregateColorStats(pages), [pages]);

  useEffect(() => {
    setIssueUrl(localStorage.getItem('component-cop-issue-url') ?? '');
  }, []);

  const multiVariantGroups = useMemo(() => {
    return groupByName(components).filter((g) => {
      const fps = new Set(g.components.map((c) => c.styleFingerprint));
      return fps.size > 1;
    });
  }, [components]);

  const generateMarkdown = useCallback(() => {
    const lines: string[] = [
      '# Component Cop Report',
      '',
      `Generated: ${new Date().toISOString()}`,
      '',
      '## Summary',
      '',
      `- Pages scanned: ${pages.length}`,
      `- Components found: ${components.length}`,
      `- Pattern groups: ${patterns.length}`,
      `- Multi-variant groups: ${multiVariantGroups.length}`,
      `- Hardcoded colors: ${colorStats.topColors.length}`,
      `- Near-duplicate color pairs: ${colorStats.nearDuplicates.length}`,
      '',
    ];

    if (multiVariantGroups.length > 0) {
      lines.push('## Components To Review', '');
      for (const group of multiVariantGroups.slice(0, 20)) {
        const byFingerprint = new Map<string, StoredComponent[]>();
        for (const comp of group.components) {
          const existing = byFingerprint.get(comp.styleFingerprint) ?? [];
          existing.push(comp);
          byFingerprint.set(comp.styleFingerprint, existing);
        }
        lines.push(`### ${group.name}`);
        lines.push('');
        lines.push(`- Instances: ${group.components.length}`);
        lines.push(`- Variants: ${byFingerprint.size}`);
        let variantIdx = 0;
        for (const [, comps] of byFingerprint) {
          const sample = comps[0];
          if (!sample) continue;
          const source = sample.sourceFile ? `${sample.sourceFile}:${sample.sourceLine ?? '?'}` : 'unknown source';
          lines.push(`- Variant ${variantLabel(variantIdx)}: ${comps.length} instance(s), sample ${source}`);
          variantIdx++;
        }
        lines.push('');
      }
    }

    if (colorStats.topColors.length > 0) {
      lines.push('## Color Audit', '');
      lines.push('| Color | Count | Used as | Severity |');
      lines.push('|---|---:|---|---|');
      for (const color of colorStats.topColors.slice(0, 15)) {
        lines.push(`| \`${color.hex}\` | ${color.count} | ${color.usedAs.join(', ')} | ${color.severities.join(', ')} |`);
      }
      lines.push('');
    }

    if (colorStats.nearDuplicates.length > 0) {
      lines.push('## Near-Duplicate Colors', '');
      lines.push('| A | B | Distance |');
      lines.push('|---|---|---:|');
      for (const pair of colorStats.nearDuplicates.slice(0, 15)) {
        lines.push(`| \`${pair.a}\` | \`${pair.b}\` | ${pair.distance.toFixed(1)} |`);
      }
      lines.push('');
    }

    lines.push('## Suggested Next Steps', '');
    lines.push('- Consolidate the highest-instance multi-variant components first.');
    lines.push('- Replace repeated hardcoded colors with existing design tokens or new token candidates.');
    lines.push('- Re-scan after changes and compare with a saved baseline.');

    return lines.join('\n');
  }, [components.length, colorStats, multiVariantGroups, pages.length, patterns.length]);

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

    if (format === 'markdown') return generateMarkdown();

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
  }, [format, components, pages, patterns, colorStats, generateMarkdown, multiVariantGroups]);

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
    const ext = format === 'json' ? 'json' : format === 'markdown' ? 'md' : 'xml';
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `component-cop-export.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }, [generateExport, format]);

  const handleIssueUrlChange = useCallback((value: string) => {
    setIssueUrl(value);
    localStorage.setItem('component-cop-issue-url', value);
  }, []);

  const handleCreateIssue = useCallback(() => {
    const body = generateMarkdown();
    const title = `Component Cop report: ${multiVariantGroups.length} component group(s) to review`;
    const base = issueUrl.trim() || 'https://github.com/new';
    const url = new URL(base);
    url.searchParams.set('title', title);
    url.searchParams.set('body', body);
    window.open(url.toString(), '_blank', 'noopener,noreferrer');
  }, [generateMarkdown, issueUrl, multiVariantGroups.length]);

  if (components.length === 0) {
    return <EmptyState title="Nothing to export" description="Scan some pages first to generate export data." />;
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value as 'json' | 'llm' | 'markdown')}
          style={{
            padding: '7px 10px', borderRadius: T.radiusSm,
            border: `1px solid ${T.border}`, background: T.bgSurface,
            color: T.text, fontSize: 12, outline: 'none', fontFamily: 'inherit',
          }}
        >
          <option value="json">JSON</option>
          <option value="llm">LLM Prompt (XML)</option>
          <option value="markdown">Markdown Report</option>
        </select>
        <ActionButton onClick={handleCopy} variant="secondary">
          {copied ? 'Copied!' : 'Copy'}
        </ActionButton>
        <ActionButton onClick={handleDownload} variant="ghost">
          Download
        </ActionButton>
        <ActionButton onClick={handleCreateIssue} variant="secondary">
          Create Issue
        </ActionButton>
      </div>

      <div style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: T.textMuted }}>
          Issue URL
        </label>
        <input
          value={issueUrl}
          onChange={(e) => handleIssueUrlChange(e.target.value)}
          placeholder="https://github.com/owner/repo/issues/new"
          style={{
            padding: '7px 10px', borderRadius: T.radiusSm,
            border: `1px solid ${T.border}`, background: T.bgSurface,
            color: T.text, fontSize: 12, outline: 'none', fontFamily: 'inherit',
          }}
        />
        <span style={{ fontSize: 11, color: T.textDim }}>
          Opens a prefilled issue in a new tab. No report data is sent until you submit it.
        </span>
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
