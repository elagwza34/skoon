# UI/UX remediation

Date: 16 November 2026. This document tracks the 29 findings in `REPORT.md`.

## Scope

All 29 findings have corresponding implementation changes. Changes are local; nothing was deployed. No schema migrations, database writes, credential changes, or permission bypasses were performed. The only route-policy change adds `/scan-qr` to guest pages. Selecting an order from search still applies the existing staff branch scope.

## Findings and changes

| Finding | Resolution |
|---|---|
| H00 Guest CTA reaches staff login | Added `/scan-qr` to public paths. Added a visible manual table-selection fallback. Staff routes remain protected. |
| H01 Kitchen becomes stale | Added visible-page polling every five seconds, overlap prevention using transition state, reconnect refresh, last-update time, stale/offline status, and manual refresh. |
| H02 QR initialization | Replaced the mutable element-ID ref with a stable React ID. Added hydration/start readiness and a synchronous start guard. Wait for video playback before offering Stop. Permission denial, absent camera, and initialization errors have separate recovery copy. |
| H03 Offscreen drawer focus | Closed mobile drawers are unmounted. Desktop navigation stays visible at its breakpoint. Mobile drawers use named native modal dialogs, scroll locking, focus containment, Escape, close buttons, and focus restoration. |
| H04 Dialog behavior | Added shared `Modal` and adopted it for guest/POS carts, variants, modifiers, invoice settlement, receipts, product/staff/table forms, employee details, waiter overlays, and archive confirmation. Nested cancel events do not dismiss the parent. In-flight submissions suppress Escape where applicable. |
| H05 Shared contrast | Corrected both themes' primary/success/destructive/warning foreground pairs. Badges use readable foreground text over their tinted semantic backgrounds. |
| H06 Public accent contrast | Added a darker text accent on cream surfaces. Preserved light text for dark photo overlays and selected filters. |
| H07 Gallery keyboard access | Gallery entries are named buttons with image alternatives. Lightbox uses the shared modal and a named close control. |
| H08 Nested employee buttons | Employee cards use a noninteractive wrapper with one explicit edit control. |
| M00 Tablet overflow | Moved the rotated decorative badge inside its container. Reduced navigation gaps and shifted desktop navigation to the larger breakpoint. |
| M01 Dropdown focus | Arrow keys move real focus; Home/End, Escape, selection, return focus, and radio selection semantics are supported. |
| M02 Popover focus | Move focus into the non-modal panel, retain the trigger reference, restore focus on Escape/close, and dismiss when focus moves outside. |
| M03 Touch targets | Increased shared buttons, icon controls, inputs, switches, and segmented controls. Added coarse-pointer minimum sizes and enlarged login password visibility control. |
| M04 Hidden carousel navigation | Replaced the horizontal menu strip with a responsive grid. All products are reachable without horizontal dragging. |
| M05 Missing labels | Added persistent labels to menu search, HR attendance/leave/report fields, employee filters, contracts, compensation, and document controls. |
| M06 Visual-only feedback | Login, guest service, and operational error/success messages use live semantics. Guest validation focuses its error and links to the name field. Employee errors appear inside the active dialog; product errors focus an in-dialog summary; invoice notices appear inside settlement. |
| M07 Motion preferences | Added global reduced-motion handling and gated public GSAP animation setup. Status remains readable without animation. |
| M08 Search races/recovery | Cancel obsolete requests, ignore late completions, bound request time, distinguish failures from empty results, and provide retry. |
| M09 Search entity context | Search URLs carry query and selected entity. Product boards consume selection; order reads can fetch the selected order within the existing branch scope, including orders outside the default latest-100 list. |
| M10 Cart persistence | Persist cart lines per table with a four-hour expiry. Restore only current products, validate/cap quantities, remove duplicates, use current prices, warn about changed drafts, and clear only after confirmed success. Personal contact details are not stored in the draft. |
| M11 Fractional EGP | Guest prices and totals use the shared two-decimal EGP formatter. Server pricing remains authoritative. |
| M12 Tracking freshness | Failed polls show the last known state, last-update time, and retry. Requests have timeout/abort handling and do not overlap. Failed tracking no longer displays an active live pulse. |
| M13 Hover-only chart detail | Added exact-value data tables, keyboard inspection, pointer/touch interaction, accessible status feedback, and empty/single-point handling. |
| M14 Arabic labels | Added shared Arabic metric/status/type labels, translated HR report KPIs and guest failure fallbacks, and resolved overtime employee names with secondary isolated references. |
| M15 Skip and anchor navigation | Added skip links and focusable main destinations to both shells. Added fixed-header scroll offsets. |
| L01 Selected state | Public navigation tracks the visible section and exposes current location. Category filters expose pressed state. |
| L02 Image delivery | Hero, about, menu, occasion, and gallery photos use responsive Next Image sizes. Hero is prioritized; below-fold images are lazy. Social QR codes are generated locally instead of fetched from a remote QR service. |
| L03 Icon consistency | Replaced public icon-font ligatures with local SVGs from the shared icon family. Removed the external Material Symbols stylesheet. Added names to icon-only controls and footer links. |
| L04 Fatal error hierarchy | Recovery guidance leads; raw diagnostic details are collapsed behind an explicit disclosure. |

## Validation

- `npm test`: **423 passed**, including five new regression tests for guest-route boundaries, draft restoration/expiry/tampering, and both themes' semantic color pairs.
- `npm run typecheck`: passed during implementation. The production build also checks types.
- `npm run lint`: zero application warnings/errors after replacing ordinary raster images and documenting generated QR images that must retain their exact pixels. Nested `.kilo/worktrees` are excluded from root-project linting.
- `npm run build`: successful production build. Next emits an existing ESLint-plugin-detection advisory; standalone ESLint still runs the configured Next rules.
- Browser checks and screenshots are in `after/`. The browser script runs the actual public pages and mounts actual client components with fixture data for staff-only behavior. Its adapters do not create an authenticated staff session or submit production transactions.
- Final production-browser run: **16 passed, zero failures, zero page errors**. Checks include 375/768/1440px and landscape layouts, larger text/light theme, reduced motion, signed-out route protection, first camera start with a fake camera, drawers, nested dialogs, dropdown/popover focus, draft persistence and fractional amounts, idle/offline kitchen refresh, failed tracking recovery, reordered search responses, chart alternatives, and both receipt widths.
- Final visual inspection also increased mobile hero clearance so the introductory badge stays below the fixed header.

Run browser checks against a local server:

```powershell
$env:PLAYWRIGHT_MODULE = 'D:/Projects-code/liveschool/node_modules/playwright-core'
$env:UI_TEST_URL = 'http://127.0.0.1:3100'
node scripts/test-ui-ux-browser.cjs
```

`PLAYWRIGHT_MODULE` can point to another installed `playwright-core`, or be omitted when it is available in normal module resolution. The browser harness uses the existing esbuild installation. Camera checks use Chromium's fake camera, not physical hardware.

## Remaining environment-dependent validation

Implementation is complete for the reported findings. Full accessibility certification is not claimed. Authenticated role walkthroughs, real camera devices/permission settings, screen readers, production traffic/Core Web Vitals, and physical receipt printers still need their respective environments. Browser print fixtures cover 58mm/80mm layout and produce PDFs; they do not certify printer hardware or driver settings.
