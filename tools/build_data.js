// OpenStreetMap（Overpass）の生データ → アプリ用の小さなJSONに
// 使い方: node tools/build_data.js tools/data/bookstores_raw.json data/bookstores.json
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
// 上書き表・追加表・確認表は tools/data/ に置く（v0.16.0。アプリが読むのは data/ の bookstores.json などだけ）。見つからないときは止める
const TD = require('path').join(__dirname, 'data');
const must = (f) => { const p = require('path').join(TD, f); if (!fs.existsSync(p)) { console.error(`見つかりません：${p}（空のまま作ると、閉店した店が戻り、足した店が消えるので止めます）`); process.exit(1); } return JSON.parse(fs.readFileSync(p, 'utf8')); };
const ov = Object.assign({ renames: {}, closed: {} }, must('overrides.json'));
let renamed = 0, closedN = 0, dupN = 0;
// 外した店（閉店・重なり）は data/gone.json に残す（v0.30.0）：アプリは地図に出さず、スタンプなど記録の表示にだけ使う（前は記録から消えていた）
const goneList = []; const goneRec = (r, extra) => { const g = { i: r.i, n: r.n, la: r.la, lo: r.lo }; if (r.p) g.p = r.p; if (r.u) g.u = 1; goneList.push(Object.assign(g, extra)); };
const dups = ov.dups || {}; // 重なり（tools/dedupe.js）：{ 外す店: { to: 残す店 } }
// ov.off＝対象に入れない店（アダルト系など・11/23）、ov.moves＝移転した店の新しい場所（11/23）
// 本めぐりの対象に入れない店（11/20 ぶっくまさん「メロンブックス・アニメイトは入れない」）：地図には出さず、記録の表示だけ（閉店とは出さない）
const NOT_TARGET = /メロンブックス|melonbooks|アニメイト|animate/i; let offN = 0;
// 追加表（公式店舗一覧にあって OSM にない店。tools/chain_check.js → tools/apply_candidates.js --add で足す）
const adds = must('additions.json');
const have = new Set(out.map((r) => r.i)); let added = 0;
for (const x of adds) { if (!x || !x.i || !x.n || x.la == null || x.lo == null || have.has(x.i) || (ov.closed && ov.closed[x.i])) continue; const rec = { i: x.i, n: x.n, la: +Number(x.la).toFixed(5), lo: +Number(x.lo).toFixed(5), x: 1 }; if (x.a) rec.a = x.a; if (x.p) rec.p = x.p; if (x.u) rec.u = 1; if (x.c) rec.c = x.c; if (x.src && /^oshibon/.test(x.src)) rec.ob = 1; if (x.src && /^web:meibo/.test(x.src)) { rec.wk = 1; delete rec.x; } else if (x.src && /^web/.test(x.src)) rec.sw = 1; /* wk＝名簿にのっている店（最新の営業は未確認・2026-11） */ /* 店のホームページ・SNSで確かめた（2026-11） */ /* SNS推し本大賞の展開店舗一覧から足した店（2026-11） */ out.push(rec); have.add(x.i); added++; }
// 上書きは、追加表の店（x…）にも入れる（11/24。前は OSM の店だけで、追加表の店には閉店しか入っていなかった）
for (let i = out.length - 1; i >= 0; i--) { const r = out[i]; if (ov.closed && ov.closed[r.i]) { goneRec(r, { z: 1 }); out.splice(i, 1); closedN++; continue; } if (dups[r.i] && dups[r.i].to) { goneRec(r, { to: dups[r.i].to }); out.splice(i, 1); dupN++; continue; } if (NOT_TARGET.test(r.n) || (ov.off && ov.off[r.i])) { goneRec(r, { h: 1 }); out.splice(i, 1); offN++; continue; } if (ov.moves && ov.moves[r.i]) { const m = ov.moves[r.i]; r.la = m.la; r.lo = m.lo; if (m.n) r.n = m.n; if (m.a) { r.a = m.a; delete r.aa; } else if (m.aa) { delete r.a; r.aa = m.aa; } } if (ov.renames && ov.renames[r.i]) { r.n = ov.renames[r.i].n; r.ov = 1; renamed++; } if (ov.addrs && ov.addrs[r.i]) { r.a = ov.addrs[r.i]; delete r.aa; } if (ov.paused && ov.paused[r.i]) { r.pz = ov.paused[r.i].since || 1; } if (ov.verified && ov.verified[r.i]) { if (ov.verified[r.i].g) r.gv = 1; else r.sw = 1; r.c = ov.verified[r.i].c; if (ov.verified[r.i].url && /^https?:\/\//.test(ov.verified[r.i].url)) r.w = ov.verified[r.i].url; } }
console.log('上書き：屋号変更', renamed, '閉店', closedN, '重なり', dupN, '対象外', offN);
// 確認表（公式店舗一覧で「ある」と確かめられた店 → 最終確認の月を更新）
const confirmed = must('confirmed.json');
let confN = 0; for (const r of out) { const m = confirmed[r.i]; if (m && (!r.c || m > r.c)) { r.c = m; r.cf = 1; confN++; } }
console.log('追加表：', added, ' 公式一覧で確認：', confN);
// 住所の目安（v0.30.0）：住所のない店に、いちばん近い町丁目（tools/approx_addr.js が作る tools/data/approx_addr.json。Geolonia 住所データ・CC BY 4.0）
//   新しく入った店にも付けるには：build → node tools/approx_addr.js <latest.csv> → もう一度 build
const approxPath = require('path').join(__dirname, 'data', 'approx_addr.json');
const approx = fs.existsSync(approxPath) ? JSON.parse(fs.readFileSync(approxPath, 'utf8')) : {};
let approxN = 0; for (const r of out) { const x = approx[r.i]; if (!r.a && x && x.aa) { r.aa = x.aa; if (!r.p && x.p) r.p = x.p; approxN++; } }
console.log('住所の目安：', approxN);
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
// 外した店の秘境度も、残った店から数える（記録の表示で、スタンプの珍しさが変わらないように）
for (const g of goneList) { let k = 0; for (const b of out) { if (Math.abs(g.la - b.la) > 0.046 || Math.abs(g.lo - b.lo) > 0.06) continue; const dLat = (b.la - g.la) * T, dLon = (b.lo - g.lo) * T; const h = Math.sin(dLat / 2) ** 2 + Math.cos(g.la * T) * Math.cos(b.la * T) * Math.sin(dLon / 2) ** 2; if (2 * R * Math.asin(Math.sqrt(h)) <= 5000) k++; } g.k = k; }
const gonePath = require('path').join(require('path').dirname(outFile), 'gone.json');
fs.writeFileSync(gonePath, JSON.stringify(goneList));
console.log('外した店（記録の表示用）:', goneList.length, '→', gonePath);
console.log('stores:', out.length, 'dropped (no name/position):', dropped);
console.log('with addr:', out.filter((r) => r.a).length, 'approx addr:', out.filter((r) => r.aa).length, 'with province:', out.filter((r) => r.p).length, 'used:', out.filter((r) => r.u).length);
console.log('top tags:', Object.entries(keyCount).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => k + ':' + v).join(' '));
