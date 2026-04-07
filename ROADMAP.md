# Component Cop Roadmap

## Current State (v0.1)

Audit-only: scans React fiber trees, fingerprints components, clusters duplicates/variants, detects hardcoded colors with Tailwind-aware severity, exports findings as JSON or LLM-optimized XML.

---

## Tier 1: Actionable Context

Make findings useful enough to act on without leaving the panel.

### 1.1 Source File Mapping ✅
Resolve component source locations from React fiber \`_debugSource\` and \`_debugOwner\`. Display file path + line number next to each component in the panel. This unlocks "click to open in editor" and makes every other feature more useful.

### 1.2 Prop Diff View ✅
Side-by-side comparison of prop shapes across variants of the same component. Shows what's structurally different between "Button variant A" vs "Button variant B" — which props are added, removed, or changed.

### 1.3 Style Diff View ✅
Computed style delta between variants using exact CSS values, not just fingerprint buckets. "Variant A: \`padding: 8px 16px\`, variant B: \`padding: 12px 24px\`" — the precise info needed for the fix.

### 1.4 Dependency Graph ✅
Which pages/routes render which variant? Helps estimate blast radius before consolidating. Visualized as a simple table or tree in the Patterns tab.

---

## Tier 2: Fix Generation

Bridge the gap from "here's what's wrong" to "here's how to fix it."

### 2.1 Consolidation Suggestions ✅
Generate concrete refactoring proposals: "These 3 Button variants could be unified with a \`size\` prop accepting \`sm | md | lg\`." Derived from style/prop diffs.

### 2.2 Design Token Extraction ✅
From the color audit, generate a proposed token map: \`--color-primary: #3b82f6\` replacing 4 hardcoded hex values. Exportable as CSS variables, Tailwind config, or design token JSON.

### 2.3 Per-Pattern Refactor Prompts ✅
One-click "Copy for Cursor/Claude" scoped to a single pattern — includes source files, variant diffs, and a structured refactoring prompt. The existing global LLM export stays; this adds targeted per-pattern prompts.

### 2.4 Ignore / Triage System ✅
Mark findings as "intentional" (e.g., hover states should differ) so they don't clutter repeat scans. Persisted in IndexedDB. Supports bulk dismiss and "show ignored" toggle.

---

## Tier 3: Tracking

Turn one-off audits into ongoing quality improvement.

### 3.1 Scan History + Trends ✅
Store scan summaries over time. Show trend charts: "47 duplicate patterns last week → 38 this week." Motivation and progress visibility.

### 3.2 Baseline Diffing ✅
Compare current scan against a saved baseline. Highlight new duplicates introduced since the baseline — useful for PR review ("this branch added 3 new duplicate patterns").

### 3.3 CI Integration ✅
Export scan results as JSON from a headless run. Provide a GitHub Action that fails if duplicate count exceeds a configurable threshold. Component Cop becomes a quality gate, not just a DevTools panel.

---

## Tier 4: Polish

### 4.1 Custom Icon / Branding ✅
Police badge or magnifying glass icon for the extension and DevTools panel tab.

### 4.2 Options Page ✅
Configure similarity thresholds, exclude patterns, color distance sensitivity, max crawl depth. Currently these are hardcoded constants.

### 4.3 Keyboard Shortcuts ✅
Quick scan (\`Ctrl+Shift+S\`), toggle picker (\`Ctrl+Shift+P\`), cycle patterns (\`Ctrl+Shift+N/P\`).

---

## Build Order

| Phase | Items | Why first |
|-------|-------|-----------|
| 1 | ~~1.1~~, ~~1.3~~, ~~2.4~~ | Source mapping ✅ unlocks everything; style diffs ✅; triage ✅ |
| 2 | ~~2.2~~, ~~2.3~~ | Token extraction ✅ + per-pattern prompts ✅ |
| 3 | ~~1.2~~, ~~1.4~~, ~~2.1~~ | Prop diffs ✅, dependency graph ✅, consolidation suggestions ✅ |
| 4 | ~~3.1~~, ~~3.2~~, ~~3.3~~ | Tracking ✅ and CI ✅ turn it from a tool into a workflow |
| 5 | ~~4.1~~, ~~4.2~~, ~~4.3~~ | Polish ✅ — all phases complete |
