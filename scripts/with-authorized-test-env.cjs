/*
 * Explicit development-test binding. Unlike the staging runner, this loader
 * permits only the project the operator approved for disposable Skoon data.
 * It never falls back to another URL and never prints credentials.
 */
const { existsSync, readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { spawnSync } = require('node:child_process')
const envPath = resolve(process.cwd(), '.env')
if (!existsSync(envPath)) throw new Error('Authorized test environment: missing .env')
for (const raw of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const line = raw.trim(); if (!line || line.startsWith('#')) continue
  const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/); if (!match) continue
  process.env[match[1]] = match[2].replace(/^(["'])(.*)\1$/, '$2')
}
const ref = 'bkgxjutnfkslpgshufhb'
for (const key of ['DATABASE_URL', 'DIRECT_URL']) {
  if (!process.env[key]) throw new Error(`Authorized test environment: missing ${key}`)
  let url; try { url = new URL(process.env[key]) } catch { throw new Error(`Authorized test environment: invalid ${key}`) }
  const identity = `${url.hostname}|${decodeURIComponent(url.username)}`.toLowerCase()
  if (!identity.includes(ref)) throw new Error(`Authorized test environment: ${key} is not the approved project`)
}
process.env.SKOON_TEST_DATABASE_PROJECT_REF = ref
process.env.SKOON_TEST_DATABASE_AUTHORIZED = 'test-data-only'
const [cmd, ...args] = process.argv.slice(2); if (!cmd) throw new Error('A command is required')
const result = spawnSync(cmd, args, { stdio: 'inherit', env: process.env, shell: false }); if (result.error) throw result.error
process.exit(result.status ?? 1)
