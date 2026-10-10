import { LoginForm } from '@/components/auth/login-form'

/**
 * Staff sign-in page (public). Renders the client form which submits to the
 * server action in `src/app/login/actions.ts`.
 * `next` — where to go after sign-in (validated server-side).
 * `reason` — context from a bounce (e.g. `unprovisioned`).
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reason?: string }>
}) {
  const { next, reason } = await searchParams
  return <LoginForm next={next} reason={reason} />
}
