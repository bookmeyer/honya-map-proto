// アイコン（PNG）を外部ライブラリなしで作る：紙色の地に、朱のピン（中に本）
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
// 4×4 の点で縁をなめらかに（アンチエイリアス）
function icon(size) {
  const PAPER = [250, 247, 241], SHU = [214, 69, 43], SHU2 = [179, 50, 28], WHITE = [255, 255, 255];
  const cx = 0.5, cy = 0.40, R = 0.26, TIP = 0.90;
  const inPin = (x, y) => { const dx = x - cx, dy = y - cy; if (dx * dx + dy * dy <= R * R) return true; if (y > cy && y <= TIP) { const t = (y - cy) / (TIP - cy); return Math.abs(dx) <= R * Math.sqrt(Math.max(0, 1 - t * t)) * (1 - t * 0.15) + 0.0; } return false; };
  const sample = (x, y) => {
    if (!inPin(x, y)) return PAPER;
    const dx = x - cx, dy = y - cy; const d = Math.sqrt(dx * dx + dy * dy);
    if (d <= 0.145) { // 白い丸と、中の本
      const bx = Math.abs(dx) <= 0.075, by = dy >= -0.085 && dy <= 0.075;
      if (bx && by) { if (Math.abs(dx) <= 0.01) return WHITE; return SHU; }
      return WHITE;
    }
    return y > 0.62 ? SHU2 : SHU;
  };
  return png(size, size, (x, y) => {
    let r = 0, g = 0, b = 0; const n = 4;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const c = sample((x + (i + 0.5) / n) / size, (y + (j + 0.5) / n) / size); r += c[0]; g += c[1]; b += c[2]; }
    return [Math.round(r / (n * n)), Math.round(g / (n * n)), Math.round(b / (n * n)), 255];
  });
}
const outDir = path.resolve(__dirname, '..');
fs.writeFileSync(path.join(outDir, 'icon-192.png'), icon(192));
fs.writeFileSync(path.join(outDir, 'icon-512.png'), icon(512));
console.log('icons written');
