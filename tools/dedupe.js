// 重なっている店（同じ名前の店が近くに2つ）を見つけて、上書き表（tools/data/overrides.json の dups）に「どちらを残すか」を書く（v0.30.0）
// 11/20 ぶっくまさん「もうちょい本屋データベースを整備できる？」→ 案C「重なりを片づける」→「ぜんぶ提案のとおりで」
// 地図データ（OpenStreetMap）では、同じ店が「点」と「建物の形」の2つで入っていることがある
// 使い方：node tools/dedupe.js [--dry]（--dry は書かずに一覧だけ）。そのあと build_data.js
// 決まり：名前が同じ（空白・記号をのぞく）で 60m 以内。「2号店」など名前が少しでもちがうものは触らない
// 残すほう：公式一覧で確かめた（cf）→ 公式から足した（x）→ 住所がある → 確認日がある → 番号が小さいほう
// 外したほうは data/gone.json に「to：残した店」として残し、アプリは記録（スタンプなど）の表示に使う
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const dry = process.argv.includes('--dry');
const NEAR = 60;
const stores = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'bookstores.json'), 'utf8'));
const ovPath = path.join(__dirname, 'data', 'overrides.json');
const ov = JSON.parse(fs.readFileSync(ovPath, 'utf8')); ov.dups = ov.dups || {};
function dist(a, b) { const R = 6371000, t = Math.PI / 180; const dLat = (b.la - a.la) * t, dLon = (b.lo - a.lo) * t; const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.la * t) * Math.cos(b.la * t) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); }
const norm = (s) => String(s || '').normalize('NFKC').toLowerCase().replace(/[\s・･\-‐－ー（）()［］\[\]「」]/g, '');
const score = (s) => (s.cf ? 1000 : 0) + (s.x ? 500 : 0) + (s.a ? 100 : 0) + (s.c ? 50 : 0) + (s.b ? 10 : 0) + (s.i[0] === 'n' ? 1 : 0);
const G = 0.002; const grid = new Map();
for (const s of stores) { const k = `${Math.floor(s.la / G)},${Math.floor(s.lo / G)}`; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(s); }
const gone = new Set(Object.keys(ov.dups)); const found = [];
for (const s of stores) {
  if (gone.has(s.i)) continue;
  const gi = Math.floor(s.la / G), gj = Math.floor(s.lo / G);
  for (let i = gi - 1; i <= gi + 1; i++) for (let j = gj - 1; j <= gj + 1; j++) for (const t of grid.get(`${i},${j}`) || []) {
    if (t.i === s.i || gone.has(t.i) || gone.has(s.i) || norm(t.n) !== norm(s.n)) continue;
    const d = dist(s, t); if (d > NEAR) continue;
    const [keep, drop] = score(s) > score(t) || (score(s) === score(t) && s.i < t.i) ? [s, t] : [t, s];
    gone.add(drop.i); found.push({ keep, drop, d });
  }
}
for (const f of found) console.log(`${Math.round(f.d)}m  残す ${f.keep.i} ${f.keep.n}  ／ 外す ${f.drop.i} ${f.drop.n}`);
console.log('重なり：', found.length, '組', dry ? '（--dry：書いていません）' : '');
if (!dry && found.length) {
  const today = new Date().toISOString().slice(0, 10);
  for (const f of found) ov.dups[f.drop.i] = { to: f.keep.i, n: f.drop.n, why: `dedupe ${today}: 同じ名前の店が ${Math.round(f.d)}m 以内（${f.keep.i} を残す）` };
  fs.writeFileSync(ovPath, JSON.stringify(ov, null, 1));
  console.log('上書き表（dups）に書きました。つぎ：node tools/build_data.js tools/data/bookstores_raw.json data/bookstores.json');
}
