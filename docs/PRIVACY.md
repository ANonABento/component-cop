# Privacy

Component Cop is designed for local-first inspection of React applications.

## What It Collects

When you click **Scan Page**, Component Cop reads the active tab's React component tree and stores:

- Component names, source file metadata when React exposes it, and DOM selectors.
- Computed style fingerprints, selected computed styles, component dimensions, and structural hashes.
- Page URL/path/title, scan time, discovered same-origin links, and color audit summaries.
- Optional design tokens you paste into the Options page.

## What It Does Not Collect

- No telemetry or analytics are sent by the extension.
- No scan data is uploaded automatically.
- No page cookies, authentication tokens, localStorage values, form values, or network responses are intentionally read.
- Export and issue creation are user-triggered. The issue button opens a prefilled issue draft; data is only sent if you submit it.

## Storage And Retention

- Scan results, baselines, dismissed findings, and design tokens are stored in the browser profile using extension storage and IndexedDB.
- Data remains until you click **Clear Data**, remove tokens in Options, clear extension storage, or uninstall the extension.
- Exports are files you download or text you copy; you control where they go.

## Permissions

- `activeTab`: lets Component Cop inspect the current page after you choose to scan.
- `scripting`: injects the page-world scanner needed to read React fiber metadata.
- `storage`: keeps options, scan history, baselines, and local design tokens.
- `alarms`: keeps long crawls alive while scanning multiple same-origin pages.
- `<all_urls>` host access: allows the DevTools panel and content script to work on arbitrary local, staging, and production React apps. Crawling stays same-origin and respects exclusion rules.

## Firefox Data Collection Declaration

The Firefox manifest declares `browser_specific_settings.gecko.data_collection_permissions.required` as `["none"]` because Component Cop does not collect and transmit personal data for storage or processing outside the extension.
