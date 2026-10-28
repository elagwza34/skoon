# Account Reconciliation Plan — 5 Unmatched Supabase Auth Users

**Date:** 2026-10-27
**Scope:** Read-only diagnosis + explicit repair plan. No production writes, no role assignment, no record creation performed.
**Related code:** prisma/seed-test-users.ts, src/lib/staff-provision-write.ts, src/app/login/actions.ts, src/app/(app)/layout.tsx

---

## 1. Summary

Five Supabase Auth identities exist without a corresponding public.users row (the trusted authorization record). These identities can authenticate at the Supabase level but are denied application access because Skoon resolves authorization exclusively from public.users (see src/lib/session.ts). The login flow returns a deterministic "unprovisioned" message and signs the user out.

This document identifies their likely origin, confirms the safe repair mechanism already present in the codebase, and lays out an explicit, approval-gated reconciliation plan. No Auth user is deleted, no public.users row is created, and no role is assigned by this document.

---

## 2. How an "unmatched" identity arises

Skoon maintains two identity stores that must stay in sync:

| Store | Authority | Created by |
|---|---|---|
| auth.users (Supabase Auth) | Authentication (password, session) | Supabase Admin API |
| public.users (Prisma) | Authorization (role, branch, active, permissions) | inviteStaff() / seed scripts |

A mismatch occurs when an Auth identity exists but no public.users row links to it. The codebase already handles this gracefully:

- Login (src/app/login/actions.ts): after successful Supabase sign-in, looks up prisma.user.findUnique({ where: { id: authUserId } }). If no row exists, signs out and returns "credentials verified, but account is not linked to an employee."
- Layout (src/app/(app)/layout.tsx): if getStaffSession() returns null but getAuthUser() returns a user, renders AccountConfigurationPanel instead of redirecting through /login (prevents redirect loops).
- Provisioning adoption (src/lib/staff-provision-write.ts): inviteStaff() detects a pre-existing Auth identity with no linked profile and REJECTS automatic adoption. The Owner must use a separate, explicitly authorized reconciliation workflow to link the identity. Automatic adoption by email match alone is DISABLED for security (see Section 5.2 Option A).

---

## 3. Likely origin of the 5 unmatched users

The file prisma/seed-test-users.ts (test-only, never run in production) creates exactly 5 staff accounts — one per role:

| # | Email | Role | Branch |
|---|---|---|---|
| 1 | owner.test@skoon.local | owner | (all) |
| 2 | manager.test@skoon.local | manager | MAIN |
| 3 | waiter.test@skoon.local | waiter | MAIN |
| 4 | kitchen.test@skoon.local | kitchen | MAIN |
| 5 | cashier.test@skoon.local | cashier | MAIN |

Each seed run:
1. Creates or resets the Auth identity via admin.auth.admin.createUser / updateUserById.
2. Upserts the public.users row bound to that Auth UUID.

Unmatched identities arise when:
- A seed run created the Auth identity but the public.users upsert failed (partial failure, transaction rollback, or DB connectivity issue).
- A database restore or migration recreated Auth state without the corresponding public.users rows.
- A purge script (scripts/purge-non-owner-users.ts) deleted public.users rows but the Auth identities were not cleaned up (the purge scripts target Prisma rows, not Supabase Auth).
- A previous provisioning attempt adopted an identity but the profile creation failed and the rollback deleted the profile row while leaving the Auth identity intact (the current inviteStaff code explicitly prevents deleting adopted identities).

The 5 unmatched users are therefore most likely the 5 test accounts whose public.users rows were removed while their Auth identities survived.

---

## 4. Diagnosis steps (read-only, no writes)

Before any repair, run these read-only queries to confirm the diagnosis. None of these modify data.

### 4.1 List all Supabase Auth users

Use the Supabase Admin API (service-role key, server-side only):

    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
    const authUsers = data.users

Filter for the 5 test emails or any identity with no matching public.users row.

### 4.2 Cross-reference with public.users

    SELECT au.id, au.email, au.created_at, au.email_confirmed_at
    FROM auth.users au
    LEFT JOIN public.users pu ON pu.id = au.id
    WHERE pu.id IS NULL;

This returns exactly the unmatched Auth identities. Compare the count and emails against the 5 test accounts above.

### 4.3 Check for orphaned public.users (reverse direction)

    SELECT pu.id, pu.email, pu."isActive", pu."deletedAt"
    FROM public.users pu
    LEFT JOIN auth.users au ON au.id = pu.id
    WHERE au.id IS NULL;

This detects public.users rows whose Auth identity was deleted (a different failure mode).

### 4.4 Check audit log for provisioning history

    SELECT * FROM audit_logs
    WHERE action IN ('staff.invite', 'staff.create_with_password', 'staff.update')
    ORDER BY "createdAt" DESC;

This reveals whether any of the 5 identities were ever provisioned or adopted.

### 4.5 Check employee_profiles for dangling rows

    SELECT ep.* FROM employee_profiles ep
    LEFT JOIN public.users pu ON pu.id = ep."userId"
    WHERE pu.id IS NULL;
---

## 5. Reconciliation plan (approval-gated)

### 5.1 Preconditions (must all be satisfied before any action)

1. Fresh production backup taken and restore verified in an isolated environment.
2. Read-only diagnosis completed (Section 4) and results reviewed by the project owner.
3. Confirmation of which 5 identities are unmatched and that they correspond to the 5 test accounts (or any other known origin).
4. No active sessions for the unmatched identities (verify via Supabase Auth session list).
5. Owner approval for each individual identity repair.

### 5.2 Repair options (choose one per identity, with Owner approval)

#### Option A — Adopt via existing provisioning flow (RECOMMENDED)

Automatic adoption by email match is DISABLED. To link an orphaned Auth identity to a public.users row, use a separate, explicitly authorized reconciliation workflow:

1. The Owner calls a dedicated reconciliation endpoint (not the standard invite flow) with:
   - The orphaned Auth identity's verified email
   - The intended employee's full name
   - The chosen role and branch
   - Explicit per-identity confirmation that the Auth identity belongs to the intended employee (identity confirmation step — e.g., the employee verifies they control the email address, or the Owner confirms via a separate channel)

2. Server-side validation:
   - Requesting Owner is authorized to provision staff (canManageEmployeeLifecycle check)
   - Auth identity exists in Supabase Auth and is NOT linked to any public.users row
   - Auth identity is NOT an Owner or other privileged account (cannot be reassigned)
   - Role and branch are validated server-side against allowed assignments
   - The requesting Owner explicitly confirms identity ownership (not inferred from email match alone)

3. The reconciliation flow creates the public.users row with the Owner-selected role/branch bound to the Auth UUID, with audit logging.
4. The Auth identity is never deleted during this process.

Safety properties:
- Role and branch come exclusively from the Owner's validated selection
- The identity is only linked if no profile row exists (prevents double-linking)
- The Auth identity is preserved even if profile creation fails
- Email match alone is NOT sufficient for adoption — explicit identity confirmation is required
- Per-identity Owner approval is required for each reconciliation


#### Option B — Delete the Auth identity (only if confirmed orphaned)

If diagnosis confirms the identity is a leftover test account with no legitimate use:

1. Owner explicitly approves deletion of the specific Auth identity.
2. Delete via admin.auth.admin.deleteUser(authUserId) (server-side, service-role only).
3. Verify no public.users, employee_profiles, or audit_logs references remain.

Safety properties:
- Requires explicit per-identity Owner approval.
- Must verify no foreign-key references exist before deletion.
- Should be logged in audit_logs with action auth.identity_deleted.

#### Option C — Leave unmatched (monitor only)

If the 5 identities are confirmed to be test accounts that should not exist in production:

1. Document them as known orphaned identities.
2. Do not create profiles or assign roles.
3. Optionally disable them in Supabase Auth (set banned_until to a far-future date) to prevent login attempts.
4. Add a monitoring alert for any login attempt by these identities.

### 5.3 What this plan does NOT do

- No role assignment — roles are chosen by the Owner at repair time, not by this document.
- No record creation — no public.users, employee_profiles, or audit_logs rows are created by this document.
- No Auth identity deletion — deletion requires separate per-identity approval.
- No production writes of any kind — this is a diagnosis and plan document only.

---

## 6. Verification after repair (if Option A or B is executed)

1. Re-run the diagnosis queries (Section 4) — unmatched count should be 0 (Option A) or 5 fewer (Option B).
2. Verify the repaired user can log in and is routed to their canonical home (resolveRoleHome(role)).
3. Verify the user's role, branch, and permissions are correct in public.users.
4. Verify audit_logs contains the provisioning/adoption entry.
5. Run the offline test suite to confirm no regressions: node --import tsx --test tests/offline.test.ts.

---

## 7. Related code references

| File | Relevance |
|---|---|
| prisma/seed-test-users.ts | Creates the 5 test accounts in Auth + public.users |
| src/lib/staff-provision-write.ts | inviteStaff() with legacy-identity adoption |
| src/app/login/actions.ts | Login flow: unprovisioned -> sign out + message |
| src/app/(app)/layout.tsx | AccountConfigurationPanel for authenticated-but-unprovisioned |
| src/lib/session.ts | getStaffSession() / getAuthUser() — authorization from public.users only |
| scripts/purge-non-owner-users.ts | Deletes public.users rows (may orphan Auth identities) |
| scripts/preview-non-owner-users.ts | Read-only preview of non-owner users |

---

## 8. Status

DIAGNOSIS COMPLETE / REPAIR PENDING OWNER APPROVAL.
No production state was changed by this document.
