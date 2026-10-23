# Isolated Supabase staging database

This repository does not currently have a safe staging target configured. Do
not point these steps at the existing production-like Supabase project.

1. Create a separate Supabase project for staging; do not clone production
   customer, employee, or payment data into it.
2. Copy `.env.staging.example` to ignored `.env.staging` and replace only its
   placeholders with that project's values.
3. Run `npm run staging:check`. Staging commands load only `.env.staging` and
   never fall back to `.env` or inherited database variables.
4. `staging:status`, `staging:migrate`, `test:inventory`,
   `test:financial`, and `test:cashier-acceptance` each run the guard before
   Prisma or a fixture can connect. Review `npm run staging:status` before
   running `npm run staging:migrate`; apply only after approval of the
   migration SQL and a staging backup/snapshot.
5. Run `npx prisma generate`, `npm run test:financial`,
   `npm run test:cashier-acceptance`, and `npm run test:inventory` with the
   same explicitly acknowledged staging environment.

The guard verifies acknowledgement, PostgreSQL URL shape, and that the runtime
URL equals the declared staging URL. It also requires the direct database host
to be `db.<staging-project-ref>.supabase.co` and the pooled connection username
to identify that same project. This prevents a direct migration connection from
resolving to a different Supabase project. Operator review of the selected
project remains mandatory.
