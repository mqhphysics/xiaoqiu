import http from 'node:http'
import { createReadStream, existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { extname, resolve, sep } from 'node:path'
import process from 'node:process'
import console from 'node:console'
import { URL } from 'node:url'

const options = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, value, index, args) => {
    if (value.startsWith('--')) pairs.push([value.slice(2), args[index + 1]])
    return pairs
  }, []),
)
if (!options.root || !options.port || !options.api || !options.label) {
  throw new Error(
    'Usage: --root <built directory> --port <preview port> --api <loopback API URL> --label <name>',
  )
}
const root = realpathSync(resolve(options.root))
const port = Number(options.port)
const api = new URL(options.api)
if (
  !Number.isInteger(port) ||
  port < 1024 ||
  port > 65535 ||
  port === 3000 ||
  api.protocol !== 'http:' ||
  !['127.0.0.1', 'localhost', '[::1]'].includes(api.hostname) ||
  api.username ||
  api.password ||
  api.pathname !== '/' ||
  api.search ||
  api.hash
) {
  throw new Error('Preview requires a separate fixed port and a loopback API.')
}
if (!existsSync(resolve(root, 'index.html'))) throw new Error('Build index.html is missing.')
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
}
const label = options.label.replace(
  /[&<>"']/g,
  (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
)
const server = http.createServer((request, response) => {
  let pathname
  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname)
  } catch {
    response.writeHead(400).end()
    return
  }
  if (pathname === '/api' || pathname.startsWith('/api/')) {
    const headers = { ...request.headers, host: api.host }
    delete headers.origin
    const incoming = new URL(request.url, 'http://127.0.0.1')
    const target = new URL(api)
    target.pathname = incoming.pathname
    target.search = incoming.search
    const upstream = http.request(
      target,
      {
        method: request.method,
        headers,
        timeout: 20000,
      },
      (result) => {
        response.writeHead(result.statusCode ?? 502, result.headers)
        result.pipe(response)
      },
    )
    upstream.on('timeout', () => upstream.destroy())
    upstream.on('error', () => {
      if (!response.headersSent) response.writeHead(502, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ message: '预览API暂不可用，请检查该分支的数据服务。' }))
    })
    request.on('aborted', () => upstream.destroy())
    request.pipe(upstream)
    return
  }
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405).end()
    return
  }
  let file = resolve(root, '.' + pathname)
  if (file !== root && !file.startsWith(root + sep)) {
    response.writeHead(403).end()
    return
  }
  if (!existsSync(file) || statSync(file).isDirectory()) file = resolve(root, 'index.html')
  file = realpathSync(file)
  if (!file.startsWith(root + sep)) {
    response.writeHead(403).end()
    return
  }
  const extension = extname(file)
  response.writeHead(200, {
    'content-type': types[extension] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  })
  if (request.method === 'HEAD') {
    response.end()
    return
  }
  if (extension === '.html') {
    const previewTitle = JSON.stringify('分支验收 · ' + options.label).replace(/</g, '\\u003c')
    let body = readFileSync(file, 'utf8').replace(
      /<title>[^<]*<\/title>/,
      `<title>分支验收 · ${label}</title>`,
    )
    body = body.replace(
      '</head>',
      `<script>(()=>{const desired=${previewTitle};const apply=()=>{if(document.title!==desired)document.title=desired;};apply();new MutationObserver(apply).observe(document.querySelector('title'),{childList:true,subtree:true,characterData:true});})();</script></head>`,
    )
    body = body.replace(
      '</body>',
      `<aside style="position:fixed;bottom:8px;right:8px;z-index:2147483647;padding:5px 10px;border-radius:6px;background:#173e2f;color:white;font:12px sans-serif;pointer-events:none">分支验收 · ${label} · ${port}</aside></body>`,
    )
    response.end(body)
  } else
    createReadStream(file)
      .on('error', () => response.destroy())
      .pipe(response)
})
server.on('error', (error) => {
  console.error(
    error.code === 'EADDRINUSE' ? `预览端口${port}已被占用，不自动换端口。` : '预览启动失败。',
  )
  process.exitCode = 1
})
server.listen(port, '127.0.0.1', () =>
  console.log(JSON.stringify({ label: options.label, port, pid: process.pid })),
)
process.on('SIGINT', () => server.close())
process.on('SIGTERM', () => server.close())
