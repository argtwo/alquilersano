/**
 * Generates simple PNG icons for the PWA manifest.
 * Run: node scripts/gen-icons.mjs
 */
import { createWriteStream } from 'fs'
import { deflateSync } from 'zlib'
import { mkdirSync } from 'fs'

mkdirSync('public/icons', { recursive: true })

function crc32(buf) {
  let c = 0xffffffff
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let v = i
    for (let j = 0; j < 8; j++) v = v & 1 ? (v >>> 1) ^ 0xedb88320 : v >>> 1
    table[i] = v
  }
  for (const byte of buf) c = (c >>> 8) ^ table[(c ^ byte) & 0xff]
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

function makePNG(size) {
  // Blue background (#2563eb = 37, 99, 235) with simple house shape
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  // IHDR: width, height, 8-bit, RGB (2), no interlace
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8   // bit depth
  ihdr[9] = 2   // color type: RGB
  ihdr[10] = 0  // compression
  ihdr[11] = 0  // filter
  ihdr[12] = 0  // interlace

  // Build raw scanlines (filter byte 0 + RGB pixels)
  const raw = Buffer.alloc(size * (1 + size * 3))
  const cx = size / 2
  const cy = size / 2
  const r = size * 0.35
  const roofH = size * 0.18

  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * 3)] = 0 // filter type None
    for (let x = 0; x < size; x++) {
      const off = y * (1 + size * 3) + 1 + x * 3
      // Normalize coords
      const nx = (x - cx) / r
      const ny = (y - cy) / r

      // Background: blue gradient
      let R = 37, G = 99, B = 235

      // House body: white square
      const bodyLeft = cx - r * 0.45
      const bodyRight = cx + r * 0.45
      const bodyTop = cy - r * 0.05
      const bodyBottom = cy + r * 0.55
      const inBody = x >= bodyLeft && x <= bodyRight && y >= bodyTop && y <= bodyBottom

      // Roof: triangle
      const roofPeak = cy - r * 0.55
      const roofBaseY = bodyTop
      const roofLeft = cx - r * 0.55
      const roofRight = cx + r * 0.55
      const slope = (roofBaseY - roofPeak) / (roofRight - cx)
      const roofEdge = roofPeak + slope * Math.abs(x - cx)
      const inRoof = y >= roofEdge && y <= roofBaseY && x >= roofLeft && x <= roofRight

      // Door
      const doorLeft = cx - r * 0.13
      const doorRight = cx + r * 0.13
      const doorTop = cy + r * 0.2
      const inDoor = x >= doorLeft && x <= doorRight && y >= doorTop && y <= bodyBottom

      if (inRoof || inBody) {
        R = 248; G = 250; B = 252 // white
      }
      if (inDoor) {
        R = 37; G = 99; B = 235 // blue door
      }

      raw[off] = R
      raw[off + 1] = G
      raw[off + 2] = B
    }
  }

  const idat = chunk('IDAT', deflateSync(raw))
  const iend = chunk('IEND', Buffer.alloc(0))

  return Buffer.concat([sig, chunk('IHDR', ihdr), idat, iend])
}

for (const size of [192, 512]) {
  const buf = makePNG(size)
  const ws = createWriteStream(`public/icons/icon-${size}.png`)
  ws.write(buf)
  ws.end()
  console.log(`✓ icon-${size}.png (${buf.length} bytes)`)
}
