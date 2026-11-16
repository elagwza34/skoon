# Sokoon UI/UX audit

Date: 16 November 2026. Scope: the local Next.js 15.5 / React 19 / Tailwind application, Arabic-first and RTL.

Remediation follow-up: see [REMEDIATION.md](REMEDIATION.md) for the implemented fixes and validation. Findings below preserve the original audit evidence.

## Assessment

The interface has a coherent café identity, reusable staff components, and generally sensible responsive containers. It is not ready for an accessibility sign-off. The most urgent issues affect receiving kitchen orders, QR entry, keyboard navigation, dialogs, and text contrast.

Findings: **29 total — 9 high, 16 medium, 4 low.** Guest scanner routing, hidden drawer links, and tablet overflow have browser evidence. Other findings are supported by source inspection or explicit token calculations; their runtime acceptance checks remain to be completed.

This is an audit, not a remediation change. No application source or database records were changed. Severity reflects user impact: **High** blocks an important flow or excludes users; **Medium** causes friction, mistakes, or weak recovery; **Low** affects polish or maintainability. These are product priorities, not a claim that every finding violates WCAG.

## Method and coverage

- Inventoried 36 page files and 103 component files. Reviewed the shared design primitives and shell, public entry and ordering journey, and representative staff workflows: kitchen, cashier, waiter, products, HR, reports, and customer tables. This is not an authenticated execution of every route.
- Read UI/UX Pro Max's full quick reference and professional rules. Used its focus and error-validation searches. The Next.js image search returned relevant image guidance; its dataset targets Next.js 16.2, so no version-specific API recommendation was applied to this Next.js 15 application. The initial forms stack match was too generic for accessibility and was not used as evidence.
- Calculated contrast from declared, opaque CSS colors using relative luminance. Ratios below apply to those exact pairs, not every transparent overlay or photograph.
- Browser evidence is stored alongside this report. Public checks use local development mode, not a production performance benchmark. The service on port 3000 was a different project and was excluded; Sokoon was started on port 3100.
- Captured 12 screenshots across requested routes `/`, `/login`, `/scan-qr`, and `/order-type` at 375px, 768px, and 1440px. `/scan-qr` captures show the redirected login screen, not a working scanner. Replaced an initially premature 375px login screenshot after explicitly waiting for the submit button. Browser JSON records document overflow and hidden drawer links, not a full automated accessibility scan. The attempted scanner click timed out because the route redirected. `follow-up-results.json` records the final scanner URL as `/login?next=%2Fscan-qr`.
- Staff authentication, real camera permission/hardware, payment submission, screen-reader testing, receipt printers, production Core Web Vitals, and all data-dependent states remain unverified. No credentials were bypassed and no transactional actions were submitted.

## High priority findings

### H00 — Primary guest ordering CTA redirects to staff login

**Evidence:** Homepage hero and menu CTAs link to `/scan-qr`. `src/middleware.ts:23–37` lists the public routes but omits `/scan-qr`. Its `isPublicPath` deliberately matches `/` exactly, so the root entry does not make every route public. Guest browser navigation to `/scan-qr` displayed the staff login form at all three tested viewport sizes.

**Impact:** The advertised ordering entry point requires staff authentication. This prevents ordinary customers from reaching the scanner, independently of its initialization defect in H02.

**Fix:** Include the scanner page in the intended guest route policy and verify its entry points while signed out. Keep staff routes protected. Provide a visible manual table-selection fallback when camera access is unavailable.

**Acceptance:** From a fresh signed-out browser, both homepage ordering CTAs reach the scanner; camera denial still allows manual table selection. Protected staff routes continue to require login.

### H01 — Kitchen orders do not refresh automatically

**Evidence:** `src/components/kitchen/kitchen-board.tsx:38` updates only the local clock every 30 seconds. Its `router.refresh()` at line 72 runs after a local status mutation. `src/app/(app)/kitchen/page.tsx` supplies the initial server snapshot. The notifications bell polls its own notification state, not the kitchen order list.

**Impact:** A kitchen worker who leaves the screen open can miss newly submitted orders. Sound detection also depends on the unchanged `orders` prop.

**Fix:** Refresh orders periodically or subscribe to changes, suspend unnecessary background work, prevent overlapping requests, and show connection freshness. Preserve filter and in-progress interaction state.

**Acceptance:** Submit an order from a separate authorized test client; the idle kitchen board shows it without manual reload. Disconnecting exposes stale status and reconnecting recovers.

### H02 — QR scanner target changes without updating the DOM

**Evidence:** `src/app/(public)/scan-qr/page.tsx:16` changes an element ID held in a ref after mount; line 114 renders that ref. A ref mutation does not trigger a render. Line 27 initializes Html5Qrcode with the new ID while the first DOM still has `reader`.

**Impact:** First camera-start attempt can fail before requesting camera access, then display misleading permission guidance. A subsequent error render can change the DOM ID and make retry behave differently.

**Fix:** Use one stable ID for render and scanner initialization. Separate initialization failures from permission denial and camera unavailability. Add an explicit camera-starting state.

**Acceptance:** First click on a fresh load finds the target element. Denied access, no camera, and repeated start/stop each have distinct recoverable outcomes.

### H03 — Closed drawers retain focusable offscreen links

**Evidence:** `src/components/layout/sidebar.tsx:48–55` and `src/components/public/landing-nav.tsx:75` hide drawers with transforms only. Neither makes closed drawer contents inert or removes their tab stops. Open drawers lack focus containment and Escape dismissal; the public drawer also lacks body scroll locking.

**Impact:** Keyboard users can tab into invisible content. When open, focus can escape behind the overlay. The public drawer remains mounted on desktop as well.

**Fix:** Hide or make closed mobile content inert while retaining visible desktop navigation. Implement focus placement, containment, Escape dismissal, focus restoration, and scroll locking. Connect the trigger with `aria-expanded` and `aria-controls`; provide a visible staff drawer close control.

**Acceptance:** Closed drawers contribute no offscreen tab stops at phone, tablet, or desktop sizes. Opening and closing by keyboard restores focus predictably.

### H04 — Dialog behavior is incomplete across ordering and staff workflows

**Evidence:** Guest cart at `src/components/menu/menu-order-view.tsx:250` has no dialog semantics or focus lifecycle. POS variant/modifier overlays at `src/components/pos/pos-checkout.tsx:635,663` likewise lack dialog semantics. The waiter cart at line 756 and invoice settlement at `src/components/cashier/invoice-board.tsx:140` declare modal roles without implementing focus containment, entry/return focus, or Escape handling. Invoice configuration at line 187 has no accessible dialog name.

**Impact:** Checkout and editing panels can be visually modal but remain confusing or escapable to assistive technology and keyboard users.

**Fix:** Create one tested dialog primitive and adopt it throughout carts, receipts, product configuration, employee details, and destructive confirmation flows. Handle nested dialogs explicitly and protect unsaved payment input from accidental dismissal.

**Acceptance:** Each dialog has a name, focus starts inside, background controls cannot be reached, Escape follows the intended policy, and close restores focus. Verify nested invoice configuration separately.

### H05 — Shared semantic color pairs fail normal-text contrast

**Evidence:** `src/app/globals.css:29–42` and its `.light` overrides define these opaque foreground/background pairs:

| Pair | Dark | Light | Normal text target |
|---|---:|---:|---:|
| White on primary | 2.68:1 | 3.64:1 | 4.5:1 |
| White on success | 2.32:1 | 3.04:1 | 4.5:1 |
| White on warning | Not used by dark warning token | 2.14:1 | 4.5:1 |
| White on destructive | 4.38:1 | Not calculated | 4.5:1 |

`Button` uses primary and destructive foreground pairs; `Segmented` also uses primary foreground. Token availability does not imply every semantic pair is used everywhere.

**Fix:** Darken filled backgrounds or use sufficiently dark foregrounds. Evaluate default, hover, pressed, focus, and outlined variants independently in both themes.

**Acceptance:** All actual normal text pairs reach 4.5:1; large text reaches 3:1. Measure composed colors for transparency and images separately.

### H06 — Public accent text has insufficient contrast on cream

**Evidence:** `src/components/public/menu-section.tsx` uses `#B98757` for small headings and prices on `#F6F0E7` / near-white surfaces. The cream pair is **2.78:1**. Related accent text recurs in events, gallery, and social sections.

**Impact:** Small brand-colored labels are difficult to read. The measured pair also falls below the 3:1 large-text threshold.

**Fix:** Keep caramel as decoration or surface color; introduce a darker accessible accent for text on light surfaces.

**Acceptance:** Audit every public section's actual text/background pairs, including cards and badges.

### H07 — Gallery cannot be operated by keyboard

**Evidence:** `src/components/public/gallery-section.tsx:30` implements clickable images as generic divs with CSS backgrounds. The lightbox lacks dialog semantics, keyboard dismissal, focus handling, and descriptive image alternatives. Its close control contains an unlabelled icon-font ligature.

**Impact:** Keyboard users cannot open gallery items, and meaningful gallery imagery has no equivalent accessible description.

**Fix:** Use named button triggers and meaningful image alternatives; reuse the accessible dialog primitive. Give close a localized accessible name.

**Acceptance:** Open, inspect, and dismiss every gallery image with keyboard only; assistive technology receives useful image descriptions.

### H08 — Employee cards contain nested buttons

**Evidence:** `src/components/staff/employee-management-board.tsx:108` renders a button containing the shared `Button` at line 114.

**Impact:** Invalid interactive nesting creates ambiguous click/focus behavior and can produce React hydration warnings.

**Fix:** Use a non-interactive card wrapper with a single explicit open/edit button, or separate sibling controls.

**Acceptance:** No interactive element contains another interactive element; both pointer and keyboard activation open exactly one employee panel.

## Medium priority findings

### M00 — Homepage has document-wide horizontal overflow at tablet width

**Evidence:** At 768px the browser measured `document.documentElement.scrollWidth` as 781px. The same check was false at 375px and 1440px. The hidden public drawer also remains outside the viewport at every tested width; investigate the full contributing set before assigning the 13px overflow to one component.

**Fix:** Inspect desktop navigation's fixed gaps at its 768px switch point, off-canvas positioning, and intrinsic content widths. Adapt navigation before it becomes crowded and constrain only the responsible element; do not mask the entire document's overflow as the sole fix.

**Acceptance:** At 768px and neighboring widths, document scroll width equals viewport width. Verify long Arabic labels, 200% zoom, open/closed drawers, and keyboard focus visibility.

### M01 — Dropdown arrow-key navigation changes styling, not focus

**Evidence:** `src/components/ui/dropdown.tsx:74–96` opens the menu without transferring focus. Arrow keys update an index but not the focused item; menu items all retain native tab stops. Repeated ArrowDown on the trigger toggles the menu.

**Fix:** Prefer a native select for simple single selection, or implement the complete menu/listbox keyboard model. Expose selected state semantically and restore trigger focus on close.

**Acceptance:** Arrow keys move actual focus or an announced active descendant; Enter chooses the visibly active item; Escape closes and returns focus.

### M02 — Popover focus handling is unfinished

**Evidence:** `src/components/ui/popover.tsx:53–71` closes on Escape but only marks its trigger with a data attribute. It does not retain a trigger reference for focus restoration or implement role-specific keyboard behavior.

**Fix:** Implement dialog/menu behavior appropriate to each consumer. Do not impose a modal focus trap on non-modal popovers; ensure focus remains usable and returns when dismissing a focused panel.

### M03 — Many operational controls miss the skill's 44px touch target

**Evidence:** `src/components/ui/button.tsx:32–35` defines 32px small buttons and 40px default/icon buttons. `switch.tsx` defines a 24px-high control. Login password visibility at `login-form.tsx:74` has a 16px icon without an expanded hit box.

**Impact:** Busy café staff and phone users face increased mistaps, especially with adjacent quantity and action controls.

**Fix:** Expand touch hit areas to at least 44×44 CSS pixels for this web product's touch target policy; retain dense visual styling where useful. Keep destructive actions separated.

**Caveat:** The skill's 44px recommendation is stronger than WCAG 2.2 AA's 24px target-size minimum with exceptions. A 40px button is not automatically an AA failure.

### M04 — Public menu carousel lacks accessible navigation and discoverability

**Evidence:** `src/components/public/menu-section.tsx:62` hides the scrollbar on a horizontal strip of fixed-minimum-width cards. There are no previous/next controls or a named focusable scrolling region.

**Fix:** Provide labelled RTL-aware previous/next controls and a visible overflow cue, or use a responsive grid. Preserve vertical page scrolling.

**Acceptance:** Users can discover and reach every card using touch and keyboard at 375px and 200% zoom.

### M05 — Inputs lack persistent accessible labels in several workflows

**Evidence:** Guest menu search at `menu-order-view.tsx:186–193` uses only a placeholder. HR attendance/leave fields in `src/components/staff/hr-workspace-panels.tsx:27,46` and contract/compensation inputs in `employee-management-board.tsx:224–225` lack persistent field labels. HR report dates also have no labels.

**Fix:** Add visible labels with associated IDs or wrapping labels. Identify date ranges as start/end dates and use appropriate input modes and autocomplete.

**Acceptance:** Every field has a meaningful accessible name that remains clear after entering a value. Do not replace labels with placeholders.

### M06 — Error and success feedback often remains visual-only

**Evidence:** Login failure at `src/components/auth/login-form.tsx:94` is an ordinary paragraph. Guest service feedback at `menu-order-view.tsx:142` is an ordinary span. Many employee errors likewise lack announcements. Some newer HR reports already use `role="alert"`, so the problem is inconsistent implementation, not universal absence.

**Fix:** Use suitable live status/error regions. Associate field-specific errors with `aria-describedby` and `aria-invalid`; focus a linked summary for multi-field submission failures. Do not attach credential errors to an arbitrary field.

**Acceptance:** Failed submissions and service acknowledgements are announced once without losing entered values.

### M07 — Motion preferences are not respected

**Evidence:** No reduced-motion handling was found in `src`. The active homepage has bouncing hero affordances and hover transforms; the order tracker has persistent `animate-ping`. Some additional public components contain GSAP animations but are not composed into the current homepage.

**Fix:** Add reduced-motion variants for active CSS animation and transitions. Gate GSAP animation by preference where those components are used. Keep status readable without animation.

**Acceptance:** Reduced-motion mode removes nonessential movement and persistent pulsing without hiding content or progress.

### M08 — Search can show stale results and disguises failures as no matches

**Evidence:** `src/components/layout/topbar-search.tsx:43–67` does not abort or invalidate in-flight requests. An earlier slow response can overwrite a newer query. The catch path sets an empty list, which the UI labels as no matching results.

**Fix:** Abort requests or validate a sequence ID before committing results. Separate loading, empty, failed, and offline states; add retry and announce result counts.

**Acceptance:** Reverse response order in a throttled browser; only results for the current query appear. Failed requests never claim zero matches.

### M09 — Search results lose the selected entity

**Evidence:** `src/components/layout/topbar-search.tsx:49–56` sends all product hits to `/products` and all order hits to `/orders`.

**Impact:** Selecting a specific match opens a generic board and forces another search.

**Fix:** Link to the selected entity or pass a URL selection/filter that the destination consumes. Preserve the search context on back navigation.

### M10 — Guest cart disappears on reload or navigation

**Evidence:** `src/components/menu/menu-order-view.tsx:35` stores the cart only in component state; guest order persistence occurs after submission, not while building the cart.

**Fix:** Persist an unsubmitted draft scoped to the table token, with expiry and server revalidation of availability/prices. Clear after confirmed success and explain stale items.

**Acceptance:** Refresh restores the correct table's draft; changing tables cannot silently carry a previous table's order.

### M11 — Guest price presentation rounds away fractional EGP

**Evidence:** `src/components/menu/menu-order-view.tsx:23` formats every price and total with `maximumFractionDigits: 0`.

**Impact:** If configured prices contain fractions, displayed item prices and cart totals can differ from the server-priced charge.

**Fix:** Display the supported currency precision consistently across menu, modifiers, total, and receipt. If the product mandates whole-pound prices, enforce and document that constraint instead.

**Acceptance:** A 12.50 EGP fixture displays the same amount in every step. This finding is conditional on fractional pricing being permitted.

### M12 — Order tracking can look live while requests fail

**Evidence:** `src/components/order/order-status-tracker.tsx:49–56` silently ignores unsuccessful responses and network failures while the active-state pulse continues at line 86.

**Fix:** Show last successful update, a stale/offline state, and retry. Announce meaningful status changes without announcing every poll.

**Acceptance:** Network loss visibly changes freshness feedback; the last known status stays available and reconnect recovers.

### M13 — Charts expose hover-only detail

**Evidence:** `src/components/ui/chart.tsx:83–85` labels the area SVG as an image and uses mouse movement for exact-value tooltips. No equivalent data table, point keyboard interaction, or touch tooltip exists in this primitive. The donut's visible text legend is a useful existing alternative.

**Fix:** Add a compact accessible data table or exact-value text alternative; support pointer/touch and keyboard inspection where interaction is useful. Provide a useful chart summary and explicit empty state.

**Acceptance:** All area-chart values are available without hover; zero-data and single-point states remain meaningful.

### M14 — Arabic workflows expose English and implementation terms

**Evidence:** `src/components/staff/hr-reports-board.tsx:31` defines English KPI labels in an RTL Arabic report. `hr-workspace-panels.tsx` renders raw metric keys, employee IDs, and status strings in some panels. Guest order failure falls back to `Order failed`.

**Fix:** Centralize Arabic labels for roles, status, metric keys, and errors. Resolve employee names for operational views, and isolate remaining identifiers/Latin text with `bdi` or suitable direction.

**Acceptance:** Every user-facing state has an understandable Arabic label; IDs remain secondary reference information.

### M15 — Skip navigation and fixed-header anchor offsets are missing

**Evidence:** `src/components/layout/app-shell.tsx:61` provides a main landmark but no skip destination/link. Public navigation targets sections beneath a fixed 96px header; no scroll-padding/scroll-margin rule was found in `globals.css`.

**Fix:** Add an early visible-on-focus skip link and stable main ID. Offset public anchor targets for the fixed header and verify keyboard focus remains visible.

**Acceptance:** Skip link bypasses long navigation; menu/contact headings remain readable after anchor navigation at mobile and desktop sizes.

## Low priority findings

### L01 — Public navigation selected state is hard-coded

**Evidence:** `src/components/public/landing-nav.tsx:10` permanently marks Home active. Public category buttons change visual styling without `aria-pressed` in `menu-section.tsx:48`.

**Fix:** Reflect the current section and filter semantically. A simple IntersectionObserver can update section state; avoid changing history on every scroll.

### L02 — Public imagery bypasses responsive image delivery

**Evidence:** Hero, menu, occasion, and gallery photos use remote CSS backgrounds; menu and gallery images are not lazy image elements with responsive sources. The current page includes many below-fold photos.

**Fix:** Use appropriately sized local/CDN images or Next Image where suitable, responsive `sizes`, lazy below-fold delivery, and explicit geometry. Prioritize only the actual above-fold hero resource. Keep decorative images decorative; meaningful gallery images need alternatives.

**Acceptance:** Inspect production network transfer and image sizing on a mobile connection. No numeric LCP, CLS, or bandwidth regression is claimed by this source review.

### L03 — Two icon systems have different semantics and failure modes

**Evidence:** Staff SVG `Icon` hides decorative glyphs consistently. Public pages use Material Symbols ligature text, loaded externally from Google Fonts in `src/app/layout.tsx:51`. Public icon-only drawer controls have no localized labels; ligature strings can become their names.

**Fix:** Reuse a local vector family where practical. Hide decorative icons and explicitly label icon controls; do not rely on downloaded ligature text for control names.

### L04 — Fatal error screens foreground implementation details

**Evidence:** `src/app/global-error.tsx` and `src/app/(app)/error.tsx` put raw error messages in the main recovery view.

**Fix:** Lead with a user-actionable explanation, retry, and support reference. Keep technical detail secondary or in diagnostics. No security exposure is asserted here.

## Strengths to retain

- Arabic document language and RTL direction are explicit at root; logical spacing utilities are common in the staff UI.
- Global visible keyboard focus styling exists, and most shared controls use native buttons.
- Login permits browser password managers through correct autocomplete values and does not block paste.
- Shared theme tokens, component variants, cards, and icons provide a strong basis for consistent fixes.
- Guest ordering and cashier operations provide busy states; multiple boards have explicit empty states.
- Staff tables commonly use contained horizontal scrolling rather than forcing document-wide overflow.
- Root viewport configuration does not disable zoom. Cairo is bundled locally.
- Café identity, alternating sections, photo treatment, and clear primary ordering CTA are visually coherent in the captured mobile homepage.

## Recommended remediation order

1. Repair kitchen freshness and QR initialization. Verify both with controlled test data and real camera permission flows.
2. Fix shared colors, drawers, dialogs, dropdowns, and nested controls. These changes improve many screens at once.
3. Standardize labels, error announcements, Arabic strings, chart alternatives, and reduced-motion behavior.
4. Improve draft preservation, exact pricing, search relevance/recovery, and tracking freshness.
5. Finish responsive image delivery and visual polish after interaction correctness is stable.

## Required validation before sign-off

| Area | Required checks |
|---|---|
| Guest ordering | QR first start/retry/permission denial; manual table choice; search; add/remove; required name; failed submit; success tracking; no duplicate submission |
| Staff operations | Owner/manager/cashier/waiter/kitchen roles; shift gates; incoming kitchen order; invoice overlays; nested configuration; pending/failed payments |
| Keyboard/assistive technology | Full Tab sequence; closed drawers; every dialog; dropdown selection; gallery; skip link; announced errors and live status |
| Responsive | 375px, 768px, 1440px; phone landscape; 200% zoom; long Arabic names; long IDs; soft keyboard open; safe-area devices |
| Themes | Independently measure dark and light text, controls, borders, hover/focus, badges, and photographic overlays |
| Resilience | Slow and failed responses; reordered search responses; stale kitchen/tracking state; interrupted checkout; reload draft recovery |
| Performance | Production-build LCP/CLS/INP and image transfer on a mobile network; do not use development compile times as performance scores |
| Printing | 58/80mm receipt configurations and QR prints on the actual printer/browser setup |

The native-specific checklist in UI/UX Pro Max was reviewed for applicable touch and safe-area concerns. Native iOS/Android point/dp requirements were not treated as web conformance requirements. No overall numerical score or accessibility certification is assigned without the remaining manual checks.
