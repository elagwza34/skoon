/*
 * Loads only the local, ignored .env.staging file for an explicitly requested
 * command.  It never falls back to .env, so a normal development or production
 * connection cannot accidentally become a staging migration/test target.
 */
const { existsSync, readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { spawnSync } = require('node:child_process')

const envPath = resolve(process.cwd(), '.env.staging')
if (!existsSync(envPath)) {
  throw new Error('Missing .env.staging. Copy .env.staging.example and configure a separate Supabase staging project.')
}

for (const rawLine of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const line = rawLine.trim()
  if (!line || line.startsWith('#')) continue
  const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
  if (!match) throw new Error('Invalid .env.staging entry')
  const [, key, rawValue] = match
  const value = rawValue.replace(/^(["'])(.*)\1$/, '$2')
  // The staging file is authoritative for database-related keys. Do not retain
  // a parent-shell DATABASE_URL when a staging value is missing or different.
  process.env[key] = value
}

const argv = process.argv.slice(2)
const guard = argv[0] === '--guard'
if (guard) {
  require('./validate-staging-env.cjs')
  argv.shift()
}
const [command, ...args] = argv
if (!command) throw new Error('A command is required')
const result = spawnSync(command, args, { stdio: 'inherit', env: process.env, shell: false })
if (result.error) throw result.error
process.exit(result.status ?? 1)
