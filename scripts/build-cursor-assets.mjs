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
const light = '#b3c8ba',
  dark = '#173f35'
const colorAt = (index, phase) => ((index - phase + 6) % 6 < 3 ? light : dark)
const mix = (first, second, amount) =>
  '#' +
  [1, 3, 5]
    .map((offset) =>
      Math.round(
        parseInt(first.slice(offset, offset + 2), 16) * (1 - amount) +
          parseInt(second.slice(offset, offset + 2), 16) * amount,
      )
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
// Six segment contours and the upper-right accent stay fixed. Only their fills chase clockwise.
function segments(phase = 0, animated = false) {
  return Array.from({ length: 6 }, (_, index) => {
    const start = -117 + index * 60,
      end = start + 54
    const path = `M${point(10.8, start + 3)} A10.8 10.8 0 0 1 ${point(10.8, end - 3)} Q${point(10.8, end)} ${point(10.1, end)} L${point(7, end)} Q${point(6.3, end)} ${point(6.3, end - 5)} A6.3 6.3 0 0 0 ${point(6.3, start + 5)} Q${point(6.3, start)} ${point(7, start)} L${point(10.1, start)} Q${point(10.8, start)} ${point(10.8, start + 3)}Z`
    const step = Math.floor(phase) % 6
    const color = mix(colorAt(index, step), colorAt(index, (step + 1) % 6), phase % 1)
    const animation = animated
      ? `<animate attributeName="fill" values="${Array.from({ length: 7 }, (_, step) => colorAt(index, step % 6)).join(';')}" dur="1.2s" repeatCount="indefinite"/>`
      : ''
    return `<path data-segment="${index}" d="${path}" fill="${color}" stroke="#fcfdf8" stroke-width=".55">${animation}</path>`
  }).join('')
}
const accent = `<path data-accent="" data-start-angle="-84" d="M${point(13.5, -84)} A13.5 13.5 0 0 1 ${point(13.5, -28)}" fill="none" stroke="#ce7e6b" stroke-width="2.6" stroke-linecap="round"/>`
const ringAt = (phase = 0, animated = false) =>
  `<g data-loading-segments="">${segments(phase, animated)}</g>${accent}`
const svg = (content, size = 32) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">${content}</svg>\n`
await writeFile(resolve(directory, 'loading-ring.svg'), svg(ringAt()))
await writeFile(resolve(directory, 'loading-ring-animated.svg'), svg(ringAt(0, true)))
await writeFile(resolve(directory, 'busy-32.svg'), svg(ringAt()))
// Only use the edited image inside the hollow region; composite the actual original
// pixels on top so its green contour and curved coral fold are never substituted.
const crop = { left: 402, top: 274, width: 492, height: 728 }
const croppedArrow = await sharp(resolve(directory, 'default-interior-fill-source.png'))
  .extract(crop)
  .png()
  .toBuffer()
const originalArrow = await sharp(
  resolve('参考图片/04-登录页定稿与光标-2026-10-01/04-default-cursor-transparent-source.png'),
)
  .extract(crop)
  .png()
  .toBuffer()
const imageLayer = (buffer, clip = '') =>
  `<image x="1" y="1" width="${round((492 * 30) / 728)}" height="30" ${clip} href="data:image/png;base64,${buffer.toString('base64')}"/>`
await writeFile(
  resolve(directory, 'default-32.svg'),
  svg(
    `<defs><clipPath id="xq-arrow-interior"><path transform="translate(1 1) scale(${30 / 728})" d="M58 82 410 424 237 430Q216 430 206 447L58 571Z"/></clipPath></defs>${imageLayer(croppedArrow, 'clip-path="url(#xq-arrow-interior)"')}${imageLayer(originalArrow)}`,
  ),
)
const arrow = await readFile(resolve(directory, 'default-32.svg'), 'utf8')
const arrowPaths = arrow.replace(/<svg[^>]*>|<\/svg>/g, '')
await writeFile(
  resolve(directory, 'progress-32.svg'),
  svg(
    `<g transform="scale(.75)">${arrowPaths}</g><g transform="translate(12 12) scale(.6)">${ringAt()}</g>`,
  ),
)
for (const name of await readdir(directory)) {
  if (
    ![
      'default-32.svg',
      'busy-32.svg',
      'progress-32.svg',
      'hand-32.svg',
      'grab-32.svg',
      'grabbing-32.svg',
    ].includes(name)
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
    const source = Buffer.from(svg(ringAt(index / 4)))
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
  const focus = []
  for (const [index, name] of ['default', 'grab', 'grabbing'].entries()) {
    focus.push({
      input: await sharp(resolve(directory, `${name}-32.svg`), { density: 288 })
        .resize(96, 96)
        .png()
        .toBuffer(),
      left: 42 + index * 180,
      top: 16,
    })
    focus.push({
      input: await readFile(resolve(directory, `${name}-32.png`)),
      left: 74 + index * 180,
      top: 135,
    })
    focus.push({
      input: Buffer.from(
        `<svg width="180" height="24"><text x="90" y="17" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#173f35">${name}</text></svg>`,
      ),
      left: index * 180,
      top: 178,
    })
  }
  await sharp({ create: { width: 540, height: 216, channels: 4, background: '#f7f7f0' } })
    .composite(focus)
    .png()
    .toFile(resolve(review, 'cursor-focus.png'))
}
