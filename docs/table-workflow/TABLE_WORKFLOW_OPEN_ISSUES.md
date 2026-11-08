# TABLE_WORKFLOW_OPEN_ISSUES.md — SOKOON Table-Centric Workflow

**Project:** SKOON  
**Status:** Open issues and blockers for table-centric workflow implementation

---

## 1. Open Issues

### Issue 1: Automatic Waiter Reassignment (Phase 5b)

**Description:** When the responsible waiter's shift ends while an order remains active, the system should automatically find another eligible waiter (same branch, active shift, not inactive) and reassign responsibility.

**Current State:** `reassignOrderResponsibility` exists in `staff-waiter-operations.ts` but requires **Manager** role and manual invocation. No automatic reassignment on shift end.

**Required:**
1. Background job or shift-close hook to detect ended shifts with active orders.
2. Eligible waiter selection algorithm (deterministic, branch-scoped).
3. API route for automatic reassignment (not yet implemented).
4. UI trigger in table workspace for manual reassignment (partially added — UI section added, API call not wired).

**Blocker:** Requires backend API implementation and business approval for deterministic selection policy.

**Verdict:** BLOCKED — REQUIRES BACKEND API + BUSINESS APPROVAL.

---

### Issue 2: Safe Order Deletion (Phase 6)

**Description:** Waiter may request physical deletion of an unpaid order before any item becomes READY.

**Current State:** No hard delete for orders exists. Only cancellation (`transitionOrderStatus` to `cancelled`) preserves audit trail.

**Critical Data-Integrity Constraints:** Before physical deletion, must inspect:
- Payment records (never delete settled payment evidence)
- Refund records (never delete)
- Inventory reservations/consumption (never delete)
- Waste records (never delete)
- Batch allocations (never delete)
- Audit logs (never delete)
- Kitchen events (never delete)
- Employee accountability (never delete)
- Referential integrity constraints

**Verdict:** BLOCKED — REQUIRES BUSINESS APPROVAL. Full order deletion is not implemented. Only cancellation exists.

**Alternative:** Use existing cancellation mechanism which preserves audit trail and inventory accounting.

---

### Issue 3: Real-Time Sync Verification

**Description:** All table and order changes must propagate to relevant connected clients without manual refresh.

**Current State:** `notifications.ts` provides branch-scoped notifications. `emitStatusNotifications` in `staff-orders.ts` sends atomic notifications within transactions.

**Gap:** No browser-based real-time testing performed. Supabase Realtime vs Socket.io usage needs audit to confirm which infrastructure is used.

**Verdict:** NEEDS BROWSER TESTING — infrastructure audit required.

---

### Issue 4: OCC Uniformity Across Write Paths

**Description:** Optimistic Concurrency Control should be uniformly applied across all write paths.

**Current State:** `expectedUpdatedAt` exists in `waiterOrderEditSchema` only. `appendOrderItems` and `transitionOrderStatus` rely on row locks only.

**Verdict:** NEEDS ENHANCEMENT — Add `expectedUpdatedAt` to all write schemas for client-side conflict detection.

---

### Issue 5: Waiter Reassignment UI (Partial)

**Description:** Reassign responsibility section added to UI for manager role, but API call not wired.

**Current State:** UI shows input fields for new waiter ID and reason, but `onClick` handler not connected to `reassignOrderResponsibility` API.

**Verdict:** NEEDS API WIRING — connect UI to existing `reassignOrderResponsibility` API endpoint.

---

## 2. Issues Requiring Database Testing

| Issue | Description | Status |
|-------|-------------|--------|
| Concurrent append operations | Two waiters append to same order simultaneously | Needs PG row lock verification |
| Concurrent serving | Two waiters serve same item simultaneously | Needs PG row lock verification |
| Shift close with active orders | Shift ends while orders active | Needs reassignment logic |
| Inventory reservation race | Two orders reserve same stock simultaneously | Needs row lock verification |

---

## 3. Issues Requiring Browser Testing

| Issue | Description | Status |
|-------|-------------|--------|
| RTL layout | Arabic text direction in table workspace | Not tested |
| Audio notifications | Browser audio playback restrictions | Not tested |
| Mobile layout | Table workspace on mobile devices | Not tested |
| Real-time sync | Live updates across browser tabs | Not tested |

---

## 4. Issues Requiring Production Authorization

| Issue | Description | Status |
|-------|-------------|--------|
| Physical order deletion | Hard delete unpaid orders before READY | BLOCKED — business approval required |
| Automatic waiter reassignment | Reassign on shift end | BLOCKED — business approval required |
| Database schema changes | Any Prisma schema modifications | BLOCKED — requires explicit approval |

---

**End of Open Issues.**
