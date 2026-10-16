// Generates every app icon from one vector drawing: the metronome's twin, a tuning fork on the
// same navy tile, its tines white (the vibrating part, as the metronome's pendulum is), its stem
// grey like the metronome's body, yellow sound waves on both sides. Run with `npm run icons`.
//
// - assets/icon.svg: the drawing itself (rounded tile on transparency).
// - pwa-*.png ("any" purpose): the rounded tile with a small margin.
// - maskable-icon-512x512.png: full-bleed square, the fork scaled into the 40% safe circle.
// - apple-touch-icon-180x180.png: full-bleed square (iOS rounds the corners itself).
// - favicon.ico: 16, 32 and 48 px PNGs in one ICO container.

import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = fileURLToPath(new URL('..', import.meta.url))
const OUT = `${root}public/`

// Colours sampled from the metronome's icon (assets/icon-source.png in sychen6192/metronome).
const TILE_LIGHT = '#263252'
const TILE_DARK = '#0b1320'
const GREY_LIGHT = '#8a93b2'
const GREY_DARK = '#4f5873'
const WHITE = '#eceff6'
const WHITE_SHADE = '#c8cedd'
const YELLOW = '#fccf3f'

const defs = `
  <defs>
    <linearGradient id="tile" x1="1" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${TILE_LIGHT}"/>
      <stop offset="1" stop-color="${TILE_DARK}"/>
    </linearGradient>
    <linearGradient id="tine" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${WHITE}"/>
      <stop offset="0.55" stop-color="${WHITE}"/>
      <stop offset="1" stop-color="${WHITE_SHADE}"/>
    </linearGradient>
    <linearGradient id="stem" gradientUnits="userSpaceOnUse" x1="0" y1="600" x2="0" y2="900">
      <stop offset="0" stop-color="${GREY_LIGHT}"/>
      <stop offset="1" stop-color="${GREY_DARK}"/>
    </linearGradient>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="14"/>
      <feOffset dy="12" result="blur"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.45"/></feComponentTransfer>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>`

/** The fork and its waves in a 1024 box, centred on (512, 512). */
const artwork = `
  <g fill="none" stroke-linecap="round">
    <g stroke="${YELLOW}" stroke-width="30">
      <path d="M300 282 A150 150 0 0 0 300 486"/>
      <path d="M234 226 A230 230 0 0 0 234 542"/>
      <path d="M724 282 A150 150 0 0 1 724 486"/>
      <path d="M790 226 A230 230 0 0 1 790 542"/>
    </g>
    <g filter="url(#shadow)">
      <path d="M512 600 V812" stroke="url(#stem)" stroke-width="70"/>
      <circle cx="512" cy="846" r="52" fill="url(#stem)" stroke="none"/>
      <path d="M410 186 V500 A102 102 0 0 0 614 500 V186" stroke="url(#tine)" stroke-width="66"/>
    </g>
  </g>`

/** The tile's continuous-curvature corners, as the metronome's: a superellipse |x|⁵ + |y|⁵ = 1. */
function squircle(cx, cy, radius) {
  const points = []
  for (let i = 0; i < 360; i++) {
    const t = (i / 360) * 2 * Math.PI
    const c = Math.cos(t)
    const s = Math.sin(t)
    const x = cx + radius * Math.sign(c) * Math.abs(c) ** 0.4
    const y = cy + radius * Math.sign(s) * Math.abs(s) ** 0.4
    points.push(`${x.toFixed(1)} ${y.toFixed(1)}`)
  }
  return `M${points.join(' L')} Z`
}

/** Rounded tile (the "any" icon) on transparency; `margin` is the share of the canvas left clear. */
function roundedSvg(margin = 0.04) {
  const inset = 1024 * margin
  const size = 1024 - 2 * inset
  const scale = size / 1024
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${defs}
  <path d="${squircle(512, 512, size / 2)}" fill="url(#tile)"/>
  <g transform="translate(${inset} ${inset}) scale(${scale})">${artwork}</g>
</svg>`
}

/** Full-bleed square; the artwork drawn at `scale` around the centre. */
function fullBleedSvg(scale) {
  const offset = 512 - 512 * scale
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${defs}
  <rect width="1024" height="1024" fill="url(#tile)"/>
  <g transform="translate(${offset} ${offset}) scale(${scale})">${artwork}</g>
</svg>`
}

const render = (svg, size) =>
  sharp(Buffer.from(svg), { density: Math.max(72, (72 * size) / 1024) * 4 })
    .resize(size, size, { kernel: 'lanczos3' })
    .png({ compressionLevel: 9, palette: true, quality: 100, effort: 10, dither: 1 })

await writeFile(`${root}assets/icon.svg`, roundedSvg(0) + '\n')

for (const size of [64, 192, 512]) {
  await render(roundedSvg(), size).toFile(`${OUT}pwa-${size}x${size}.png`)
}

// Maskable: everything drawn (waves included, about 300 px from the centre at scale 1) must stay
// inside the centre circle of radius 40% (410 of 1024).
await render(fullBleedSvg(0.74), 512).toFile(`${OUT}maskable-icon-512x512.png`)

// Apple touch icon: the same framing as the rounded tile, full bleed.
await render(fullBleedSvg(0.92), 180).toFile(`${OUT}apple-touch-icon-180x180.png`)

const icoSizes = [16, 32, 48]
const icoImages = await Promise.all(icoSizes.map((size) => render(roundedSvg(), size).toBuffer()))
const header = Buffer.alloc(6 + 16 * icoSizes.length)
header.writeUInt16LE(0, 0)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(icoSizes.length, 4)
let offset = header.length
icoSizes.forEach((size, n) => {
  const entry = 6 + 16 * n
  header.writeUInt8(size, entry)
  header.writeUInt8(size, entry + 1)
  header.writeUInt16LE(1, entry + 4) // colour planes
  header.writeUInt16LE(32, entry + 6) // bits per pixel
  header.writeUInt32LE(icoImages[n].length, entry + 8)
  header.writeUInt32LE(offset, entry + 12)
  offset += icoImages[n].length
})
await writeFile(`${OUT}favicon.ico`, Buffer.concat([header, ...icoImages]))

console.log('icons written to public/ and assets/icon.svg')
