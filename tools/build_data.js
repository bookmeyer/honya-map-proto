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
  // 本屋でない店（レンタル・まんが喫茶・コンビニなど）を除く。ただし名前に書店らしい言葉があれば残す
  const bad = /GEO|ゲオ|Manboo|コミックバスター|快活|自遊空間|コミックレンタル|本レンタル|ローソン|ファミリーマート|セブン-?イレブン|ゲームセンター|ダイソー|カラオケ/i;
  const keep = /書店|書房|書林|書肆|文庫|ブックス|BOOKS|本屋|本店|堂/i;
  if ((bad.test(name) && !keep.test(name)) || name === 'Book Home コミックレンタル') { dropped++; continue; }
  Object.keys(t).forEach((k) => { keyCount[k] = (keyCount[k] || 0) + 1; });
  const used = (/古書|古本|ブックオフ|BOOK ?OFF|BOOK-OFF|bookoff/i.test(name) || t.second_hand === 'only' || t.second_hand === 'yes' || t.books === 'second_hand') ? 1 : 0;
  const addr = t['addr:full'] || [t['addr:province'], t['addr:city'], t['addr:quarter'], t['addr:neighbourhood'], t['addr:block_number'], t['addr:housenumber']].filter(Boolean).join('');
  const rec = { i: e.type[0] + e.id, n: name, la: +Number(lat).toFixed(5), lo: +Number(lon).toFixed(5) };
  if (addr) rec.a = addr;
  if (t['addr:province'] && /[都道府県]$/.test(t['addr:province'])) rec.p = t['addr:province']; // 日本語の都道府県名だけ使う
  if (used) rec.u = 1;
  if (t.brand && t.brand !== name) rec.b = t.brand;
  const cd = t.check_date || t['survey:date'] || t.last_checked; if (cd && /^\d{4}/.test(cd)) rec.c = cd.slice(0, 7); // 地図データの確認日（年-月）
  out.push(rec);
}
// 上書き表（閉店・屋号変更など、確かめた分）
const ovPath = require('path').join(require('path').dirname(outFile), 'overrides.json');
let ov = { renames: {}, closed: {} }; try { ov = JSON.parse(fs.readFileSync(ovPath, 'utf8')); } catch (e) {}
let renamed = 0, closedN = 0;
for (let i = out.length - 1; i >= 0; i--) { const r = out[i]; if (ov.closed && ov.closed[r.i]) { out.splice(i, 1); closedN++; continue; } if (ov.renames && ov.renames[r.i]) { r.n = ov.renames[r.i].n; r.ov = 1; renamed++; } }
console.log('上書き：屋号変更', renamed, '閉店', closedN);
// 追加表（公式店舗一覧にあって OSM にない店。tools/chain_check.js → tools/apply_candidates.js --add で足す）
const dataDir = require('path').dirname(outFile);
let adds = []; try { adds = JSON.parse(fs.readFileSync(require('path').join(dataDir, 'additions.json'), 'utf8')); } catch (e) {}
const have = new Set(out.map((r) => r.i)); let added = 0;
for (const x of adds) { if (!x || !x.i || !x.n || x.la == null || x.lo == null || have.has(x.i) || (ov.closed && ov.closed[x.i])) continue; const rec = { i: x.i, n: x.n, la: +Number(x.la).toFixed(5), lo: +Number(x.lo).toFixed(5), x: 1 }; if (x.a) rec.a = x.a; if (x.p) rec.p = x.p; if (x.u) rec.u = 1; if (x.c) rec.c = x.c; out.push(rec); have.add(x.i); added++; }
// 確認表（公式店舗一覧で「ある」と確かめられた店 → 最終確認の月を更新）
let confirmed = {}; try { confirmed = JSON.parse(fs.readFileSync(require('path').join(dataDir, 'confirmed.json'), 'utf8')); } catch (e) {}
let confN = 0; for (const r of out) { const m = confirmed[r.i]; if (m && (!r.c || m > r.c)) { r.c = m; r.cf = 1; confN++; } }
console.log('追加表：', added, ' 公式一覧で確認：', confN);
out.sort((a, b) => a.la - b.la);
// 秘境度：半径5kmにある他の本屋の数（k）。少ないほど珍しい印になる
const R = 6371000, T = Math.PI / 180;
for (let i = 0; i < out.length; i++) {
  const a = out[i]; let k = 0;
  for (let j = 0; j < out.length; j++) {
    if (i === j) continue; const b = out[j];
    if (Math.abs(a.la - b.la) > 0.046 || Math.abs(a.lo - b.lo) > 0.06) continue;
    const dLat = (b.la - a.la) * T, dLon = (b.lo - a.lo) * T;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.la * T) * Math.cos(b.la * T) * Math.sin(dLon / 2) ** 2;
    if (2 * R * Math.asin(Math.sqrt(h)) <= 5000) k++;
  }
  a.k = k;
}
console.log('秘境（k<=1）:', out.filter((r) => r.k <= 1).length, ' k<=8:', out.filter((r) => r.k <= 8).length);
fs.writeFileSync(outFile, JSON.stringify(out));
console.log('stores:', out.length, 'dropped (no name/position):', dropped);
console.log('with addr:', out.filter((r) => r.a).length, 'with province:', out.filter((r) => r.p).length, 'used:', out.filter((r) => r.u).length);
console.log('top tags:', Object.entries(keyCount).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => k + ':' + v).join(' '));
