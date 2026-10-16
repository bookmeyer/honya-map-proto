// 大手チェーンの公式店舗一覧と、地図データ（OpenStreetMap由来）を突き合わせる
//
// 使い方：
//   node tools/chain_check.js                        … 全チェーン：取得 → 位置を調べる → 突き合わせ → 報告
//   node tools/chain_check.js --only kinokuniya,yurindo
//   node tools/chain_check.js --fetch-only --only xxx … 取得だけして件数と見本を表示（部品の確認用）
//   node tools/chain_check.js --no-fetch             … 前回取った一覧（cache）で突き合わせだけ
// 出力：data/chain_check/report_YYYY-MM-DD.md（人が読む）、data/chain_check/candidates.json（上書き表の候補）
// 位置は国土地理院の住所検索API（無料・鍵なし）で調べ、data/chain_check/geocode.json に覚える
const fs = require('fs');
const path = require('path');
const lib = require('./chains/_lib');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'chain_check');
const CACHE = path.join(OUT, 'cache');
fs.mkdirSync(CACHE, { recursive: true });
const args = process.argv.slice(2);
const flag = (k) => args.includes(k);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const only = opt('--only') ? opt('--only').split(',').map((s) => s.trim()) : null;
const NEAR_M = +(opt('--near') || 500); // 位置での一致とみなす距離
const today = new Date().toISOString().slice(0, 10);

const PREFS = [['北海道', 43.064, 141.347], ['青森県', 40.824, 140.740], ['岩手県', 39.704, 141.153], ['宮城県', 38.269, 140.872], ['秋田県', 39.719, 140.102], ['山形県', 38.240, 140.363], ['福島県', 37.750, 140.468], ['茨城県', 36.342, 140.447], ['栃木県', 36.566, 139.884], ['群馬県', 36.391, 139.061], ['埼玉県', 35.857, 139.649], ['千葉県', 35.605, 140.123], ['東京都', 35.690, 139.692], ['神奈川県', 35.448, 139.643], ['新潟県', 37.903, 139.024], ['富山県', 36.695, 137.211], ['石川県', 36.595, 136.626], ['福井県', 36.065, 136.222], ['山梨県', 35.664, 138.568], ['長野県', 36.651, 138.181], ['岐阜県', 35.391, 136.722], ['静岡県', 34.977, 138.383], ['愛知県', 35.180, 136.907], ['三重県', 34.730, 136.509], ['滋賀県', 35.005, 135.869], ['京都府', 35.021, 135.756], ['大阪府', 34.686, 135.520], ['兵庫県', 34.691, 135.183], ['奈良県', 34.685, 135.833], ['和歌山県', 34.226, 135.168], ['鳥取県', 35.504, 134.238], ['島根県', 35.472, 133.051], ['岡山県', 34.662, 133.934], ['広島県', 34.397, 132.460], ['山口県', 34.186, 131.471], ['徳島県', 34.066, 134.559], ['香川県', 34.340, 134.043], ['愛媛県', 33.842, 132.766], ['高知県', 33.560, 133.531], ['福岡県', 33.606, 130.418], ['佐賀県', 33.249, 130.299], ['長崎県', 32.745, 129.874], ['熊本県', 32.790, 130.742], ['大分県', 33.238, 131.613], ['宮崎県', 31.911, 131.424], ['鹿児島県', 31.560, 130.558], ['沖縄県', 26.212, 127.681]];
function dist(lat1, lon1, lat2, lon2) { const R = 6371000, t = Math.PI / 180; const dLat = (lat2 - lat1) * t, dLon = (lon2 - lon1) * t; const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * t) * Math.cos(lat2 * t) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(a)); }
const fmtKm = (m) => (m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`);

// ---- 位置（国土地理院の住所検索） ----
const geoPath = path.join(OUT, 'geocode.json');
let GEO = {}; try { GEO = JSON.parse(fs.readFileSync(geoPath, 'utf8')); } catch (e) {}
let geoDirty = 0;
async function geocode(address) {
  const key = lib.normAddr(address); if (!key) return null;
  if (key in GEO) return GEO[key];
  let v = null;
  try {
    const q = String(address).normalize('NFKC').replace(/〒\s*\d{3}-?\d{4}/g, '').replace(/\s+/g, '').replace(/(ビル|タワー|モール|館|階|F).*$/u, (m) => m); // そのまま
    const r = await fetch('https://msearch.gsi.go.jp/address-search/AddressSearch?q=' + encodeURIComponent(q), { headers: { 'User-Agent': lib.UA } });
    if (r.ok) { const j = await r.json(); if (Array.isArray(j) && j[0] && j[0].geometry) { const [lon, lat] = j[0].geometry.coordinates; v = { lat, lon, title: (j[0].properties || {}).title || '' }; } }
  } catch (e) { v = null; }
  GEO[key] = v; geoDirty++; if (geoDirty % 25 === 0) fs.writeFileSync(geoPath, JSON.stringify(GEO));
  await lib.sleep(260);
  return v;
}

// ---- 部品を読み込む ----
const dir = path.join(__dirname, 'chains');
const adapters = fs.readdirSync(dir).filter((f) => f.endsWith('.js') && !f.startsWith('_')).map((f) => require(path.join(dir, f))).filter((a) => a && a.id && (!only || only.includes(a.id)));
if (!adapters.length) { console.error('部品がありません（--only の名前を確かめてください）'); process.exit(1); }

(async () => {
  const stores = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'bookstores.json'), 'utf8'));
  const report = [`# チェーン公式一覧との突き合わせ ${today}`, '', `地図データ ${stores.length} 店。位置の一致は ${NEAR_M}m 以内。閉店候補は「公式一覧に名前も位置も見当たらない店」。`, ''];
  const candidates = { generatedAt: today, closed: {}, renames: {}, confirmed: {}, additions: {} };
  const summary = [];
  for (const a of adapters) {
    const cachePath = path.join(CACHE, a.id + '.json');
    let list = null;
    if (!flag('--no-fetch')) {
      try { list = await a.fetch(lib); fs.writeFileSync(cachePath, JSON.stringify({ fetchedAt: new Date().toISOString(), list }, null, 1)); }
      catch (e) { console.error(`[${a.id}] 取得できませんでした：${e.message}`); }
    }
    if (!list) { try { list = JSON.parse(fs.readFileSync(cachePath, 'utf8')).list; console.log(`[${a.id}] 前回の一覧を使います（${list.length}件）`); } catch (e) { list = null; } }
    if (!list) { report.push(`## ${a.name}`, '', '- 一覧が取れませんでした', ''); summary.push([a.name, '-', '-', '-', '-', '-']); continue; }
    console.log(`[${a.id}] 公式一覧 ${list.length} 件`);
    if (flag('--fetch-only')) { console.log(JSON.stringify(list.slice(0, 3), null, 1)); continue; }

    // 位置を調べる
    let geoOk = 0; for (const o of list) { if (o.lat != null && o.lon != null && isFinite(+o.lat) && isFinite(+o.lon)) { o.lat = +o.lat; o.lon = +o.lon; o.precise = true; geoOk++; } else if (o.address) { const g = await geocode(o.address); if (g) { o.lat = g.lat; o.lon = g.lon; o.precise = /番/.test(g.title || ''); geoOk++; } } if (o.lat == null) { delete o.lat; delete o.lon; } o.branch = lib.branchOf(o.name, a.brand); o.pref = lib.prefOfAddress(o.address) || (o.lat != null ? nearestPref(o.lat, o.lon) : ''); }
    fs.writeFileSync(geoPath, JSON.stringify(GEO));

    // 地図データ側
    const ours = stores.filter((s) => a.brand.test(s.n) && !(a.exclude && a.exclude.test(s.n)));
    for (const s of ours) { s._branch = lib.branchOf(s.n, a.brand); s._pref = s.p || nearestPref(s.la, s.lo); }
    const matched = new Map(); const usedOfficial = new Set();
    // 1) 支店名で一致（同じ県の中で。支店名が空なら飛ばす）
    for (const s of ours) {
      if (!s._branch) continue;
      const near30 = (o) => o.lat != null && dist(s.la, s.lo, o.lat, o.lon) < 30000;
      const cands = list.filter((o) => o.branch && (!o.pref || !s._pref || o.pref === s._pref || near30(o)) && (o.branch === s._branch || (Math.min(o.branch.length, s._branch.length) >= 3 && (o.branch.includes(s._branch) || s._branch.includes(o.branch)))));
      if (!cands.length) continue;
      cands.sort((x, y) => (x.branch === s._branch ? 0 : 1) - (y.branch === s._branch ? 0 : 1) || ((x.lat ? dist(s.la, s.lo, x.lat, x.lon) : 9e9) - (y.lat ? dist(s.la, s.lo, y.lat, y.lon) : 9e9)));
      const o = cands[0]; matched.set(s.i, { o, how: 'name', d: o.lat ? dist(s.la, s.lo, o.lat, o.lon) : null }); usedOfficial.add(o);
    }
    // 2) 位置で一致（残り）
    for (const s of ours) {
      if (matched.has(s.i)) continue;
      let best = null, bd = Infinity; for (const o of list) { if (o.lat == null) continue; const d = dist(s.la, s.lo, o.lat, o.lon); if (d < bd) { bd = d; best = o; } }
      if (best && bd <= NEAR_M) { matched.set(s.i, { o: best, how: 'geo', d: bd }); usedOfficial.add(best); }
      else if (best) s._nearest = { o: best, d: bd };
    }
    const unmatched = ours.filter((s) => !matched.has(s.i));
    const renames = []; for (const [id, m] of matched) { const s = ours.find((x) => x.i === id); if (lib.norm(s.n) !== lib.norm(m.o.name)) renames.push({ s, o: m.o, how: m.how, d: m.d }); }
    const missing = list.filter((o) => !usedOfficial.has(o));
    const coverage = ours.length ? matched.size / ours.length : 0;
    const trust = a.complete !== false && list.length >= 5 && coverage >= 0.4; // 一覧が薄すぎるときは閉店候補を出さない
    console.log(`[${a.id}] 地図 ${ours.length} 店 / 一致 ${matched.size}（名前 ${[...matched.values()].filter((m) => m.how === 'name').length}・位置 ${[...matched.values()].filter((m) => m.how === 'geo').length}）/ 閉店候補 ${unmatched.length} / 名前ちがい ${renames.length} / 地図にない公式店 ${missing.length} / 位置が分かった公式店 ${geoOk}/${list.length}`);
    summary.push([a.name, ours.length, list.length, matched.size, trust ? unmatched.length : `(${unmatched.length})`, renames.length, missing.length]);

    report.push(`## ${a.name}（公式一覧 ${list.length} 件・${a.source}）`, '', `- 地図データ ${ours.length} 店のうち一致 ${matched.size}（名前 ${[...matched.values()].filter((m) => m.how === 'name').length}・位置 ${[...matched.values()].filter((m) => m.how === 'geo').length}）。位置が分かった公式店 ${geoOk}/${list.length}`, '');
    if (!trust) report.push(`- ⚠ 一覧の重なりが薄い（${Math.round(coverage * 100)}%）ので、閉店候補は参考扱い（上書き表の候補には入れない）`, '');
    // 閉店候補の確からしさ：高＝支店名があり近くに公式店なし／中＝支店名なし／要確認＝1.5km以内に公式店（移転・改称かも）／学内＝大学などの中の店（公式一覧に載らないことが多い）
    const CAMPUS = /大学|学院|学園|キャンパス|高専|短大|専門学校|病院|学校/;
    const confOf = (s) => (CAMPUS.test(s.n) ? 'campus' : s._nearest && s._nearest.d < 1500 ? 'low' : s._branch ? 'high' : 'mid');
    const CONF_LBL = { high: '高', mid: '中（支店名なし）', low: '要確認（近くに公式店）', campus: '学内・施設内（候補にしない）' };
    report.push(`### 閉店候補 ${unmatched.length}（公式一覧に名前も位置も見当たらない）`, '');
    for (const s of unmatched) { const conf = confOf(s); const near = s._nearest ? `最寄りの公式店：${s._nearest.o.name}（${fmtKm(s._nearest.d)}）` : '近くに公式店なし'; report.push(`- [ ] \`${s.i}\` ${s.n}（${s._pref}${s.a ? '・' + s.a : ''}）｜${near}｜確からしさ：${CONF_LBL[conf]}`); if (trust && conf !== 'campus') candidates.closed[s.i] = { n: s.n, conf, why: `chain-check ${today}: ${a.name}の公式店舗一覧に見当たらない（${near}）`, near: s._nearest ? { n: s._nearest.o.name, m: Math.round(s._nearest.d) } : null }; }
    report.push('', `### 名前がちがう ${renames.length}（公式の表記 ← 地図データ）`, '');
    for (const r of renames) { const sure = r.how === 'name' || (r.d != null && r.d <= 200); report.push(`- [ ] \`${r.s.i}\` ${r.o.name} ← ${r.s.n}（${r.how === 'name' ? '支店名で一致' : '位置で一致'}${r.d != null ? '・' + fmtKm(r.d) : ''}）${sure ? '' : '｜要確認（位置だけで200m超）'}`); if (sure) candidates.renames[r.s.i] = { n: r.o.name, old: r.s.n, why: `chain-check ${today}: ${a.name}の公式表記（${r.how === 'name' ? '支店名で一致' : '位置で一致'}${r.d != null ? '・' + fmtKm(r.d) : ''}）` }; }
    // 公式一覧で「ある」と確かめられた店 → 確認表（最終確認の月）
    for (const id of matched.keys()) candidates.confirmed[id] = today.slice(0, 7);
    report.push('', `### 地図にない公式店 ${missing.length}（新店か、地図データで別名の店。位置が番地まで分かるものは追加の候補）`, '');
    const adds = [];
    for (const o of missing) { if (o.lat != null) { let dupe = null; for (const s of stores) { if (Math.abs(s.la - o.lat) > 0.001 || Math.abs(s.lo - o.lon) > 0.0013) continue; if (dist(s.la, s.lo, o.lat, o.lon) < 70) { dupe = s; break; } } if (dupe) { o.dupe = dupe.n; continue; } const u = /古本|古書|BOOKOFF|ブックオフ|古本市場/i.test(o.name) || a.used ? 1 : undefined; adds.push({ i: 'x' + hash32(a.id + '|' + o.name).toString(36), n: o.name, la: +o.lat.toFixed(5), lo: +o.lon.toFixed(5), a: o.address || '', p: o.pref || '', u, c: today.slice(0, 7), chain: a.id, precise: !!o.precise }); } }
    for (const o of missing.slice(0, 80)) report.push(`- ${o.name}（${o.address || '住所なし'}）${o.lat == null ? '｜位置不明' : o.dupe ? `｜同じ場所に地図の店あり：${o.dupe}（追加しない）` : o.precise ? '｜追加できる（位置が正確）' : '｜位置はおおよそ（町丁目まで）'}`);
    if (missing.length > 80) report.push(`- …ほか ${missing.length - 80} 店`);
    report.push('');
    candidates.additions[a.id] = adds;
  }
  if (flag('--fetch-only')) return;
  // どれか1つのチェーンの公式一覧で確認できた店は、ほかのチェーンの目で「見当たらない」となっても閉店候補にしない（例：元・啓文堂の紀伊國屋書店）
  let crossKept = 0; for (const id of Object.keys(candidates.closed)) if (candidates.confirmed[id]) { delete candidates.closed[id]; crossKept++; }
  // 公式店のどれかが 150m 以内にある店も、閉店候補にしない（別の屋号で一覧に載っている複合店など）
  const allOfficial = []; for (const a of adapters) { try { for (const o of JSON.parse(fs.readFileSync(path.join(CACHE, a.id + '.json'), 'utf8')).list) { let la = o.lat, lo = o.lon; if (la == null && o.address) { const g = GEO[lib.normAddr(o.address)]; if (g) { la = g.lat; lo = g.lon; } } if (la != null) allOfficial.push([+la, +lo, o.name]); } } catch (e) {} }
  for (const id of Object.keys(candidates.closed)) { const s = stores.find((x) => x.i === id); if (!s) continue; const hit = allOfficial.find(([la, lo]) => Math.abs(la - s.la) < 0.002 && Math.abs(lo - s.lo) < 0.0025 && dist(s.la, s.lo, la, lo) <= 150); if (hit) { delete candidates.closed[id]; crossKept++; } }
  report.splice(3, 0, `ほかのチェーンの一覧で確認できた店・150m以内に公式店がある店 ${crossKept} 店は、閉店候補から外しました。`, '');
  report.splice(4, 0, '| チェーン | 地図 | 公式 | 一致 | 閉店候補 | 名前ちがい | 地図にない |', '|---|---|---|---|---|---|---|', ...summary.map((r) => `| ${r.join(' | ')} |`), '');
  fs.writeFileSync(path.join(OUT, `report_${today}.md`), report.join('\n'));
  fs.writeFileSync(path.join(OUT, 'candidates.json'), JSON.stringify(candidates, null, 1));
  const addN = Object.values(candidates.additions).reduce((n, l) => n + l.length, 0), addP = Object.values(candidates.additions).reduce((n, l) => n + l.filter((x) => x.precise).length, 0);
  console.log(`\n報告：data/chain_check/report_${today}.md\n候補：data/chain_check/candidates.json（閉店 ${Object.keys(candidates.closed).length}・名前 ${Object.keys(candidates.renames).length}・確認 ${Object.keys(candidates.confirmed).length}・追加 ${addN}（位置が正確 ${addP}））\n反映：node tools/apply_candidates.js --closed high --renames all --confirmed --add precise`);
})().catch((e) => { console.error(e); process.exit(1); });

function hash32(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; }
function nearestPref(la, lo) { let best = '', bd = Infinity; for (const [n, pla, plo] of PREFS) { const d = (la - pla) ** 2 + (lo - plo) ** 2; if (d < bd) { bd = d; best = n; } } return best; }
