// OpenStreetMap（Overpass）の生データ → アプリ用の小さなJSONに
// 使い方: node tools/build_data.js data/bookstores_raw.json data/bookstores.json
const fs = require('fs');
const [,, inFile, outFile] = process.argv;
const raw = JSON.parse(fs.readFileSync(inFile, 'utf8'));
const out = [];
const keyCount = {};
let dropped = 0;
for (const e of raw.elements || []) {
  const t = e.tags || {};
  const lat = e.lat ?? (e.center && e.center.lat);
  const lon = e.lon ?? (e.center && e.center.lon);
  if (lat == null || lon == null) { dropped++; continue; }
  let name = t['name:ja'] || t.name || t.brand || t['brand:ja'];
  if (!name) { dropped++; continue; }
  // 支店名（branch）が名前に入っていなければ足す（例：紀伊國屋書店 → 紀伊國屋書店 新宿本店）
  if (t.branch && !name.includes(t.branch)) name = name + ' ' + t.branch;
  Object.keys(t).forEach((k) => { keyCount[k] = (keyCount[k] || 0) + 1; });
  const used = (/古書|古本|ブックオフ|BOOK ?OFF|BOOK-OFF|bookoff/i.test(name) || t.second_hand === 'only' || t.second_hand === 'yes' || t.books === 'second_hand') ? 1 : 0;
  const addr = t['addr:full'] || [t['addr:province'], t['addr:city'], t['addr:quarter'], t['addr:neighbourhood'], t['addr:block_number'], t['addr:housenumber']].filter(Boolean).join('');
  const rec = { i: e.type[0] + e.id, n: name, la: +Number(lat).toFixed(5), lo: +Number(lon).toFixed(5) };
  if (addr) rec.a = addr;
  if (t['addr:province'] && /[都道府県]$/.test(t['addr:province'])) rec.p = t['addr:province']; // 日本語の都道府県名だけ使う
  if (used) rec.u = 1;
  if (t.brand && t.brand !== name) rec.b = t.brand;
  out.push(rec);
}
out.sort((a, b) => a.la - b.la);
fs.writeFileSync(outFile, JSON.stringify(out));
console.log('stores:', out.length, 'dropped (no name/position):', dropped);
console.log('with addr:', out.filter((r) => r.a).length, 'with province:', out.filter((r) => r.p).length, 'used:', out.filter((r) => r.u).length);
console.log('top tags:', Object.entries(keyCount).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => k + ':' + v).join(' '));
