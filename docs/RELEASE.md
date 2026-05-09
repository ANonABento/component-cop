# Release Checklist

## Preflight

1. Update `package.json` and `wxt.config.ts` versions.
2. Add release notes to `CHANGELOG.md`.
3. Run `npm run check`.
4. Run `npm test`.

## Package

```bash
npm run package:chrome
npm run package:firefox
```

Expected artifacts:

- Chrome: `.output/component-cop-<version>-chrome.zip`
- Firefox: `.output/component-cop-<version>-firefox.zip` for Firefox 140+
- Firefox sources: `.output/component-cop-<version>-sources.zip`

## Store Metadata

- Use `docs/STORE_LISTING.md` for descriptions, feature bullets, review notes, and screenshot coverage.
- Use `docs/PRIVACY.md` for privacy disclosures and permission explanations.
- Confirm icons exist at 16, 32, 48, and 128 pixels.

## Manual Smoke Test

1. Load the Chrome artifact unpacked from `.output/chrome-mv3`.
2. Open a React app, open DevTools, and select **Component Cop**.
3. Confirm onboarding appears before the first scan.
4. Accept scan safety and click **Scan Page**.
5. Confirm components appear, Dashboard populates, and Export can download JSON, XML, and Markdown.
6. Add an issue URL and confirm **Create Issue** opens a prefilled issue draft.
7. Repeat the load and scan flow in Firefox from `.output/firefox-mv2`.
