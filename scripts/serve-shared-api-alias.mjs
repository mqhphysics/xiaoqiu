import http from 'node:http'
import process from 'node:process'
import console from 'node:console'
import { URL } from 'node:url'

const target = new URL(process.argv[2] || 'http://127.0.0.1:3301')
if (target.protocol !== 'http:' || target.hostname !== '127.0.0.1' || target.port !== '3301')
  throw new Error('Alias only forwards to the shared loopback API on 3301.')
const server = http.createServer((request, response) => {
  const incoming = new URL(request.url, 'http://127.0.0.1')
  if (incoming.pathname !== '/api' && !incoming.pathname.startsWith('/api/')) {
    response.writeHead(404).end()
    return
  }
  const url = new URL(target)
  url.pathname = incoming.pathname
  url.search = incoming.search
  const upstream = http.request(
    url,
    { method: request.method, headers: { ...request.headers, host: target.host }, timeout: 20000 },
    (result) => {
      response.writeHead(result.statusCode ?? 502, result.headers)
      result.pipe(response)
    },
  )
  upstream.on('timeout', () => upstream.destroy())
  upstream.on('error', () => {
    if (!response.headersSent) response.writeHead(502, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ message: '共用后端暂不可用，请启动统一运行服务。' }))
  })
  request.on('aborted', () => upstream.destroy())
  request.pipe(upstream)
})
server.on('error', (error) => {
  console.error(
    error.code === 'EADDRINUSE' ? '3001已占用，不自动换端口。' : 'Shared API alias failed.',
  )
  process.exitCode = 1
})
server.listen(3001, '127.0.0.1', () => console.log('Local API 3001 forwards to shared API 3301.'))
process.on('SIGINT', () => server.close())
process.on('SIGTERM', () => server.close())
