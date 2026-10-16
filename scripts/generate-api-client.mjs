import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const input = process.argv[2] || 'http://127.0.0.1:3001/api/openapi.json'
const source = /^https?:\/\//.test(input)
  ? await (await fetch(input, { signal: AbortSignal.timeout(10000) })).text()
  : await readFile(resolve(input), 'utf8')
const document = JSON.parse(source)
if (!document.openapi || !document.paths) throw new Error('API did not return an OpenAPI document')
const snapshot = resolve(repository, 'docs/api/openapi.json')
await mkdir(dirname(snapshot), { recursive: true })
await writeFile(snapshot, JSON.stringify(document, null, 2) + '\n')
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const arguments_ = [
  'exec',
  '--yes',
  '--package=openapi-typescript-codegen@0.29.0',
  '--',
  'openapi',
  '--input',
  snapshot,
  '--output',
  resolve(repository, 'packages/api-client/src/generated'),
  '--client',
  'fetch',
  '--useUnionTypes',
]
const child =
  process.platform === 'win32'
    ? spawnSync(
        process.execPath,
        [resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'), ...arguments_],
        { cwd: repository, stdio: 'inherit', windowsHide: true },
      )
    : spawnSync(npm, arguments_, { cwd: repository, stdio: 'inherit' })
if (child.status !== 0) process.exit(child.status ?? 1)
