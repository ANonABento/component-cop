# Component Cop CI Integration

Use Component Cop as a quality gate in CI/CD pipelines.

## Quick Start

```bash
# Run audit and fail if thresholds exceeded
npx component-cop-ci --url http://localhost:3000 \
  --max-duplicates 10 \
  --max-hardcoded-colors 20 \
  --output report.json
```

## GitHub Action

```yaml
- name: Component Cop Audit
  run: |
    npx component-cop-ci \
      --url ${{ env.PREVIEW_URL }} \
      --max-duplicates ${{ vars.MAX_DUPLICATES || 10 }} \
      --max-hardcoded-colors ${{ vars.MAX_HC_COLORS || 20 }} \
      --output component-cop-report.json

- name: Upload Report
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: component-cop-report
    path: component-cop-report.json
```

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `--url` | URL to audit (required) | — |
| `--max-duplicates` | Max multi-variant pattern groups | unlimited |
| `--max-hardcoded-colors` | Max hardcoded color usages | unlimited |
| `--max-near-duplicates` | Max near-duplicate color pairs | unlimited |
| `--output` | Write JSON report to file | stdout |
| `--baseline` | Path to baseline JSON for diff comparison | — |
| `--fail-on-regression` | Exit 1 if any metric regressed vs baseline | false |

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | All thresholds passed |
| 1 | One or more thresholds exceeded |
| 2 | Error (page failed to load, no React detected, etc.) |

## Report Format

```json
{
  "url": "http://localhost:3000",
  "timestamp": "2025-01-15T10:30:00Z",
  "passed": true,
  "metrics": {
    "pagesScanned": 1,
    "totalComponents": 47,
    "patternGroups": 12,
    "multiVariantPatterns": 3,
    "hardcodedColors": 8,
    "nearDuplicateColors": 2
  },
  "thresholds": {
    "maxDuplicates": { "limit": 10, "actual": 3, "passed": true },
    "maxHardcodedColors": { "limit": 20, "actual": 8, "passed": true }
  }
}
```

## Baseline Diffing

```bash
# Save baseline
npx component-cop-ci --url http://localhost:3000 --output baseline.json

# Compare against baseline
npx component-cop-ci --url http://localhost:3000 \
  --baseline baseline.json \
  --fail-on-regression \
  --output current.json
```

The `--fail-on-regression` flag exits 1 if `multiVariantPatterns` or `hardcodedColors` increased vs baseline.
