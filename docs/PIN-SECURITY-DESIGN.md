# PIN Security Design — Employee POS PIN

> **Status:** Design + helper implementation (`src/lib/security/pin.ts`) complete.
> **Not yet implemented:** the POS action endpoint that consumes these helpers,
> rate limiting, and lockout persistence. Those belong to a later phase.
> **Database migration:** NOT applied. See "Migration implications" below.

## 1. Purpose & boundary

- The employee PIN authorizes **individual POS actions** (e.g. void an item,
  apply a discount, confirm a payment) for an **already authenticated** staff
  member.
- The PIN **does NOT replace Supabase Auth**. Sign-in, sessions, and identity are
  owned exclusively by Supabase Auth. The PIN is an *action-level* second factor
  within the app, never a login credential.
- **Decision (approved):** `pinCode` is retained as a **future POS employee PIN**,
  stored and verified securely.

## 2. Storage: hash only, never plaintext

Schema change (local design only; migration NOT applied this phase):

| Before | After | Reason |
|---|---|---|
| `pinCode String? @map("pin_code") @db.VarChar(10)` | `pinHash String? @map("pin_hash") @db.VarChar(255)` | Store only a bcrypt hash; widen for future algorithm/pepper changes. |
| — | `pinUpdatedAt DateTime? @map("pin_updated_at")` | Supports rotation policy and audit (when was the PIN last changed). |

Rules enforced by design:
- **Never store a plaintext PIN** (asserted by the round-trip test: the stored
  value can never equal the input).
- The PIN is **not** a foreign key or identity; it is a per-user secret.

## 3. Hashing algorithm & parameters

- **bcrypt**, cost factor **12** (≈250–350 ms per hash on the CI host; see tests).
- **Per-PIN random salt** — generated and embedded by bcrypt automatically.
- **Optional server-side pepper** (`POS_PIN_PEPPER`, server-only env): the PIN is
  HMAC-SHA256'd with the pepper *before* bcrypt. The pepper is never stored in
  the database, so an attacker with only a dumped `pin_hash` still cannot
  brute-force offline without also compromising the server secret.

### Why bcrypt and a pepper?
A 4-digit PIN has only **10,000** possibilities. bcrypt slows each guess, and the
pepper removes the "dump the table and crack offline" attack. This does not make
a 4-digit PIN unguessable in isolation — that is mitigated by **rate limiting and
lockout** (§5), which is why a short PIN is only acceptable *with* those controls.

## 4. Verification — server only

- Verification runs **exclusively on the server** via `verifyPin()`.
- PINs must **never** be logged, sent to analytics, included in error messages,
  or returned in any API response (including hashes).
- `verifyPin` is constant-time (bcrypt internal compare) and returns `false`
  instead of throwing on a malformed/empty hash.
- Before a POS action, the server must re-derive the caller's identity from the
  Supabase Auth session (never from client-supplied user id) and confirm the
  user is active and branch-authorized (`src/lib/authz.ts`).

## 5. Rate limiting, lockout & escalating delay (required, not yet built)

Because the search space is tiny, the endpoint that verifies PINs **must**:

1. **Rate limit** per user id and per source IP (e.g. a small fixed number of
   attempts per window) using a shared store (e.g. Redis/Upstash or a DB table).
2. **Lockout** after N consecutive failures, with an **escalating** delay
   (exponential backoff) or a temporary account-PIN lock.
3. Record failures/lockouts in `audit_logs` (action e.g. `pos.pin.failure`) for
   detection — **without logging the PIN or the hash**.
4. Return a generic error ("invalid PIN") that does not reveal whether the user
   exists or whether the account is locked vs. the PIN is wrong.

> These controls are mandatory companions to a low-entropy PIN and are part of
> the later POS endpoint task, not this phase.

## 6. PIN reset / change & audit

- Setting or changing a PIN requires an **authenticated, authorized** session
  (self-service change) or an admin action.
- On change: write `pinHash` and bump `pinUpdatedAt`; write an `audit_logs`
  entry (`user.pin.set` / `user.pin.reset`) — never logging the PIN.
- A reset by a manager should invalidate the previous PIN (a new random salt
  guarantees the old hash no longer matches).
- **Rehash on next successful verify** is unnecessary with bcrypt cost 12, but if
  the cost or pepper ever changes, `verifyPin` should detect the old parameters
  and transparently rehash.

## 7. Distinction: POS PIN vs Supabase Auth credentials

| Aspect | Supabase Auth | Employee POS PIN |
|---|---|---|
| Purpose | Sign-in / session / identity | Authorize individual POS actions |
| Owner | Supabase (managed) | Application (`users.pin_hash`) |
| Storage | Supabase `auth.users` (hashed) | `users.pin_hash` (bcrypt) |
| Entropy | User-chosen, policy-enforced | Low (4–8 digits) → needs rate limiting |
| Bypasses RLS? | No (anon key + RLS) | N/A |
| Reset flow | Supabase invite/reset | App endpoint, audited |

## 8. Migration implications (future — NOT applied now)

Changing `pin_code` → `pin_hash` is a **schema change requiring a migration** in
a later, approved step:
- No data exists yet (no migrations have been run), so no backfill is required.
- When first deployed: `pin_hash` starts `NULL` for all users (no PIN set) until
  each employee sets one. The POS endpoint must treat "no PIN set" according to
  policy (e.g. block PIN-gated actions until a PIN is configured).
- If any legacy `pin_code` plaintext values ever existed, they must be
  **invalidated** (never carried over); users would set a new PIN.

## 9. Library choice

- Uses the **already-installed `bcryptjs`** (pure-JS, no native build). No new
  dependency was added. `@types/bcryptjs` already present.
- `bcryptjs` is acceptable here; a native `bcrypt` would be faster but requires
  a toolchain not guaranteed on the shared-hosting target. Not switching now.
