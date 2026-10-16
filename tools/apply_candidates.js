// chain_check の候補（data/chain_check/candidates.json）を、上書き表・確認表・追加表に写す
// 使い方：
//   node tools/apply_candidates.js --closed high            … 確からしさ「高」の閉店候補を data/overrides.json の closed に
//   node tools/apply_candidates.js --closed high,mid        … 高と中
//   node tools/apply_candidates.js --closed n123,w456       … id を指定
//   node tools/apply_candidates.js --renames all|id,id      … 公式表記への名前直しを overrides.json の renames に
//   node tools/apply_candidates.js --confirmed              … 公式一覧で確認できた店の「最終確認の月」を data/confirmed.json に
//   node tools/apply_candidates.js --add precise|all|kinokuniya … 地図にない公式店を data/additions.json に（precise＝位置が番地まで正確なものだけ）
//   組み合わせ可。写したあと：node tools/build_data.js data/bookstores_raw.json data/bookstores.json → 版を上げて push
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : 'all') : null; };
const read = (f, def) => { try { return JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8')); } catch (e) { return def; } };
const write = (f, v) => fs.writeFileSync(path.join(DATA, f), JSON.stringify(v, null, 1));

const cand = read('chain_check/candidates.json', null);
if (!cand) { console.error('候補がありません。先に node tools/chain_check.js を動かしてください'); process.exit(1); }
const ov = read('overrides.json', { renames: {}, closed: {} }); ov.renames = ov.renames || {}; ov.closed = ov.closed || {};
let changed = false;

const closedSel = opt('--closed');
if (closedSel) {
  const levels = new Set(['high', 'mid', 'low']); const parts = closedSel.split(',').map((s) => s.trim());
  const byLevel = parts.filter((p) => levels.has(p)), byId = parts.filter((p) => !levels.has(p) && p !== 'all');
  let n = 0;
  for (const [id, c] of Object.entries(cand.closed)) { if (closedSel === 'all' || byLevel.includes(c.conf) || byId.includes(id)) { if (!ov.closed[id]) { ov.closed[id] = { n: c.n, why: c.why }; n++; } } }
  console.log('閉店を上書き表に：', n); changed = changed || n > 0;
}
const renSel = opt('--renames');
if (renSel) {
  const ids = renSel === 'all' ? null : new Set(renSel.split(',').map((s) => s.trim()));
  let n = 0;
  for (const [id, r] of Object.entries(cand.renames)) { if (!ids || ids.has(id)) { if (!ov.renames[id] || ov.renames[id].n !== r.n) { ov.renames[id] = { n: r.n, why: r.why }; n++; } } }
  console.log('名前直しを上書き表に：', n); changed = changed || n > 0;
}
if (changed) write('overrides.json', ov);

if (args.includes('--confirmed')) {
  const conf = read('confirmed.json', {}); let n = 0;
  for (const [id, m] of Object.entries(cand.confirmed || {})) { if (!conf[id] || conf[id] < m) { conf[id] = m; n++; } }
  write('confirmed.json', conf); console.log('確認表に：', n, '（合計', Object.keys(conf).length, '店）');
}
const addSel = opt('--add');
const SKIP_ADD = new Set(['villagevanguard']); // 雑貨が主の店は、名指ししたときだけ足す
if (addSel) {
  const adds = read('additions.json', []); const have = new Set(adds.map((x) => x.i)); let n = 0;
  for (const [chain, list] of Object.entries(cand.additions || {})) {
    for (const x of list) {
      if (addSel !== 'all' && addSel !== 'precise' && addSel !== chain) continue;
      if (addSel === 'precise' && !x.precise) continue;
      if (have.has(x.i)) continue;
      if (adds.some((y) => Math.abs(y.la - x.la) < 0.0008 && Math.abs(y.lo - x.lo) < 0.001)) continue; // 別チェーンの一覧と同じ店（約70m以内）は1つだけ
      if (addSel !== chain && SKIP_ADD.has(chain)) continue;
      adds.push({ i: x.i, n: x.n, la: x.la, lo: x.lo, a: x.a, p: x.p, u: x.u, c: x.c, src: 'chain:' + chain, precise: x.precise }); have.add(x.i); n++;
    }
  }
  write('additions.json', adds); console.log('追加表に：', n, '（合計', adds.length, '店）');
}
console.log('つぎ：node tools/build_data.js data/bookstores_raw.json data/bookstores.json');
