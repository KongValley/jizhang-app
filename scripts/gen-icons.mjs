import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const OUT = path.resolve('public/icons')
const SS = 3 // supersampling factor

const crcTable = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePNG(width, height, rgba) {
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)

function mix(a, b, t) {
  return a.map((v, i) => Math.round(v + (b[i] - v) * t))
}

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const lenSq = dx * dx + dy * dy
  let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq
  t = clamp01(t)
  const qx = ax + t * dx
  const qy = ay + t * dy
  return Math.hypot(px - qx, py - qy)
}

const GLYPH = [
  // V of the ¥
  [0.3, 0.255, 0.5, 0.47],
  [0.7, 0.255, 0.5, 0.47],
  // stem
  [0.5, 0.47, 0.5, 0.775],
  // two bars
  [0.335, 0.552, 0.665, 0.552],
  [0.355, 0.655, 0.645, 0.655],
]

function render(size, { maskable = false } = {}) {
  const W = size * SS
  const out = Buffer.alloc(size * size * 4)
  const bgA = maskable ? [0x4c, 0x6f, 0xff] : [0x4c, 0x6f, 0xff]
  const bgB = maskable ? [0x8b, 0x5c, 0xf6] : [0x7c, 0x5c, 0xff]
  const radius = maskable ? 0 : 0.225
  const glyphScale = maskable ? 0.72 : 0.84
  const strokeW = 0.088 * glyphScale

  const px = new Float32Array(W * W * 4)
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W
      const v = (y + 0.5) / W
      const i = (y * W + x) * 4

      // rounded-rect coverage
      let coverage = 1
      if (radius > 0) {
        const r = radius
        const dx = Math.max(Math.abs(u - 0.5) - (0.5 - r), 0)
        const dy = Math.max(Math.abs(v - 0.5) - (0.5 - r), 0)
        const d = Math.hypot(dx, dy)
        coverage = clamp01((r - d) * W + 0.5)
      } else {
        coverage = 1
      }
      if (coverage <= 0) continue

      const t = clamp01(((u + v) / 2 - 0.12) / 0.76)
      const base = mix(bgA, bgB, t)
      // soft radial highlight, top-left
      const glow = Math.max(0, 1 - Math.hypot(u - 0.18, v - 0.12) / 0.85) ** 2 * 0.22
      const col = mix(base, [255, 255, 255], glow)

      // glyph (normalized around center, scaled)
      const gx = (u - 0.5) / glyphScale + 0.5
      const gy = (v - 0.5) / glyphScale + 0.5
      let glyph = 0
      for (const [ax, ay, bx, by] of GLYPH) {
        const d = distToSegment(gx, gy, ax, ay, bx, by)
        glyph = Math.max(glyph, clamp01((strokeW / 2 - d) * (W * glyphScale) + 0.5))
      }
      const final = mix(col, [255, 255, 255], glyph)

      px[i] = final[0]
      px[i + 1] = final[1]
      px[i + 2] = final[2]
      px[i + 3] = 255 * coverage
    }
  }

  // downscale
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = ((y * SS + sy) * W + (x * SS + sx)) * 4
          const alpha = px[i + 3] / 255
          r += px[i] * alpha
          g += px[i + 1] * alpha
          b += px[i + 2] * alpha
          a += alpha
        }
      }
      const n = SS * SS
      const o = (y * size + x) * 4
      if (a <= 0) {
        out[o + 3] = 0
      } else {
        out[o] = Math.round(r / a)
        out[o + 1] = Math.round(g / a)
        out[o + 2] = Math.round(b / a)
        out[o + 3] = Math.round((a / n) * 255)
      }
    }
  }
  return encodePNG(size, size, out)
}

fs.mkdirSync(OUT, { recursive: true })
const jobs = [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['icon-1024.png', 1024, {}],
  ['maskable-512.png', 512, { maskable: true }],
  ['apple-touch-icon.png', 180, {}],
]
for (const [name, size, opts] of jobs) {
  fs.writeFileSync(path.join(OUT, name), render(size, opts))
  console.log('generated', name)
}
