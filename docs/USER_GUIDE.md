# Component Cop — User Guide

A step-by-step guide to using Component Cop to find and fix UI inconsistencies in your React application.

---

## Table of Contents

- [Installation](#installation)
- [Your First Scan](#your-first-scan)
- [The Dashboard](#the-dashboard)
  - [Pattern Groups](#pattern-groups)
  - [Color Analysis](#color-analysis)
  - [Complexity](#complexity)
  - [Typography](#typography)
  - [Spacing](#spacing)
  - [Z-Index](#z-index)
  - [Accessibility](#accessibility)
  - [Token Compliance](#token-compliance)
- [Element Picker](#element-picker)
- [Multi-Page Crawling](#multi-page-crawling)
- [Tracking Progress Over Time](#tracking-progress-over-time)
- [Exporting Results](#exporting-results)
- [Setting Up Design Tokens](#setting-up-design-tokens)
- [Configuration](#configuration)
- [CI Integration](#ci-integration)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Troubleshooting](#troubleshooting)

---

## Installation

### Build from source

```bash
git clone https://github.com/ANonABento/component-cop.git
cd component-cop
npm install
npm run build
```

### Load into Chrome

1. Navigate to `chrome://extensions`
2. Toggle **Developer mode** on (top-right)
3. Click **Load unpacked**
4. Select the `.output/chrome-mv3` folder inside the project

You should see the Component Cop icon appear in your extensions bar.

### For development

```bash
npm run dev   # Starts watch mode — changes auto-reload the extension
```

After `npm run dev`, just reload your DevTools panel to pick up changes.

---

## Your First Scan

1. Open any React application in Chrome (works with both development and production builds)
2. Open DevTools (`F12` or `Cmd+Option+I`)
3. Click the **Component Cop** tab at the top of DevTools
4. You'll see a status badge showing whether React was detected and which mode (dev/prod)
5. Click **Scan Page**

The scan takes 1-3 seconds. When complete, you'll see a table of every React component found on the page — its name, source file, and style fingerprint.

> **Tip**: If you see "React not detected", make sure the page has fully loaded. Some SPAs lazy-load React.

---

## The Dashboard

After scanning one or more pages, click the **Dashboard** tab. At the top you'll see four summary stats:

- **Components** — total components in the database
- **Pages** — how many pages have been scanned
- **With Variants** — patterns that have multiple visual variants (the main thing to fix)
- **HC Colors** — unique hardcoded colors found

Below that is a **section pill bar** with 8 analysis tabs:

### Pattern Groups

The core feature. Components are grouped by name and sub-clustered into **variants** based on visual similarity. Each pattern card shows:

- **Variant count** — how many visually distinct versions exist (e.g., "3 variants")
- **Total instances** — how many times this component appears across all scanned pages
- **Style diff** — click to expand and see exactly which CSS properties differ between variants
- **Prop diff** — which props differ (e.g., variant A has `size="sm"`, variant B has `size="lg"`)
- **Consolidation suggestion** — a concrete refactoring recommendation like "Add a `variant` prop to unify these" with an effort estimate (Low/Medium/High)
- **Bundle savings** — estimated bytes saved by consolidating (shown as a badge)
- **Copy for LLM** — one-click copy of structured data optimized for pasting into Claude/ChatGPT

Use the **search bar** to filter by component name and the **"Multi-variant only"** toggle to focus on components that actually need attention.

### Color Analysis

Shows all hardcoded colors detected across scanned pages:

- **Near-duplicate pairs** — colors like `#1a1a2e` and `#1b1b2f` that look identical but are defined separately, with their CIE76 perceptual distance
- **Top hardcoded colors** — most frequently used hardcoded colors, with severity badges (inline > non-tailwind > tw-arbitrary)
- **Design token extraction** — generate a token set from detected colors and export as CSS custom properties, Tailwind config, or JSON

### Complexity

Each component gets a **0-100 complexity score** based on four equally-weighted factors:

| Factor | Ceiling (100%) | What it measures |
|--------|---------------|------------------|
| **Depth (D)** | 12 levels | How deeply nested the DOM tree is |
| **Children (C)** | 30 children | How many direct children at the root |
| **Props (P)** | 20 props | How many props the component accepts |
| **Area (A)** | 500K px² | How much screen space it occupies |

Components scoring **80+** are flagged as outliers. The bar chart shows a breakdown of which factors contribute most to each component's score.

### Typography

Analyzes all font usage across scanned components:

- **Type scale** — visual preview of all font sizes in use (shown at actual size)
- **Near-duplicate sizes** — pairs like 14px and 15px that are probably unintentional
- **Font families** — every font family in use and how often
- **Combination table** — every unique combination of family + size + weight + line-height (too many combinations = inconsistent type system)

### Spacing

Detects when the same component uses different spacing values on different pages:

- **Inconsistencies** — e.g., `<Card>` uses `padding-top: 8px` on the home page but `12px` on the settings page
- **Near-duplicate values** — pairs within 2px that are probably unintentional
- Click any inconsistency to expand and see which values appear on which pages

### Z-Index

Surfaces z-index problems:

- **Collisions** — different components sharing the same z-index (potential stacking bugs)
- **Extreme values** — z-index values over 100 (a sign of z-index wars)
- **Full table** — every component with an explicit z-index, sorted highest first

### Accessibility

Checks every component for common accessibility issues:

| Check | Severity | What it finds |
|-------|----------|---------------|
| Missing alt text | Error | `<img>` elements without `alt` attributes |
| Missing labels | Error | `<input>` elements without associated labels |
| Missing button text | Warning | `<button>` elements with no text content |
| Low contrast | Error | Text that fails WCAG AA contrast ratio (4.5:1 normal, 3:1 large) |
| Small touch targets | Warning | Interactive elements smaller than 44x44px |

Use the **severity filter** dropdown to focus on errors first.

### Token Compliance

If you've configured a design token set (see [Setting Up Design Tokens](#setting-up-design-tokens)), this section shows:

- **Compliance gauge** — percentage of style checks that match a token
- **Category breakdown** — compliance by category (color, spacing, typography, border-radius)
- **Violations** — every non-compliant style with the nearest matching token suggested

---

## Element Picker

The **Picker** tab lets you click-to-inspect any element on the page:

1. Click **Start Picker** (or press `Cmd+Shift+P`)
2. Hover over elements — they'll highlight with a blue overlay
3. Click an element to select it
4. Component Cop finds the nearest React component owner and shows:
   - Component name and source file
   - All props
   - Computed styles
   - Similar components across all scanned pages (with similarity scores)

This is useful for answering "is this button the same as the one on the other page?"

---

## Multi-Page Crawling

The **Crawl** tab automates scanning across your entire app:

1. Click **Start Crawl** — it begins from the current page
2. The crawler discovers links on each page and visits them (same-origin only)
3. Each page is automatically scanned for components
4. Progress shows pages scanned, total discovered, and current URL

**Configuration** (in the Options page):
- **Max pages** — default 100, increase for larger apps
- **Crawl delay** — milliseconds between page loads (default 1000ms)
- **Exclude patterns** — URL glob patterns to skip (e.g., `/api/*`, `/admin/*`)

You can **pause** and **resume** a crawl at any time.

---

## Tracking Progress Over Time

The **History** tab lets you track your UI consistency over time:

1. After scanning, go to History and click **Save Snapshot** with a label (e.g., "Before refactor")
2. Each snapshot captures all metrics: components, patterns, colors, complexity, typography, spacing, z-index, a11y issues
3. Click **Set as Baseline** on any snapshot
4. Future snapshots show a diff against the baseline — green arrows for improvements, red for regressions

This is great for measuring the impact of refactoring work.

---

## Exporting Results

The **Export** tab provides three report formats:

- **JSON** — full structured data for programmatic use or CI integration
- **LLM XML** — optimized format for pasting into Claude or ChatGPT, includes component data and pattern analysis in a structure that helps LLMs generate concrete refactoring code
- **Markdown Report** — a readable issue-ready summary with key metrics, top component groups, and color findings

Use **Copy** or **Download** for local reporting. To create an issue, paste your tracker's new-issue URL (for example `https://github.com/owner/repo/issues/new`) and click **Create Issue**. Component Cop opens a prefilled issue draft in a new tab; it does not submit or upload the report for you.

---

## Setting Up Design Tokens

To check your app against your design system:

1. Right-click the Component Cop extension icon → **Options** (or find it in `chrome://extensions`)
2. Scroll to **Design Tokens (JSON)**
3. Paste your token set or click **Import File** to load a `.json` file

### Token format

```json
{
  "colors": {
    "primary": "#818cf8",
    "background": "#1e1e2e",
    "text": "#e0e0e0",
    "error": "#f87171"
  },
  "spacing": {
    "xs": "4px",
    "sm": "8px",
    "md": "16px",
    "lg": "24px",
    "xl": "32px"
  },
  "typography": {
    "fontSizes": {
      "sm": "12px",
      "base": "14px",
      "lg": "18px",
      "xl": "24px"
    },
    "fontFamilies": {
      "sans": "Inter, system-ui, sans-serif",
      "mono": "SF Mono, monospace"
    },
    "fontWeights": {
      "normal": "400",
      "medium": "500",
      "bold": "700"
    }
  },
  "borderRadius": {
    "sm": "4px",
    "md": "8px",
    "lg": "12px",
    "full": "9999px"
  }
}
```

All fields are optional — include only the categories you want to check. Click **Save** and switch back to the DevTools panel. The **Token Compliance** section on the Dashboard will now show results.

> **Tip**: If you use Tailwind, you can export your `theme` config as JSON and use it directly.

---

## Configuration

Open the Options page (right-click extension icon → Options) to configure:

| Setting | Default | Description |
|---------|---------|-------------|
| **Similarity threshold** | 0.7 | How similar two components must be to group together (0.0–1.0) |
| **Color distance threshold** | 15 | CIE76 distance below which colors are flagged as near-duplicates |
| **Max crawl pages** | 100 | Maximum pages to visit during a crawl |
| **Crawl delay** | 1000ms | Wait time between page loads during crawl |
| **Exclude URL patterns** | — | Glob patterns for URLs to skip (one per line) |
| **Skip component names** | — | Component names to exclude from scanning (one per line) |
| **Design tokens** | — | JSON token set for compliance checking |

---

## CI Integration

Component Cop's analysis modules are browser-agnostic. The CI report generator can be used in Node.js pipelines to fail builds on quality regressions.

```typescript
import { generateCIReport, checkRegression } from './ci/ci-report';

// Generate a report with thresholds
const report = generateCIReport(url, pages, components, patterns, colorStats, {
  maxDuplicates: 5,
  maxHardcodedColors: 20,
  maxNearDuplicates: 3,
  maxComplexityOutliers: 10,
  maxTypeCombinations: 15,
  maxSpacingInconsistencies: 5,
  maxZIndexCollisions: 2,
  maxA11yIssues: 0,
  minTokenCompliance: 80,
}, tokenSet);

if (!report.passed) {
  // report.thresholds shows which checks failed
}

// Compare against a saved baseline
const result = checkRegression(baseline, report);
if (result.regressed) {
  console.error(result.regressions.join('\n'));
}
```

The report includes all metrics in a flat JSON structure suitable for dashboards or alerting.

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+Shift+S` | Scan the current page |
| `Cmd+Shift+P` | Toggle the element picker |

Configure shortcuts at `chrome://extensions/shortcuts`.

---

## Troubleshooting

### "React not detected"
- Make sure the page is fully loaded (some SPAs lazy-load React)
- Check that the page actually uses React (not Vue, Angular, etc.)
- Try refreshing the page and reopening DevTools

### Extension context invalidated
- This happens when the extension is reloaded during development
- Close and reopen DevTools to reconnect

### Scan shows 0 components
- The page may use Shadow DOM or iframes (not yet supported)
- Check if the component names are in the skip list (Options → Skip Component Names)
- Extremely minified production builds may obscure component names

### Crawl stops early
- Check the console for errors
- Some SPAs use client-side routing that doesn't update `window.location` — the crawler discovers links from `<a>` elements
- Increase the crawl delay if pages are slow to render

### Token compliance shows "No design tokens configured"
- Open the Options page and paste your token JSON
- Make sure to click **Save** after pasting
- Switch back to the DevTools panel — tokens load automatically

### Colors look the same but aren't flagged
- Increase the color distance threshold in Options (default 15, try 20-25)
- Colors in different formats (e.g., `rgb(255,0,0)` vs `#ff0000`) are normalized before comparison
