# Owner Provisioning - Trusted Onboarding Design

> **Status: DESIGN ONLY. Not implemented. No invitation sent, no user created,
> no service-role secret added, no seed executed in this phase.**

The Owner is the first and most privileged account. It must be created through a
**trusted server-side process**, never through client-controlled input, public
registration, or editable metadata. This document defines that flow and its
authorization boundary. Implementation is a separately-approved task.

---

## 1. Threat model (what this design prevents)

| Attack | Blocked by |
|--------|------------|
| A stranger signs up and becomes Owner via public sign-up | Public sign-up is **disabled** in Supabase Auth for the staff app; no public "register as owner". |
| A signed-in user sets their own role = owner via user_metadata | Role is read from public.users (server-written), never from JWT metadata (see 00-helpers.sql). |
| A user calls an API to elevate themselves | Role assignment runs under the **service-role key** on the server and requires an authenticated **admin/owner** caller. |
| Owner granted with a hardcoded password in source | Owner receives a **Supabase Auth invitation** and sets their own password; no password in code. |
| Invitation link reused / stale | Assignment requires an **authenticated, email-verified** session bound to the invited email. |
| Partial failure leaves a half-Owner | The flow is **transactional and fails safe** (see section 5). |

---

## 2. Roles involved

- **Bootstrap admin** - the first human to own the project. In a brand-new empty
  database there is no Owner yet, so the *first* Owner is bootstrapped by a
  **one-time server script run by the project owner** using the service-role key
  in a trusted environment (local .env, not a public endpoint). This is the
  only privileged action without a prior Owner.
- **Existing Owner / admin** - once one Owner exists, all further Owner/admin
  invitations are initiated by an already-authenticated Owner through a
  protected server route.

---

## 3. Intended flow (first Owner - bootstrap)

1. Project owner sets env in a **trusted local environment**: the Supabase
   service-role key (server-only) + the desired Owner email.
2. A **one-time, offline** script (not a deployed route) calls Supabase Admin
   auth.admin.inviteUserByEmail(email, { redirectTo }).
   - If the Auth user already exists, reuse it; otherwise the invitation is sent.
3. The invitee completes the Supabase Auth flow (sets a password / OAuth). Their
   identity now exists in auth.users with email_verified = true.
4. The trusted script inserts the **application profile** into public.users:
   - id = the Auth user UUID (auth.uid()),
   - role_id -> the owner role (from seeded roles.slug = owner),
   - branch_id = NULL (Owner is cross-branch by convention),
   - is_active = true.
   - Uses the service-role key (bypasses RLS) so the insert is authoritative.
5. **Audit:** an audit_logs row (action = owner.provisioned,
   entity_type = User, new_values redacted of secrets) is written by the
   same trusted process.

---

## 4. Intended flow (subsequent admin/staff invitations)

1. An authenticated **Owner** calls a protected server route
   (e.g. POST /api/admin/invite) with the invitee email + intended role.
2. The route **verifies the caller** is an active Owner/admin by reading their
   public.users row server-side (role from DB, not from the request). Reject
   otherwise (403). Rate-limit the endpoint.
3. Server sends the Supabase Auth invitation (service-role).
4. After the invitee authenticates + verifies email, the server creates their
   public.users profile with the **server-determined** role and branch. The
   requested role in the request body is *advisory*; the server may override or
   reject privileged escalations per policy.
5. Audit + transactional insert as in section 3.
