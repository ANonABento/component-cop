# Store Listing Materials

## Short Description

Privacy-first React UI auditor for duplicate components, design drift, accessibility issues, and design-token compliance.

## Full Description

Component Cop adds a DevTools panel for auditing React applications directly in your browser. Run a one-click scan on the current page or crawl same-origin pages to find duplicated component patterns, hardcoded colors, typography drift, spacing inconsistencies, z-index collisions, accessibility issues, and token compliance gaps.

Scan data stays local by default. Export reports as JSON, XML for LLM-assisted refactoring, or Markdown for issue trackers. Open a prefilled GitHub issue from the report when you are ready to share findings with your team.

## Feature Bullets

- One-click React component scan from Chrome or Firefox DevTools.
- Pattern grouping with variant labels, source links, and consolidation hints.
- Color, typography, spacing, z-index, accessibility, complexity, token compliance, and bundle impact audits.
- Same-origin crawler with pause, resume, exclusions, and crawl limits.
- Local baselines and scan history for tracking cleanup progress.
- JSON, XML, and Markdown export plus prefilled issue creation.
- Privacy-first defaults: local storage, no telemetry, user-triggered exports.

## Screenshot Checklist

- DevTools panel with React detected and the Scan tab ready.
- Scan results table after a one-click scan.
- Dashboard pattern section showing multi-variant component groups.
- Color or accessibility dashboard section with findings.
- Export tab showing Markdown report and Create Issue button.
- Options page showing exclusions, crawl limits, and token settings.

## Review Notes

- The extension requires all-site host access so the DevTools panel can inspect arbitrary React apps chosen by the user.
- The scanner only runs after an explicit user action from the DevTools panel or configured keyboard shortcut.
- Reports are stored locally and only leave the browser when the user copies, downloads, or submits an issue/export.
