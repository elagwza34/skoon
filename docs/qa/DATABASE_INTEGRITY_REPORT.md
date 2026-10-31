# Database integrity report

Date: 2026-10-28

## Production read-only results

- Unmatched Auth identities: 4.
- Unmatched documented seed-test identities: 1.
- `public.users` rows whose Auth identity is absent: 0.
- Active application users: 2.
- All four unmatched identities are email-confirmed; none are pending invitation or currently banned.
- There are zero branch rows (and therefore zero active branches).
- There are zero `employee_profiles` rows and no provisioning audit records.

## Incident conclusion

The login error is expected for each unmatched Auth identity: authentication succeeds, then the application correctly denies access because no `public.users` row has the same UUID. The origin of the four identities cannot be established from the available audit records. They were created in the last 30 days and did not complete the current audited provisioning transaction.

The absence of every branch is a separate production-data prerequisite: the current safe provisioning path requires an active branch before it can create a Manager, Cashier, Waiter, or Kitchen employee. It cannot repair or create an operational employee until an approved branch exists.

## Integrity controls inspected

- Application user primary key is the Supabase Auth UUID.
- Application email is unique.
- `employee_profiles.user_id` is unique and foreign-keyed to `users`.
- Staff provisioning creates the user, profile, and audit log in one Prisma transaction.
- On transaction failure, a newly created Auth identity is deleted only when no application user row survived; adopted identities are never deleted.

No SQL writes, migrations, resets, or data repair actions were performed.
