# Component Cop

Chrome DevTools extension that audits React applications for component duplication, inconsistent styling patterns, and hardcoded colors.

Open DevTools, navigate to the **Component Cop** panel, and scan any React app to get a full audit of UI inconsistencies — no code changes or React DevTools required.

## Features

- **Component scanning** — Walks the React fiber tree to extract every rendered component with its computed styles, props, DOM structure, and source location
- **Pattern detection** — Groups identical components and clusters style variants (e.g., "Button has 3 visual variants across 12 instances")
- **Similarity matching** — Weighted style + structure scoring to find near-duplicate components across pages
- **Hardcoded color detection** — Tailwind-aware severity classification (inline > non-tailwind > tw-arbitrary) with CIE76 near-duplicate color pairing
- **Element picker** — Click-to-select with level navigation (scroll/arrows to traverse the fiber ancestor chain)
- **Component navigator** — Ctrl+F-style cycling through similar components on the page
- **Multi-page crawling** — Automated same-origin crawl with configurable limits, delay, and exclude patterns
- **IndexedDB persistence** — Scan results survive page navigations and DevTools close/reopen
- **Export** — JSON (machine-readable) and LLM-optimized XML formats with full color audit and pattern data

## Architecture

Four execution contexts connected by message passing:

```
┌─────────────┐  window.postMessage  ┌─────────────┐  chrome.runtime  ┌────────────┐  port  ┌───────────┐
│  Injected   │◄────────────────────►│   Content    │◄────────────────►│ Background │◄──────►│   Panel   │
│ (MAIN world)│                      │  (isolated)  │                  │  (worker)  │        │ (DevTools)│
└─────────────┘                      └─────────────┘                  └────────────┘        └───────────┘
 React fiber access                   Message relay                    Storage + crawl       React UI
```

| Context | Files | Role |
|---------|-------|------|
| **Injected** | `entrypoints/injected.ts`, `lib/*` | Runs in page's MAIN world. Direct access to React internals, DOM, computed styles. Handles scanning, picking, and navigation. |
| **Content** | `entrypoints/content.ts` | Isolated content script. Relays messages between injected (postMessage) and background (chrome.runtime). |
| **Background** | `entrypoints/background.ts` | Service worker. IndexedDB storage, similarity search, pattern computation, crawl orchestration, panel relay. |
| **Panel** | `entrypoints/panel/App.tsx` | DevTools panel React app. Dashboard, picker results, pattern explorer, crawl controls, export. |

## Project Structure

```
component-cop/
├── entrypoints/
│   ├── injected.ts          # Page-world script (fiber access)
│   ├── content.ts           # Content script (message relay)
│   ├── background.ts        # Service worker (storage, crawl, patterns)
│   ├── devtools/             # DevTools page (creates panel)
│   └── panel/
│       ├── App.tsx           # Panel UI (dashboard, picker, patterns, export)
│       └── main.tsx          # React entry point
├── lib/
│   ├── scanner.ts           # Page scanner (fiber walk, component extraction)
│   ├── picker.ts            # Element picker with level navigation
│   ├── navigator.ts         # Ctrl+F component navigator
│   ├── fiber-utils.ts       # Shared fiber↔DOM utilities
│   ├── fingerprint.ts       # Categorical style fingerprinting
│   ├── structure-hash.ts    # DOM structure hashing
│   ├── selector.ts          # Stable CSS selector generation
│   ├── color-detection.ts   # Tailwind-aware hardcoded color detection
│   ├── color-distance.ts    # CIE76 perceptual color distance
│   └── __tests__/           # Unit tests
├── shared/
│   ├── types.ts             # All TypeScript interfaces
│   ├── messages.ts          # Message type definitions + helpers
│   ├── constants.ts         # Thresholds, skip lists, config
│   ├── db.ts                # IndexedDB operations (idb wrapper)
│   ├── similarity.ts        # Style + structure similarity scoring
│   ├── hash.ts              # FNV-1a hash function
│   └── variant-label.ts     # A-Z, AA, AB... label generator
└── wxt.config.ts            # WXT build config + manifest
```

## How It Works

### Scanning

1. `scanner.ts` calls `findFiberRoots()` to locate React roots — tries DevTools hook first, falls back to scanning DOM properties (`__reactFiber$`, `__reactContainer$`, `_reactRootContainer`)
2. Walks the fiber tree iteratively, skipping internal fibers (Fragment, Provider, Router, etc.)
3. For each component: extracts computed styles, computes a categorical style fingerprint, hashes the DOM structure, detects hardcoded colors, and serializes sanitized props
4. Results are sent through content → background → stored in IndexedDB

### Fingerprinting

Style fingerprinting buckets CSS values into categories for fuzzy comparison:

| Property | Buckets |
|----------|---------|
| Colors | `black`, `gray-dark`, `gray-mid`, `gray-light`, `white`, `red`, `blue`, `green`, etc. |
| Font family | `mono`, `sans`, `serif` |
| Font size | `xs`, `sm`, `md`, `lg`, `xl`, `2xl` |
| Dimensions | `auto`, `tiny`, `small`, `medium`, `large`, `xlarge`, `partial`, `half+`, `full` |
| Spacing | `none`, `tight`, `compact`, `normal`, `spacious`, `wide` |

The category vector is hashed for fast grouping, while the raw categories are preserved for slot-by-slot similarity comparison.

### Similarity Scoring

Components are compared using a weighted combination:

- **Style similarity** (55%) — Slot-by-slot category match ratio
- **Structure similarity** (45%) — Hash match (1.0), same component name (0.5), or different (0.0)
- **Name bonus** — +0.15 when component names match (capped at 1.0)

Thresholds: `0.70` similar, `0.85` strong match, `0.95` exact match.

### Color Detection

For each element, the detector:
1. Checks if the color comes from a CSS variable (not hardcoded — skip)
2. Checks for inline styles (highest severity: `inline`)
3. Checks Tailwind classes — standard utility = skip, arbitrary value like `text-[#ff0000]` = `tw-arbitrary`
4. Everything else = `non-tailwind`

Near-duplicate colors are found using CIE76 distance in Lab color space (threshold: 5.0).

## Development

```bash
# Install dependencies
npm install

# Dev mode (hot reload)
npm run dev

# Production build
npm run build

# Package as .zip
npm run zip

# Run tests
npm test

# Type check
npm run check
```

### Loading in Chrome

1. `npm run build`
2. Open `chrome://extensions`
3. Enable "Developer mode"
4. Click "Load unpacked" → select `.output/chrome-mv3`
5. Open DevTools on any React app → find the "Component Cop" panel

### Testing

Tests use Vitest with `fake-indexeddb` for storage tests:

```bash
npm test              # Single run
npm run test:watch    # Watch mode
```

Test coverage:
- `fingerprint.spec.ts` — Style bucketing (color, font, size, spacing, dimension)
- `similarity.spec.ts` — Scoring edge cases, name bonus, threshold boundaries
- `color-distance.spec.ts` — CIE76 distance, near-duplicate detection, hex parsing

## Key Design Decisions

**No React DevTools dependency** — The extension works on production React apps by scanning DOM properties (`__reactFiber$`) directly. DevTools hook is used when available but not required.

**Categorical fingerprinting over exact values** — Raw `rgb(59, 130, 246)` values would never match across themes or slight variations. Bucketing into `blue` allows meaningful comparison.

**IndexedDB over chrome.storage** — Component data can be large (hundreds of components with full computed styles). IndexedDB handles this without hitting storage limits and supports indexed queries.

**Iterative fiber walking** — React trees can be very deep. The main `walkFiberTree` and `findHostElementDown` use explicit stacks to avoid stack overflow.

**Global callback pattern for monkey-patches** — History API patches are idempotent (sentinel-guarded) and route through a global callback so destroy/re-create cycles work correctly.

## Tech Stack

- [WXT](https://wxt.dev) — Extension framework (Manifest V3, Vite-based)
- [React 19](https://react.dev) — Panel UI
- [idb](https://github.com/jakearchibald/idb) — IndexedDB wrapper with TypeScript generics
- [Vitest](https://vitest.dev) — Unit testing
- TypeScript — Strict mode throughout
