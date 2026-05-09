# Component Cop

A Chrome DevTools extension that audits React applications for UI duplication and inconsistency. Point it at any React app and get instant visibility into duplicated components, hardcoded colors, accessibility issues, spacing drift, and more.

**151 tests** | **373 KB bundle** | **Chrome MV3 + Firefox** | **Works on dev and prod React apps**

---

## Quick Start

```bash
git clone https://github.com/ANonABento/component-cop.git
cd component-cop
npm install
npm run build
```

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked** and select the `.output/chrome-mv3` directory
4. Open DevTools (F12) on any React app and click the **Component Cop** tab

For a detailed walkthrough, see the **[User Guide](docs/USER_GUIDE.md)**.

### Release Packages

```bash
npm run package:chrome
npm run package:firefox
```

Both commands run type checking and tests before creating store-ready ZIP artifacts in `.output/`.

---

## What It Finds

| Analysis | What it surfaces |
|----------|-----------------|
| **Pattern Detection** | Components grouped by visual similarity, with variant diffs and consolidation suggestions |
| **Color Audit** | Hardcoded colors, near-duplicate pairs (CIE76), design token extraction |
| **Complexity Scoring** | 0-100 score per component (DOM depth, children, props, area) with outlier detection |
| **Typography Audit** | Type scale, near-duplicate font sizes, font family inventory, combination explosion |
| **Spacing Audit** | Same component using different padding/margin across pages |
| **Z-Index Audit** | Collisions (different components at same z-index), extreme values |
| **Accessibility** | Missing alt text, missing labels, WCAG AA contrast failures, small touch targets |
| **Token Compliance** | Check all styles against your design tokens, with nearest-token suggestions |
| **Bundle Impact** | Estimated byte savings from consolidating duplicate patterns |

---

## Key Features

- **Single-page scan** — one-click analysis of the current page's React component tree
- **Element picker** — click any element to inspect it and find similar instances across pages
- **Multi-page crawler** — auto-navigate and scan an entire site, building a cross-page database
- **8 dashboard sections** — deep analysis across patterns, colors, complexity, typography, spacing, z-index, accessibility, and token compliance
- **Consolidation engine** — concrete refactoring suggestions ("add a `size` prop") with effort estimates and bundle savings
- **Design token generation** — export detected colors as CSS custom properties, Tailwind config, or JSON
- **Design token compliance** — import your token set (JSON or file) and audit your app against it
- **Baseline tracking** — save snapshots over time, set a baseline, see if your codebase is improving
- **LLM export** — structured XML format for pasting into Claude/ChatGPT for automated refactoring
- **Report exports** — JSON, XML, and Markdown downloads plus prefilled issue creation
- **Privacy-first scanning** — scans run only after user action, data stays local until exported
- **CI integration** — browser-agnostic report generator with pass/fail thresholds and regression detection
- **Source links** — click any component to open it in VS Code/Cursor at the exact line
- **Keyboard shortcuts** — `Cmd+Shift+S` to scan, `Cmd+Shift+P` to toggle picker

---

## Architecture

Four execution contexts communicating via Chrome message passing:

```
┌─────────────────────────────────────────────────────┐
│              DevTools Panel (React)                  │
│  Scan · Picker · Crawl · Dashboard · Export · History│
└────────────────────────┬────────────────────────────┘
                         │ chrome.runtime.connect
┌────────────────────────▼────────────────────────────┐
│           Background Service Worker                  │
│  IndexedDB storage · pattern matching · crawl        │
│  orchestration · audit computation on snapshots      │
└──────────┬──────────────────────────┬───────────────┘
           │ chrome.tabs.sendMessage  │
┌──────────▼──────────────────────────▼───────────────┐
│           Content Script (ISOLATED world)             │
│  Message relay between page and extension             │
└──────────┬──────────────────────────┬───────────────┘
           │ window.postMessage       │
┌──────────▼──────────────────────────▼───────────────┐
│           Injected Script (MAIN world)               │
│  React fiber tree walking · component extraction     │
│  color detection · element picker · navigator        │
└─────────────────────────────────────────────────────┘
```

The injected script runs in the page's MAIN world where it can access `__reactFiber$` properties and `getComputedStyle`. Everything flows back through the content script relay to the background worker (IndexedDB storage) and panel (React UI).

---

## Project Structure

```
component-cop/
├── entrypoints/
│   ├── injected.ts              # MAIN world — fiber tree, scanner, picker, navigator
│   ├── content.ts               # ISOLATED world — message relay
│   ├── background.ts            # Service worker — storage, patterns, crawl, audit computation
│   ├── devtools/main.ts         # Creates the DevTools panel
│   ├── options/OptionsPage.tsx   # Options page (thresholds, exclusions, design tokens)
│   └── panel/                   # DevTools panel UI (React)
│       ├── App.tsx               # Tab router, port management, state
│       ├── DashboardTab.tsx      # Stats grid + data-driven section pill bar
│       ├── dashboard/            # 8 extracted dashboard sections
│       │   ├── PatternSection.tsx
│       │   ├── ColorSection.tsx
│       │   ├── ComplexitySection.tsx
│       │   ├── TypographySection.tsx
│       │   ├── SpacingSection.tsx
│       │   ├── ZIndexSection.tsx
│       │   ├── A11ySection.tsx
│       │   └── TokenComplianceSection.tsx
│       ├── ScanTab.tsx           # Single-page scan with component table
│       ├── PickerTab.tsx         # Element picker with similarity results
│       ├── CrawlTab.tsx          # Multi-page crawler controls
│       ├── ExportTab.tsx         # JSON and LLM export
│       ├── HistoryTab.tsx        # Snapshots, baselines, trend charts
│       ├── primitives.tsx        # Shared UI components
│       ├── helpers.ts            # Panel utilities
│       └── theme.ts              # Dark theme tokens
├── lib/                         # Core analysis (browser-agnostic, no DOM/chrome APIs)
│   ├── scanner.ts               # React detection, fiber tree walking
│   ├── fingerprint.ts           # Style fingerprinting (categorical + hash-based)
│   ├── structure-hash.ts        # DOM structure hashing
│   ├── color-detection.ts       # Hardcoded color detection (Tailwind-aware)
│   ├── color-distance.ts        # CIE76 color distance, near-duplicate detection
│   ├── consolidation.ts         # Refactoring suggestion engine
│   ├── prop-diff.ts             # Prop shape diffing between variants
│   ├── style-diff.ts            # CSS property diffing between variants
│   ├── token-generator.ts       # Design token generation (CSS/Tailwind/JSON)
│   ├── complexity-score.ts      # Component complexity scoring (0-100)
│   ├── bundle-impact.ts         # Bundle savings estimation
│   ├── typography-audit.ts      # Font usage analysis
│   ├── spacing-audit.ts         # Spacing inconsistency detection
│   ├── z-index-audit.ts         # Z-index collision and extreme detection
│   ├── a11y-audit.ts            # Accessibility checks (WCAG AA)
│   ├── token-compliance.ts      # Design token compliance auditing
│   ├── picker.ts                # Element picker with keyboard navigation
│   ├── navigator.ts             # Instance navigator
│   ├── fiber-utils.ts           # Fiber tree utilities
│   ├── selector.ts              # CSS selector generation
│   └── __tests__/               # 151 unit tests across 18 test files
├── shared/                      # Shared between all contexts
│   ├── types.ts                 # All TypeScript interfaces
│   ├── messages.ts              # Typed message definitions
│   ├── constants.ts             # Thresholds, defaults, skip lists
│   ├── db.ts                    # IndexedDB via idb (v3 schema)
│   ├── options.ts               # chrome.storage options + design token storage
│   ├── similarity.ts            # Similarity scoring (55% style + 45% structure)
│   ├── color-utils.ts           # RGB/hex conversion utilities
│   ├── scan-history.ts          # Snapshot types and baseline diffing
│   ├── hash.ts                  # djb2 string hashing
│   ├── url-utils.ts             # URL exclusion matching
│   └── variant-label.ts         # A/B/C/... labeling
├── ci/
│   └── ci-report.ts             # CI report generator with 9 threshold checks + regression detection
├── wxt.config.ts                # WXT build configuration
└── vitest.config.ts             # Test configuration
```

---

## How Similarity Scoring Works

Each component gets two fingerprints:

1. **Style fingerprint** — computed styles are categorized (e.g., "rounded corners", "bold text", "blue background") and hashed. Two components with the same categories get a high style score via Jaccard similarity.

2. **Structure hash** — DOM tree serialized to a normalized string (tag names + nesting, up to depth 3) and hashed. Identical structure = 1.0 score.

Final similarity = **55% style + 45% structure**. Components above the threshold (default 0.7) are grouped. Components sharing a name are further sub-grouped by style fingerprint into variants.

---

## CI Integration

The CI report module (`ci/ci-report.ts`) works outside the browser. Feed it scan data and get a pass/fail JSON report:

```typescript
import { generateCIReport, checkRegression } from './ci/ci-report';

const report = generateCIReport(url, pages, components, patterns, colorStats, {
  maxDuplicates: 5,           // max multi-variant patterns
  maxHardcodedColors: 20,     // max hardcoded color usages
  maxNearDuplicates: 3,       // max near-duplicate color pairs
  maxComplexityOutliers: 10,  // max components scoring 80+
  maxTypeCombinations: 15,    // max unique type combos
  maxSpacingInconsistencies: 5,
  maxZIndexCollisions: 2,
  maxA11yIssues: 0,           // zero-tolerance for a11y
  minTokenCompliance: 80,     // minimum compliance %
});

// Compare against a baseline
const regression = checkRegression(baselineReport, currentReport);
if (regression.regressed) {
  console.error(regression.regressions.join('\n'));
  process.exit(1);
}
```

---

## Privacy And Permissions

Component Cop stores scan results in the local browser profile. It does not send telemetry, upload reports, or submit issues automatically. Exporting, copying, downloading, and issue submission are user-triggered actions.

Required permissions are intentionally narrow for the feature set:

| Permission | Why it is needed |
|------------|------------------|
| `activeTab` | Inspect the page the user chooses to scan |
| `scripting` | Inject the page-world React scanner |
| `storage` | Save options, scan history, baselines, and local design tokens |
| `alarms` | Keep long same-origin crawls alive |
| `<all_urls>` | Allow the DevTools panel to work on arbitrary local, staging, and production React apps |

Full details are in **[Privacy](docs/PRIVACY.md)**.

Firefox data collection consent is declared as `required: ["none"]` because Component Cop does not transmit personal data outside the extension.

---

## Publish-Ready Checklist

Artifacts:

- Run `npm run package:chrome` and upload the Chrome ZIP from `.output/`.
- Run `npm run package:firefox` and upload the Firefox ZIP plus source ZIP from `.output/`.
- Confirm generated manifests include DevTools panel, background service worker, content script, options page, action metadata, commands, icons, and Firefox Gecko settings.

Metadata:

- Use **[Store Listing Materials](docs/STORE_LISTING.md)** for short description, full description, feature bullets, review notes, and screenshot checklist.
- Use **[Privacy](docs/PRIVACY.md)** for data use, retention, and permission disclosure.
- Use **[Release Checklist](docs/RELEASE.md)** before submitting a new version.
- Update **[CHANGELOG](CHANGELOG.md)** and bump the version with `npm run version:patch`, `npm run version:minor`, or `npm run version:major`.

Manual smoke test:

- Load the unpacked Chrome and Firefox builds.
- Open a React app, accept scan safety, run **Scan Page**, confirm Dashboard data appears.
- Export JSON, XML, and Markdown; verify **Create Issue** opens a prefilled issue draft.
- Clear data and confirm local scan history is removed.

---

## Development

```bash
npm run dev      # Watch mode with hot reload
npm test         # Run 151 unit tests
npm run check    # TypeScript type checking
npm run build    # Production Chrome build (outputs to .output/chrome-mv3)
npm run build:firefox
```

---

## Tech Stack

- **[WXT](https://wxt.dev)** — Chrome extension framework (Manifest V3)
- **React 19** — DevTools panel and options page
- **TypeScript** — full type safety across all contexts
- **[idb](https://github.com/nicolestandifer3/idb-next.js)** — typed IndexedDB wrapper
- **Vitest** — 151 tests across 18 files
- **CIE76** — perceptual color distance
- **W3C relative luminance** — WCAG AA contrast ratio checking

## License

MIT
