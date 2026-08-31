import { PrismaClient } from '../generated/prisma/client'
import { DEMO_PASSWORD, DEMO_PLAYERS, DEMO_TEAMS, DEMO_MATCHES, DEMO_ACCOUNTS } from './demo-fixture'
import { seedDemoFixture } from './seed-demo-fixture'

const prisma = new PrismaClient()

seedDemoFixture(prisma)
  .then(() => {
    console.log(
      `Demo fixture ready: ${DEMO_TEAMS.length} teams, ${DEMO_PLAYERS.length} players, ${DEMO_MATCHES.length} matches, ${DEMO_ACCOUNTS.length} accounts.`,
    )
    console.log(`Demo password for all accounts: ${DEMO_PASSWORD}`)
  })
  .catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
