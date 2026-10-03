import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { URL, fileURLToPath } from 'node:url'
import test from 'node:test'

const sourceRoot = fileURLToPath(new URL('../src/', import.meta.url))

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = resolve(directory, entry.name)
      return entry.isDirectory() ? filesIn(path) : [path]
    }),
  )
  return nested.flat()
}

test('H5 fallback imports cannot resolve back to their platform entry', async () => {
  const entries = (await filesIn(sourceRoot)).filter((path) => /\.h5\.tsx?$/.test(path))
  assert.ok(entries.length > 0, 'the check must cover the H5 entries')
  const unsafe = []
  for (const entry of entries) {
    const counterpart = entry.replace(/\.h5(?=\.tsx?$)/, '')
    const source = await readFile(entry, 'utf8')
    const imports = source.matchAll(/(?:from\s*|import\s*\(\s*)['"]([^'"]+)['"]/g)
    for (const match of imports) {
      if (match[1].startsWith('.') && resolve(dirname(entry), match[1]) === counterpart)
        unsafe.push(`${entry}: ${match[1]}`)
    }
  }
  assert.deepEqual(
    unsafe,
    [],
    'H5 fallbacks must use a distinct module to avoid platform resolver cycles',
  )
})
