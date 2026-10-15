// Rebuild code-native cursor PNGs and an optional review sheet / 24-frame loading cycle.
import { createRequire } from 'node:module'
import { Buffer } from 'node:buffer'
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'

const require = createRequire(resolve('apps/api/package.json'))
const sharp = require('sharp')
const directory = resolve('apps/mini-program/src/assets/login-art/cursors')
const round = (value) => Number(value.toFixed(3))
const point = (radius, degrees) => {
  const angle = (degrees * Math.PI) / 180
  return [round(16 + radius * Math.cos(angle)), round(16 + radius * Math.sin(angle))].join(' ')
}
// Light segment centres: -90, -30, 30. Dark centres: 90, 150, 210.
// Their shared radial boundary is -120 degrees; the orange arc starts on that radius.
const segments = Array.from({ length: 6 }, (_, index) => {
  const start = -117 + index * 60,
    end = start + 54
  const path = `M${point(10.8, start + 3)} A10.8 10.8 0 0 1 ${point(10.8, end - 3)} Q${point(10.8, end)} ${point(10.1, end)} L${point(7, end)} Q${point(6.3, end)} ${point(6.3, end - 5)} A6.3 6.3 0 0 0 ${point(6.3, start + 5)} Q${point(6.3, start)} ${point(7, start)} L${point(10.1, start)} Q${point(10.8, start)} ${point(10.8, start + 3)}Z`
  return `<path d="${path}" fill="${index < 3 ? '#b3c8ba' : '#173f35'}" stroke="#fcfdf8" stroke-width=".55"/>`
}).join('')
const rotor = `<g data-loading-rotor="">${segments}<path data-accent="" data-start-angle="-120" d="M${point(13.5, -120)} A13.5 13.5 0 0 1 ${point(13.5, -60)}" fill="none" stroke="#ce7e6b" stroke-width="2.6" stroke-linecap="round"/></g>`
const svg = (content, size = 32) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">${content}</svg>\n`
await writeFile(resolve(directory, 'loading-ring.svg'), svg(rotor))
await writeFile(resolve(directory, 'busy-32.svg'), svg(rotor))
const arrow = await readFile(resolve(directory, 'default-32.svg'), 'utf8')
const arrowPaths = arrow.replace(/<svg[^>]*>|<\/svg>/g, '')
await writeFile(
  resolve(directory, 'progress-32.svg'),
  svg(
    `<g transform="scale(.75)">${arrowPaths}</g><g transform="translate(12 12) scale(.6)">${rotor}</g>`,
  ),
)
for (const name of await readdir(directory)) {
  if (
    !['busy-32.svg', 'progress-32.svg', 'hand-32.svg', 'grab-32.svg', 'grabbing-32.svg'].includes(
      name,
    )
  )
    continue
  const source = await readFile(resolve(directory, name))
  const width = Number(name.match(/-(\d+)\.svg$/)[1])
  for (const scale of [1, 2]) {
    const png = await sharp(source, { density: 288 })
      .resize(width * scale, width * scale)
      .png()
      .toBuffer()
    await writeFile(resolve(directory, name.replace('.svg', scale === 1 ? '.png' : '@2x.png')), png)
  }
}
const review = process.argv[2]
if (review) {
  await mkdir(resolve(review, 'loading-frames'), { recursive: true })
  const frames = []
  for (let index = 0; index < 24; index++) {
    const source = Buffer.from(svg(`<g transform="rotate(${index * 15} 16 16)">${rotor}</g>`))
    const frame = await sharp(source, { density: 288 }).resize(128, 128).png().toBuffer()
    await writeFile(
      resolve(review, 'loading-frames', `${String(index).padStart(2, '0')}.png`),
      frame,
    )
    frames.push(frame)
  }
  const pixels = await sharp({
    create: { width: 128, height: 128 * frames.length, channels: 4, background: '#00000000' },
  })
    .composite(frames.map((input, index) => ({ input, top: index * 128, left: 0 })))
    .raw()
    .toBuffer()
  await sharp(pixels, {
    raw: { width: 128, height: 128 * frames.length, channels: 4, pageHeight: 128 },
  })
    .gif({ loop: 0, delay: 50 })
    .toFile(resolve(review, 'loading-cycle.gif'))
  await sharp({ create: { width: 768, height: 512, channels: 4, background: '#f7f7f0' } })
    .composite(
      frames.map((input, index) => ({
        input,
        left: (index % 6) * 128,
        top: Math.floor(index / 6) * 128,
      })),
    )
    .png()
    .toFile(resolve(review, 'loading-filmstrip.png'))
  const names = (await readdir(directory)).filter((name) => /-\d+@2x\.png$/.test(name)).sort()
  const tiles = await Promise.all(
    names.map(async (name) => ({
      input: await sharp(resolve(directory, name)).resize(64, 64).png().toBuffer(),
      left: 20 + (names.indexOf(name) % 6) * 140,
      top: 24 + Math.floor(names.indexOf(name) / 6) * 118,
    })),
  )
  await sharp({ create: { width: 840, height: 354, channels: 4, background: '#f7f7f0' } })
    .composite([
      ...tiles,
      ...names.map((name, index) => ({
        input: Buffer.from(
          `<svg width="140" height="24"><text x="12" y="16" font-family="sans-serif" font-size="12" fill="#173f35">${name.replace(/-\d+@2x.png/, '')}</text></svg>`,
        ),
        left: (index % 6) * 140,
        top: 92 + Math.floor(index / 6) * 118,
      })),
    ])
    .png()
    .toFile(resolve(review, 'cursor-sheet.png'))
}
