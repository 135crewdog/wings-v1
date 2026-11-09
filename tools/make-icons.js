// Writes the placeholder app icons: icons/icon-180.png (Apple touch icon), icon-192.png and
// icon-512.png. A sky gradient with a white glider seen from above. No dependencies: the PNG is
// encoded here with node:zlib. Run with `node tools/make-icons.js` after changing the drawing.

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(new URL("../icons/", import.meta.url));
const SIZES = [180, 192, 512];
const SS = 4; // supersampling per axis, for smooth edges

// The glider, in a unit square (0..1, y down): capsules [x0, y0, x1, y1, radius].
const SHAPES = [
  [0.07, 0.43, 0.93, 0.43, 0.035], // wing
  [0.5, 0.2, 0.5, 0.82, 0.045], // fuselage
  [0.36, 0.78, 0.64, 0.78, 0.025], // tailplane
];

function insideCapsule(px, py, [x0, y0, x1, y1, r]) {
  const dx = x1 - x0, dy = y1 - y0;
  const t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / (dx * dx + dy * dy)));
  const ex = px - (x0 + t * dx), ey = py - (y0 + t * dy);
  return ex * ex + ey * ey <= r * r;
}

function render(size) {
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let cover = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (x + (sx + 0.5) / SS) / size, v = (y + (sy + 0.5) / SS) / size;
          if (SHAPES.some((s) => insideCapsule(u, v, s))) cover++;
        }
      }
      const a = cover / (SS * SS);
      const t = y / (size - 1); // sky: deep blue at the top, pale at the horizon
      const sky = [Math.round(40 + 120 * t), Math.round(110 + 100 * t), Math.round(200 + 45 * t)];
      const i = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) rgba[i + c] = Math.round(sky[c] * (1 - a) + 255 * a);
      rgba[i + 3] = 255; // opaque: iOS fills transparency with black
    }
  }
  return png(size, size, rgba);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
for (const size of SIZES) {
  const file = `${OUT}icon-${size}.png`;
  writeFileSync(file, render(size));
  console.log(`wrote icons/icon-${size}.png`);
}
