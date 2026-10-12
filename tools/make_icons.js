// アイコン（PNG）を外部ライブラリなしで作る：紙色の地に朱の印
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

function crc32(buf) {
  let crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    let c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, px) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = px(x, y);
      const o = y * (w * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function icon(size) {
  const c = size / 2;
  return png(size, size, (x, y) => {
    const dx = x - c, dy = y - c;
    const r = Math.sqrt(dx * dx + dy * dy) / size;
    // 紙色の地
    if (r > 0.36) return [246, 241, 232, 255];
    // 朱の印（外の輪と、内の丸）
    if (r > 0.33) return [200, 56, 31, 255];
    if (r > 0.29) return [246, 241, 232, 255];
    // 内側：朱に、白い小さな四角（本）
    const inBook = Math.abs(dx) < size * 0.09 && Math.abs(dy) < size * 0.12;
    const spine = Math.abs(dx) < size * 0.012 && Math.abs(dy) < size * 0.12;
    if (spine) return [200, 56, 31, 255];
    if (inBook) return [255, 255, 255, 255];
    return [200, 56, 31, 255];
  });
}
const outDir = path.resolve(__dirname, '..');
fs.writeFileSync(path.join(outDir, 'icon-192.png'), icon(192));
fs.writeFileSync(path.join(outDir, 'icon-512.png'), icon(512));
console.log('icons written');
