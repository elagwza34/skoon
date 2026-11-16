# Cash custody, shifts, float, and safe review

Reviewed 2026-11-16. This is a source review with offline service reproductions. No application source, database, migration state, or financial records were changed. The only added files are this report and its reproducer.

## Verification

Run from the repository root:

```powershell
node --require ./tests/node-userinfo-workaround.cjs --import tsx docs/audits/financial-2026-11-16/cash-custody-reproducer.cjs
```

Result: 10 confirmed scenarios, exit code 0. The reproducer invokes the actual financial services with an in-memory Prisma double. It replaces both datasource URLs with a dummy localhost address, blocks network entry points, and throws on any Prisma method absent from the double. It does not model PostgreSQL lock scheduling, transactions, constraints, or rollback.

Existing regression coverage also executed with dummy datasource URLs:

```powershell
node --require ./tests/node-userinfo-workaround.cjs --import tsx --test tests/cash-handover-offline.test.ts
```

Result: 17 passed, 0 failed. No database-backed tests were run.

## Findings

### CASH-01 — P1: Safe-to-float transfer credits the float twice

Evidence: `src/lib/staff-float.ts:357` and `:367` each create an amount-bearing movement from `MAIN_SAFE` to `FIXED_FLOAT`. `sharedFloatTotals` at `:59`–`:61` counts every movement whose destination is `FIXED_FLOAT`; the `main_safe_withdrawal` row is therefore a second float credit.

Executed proof: baseline 0; safe deposit 100; `transferMainSafeToFixedFloat(owner, 100, ...)` returns successfully. Safe balance becomes 0, but shared float availability becomes 200. `recordSharedFloatAdvance` at `:99` trusts that inflated balance for actual disbursements.

Impact: one real transfer creates twice the spendable float, allowing advances or withdrawals beyond physical cash.

Proposed correction: represent each transfer with one authoritative account-to-account posting, or make paired entries explicit legs with only one float credit. Use one consistent ledger interpretation for safe and float balances. Preserve paired entries and provenance when correcting historical duplicates.

### CASH-02 — P1: The fixed-float addition endpoint bypasses safe funding checks and debits

Evidence: `recordFixedFloatMovement` accepts Owner additions at `src/lib/staff-float.ts:168`–`:169`, locks only the shared float at `:185`, and writes a `MAIN_SAFE` → `FIXED_FLOAT` addition at `:204`–`:209`. It never verifies or debits the safe. Safe readers/debit guards count only `main_safe_deposit`/`main_safe_withdrawal` at `:258`, `:264`–`:265`, and `:299`–`:303`. This path is exposed by `src/app/api/staff/fixed-float/route.ts:16` and the normal fixed-float UI.

Executed proof: with baseline 0 and an empty safe, an Owner addition of 100 succeeds. Float availability becomes 100 while the safe remains 0. With a funded safe, the original safe balance would remain available for a second withdrawal.

Impact: recorded cash is created or remains spendable in two locations. This is separate from CASH-01: fixing the dedicated safe transfer alone leaves this bypass available.

Proposed correction: route safe-funded additions through a single corrected safe-transfer service. Acquire safe and float locks in a common order, verify the source balance, and atomically record exactly one debit and one credit effect.

### CASH-03 — P1: Operational withdrawals ignore executed refund cash outflows

Evidence: `src/lib/staff-float.ts:188`–`:196` calculates available cash using completed payments, legacy `payment.status='refunded'` rows, and operational withdrawals. Current refund execution retains completed payment status and records a separate `cash_refund` movement at `src/lib/staff-payments-write.ts:666` and `:687`–`:692`. The correct shared cash equation already includes those movements at `src/lib/staff-shifts.ts:218`–`:225`.

Executed proof: opening 0, completed cash receipt 100, and posted cash refund 80 leave physical/expected cash 20. An operational withdrawal of 100 nevertheless succeeds. `readShiftCashState` then returns expected cash −80.

Impact: refunds followed by operating expenses can spend more cash than exists despite the common financial lock.

Proposed correction: use `readShiftCashState` under the existing shift lock for the funding decision. If opening cash is reserved by policy, express that reservation explicitly while still deducting every executed refund. Opening cash exclusion alone was not treated as a defect because custody policy may intentionally reserve it.

### CASH-04 — P1: Reversal can remove already-spent float and bypass Owner-only cash movement authority

Evidence: `reverseFixedFloatMovement` allows Manager+ at `src/lib/staff-float.ts:227`, locks only the original movement at `:231`, and creates the reversed account transfer at `:235`. There is no shared-float lock or availability check. Ordinary additions/withdrawals are Owner-only at `:169`.

Executed proof: Owner adds 100; a cashier advances all 100, leaving shared float 0. A Manager reverses the original Owner addition successfully. Shared float becomes −100 while the cashier still owes 100.

Impact: a correction path violates the nonnegative fund invariant and permits a Manager to authorize physical account movement denied through the normal endpoint. Even adding a balance check without the shared lock would leave a race with concurrent float debits.

Proposed correction: enforce the cash movement authority on reversals, coordinate every float debit with the same branch lock, and reject or separately reconcile reversals whose source funds are no longer available.

### CASH-05 — P2: History pagination is applied before financial balances and outstanding debt are calculated

Evidence: `getSharedFloatSummary` fetches only 300 recent movements at `src/lib/staff-float.ts:74` and uses that slice for baseline, availability, linked advances, and repayments at `:75`–`:85`. `getFixedFloatBoard` similarly limits to 200 at `:147`. `getMainSafeSummary` limits to 200 at `:261` before calculating deposits/withdrawals/balance at `:264`–`:268`.

Executed proofs:

- Baseline 1000, outstanding advance 100, and 300 later unrelated operating movements produce actual float availability 900 and debt 100. The summary displays 0/0, reports a missing baseline, and exposes no old advance for return selection.
- Safe deposit 1000 followed by 200 withdrawals of 1 leaves 800. The safe summary displays −200 and deposits 0.

Impact: normal ledger growth corrupts the displayed financial position. The cashier UI disables new advances when the old baseline disappears and removes old unsettled advances from the return selector (`src/components/cashier/shared-float-panel.tsx:12`–`:14`). Server mutation guards that aggregate the complete history do not inherit this particular pagination defect.

Proposed correction: calculate balances, baseline existence, outstanding advances, and linked repayments from complete scoped history or maintained authoritative balances. Paginate only the presentation history. Fetch unresolved advances independently of the latest movements.

### CASH-06 — P2: Safe withdrawal and transfer retries have no reusable idempotency identity

Evidence: `/api/staff/main-safe` passes only session, amount, and reason at `src/app/api/staff/main-safe/route.ts:49` and `:59`; it does not pass a request idempotency key. `withdrawFromMainSafe` generates a new random key on every invocation at `src/lib/staff-float.ts:283`. `transferMainSafeToFixedFloat` does the same at `:332` and never persists a `FinancialOperation` before returning at `:381`.

Executed proof: with safe balance 100, replaying an intended withdrawal of 30 posts two distinct movements and reduces the safe to 40. The safe lock prevents an overdraft but cannot identify a lost-response retry.

Impact: network retries or duplicate submissions record a second monetary operation. The transfer path also compounds CASH-01.

Proposed correction: accept and require a stable request key for both operations, include all material request fields in its fingerprint, recheck it under the transaction lock, and persist the response atomically with the ledger movement. Retain the same key in the client for retries of one intended operation.

### CASH-07 — P2: Cashier handover accepts recipients who can never acknowledge it

Evidence: close resolves any active same-branch user at `src/lib/staff-shifts.ts:393`–`:395` and rechecks only active branch membership at `:423`. The board offers all active branch staff at `:875`–`:877`. The resulting cash handover is created at `:493`–`:503`. Acceptance/dispute permits only a Cashier (`:629`–`:633`); all transitions additionally require an active Cashier recipient (`:672`–`:677`). Resolution also requires an existing dispute and recipient count (`:790`–`:793`). No cancel/reassignment transition is exposed.

Executed proof: cashier closes with count 100 and a Kitchen recipient. The shift closes and a pending 100 handover exists. The Kitchen recipient receives 403 on acceptance. An independent Owner receives 409 on resolution because the recipient is ineligible, without a path to obtain the required recipient count.

Impact: a normal offered dropdown selection strands recorded custody outside the supported handover workflow. Recovery requires changing staff roles or a separate manual correction.

Proposed correction: require eligible Cashier recipients when creating cash handovers and show the same eligible list in the UI. Provide an audited cancellation/reassignment procedure for an originally valid recipient who later becomes ineligible.

### CASH-08 — P2: The fixed-float management balance omits compensating reversals

Evidence: `getFixedFloatBoard` calculates `sharedFloatTotals` at `src/lib/staff-float.ts:150` but then discards its corrected net additions/withdrawals. It filters only original addition/withdrawal type names at `:151`–`:154`.

Executed proof: baseline 100, addition 50, and a compensating reversal 50 yield authoritative account-direction availability 100. The management board shows balance 150.

Impact: managers/owners see a reversal as ineffective in the financial total. This remains wrong even with fewer than 200 movements, so it is independent of CASH-05.

Proposed correction: use the reversal-aware net amounts from the authoritative ledger calculation for management totals, with a clearly defined principal-versus-available balance where necessary.

### CASH-09 — P2: Waiter close ignores the supplied handoff recipient and always blocks unpaid work

Evidence: `tableHandoffRecipient` is initialized to null at `src/lib/staff-shifts.ts:390` and is never assigned. `tableHandoffRecipientId` is accepted by the schema at `:179` but unused thereafter. When responsible open/unpaid orders exist, `:442` therefore always throws before the transfer block at `:443` can run.

Executed proof: waiter owns one unpaid open order and supplies a valid active same-branch waiter UUID in `tableHandoffRecipientId`. Close returns 409 and the sender shift stays open.

Impact: the documented waiter close-and-transfer workflow cannot complete while outstanding bills remain. Shift attendance/custody closure remains blocked even after the user selects the requested successor.

Proposed correction: resolve and authorize the selected recipient, verify their eligible role/open shift under the appropriate locks, and assign the resolved recipient before testing the handoff guard.

## Reviewed controls and scope

- Reviewed shift open/close, manual versus incoming opening cash, cash payment/refund/withdrawal equation, cash handover accept/dispute/reject/resolve, recipient eligibility, branch scoping, shared float baseline/advance/return/settlement, immutable corrections, safe deposit/withdrawal/transfer, financial operation keys, financial shift locks, associated APIs/UI, Prisma models and migrations, and relevant offline/PostgreSQL test source.
- Shift ownership and branch checks are enforced in services. Close rereads the shift under the common advisory lock and row lock before freezing reconciliation. Payment/refund/operational withdrawal writers use that common shift lock; the identified withdrawal defect is arithmetic, not absent serialization.
- Cash handovers require explicit confirmation and whole-cent count. Mismatches create a non-posting dispute. Original recipient count and difference cannot be overwritten. Resolution requires an independent authorized Manager/Owner and the same recipient-confirmed count.
- Pending/disputed incoming custody blocks manual opening. A recipient with an already open till cannot silently top it up by accepting the next opening transfer. Opening consumes accepted handover movements once in the same transaction.
- Original cash entries are preserved on reversal; `reversalOfId` is unique. Linked advance returns/settlements are bounded by original outstanding amount and coordinated by the advance repayment lock.
- Advances intentionally remain personal obligations after shift close. They are separate `CASHIER_ADVANCE` custody, not drawer sale receipts; excluding those advances from the drawer equation was not flagged. Owner/manual opening reconciliation provenance remains a policy limitation rather than an asserted defect.
- The partial open-shift unique index exists in the Supabase migration tree; deployment/index presence was not verified. The read-only audit did not claim live database or RLS/constraint verification.
- `staff-reconcile.ts` concerns staff Auth identity linkage rather than financial cash reconciliation. It was read for scope; no additional financial custody finding was inferred from its name.
