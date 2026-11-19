// 住所の目安（v0.30.0。11/20 ぶっくまさん「もうちょい本屋データベースを整備できる？」→ 案A「住所を埋める」→「ダウンロードOK」）
// 住所のない店に、位置にいちばん近い町丁目の名前（都道府県＋市区町村＋大字・町丁目）を「付近」として付ける
// 元：Geolonia 住所データ（CC BY 4.0。国土交通省 位置参照情報をもとに作成）https://github.com/geolonia/japanese-addresses の latest.csv（約52MB。リポジトリには入れない）
// 使い方：node tools/approx_addr.js <latest.csv のパス>
//   → tools/data/approx_addr.json（{ 店番号: { aa: '大阪府大阪市北区梅田三丁目', p: '大阪府' } }）。build_data.js が読み、住所のない店にだけ重ねる
//   いちばん近い町丁目が 1.5km より遠いときは、町丁目を付けず市区町村までにする（山あいなどで、となりの町になりやすいため）
const fs = require('fs');
const path = require('path');
const csvPath = process.argv[2];
if (!csvPath || !fs.existsSync(csvPath)) { console.error('使い方：node tools/approx_addr.js <latest.csv のパス>'); process.exit(1); }
const ROOT = path.join(__dirname, '..');
const OUTF = path.join(__dirname, 'data', 'approx_addr.json');
const FAR_M = 1500;

// CSV（"…","…",…）を1行ずつ。カンマを含む値は無い前提だが、念のため引用符の中のカンマは区切らない
function cells(line) { const out = []; let cur = '', q = false; for (const ch of line) { if (ch === '"') { q = !q; continue; } if (ch === ',' && !q) { out.push(cur); cur = ''; continue; } cur += ch; } out.push(cur); return out; }
const text = fs.readFileSync(csvPath, 'utf8');
const lines = text.split(/\r?\n/);
const head = cells(lines[0]);
const ix = (n) => { const i = head.indexOf(n); if (i < 0) throw new Error('列が見つかりません：' + n); return i; };
const P = ix('都道府県名'), C = ix('市区町村名'), O = ix('大字町丁目名'), LA = ix('緯度'), LO = ix('経度');
// 0.02度ごとのます目に入れて、近くだけを探す
const G = 0.02; const grid = new Map(); let n = 0;
const key = (la, lo) => `${Math.floor(la / G)},${Math.floor(lo / G)}`;
for (let i = 1; i < lines.length; i++) {
  if (!lines[i]) continue; const c = cells(lines[i]); const la = +c[LA], lo = +c[LO];
  if (!Number.isFinite(la) || !Number.isFinite(lo) || !c[P] || !c[C]) continue;
  const k = key(la, lo); if (!grid.has(k)) grid.set(k, []); grid.get(k).push([la, lo, c[P], c[C], c[O]]); n++;
}
console.log('町丁目の点：', n);
function dist(lat1, lon1, lat2, lon2) { const R = 6371000, t = Math.PI / 180; const dLat = (lat2 - lat1) * t, dLon = (lon2 - lon1) * t; const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * t) * Math.cos(lat2 * t) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(a)); }
function nearest(la, lo) {
  let best = null, bd = Infinity;
  for (let r = 1; r <= 4 && (!best || r <= 2); r++) { // まわり（最大 ±4 ます＝およそ±8km）
    const ci = Math.floor(la / G), cj = Math.floor(lo / G);
    for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) {
      const a = grid.get(`${i},${j}`); if (!a) continue;
      for (const p of a) { const d = dist(la, lo, p[0], p[1]); if (d < bd) { bd = d; best = p; } }
    }
    if (best && bd < r * G * 111000 * 0.7) break;
  }
  return best ? { p: best, d: bd } : null;
}
const out = {}; let near = 0, cityOnly = 0, none = 0, skipped = 0;
for (const f of ['bookstores.json', 'libraries.json']) {
  const list = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
  for (const s of list) {
    if (s.a) { skipped++; continue; } // 住所がある店はそのまま
    const r = nearest(s.la, s.lo); if (!r) { none++; continue; }
    const [, , pref, city, oaza] = r.p;
    const far = r.d > FAR_M;
    out[s.i] = { aa: far ? pref + city : pref + city + (oaza || ''), p: pref };
    if (far) cityOnly++; else near++;
  }
}
fs.writeFileSync(OUTF, JSON.stringify(out));
console.log('住所の目安：町丁目まで', near, '・市区町村まで', cityOnly, '・見つからない', none, '（住所がある店', skipped, '）→', path.relative(ROOT, OUTF));
