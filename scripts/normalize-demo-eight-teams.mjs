import console from 'node:console'
import process from 'node:process'

// Preserve the old entrypoint so historical instructions fail before accessing any database.
console.error(
  'Eight-team normalization is retired: the 2026 competition has 16 entrants and 8 knockout qualifiers. Existing data needs a separately reviewed restoration; this command makes no changes.',
)
process.exitCode = 1
