/*
 * Guard every staging migration/test invocation. It validates URL shape and
 * explicit human acknowledgement without logging credentials, paths, tokens,
 * or host names. It cannot prove a Supabase project is non-production on its
 * own; the separate project ref is an intentional operator-supplied binding.
 */
const required = ['DATABASE_URL', 'DIRECT_URL', 'SKOON_STAGING_DATABASE_URL', 'SKOON_STAGING_PROJECT_REF']
const missing = required.filter((key) => !process.env[key]?.trim())
if (missing.length) throw new Error(`Staging guard: missing ${missing.join(', ')}`)
const templateValues = required.filter((key) => /(?:same-value-as-database-url|your-separate-staging-project-ref|<[^>]+>)/i.test(process.env[key]))
if (templateValues.length) {
  throw new Error(`Staging guard: replace template placeholders in ${templateValues.join(', ')} with values from a separate staging project`)
}
if (process.env.SKOON_STAGING_ACKNOWLEDGEMENT !== 'isolated-staging-only') {
  throw new Error('Staging guard: set SKOON_STAGING_ACKNOWLEDGEMENT=isolated-staging-only after verifying the separate project')
}
if (process.env.DATABASE_URL !== process.env.SKOON_STAGING_DATABASE_URL) {
  throw new Error('Staging guard: DATABASE_URL must exactly equal SKOON_STAGING_DATABASE_URL')
}
const localDevelopment = process.env.SKOON_LOCAL_DEVELOPMENT_DATABASE === 'localhost-only'
const projectRef = process.env.SKOON_STAGING_PROJECT_REF.trim().toLowerCase()
if (!/^[a-z0-9-]{8,}$/i.test(projectRef) || /production|prod/i.test(projectRef)) {
  throw new Error('Staging guard: project ref must be a separate non-production Supabase project ref')
}
for (const key of ['DATABASE_URL', 'DIRECT_URL']) {
  let url
  try { url = new URL(process.env[key]) } catch { throw new Error(`Staging guard: ${key} is not a valid PostgreSQL URL`) }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error(`Staging guard: ${key} must use PostgreSQL`)
  if (!url.username || !url.hostname || !url.pathname || url.pathname === '/') throw new Error(`Staging guard: ${key} is incomplete`)
  if (localDevelopment) {
    const host = url.hostname.toLowerCase()
    if (host !== 'localhost' && host !== '127.0.0.1' && host !== '::1') {
      throw new Error(`Staging guard: ${key} must be localhost-only for local development`)
    }
    if (decodeURIComponent(url.pathname) !== '/skoon_variants_dev') {
      throw new Error(`Staging guard: ${key} must target the dedicated local skoon_variants_dev database`)
    }
    continue
  }
  const username = decodeURIComponent(url.username).toLowerCase()
  if (key === 'DIRECT_URL' && url.hostname.toLowerCase() !== `db.${projectRef}.supabase.co`) {
    throw new Error('Staging guard: DIRECT_URL host does not match the declared staging project')
  }
  if (key === 'DATABASE_URL' && !username.endsWith(`.${projectRef}`) && url.hostname.toLowerCase() !== `db.${projectRef}.supabase.co`) {
    throw new Error('Staging guard: DATABASE_URL does not identify the declared staging project')
  }
}
console.log(localDevelopment
  ? 'Staging guard passed: dedicated localhost-only development target explicitly acknowledged; credentials remain hidden.'
  : 'Staging guard passed: isolated target explicitly acknowledged; credentials remain hidden.')
