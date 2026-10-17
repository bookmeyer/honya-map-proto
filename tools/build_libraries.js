// OpenStreetMap（Overpass）の図書館の生データ → アプリ用の小さなJSONに
// 使い方:
//   curl -A "honya-map/0.8" --data-urlencode "data@tools/overpass_libraries.txt" -o data/libraries_raw.json https://overpass-api.de/api/interpreter
//   node tools/build_libraries.js data/libraries_raw.json data/libraries.json
// 大学・学校・研究所・病院などの、一般の人が入れないことが多い図書館は外す。id は「L」＋OSMの種別1文字＋番号
const fs = require('fs');
const path = require('path');
const [,, inFile, outFile] = process.argv;
if (!inFile || !outFile) { console.error('使い方: node tools/build_libraries.js data/libraries_raw.json data/libraries.json'); process.exit(1); }
const raw = JSON.parse(fs.readFileSync(inFile, 'utf8'));
const NG_NAME = /大学|学院|学園|短期大学|短大|高専|キャンパス|小学校|中学校|高校|高等学校|学校|幼稚園|保育園|研究所|研究センター|社内|株式会社|病院|資料室/;
const NG_ACCESS = /^(private|no|customers|students|members)$/;
const out = []; let dropped = 0, ng = 0;
for (const e of raw.elements || []) {
  const t = e.tags || {};
  const lat = e.lat ?? (e.center && e.center.lat), lon = e.lon ?? (e.center && e.center.lon);
  if (lat == null || lon == null) { dropped++; continue; }
  let name = t['name:ja'] || t.name; if (!name) { dropped++; continue; }
  if (NG_NAME.test(name) || NG_ACCESS.test(t.access || '')) { ng++; continue; }
  if (t.branch && !name.includes(t.branch)) name = name + ' ' + t.branch;
  const addr = t['addr:full'] || [t['addr:province'], t['addr:city'], t['addr:quarter'], t['addr:neighbourhood'], t['addr:block_number'], t['addr:housenumber']].filter(Boolean).join('');
  const rec = { i: 'L' + e.type[0] + e.id, n: name, la: +Number(lat).toFixed(5), lo: +Number(lon).toFixed(5), t: 'l' };
  if (addr) rec.a = addr;
  if (t['addr:province'] && /[都道府県]$/.test(t['addr:province'])) rec.p = t['addr:province'];
  const cd = t.check_date || t['survey:date'] || t.last_checked; if (cd && /^\d{4}/.test(cd)) rec.c = cd.slice(0, 7);
  out.push(rec);
}
// 上書き表（閉館・名前の変更。本屋と同じ data/overrides.json を使う）
let ov = { renames: {}, closed: {} }; try { ov = JSON.parse(fs.readFileSync(path.join(path.dirname(outFile), 'overrides.json'), 'utf8')); } catch (e) {}
let renamed = 0, closedN = 0;
for (let i = out.length - 1; i >= 0; i--) { const r = out[i]; if (ov.closed && ov.closed[r.i]) { out.splice(i, 1); closedN++; continue; } if (ov.renames && ov.renames[r.i]) { r.n = ov.renames[r.i].n; r.ov = 1; renamed++; } }
// 同じ場所・同じ名前の重なり（点と建物の両方で描かれているもの）を1つに
out.sort((a, b) => a.la - b.la); const keep = [];
for (const r of out) { const dup = keep.slice(-40).find((x) => x.n === r.n && Math.abs(x.la - r.la) < 0.0015 && Math.abs(x.lo - r.lo) < 0.0018); if (!dup) keep.push(r); }
// 秘境度：半径5kmにある、ほかの図書館の数（k）
const R = 6371000, T = Math.PI / 180;
for (let i = 0; i < keep.length; i++) {
  const a = keep[i]; let k = 0;
  for (let j = 0; j < keep.length; j++) { if (i === j) continue; const b = keep[j]; if (Math.abs(a.la - b.la) > 0.046 || Math.abs(a.lo - b.lo) > 0.06) continue; const dLat = (b.la - a.la) * T, dLon = (b.lo - a.lo) * T; const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.la * T) * Math.cos(b.la * T) * Math.sin(dLon / 2) ** 2; if (2 * R * Math.asin(Math.sqrt(h)) <= 5000) k++; }
  a.k = k;
}
fs.writeFileSync(outFile, JSON.stringify(keep));
console.log('libraries:', keep.length, ' 外した（大学・学校など）:', ng, ' 名前や位置なし:', dropped, ' 重なり:', out.length - keep.length, ' 上書き 名前', renamed, '閉館', closedN);
console.log('秘境（周り5kmに図書館なし）:', keep.filter((r) => r.k === 0).length, ' 住所あり:', keep.filter((r) => r.a).length);
