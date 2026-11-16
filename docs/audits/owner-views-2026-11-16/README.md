# Owner order and invoice browser proof

The harness mounts the real `OwnerOpenOrdersBoard` and `OwnerInvoiceBoard` client components with synthetic `InvoiceRow` data. It bundles the repository's CSS and components into a temporary local HTTP server. No authentication, database connection, or production API request is used. CSV navigation is intercepted and aborted before any export request reaches a server.

Browser clock: `2026-11-16T10:00:00Z`. Viewports: 375 × 1000 and 1440 × 1000. Fixtures are saved in `fixtures.json`; named checks, failures, runtime errors, unexpected requests, and intercepted export URLs are saved in `results.json`. Screenshots show both boards and the read-only order dialog at both widths, plus invalid invoice date feedback.

Run with an installed Playwright module and compatible browser:

```powershell
$env:PLAYWRIGHT_MODULE='C:/Users/AGOZA/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright-core'
$env:PLAYWRIGHT_EXECUTABLE_PATH='C:/Users/AGOZA/AppData/Local/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-win64/chrome-headless-shell.exe'
node scripts/test-owner-views-browser.cjs
```

The explicit executable path works around cached Playwright packages expecting browser revisions 1243/1254 while this environment has revision 1255. No dependency or lockfile changes are required.

The proof checks rendered client behavior, keyboard access, layout overflow, and export query parameters. It does not verify server authorization, CSV contents, database queries, archival writes, or the surrounding authenticated application shell.
