import { PrismaClient } from '../generated/prisma/client'
import {
  DEMO_PASSWORD,
  DEMO_PLAYERS,
  DEMO_TOURNAMENT_TEAMS,
  DEMO_MATCHES,
  DEMO_ACCOUNTS,
} from './demo-fixture'
import { seedDemoFixture } from './seed-demo-fixture'
import { installDemoUserBackgrounds } from './install-demo-user-backgrounds'
import { installDemoGoalGifs } from './install-demo-goal-gifs'

const prisma = new PrismaClient()

seedDemoFixture(prisma)
  .then(() => installDemoUserBackgrounds(prisma))
  .then(() => installDemoGoalGifs(prisma))
  .then(() => {
    console.log(
      `Demo fixture ready: ${DEMO_TOURNAMENT_TEAMS.length} tournament teams, ${DEMO_PLAYERS.length} retained demo profiles, ${DEMO_MATCHES.length} matches across both seasons, ${DEMO_ACCOUNTS.length} accounts.`,
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
