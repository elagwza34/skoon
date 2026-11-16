# Financial-system audit checklist

Scope: current working tree, including earlier local UI changes. Review only; no application fixes or real financial data changes.

- [x] Read requested Superpowers process and relevant database/security skills.
- [x] Inventory services, routes, financial models, migrations, UI consumers, and existing tests.
- [x] Split independent payment, custody, and payroll investigations using read-only reviewer agents.
- [x] Review collection, external references, refund lifecycle, authorization, and durable retries.
- [x] Review tills, opening balances, shared floats, safes, handovers, reversals, and reconciliation.
- [x] Review payroll periods, rate changes, attendance, leave, holidays, overtime, advances, and payment/closure.
- [x] Review invoice edits, discounts, tax snapshots, report aggregation, and date attribution.
- [x] Run the existing offline suite and inspect its real output.
- [x] Independently run each isolated issue reproducer and record limitations.
- [x] Cross-check findings against actual routes, UI contracts, schema and migrations; remove duplicates and false positives.
- [x] Run fresh typecheck, lint, and Prisma schema validation.
- [x] Write prioritized report with locations, reproduction, impact, remediation, strengths, and unverified areas.
- [x] Verify audit artifacts and report actual results without claiming live-database certification.
