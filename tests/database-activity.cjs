// Read-only diagnostic for database stalls. It deliberately omits SQL text,
// credentials, and record values.
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

;(async () => {
  const activity = await prisma.$queryRawUnsafe(`SELECT state, wait_event_type, wait_event, backend_type FROM pg_stat_activity WHERE datname = current_database() AND backend_type = 'client backend' ORDER BY state, wait_event_type NULLS FIRST`)
  console.log(JSON.stringify({ activity }))
})()
  .catch((error) => {
    console.error(`Read-only database activity query failed: ${error.code || error.name}`)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
