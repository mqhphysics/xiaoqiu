import fs from 'node:fs/promises'
import path from 'node:path'

const targets = await (await fetch('http://127.0.0.1:12690/json/list')).json()
const target = targets.find((item) => item.type === 'page' && item.url.includes(process.argv[2] ?? 'entrance'))
if (!target) throw new Error('Requested IDE window is not available')
const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})
let nextId = 0
const pending = new Map()
socket.addEventListener('message', ({ data }) => {
  const response = JSON.parse(data)
  if (!response.id) return
  const operation = pending.get(response.id)
  if (!operation) return
  pending.delete(response.id)
  response.error ? operation.reject(response.error) : operation.resolve(response.result)
})
function send(method, params = {}) {
  const id = ++nextId
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    socket.send(JSON.stringify({ id, method, params }))
  })
}
try {
  const expression = process.argv[3] ?? `JSON.stringify({text:document.body.innerText,controls:[...document.querySelectorAll('button,input,a,[role="button"]')].map(el=>({tag:el.tagName,text:el.innerText,value:el.value,placeholder:el.placeholder}))})`
  const result = await send('Runtime.evaluate', { expression, returnByValue: true })
  if (result.exceptionDetails) console.log(JSON.stringify(result.exceptionDetails))
  else console.log(result.result.value ?? result.result.description)
  if (process.argv[4]) {
    const outputPath = path.resolve(process.argv[4])
    await fs.mkdir(path.dirname(outputPath), { recursive: true })
    const screenshot = await send('Page.captureScreenshot', { format: 'png' })
    await fs.writeFile(outputPath, Buffer.from(screenshot.data, 'base64'))
    console.log(`Screenshot: ${outputPath}`)
  }
} finally {
  socket.close()
}
