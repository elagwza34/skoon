# SOKOON Technical Audit — Executive Summary

**Audit date:** 2026-10-30

**Verdict:** **NOT READY**

**Scope:** current local worktree, source/configuration, Prisma schema and local migrations. No production database, Hostinger setting, or live Supabase policy was changed or queried.

## Overall assessment

The application has strong foundations: server-resolved staff identity, branch scoping in core writers, server-side pricing, transaction locks around payments and inventory, immutable-ledger concepts, and a meaningful offline regression suite. The local production build succeeds.

Release is nevertheless blocked by two critical findings and six high-priority findings. A privileged invoice endpoint can permanently erase an order and its payments; the installed Next.js version is covered by a critical advisory. The reported inconsistent global-discount behavior has a confirmed code cause: `eligibleForInvoiceDiscount` is persisted but ignored by the calculator. Cashier invoice item edits also bypass inventory reservation/release logic, and the Waiter UI calls a serving endpoint that does not exist in the built route manifest.

## Finding totals

| Priority | Count |
|---|---:|
| P0 | 2 |
| P1 | 6 |
| P2 | 5 |
| P3 | 2 |
| **Total** | **15** |

## Top 10 actions

1. Disable and replace hard invoice deletion with an auditable reversal/void flow.
2. Upgrade Next.js to a non-vulnerable release and rerun the complete build/security regression suite.
3. Correct the invoice-discount eligible base and add mixed eligible/ineligible regression cases.
4. Route cashier quantity/add/remove operations through the inventory-aware order adjustment service.
5. Restore or rewire the missing Waiter serve-items API contract and test ready-to-served transitions.
6. Resolve the Manager shift-policy contradiction with one central policy and role matrix.
7. Reconcile Prisma and Supabase migration histories against a backed-up staging clone before release.
8. Add rate limiting, payload-size limits, and replay/abuse controls to public QR order creation.
9. Run PostgreSQL transaction/concurrency suites on a proven isolated staging database.
10. Add browser E2E coverage for all roles, QR ordering, receipts, and mobile RTL workflows.

## Domain assessments

- **Security:** NOT READY. Staff routes are authenticated, but vulnerable dependencies and public endpoint abuse controls require remediation.
- **Financial integrity:** NOT READY. Hard deletion and discount eligibility defects affect auditability and totals.
- **Inventory integrity:** NOT READY. Core reservation code is concurrency-aware, but cashier invoice edits bypass it.
- **Testing:** READY WITH CONDITIONS locally. 225 offline tests pass; database and browser suites remain unverified.
- **Deployment:** NOT READY. Local build passes, but production schema/RLS/runtime compatibility was not verified.

See `FULL_AUDIT_REPORT.md` for evidence and classification.
