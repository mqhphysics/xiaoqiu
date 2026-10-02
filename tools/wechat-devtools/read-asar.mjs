/* global Buffer, console, process */
import fs from 'node:fs'
const archive = 'D:/software/WeChatDevTools/resources/app.asar'
const fd = fs.openSync(archive, 'r')
try {
  const prefix = Buffer.alloc(16)
  fs.readSync(fd, prefix, 0, 16, 0)
  const header = Buffer.alloc(prefix.readUInt32LE(12))
  fs.readSync(fd, header, 0, header.length, 16)
  const tree = JSON.parse(header.toString())
  const payloadOffset = 8 + prefix.readUInt32LE(4)
  for (const requestedPath of process.argv.slice(2)) {
    let entry = tree
    for (const part of requestedPath.split('/')) entry = entry.files?.[part]
    if (!entry) throw new Error(`Archive path is unavailable: ${requestedPath}`)
    console.log(`FILE: ${requestedPath}`)
    if (entry.files) console.log(Object.keys(entry.files).join('\n'))
    else if (entry.unpacked)
      console.log(fs.readFileSync(`${archive}.unpacked/${requestedPath}`, 'utf8'))
    else {
      const content = Buffer.alloc(entry.size)
      fs.readSync(fd, content, 0, content.length, payloadOffset + Number(entry.offset))
      console.log(content.toString())
    }
  }
} finally {
  fs.closeSync(fd)
}
