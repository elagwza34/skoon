/**
 * Environment variable validation — PUBLIC (browser-safe) values only.
 *
 * Only NEXT_PUBLIC_* variables belong here. They are inlined into the client
 * bundle at build time and are therefore safe to expose. Server-only secrets
 * live in `env.server.ts` and must NEVER be imported from client code.
 */
import { z } from 'zod'

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string({ required_error: 'NEXT_PUBLIC_SUPABASE_URL is required' })
    .url('NEXT_PUBLIC_SUPABASE_URL must be a valid URL'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string({ required_error: 'NEXT_PUBLIC_SUPABASE_ANON_KEY is required' })
    .min(1, 'NEXT_PUBLIC_SUPABASE_ANON_KEY is required'),
})

export type PublicEnv = z.infer<typeof publicEnvSchema>

/**
 * Validate and return the public Supabase configuration.
 * Throws a descriptive, secret-free error listing missing/invalid variables.
 * Reads lazily so it is safe to import on both server and client.
 */
export function getPublicEnv(): PublicEnv {
  const parsed = publicEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  })
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
    throw new Error(`Invalid public environment configuration:\n- ${issues.join('\n- ')}`)
  }
  return parsed.data
}
