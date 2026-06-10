import { copyFile, mkdir, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'

const destination = process.argv[2]

if (destination === undefined) {
  throw new Error('Usage: node scripts/copy-prisma-engine.mjs <destination>')
}

const sourceDirectory = resolve('src/generated/prisma')
const destinationDirectory = resolve(destination)
const entries = await readdir(sourceDirectory)
const engineFiles = entries.filter((entry) => /^(?:lib)?query_engine-.+\.node$/.test(entry))

if (engineFiles.length !== 1) {
  throw new Error(`Expected one Prisma query engine, found ${engineFiles.length}`)
}

await mkdir(destinationDirectory, { recursive: true })
await copyFile(
  resolve(sourceDirectory, engineFiles[0]),
  resolve(destinationDirectory, engineFiles[0]),
)
