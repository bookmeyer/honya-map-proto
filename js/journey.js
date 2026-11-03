// 旅の記録：歩いた距離（ページ）・その日の物語・月のふり返り・行きたい店のお知らせ・投稿の記録・Googleマップの★の読み込み・店と店のあいだ・読書・いま読んでいる本
// 位置は、アプリを開いて現在地を追っているあいだだけ使う（ブラウザの決まりで、閉じているあいだは測れない）。閉じていたあいだの道のりは、次の店でスタンプを押したときに、前の店からのまっすぐの距離で足す（v0.14）
import { WALK, RANGE_M, SEG } from './config.js?v=0.17.0';
import { todayISO, dist, emit, hash32, prefOf, fmtDist, monthKey, fmtMin } from './util.js?v=0.17.0';
import { S, save } from './state.js?v=0.17.0';
import { POS } from './position.js?v=0.17.0';
import { BYID, STORES, rarityOf } from './data.js?v=0.17.0';
import * as G from './game.js?v=0.17.0';
import { activeTrip, endTrip, readTimes, readMinOf, allReads } from './reading.js?v=0.17.0';

function dayRec(d = todayISO()) { S.days = S.days || {}; const r = (S.days[d] = S.days[d] || { m: 0, v: 0 }); r.pass = r.pass || {}; r.alert = r.alert || {}; return r; }
export const pagesOf = (m) => Math.floor((m || 0) / WALK.pageM);
export const stepsOf = (m) => Math.round((m || 0) / WALK.stepM);
export const kmOf = (m) => ((m || 0) / 1000).toFixed((m || 0) < 10000 ? 1 : 0);
export const totalWalk = () => Object.values(S.days || {}).reduce((a, r) => a + (r.m || 0), 0);
// ---- 歩いた距離 ----
// 位置の揺れ（誤差）で増えないよう、精度が悪い点は使わず、一定以上動いたときだけ足す。速すぎる移動は「乗り物」として別に数える
let last = null;
export function track(POS, jumpedNow) {
  if (POS.fake || POS.lat == null) { last = null; return; }
  const now = Date.now(), acc = POS.acc == null ? 999 : POS.acc;
  if (jumpedNow) { last = null; return; }
  if (acc > WALK.maxAccM) return;
  if (!last) { last = { lat: POS.lat, lon: POS.lon, t: now }; return; }
  const d = dist(last.lat, last.lon, POS.lat, POS.lon), dt = (now - last.t) / 1000;
  if (dt > WALK.gapS) { last = { lat: POS.lat, lon: POS.lon, t: now }; return; } // 間があいた（閉じていた）ら、その間は数えない
  if (d < Math.max(WALK.minMoveM, acc * 0.6)) return;
  const v = d / Math.max(dt, 1); const day = dayRec(); const volBefore = G.volume();
  if (v <= WALK.walkMaxMps) day.m = Math.round(day.m + d); else if (v <= WALK.rideMaxMps) day.v = Math.round((day.v || 0) + d);
  if (!day.t0) day.t0 = now; day.t1 = now;
  last = { lat: POS.lat, lon: POS.lon, t: now }; prune(); save();
  const volAfter = G.volume(); if (volAfter > volBefore) emit('volume', { after: volAfter });
}
function prune() { const keys = Object.keys(S.days || {}); if (keys.length <= 420) return; keys.sort(); for (const k of keys.slice(0, keys.length - 400)) delete S.days[k]; }
// ---- 行きたい店のお知らせ ----
// 段階：1＝設定の距離（1〜5km）に入った／2＝500m以内。同じ日に同じ段階は1回だけ。射程内（120m）はいつもの演出に任せる
export function checkWanted(POS) {
  const out = [];
  if (POS.lat == null || !S.wants.length) return out;
  const far = S.settings.wantAlertM || 2000; const day = dayRec(); let changed = false;
  for (const id of S.wants) {
    const st = BYID.get(id); if (!st) continue;
    const d = dist(POS.lat, POS.lon, st.la, st.lo);
    if (!POS.fake && d <= far) { const r = Math.round(d); if (day.pass[id] == null || r < day.pass[id]) { day.pass[id] = r; changed = true; } }
    if (S.settings.wantAlert === false) continue;
    const stage = d <= RANGE_M ? 3 : d <= WALK.wantNearM ? 2 : d <= far ? 1 : 0;
    if (stage && stage > (day.alert[id] || 0)) { day.alert[id] = stage; changed = true; if (stage < 3) out.push({ st, d, stage }); }
  }
  if (changed) save();
  return out.sort((a, b) => a.d - b.d);
}
export const wantsInBounds = (b) => S.wants.map((id) => BYID.get(id)).filter((st) => st && !st.closed && st.la >= b.s && st.la <= b.n && st.lo >= b.w && st.lo <= b.e);
export const wantsSorted = (lat, lon) => S.wants.map((id) => BYID.get(id)).filter((st) => st && !st.closed).map((st) => ({ st, d: dist(lat, lon, st.la, st.lo) })).sort((a, b) => a.d - b.d);
// ---- 投稿・シェアの記録 ----
export function addPost({ url, text, sid }) { S.posts = S.posts || []; const t = Date.now(); S.posts.push({ id: 'p' + t, t, d: todayISO(), url: url || '', text: text || '', s: sid || '' }); save(); }
export function deletePost(id) { S.posts = (S.posts || []).filter((p) => p.id !== id); save(); }
const SHARE_LBL = { stamp: 'スタンプの画像をシェアした。', regular: '常連度をシェアした。', card: 'カードの画像をシェアした。', profile: 'プレイヤーカードをシェアした。', story: 'この日の物語をシェアした。' };
// ---- 店と店のあいだ・読書・いま読んでいる本（v0.14） ----
// 次の店でスタンプを押したときに呼ぶ（G.checkin より先）。前の店から、まだ数えていない道のりを歩いたページに足す。前の店からあとの読書も、まとめて見せる
export function arrive(st, { near, trial }) {
  if (!near || trial || st.demo) return null;
  const now = Date.now(), today = todayISO();
  const pv = G.lastNearVisitToday();
  const a = pv && pv.s !== st.i ? BYID.get(pv.s) : null;
  const auto = activeTrip() && S.trip.from !== st.i ? endTrip(now, true, [st.la, st.lo]) : null; // 「おわる」を押し忘れたまま次の本屋に着いた → ここで終える（このときだけ、スタンプまでの時間）
  const g = { id: 'g' + now, d: today, t: now, to: st.i };
  if (a) {
    const m = dist(a.la, a.lo, st.la, st.lo), dt = Math.max(1, (now - pv.t) / 1000), day = dayRec();
    const tracked = pv.m != null ? Math.max(0, (day.m || 0) - pv.m) : null; // 開いたまま歩いて、もう数えた分
    const ride = m / dt > WALK.walkMaxMps; let add = 0;
    if (tracked != null && !ride && m >= SEG.minM && m <= SEG.maxM && m > tracked) { add = Math.round(m - tracked); day.m = Math.round((day.m || 0) + add); if (!day.t0) day.t0 = now; day.t1 = now; }
    Object.assign(g, { from: a.i, fn: a.n, m: Math.round(m), ride: ride ? 1 : 0, add, walked: (tracked || 0) + add });
  }
  if (g.from) { S.trips = S.trips || []; S.trips.push(g); if (S.trips.length > 600) S.trips.splice(0, S.trips.length - 600); }
  save();
  const reads = (S.reads || []).filter((r) => !r.off && r.t1 > (pv ? pv.t : now - 6 * 3600 * 1000));
  return g.from || reads.length ? { ...g, reads, autoId: auto && auto.id ? auto.id : '' } : null;
}
// 前の店とのあいだ（まっすぐの線のそば）にあった店。実際に通ったとは言わない
export function betweenStores(a, b) {
  const kx = 111320 * Math.cos((((a.la + b.la) / 2) * Math.PI) / 180), ky = 110540, r = SEG.betweenM;
  const bx = (b.lo - a.lo) * kx, by = (b.la - a.la) * ky, L2 = bx * bx + by * by; if (L2 < 200 * 200) return [];
  const s0 = Math.min(a.la, b.la) - r / ky, n0 = Math.max(a.la, b.la) + r / ky, w0 = Math.min(a.lo, b.lo) - r / kx, e0 = Math.max(a.lo, b.lo) + r / kx;
  const out = [];
  for (const s of STORES) {
    if (s.la < s0 || s.la > n0 || s.lo < w0 || s.lo > e0 || s.i === a.i || s.i === b.i || s.demo) continue;
    const px = (s.lo - a.lo) * kx, py = (s.la - a.la) * ky, t = Math.max(0, Math.min(1, (px * bx + py * by) / L2)), dx = px - t * bx, dy = py - t * by;
    if (dx * dx + dy * dy <= r * r) out.push({ s, t });
  }
  return out.sort((x, y) => x.t - y.t).map((x) => x.s);
}
// ---- その日の物語 ----
function activeDates() {
  const set = new Set();
  S.visits.forEach((v) => set.add(v.d)); S.cards.forEach((c) => set.add(c.d)); (S.posts || []).forEach((p) => set.add(p.d));
  for (const [d, r] of Object.entries(S.days || {})) if ((r.m || 0) >= WALK.pageM) set.add(d);
  (S.reading || []).forEach((b) => { if (b.done) set.add(b.done); }); (S.reads || []).forEach((r) => { if (!r.off) set.add(r.d); });
  return [...set].sort();
}
const WD = '日月火水木金土';
function regRankAt(id, date, inclusive) { const days = new Set(S.visits.filter((v) => v.s === id && v.near && (inclusive ? v.d <= date : v.d < date)).map((v) => v.d)).size; return { rank: G.regularRank(days), days }; }
export function chapter(date = todayISO(), dates = activeDates()) {
  let no = dates.indexOf(date) + 1; if (!no) no = dates.filter((d) => d < date).length + 1;
  const rec = (S.days || {})[date] || { m: 0, v: 0, pass: {} };
  const vis = S.visits.filter((v) => v.d === date).sort((a, b) => a.t - b.t);
  const cards = S.cards.filter((c) => c.d === date).sort((a, b) => a.t - b.t);
  const posts = (S.posts || []).filter((p) => p.d === date);
  const shares = (S.shares || []).filter((p) => p.d === date && p.r !== 'saved');
  const rnd = (arr, k) => arr[hash32(date + '|' + k) % arr.length];
  const prefBefore = new Set(S.visits.filter((v) => v.near && v.d < date).map((v) => BYID.get(v.s)).filter(Boolean).map(prefOf));
  const seenPref = new Set(), seenReg = new Set();
  const events = [];
  for (const v of vis) {
    const st = BYID.get(v.s); const name = st ? st.n : v.n; const h = new Date(v.t).getHours();
    const g = v.near ? (S.trips || []).find((x) => x.read && x.to === v.s && Math.abs(x.t - v.t) < 5000) : null; // 移動読書で着いた
    let s = g ? `${h}時、${g.title ? `『${g.title}』を` : '本を'}${g.mode === 'ear' ? '耳で聞きながら' : '読みながら'}、${name}${rnd(['へ', 'に着いた'], v.t)}${g.min ? `（読書${fmtMin(g.min)}）` : ''}。` : `${h}時、${name}${v.near ? rnd(['へ。', 'の扉をくぐる。', 'に着いた。'], v.t) : 'に立ち寄った（記録だけ）。'}`;
    if (v.near && st) {
      const firstToday = vis.find((x) => x.s === v.s && x.near) === v;
      if (firstToday && S.stamps[v.s] && S.stamps[v.s].d === date) s += rarityOf(st) === 3 ? '周りに本屋のない、秘境の一軒。はじめてのスタンプを押した。' : 'はじめてのスタンプを押した。';
      if (firstToday && !seenReg.has(v.s)) { seenReg.add(v.s); const a = regRankAt(v.s, date, false), b = regRankAt(v.s, date, true); if (b.rank > a.rank && b.rank >= 2) s += `常連度は「${G.REGULAR_NAMES[b.rank - 1]}」に（${b.days}日目）。`; }
      const p = prefOf(st); if (!prefBefore.has(p) && !seenPref.has(p)) { seenPref.add(p); s += `はじめて${p}の${st.t === 'l' ? '図書館' : '本屋'}に入った。`; }
    }
    if (v.memo) s += `「${v.memo}」`;
    events.push({ t: v.t, s });
  }
  for (const c of cards) events.push({ t: c.t, s: `『${c.title}』と出会った（${c.sn}）。${c.why ? '——' + c.why : ''}` });
  for (const r of (S.reads || []).filter((x) => x.d === date && !x.off)) { const pl = r.pl, h = `${new Date(r.t0).getHours()}時、`, bk = `${r.title ? `『${r.title}』を` : '本を'}${fmtMin(r.min)}読んだ。`; // どこで読んだか（v0.15.0）
    events.push({ t: r.t0, s: pl && pl.k === 'store' ? `${h}${pl.n}のそばで、${bk}` : `${h}${r.fn ? `${r.fn}を出て、` : ''}${pl && pl.k === 'move' ? `移動しながら（${fmtDist(pl.m)}）、` : ''}${bk}` }); }
  for (const b of (S.reading || []).filter((x) => x.done === date)) { const n = readTimes(b.id); const days = b.dm ? Math.round((Date.parse(date) - Date.parse(b.dm)) / 864e5) : -1; events.push({ t: b.tDone || 0, s: `『${b.title}』を読み終えた。${b.sn ? (days > 0 ? `${b.sn}で出会ってから${days}日。` : `${b.sn}で出会ったその日に。`) : ''}${n ? `読書${n}回・あわせて${fmtMin(readMinOf(b.id))}。` : ''}` }); }
  for (const p of posts) events.push({ t: p.t, s: `Xに投稿した。${p.text ? '「' + p.text + '」' : ''}`, url: p.url, pid: p.id });
  for (const sh of shares) events.push({ t: sh.t, s: SHARE_LBL[sh.kind] || 'シェアした。' });
  events.sort((a, b) => a.t - b.t);
  const lines = [];
  if ((rec.m || 0) >= WALK.pageM) lines.push({ s: rnd([`この日は${kmOf(rec.m)}km、${pagesOf(rec.m)}ページぶん歩いた。`, `歩いた道のりは${kmOf(rec.m)}km。${pagesOf(rec.m)}ページぶんの一日。`, `${pagesOf(rec.m)}ページぶん（${kmOf(rec.m)}km）の道のり。`], 'open') });
  lines.push(...events);
  const visited = new Set(vis.map((v) => v.s));
  for (const [id, m] of Object.entries(rec.pass || {})) { if (visited.has(id)) continue; const st = BYID.get(id); if (st) lines.push({ s: `行きたかった${st.n}の${fmtDist(m)}そばを通った。${rnd(['次こそは。', '今度は寄り道を。', '覚えておこう。'], id)}` }); }
  const isEmpty = !lines.length;
  if (!isEmpty) lines.push({ s: rnd(['続きは、また明日。', '今日のしおりは、ここに。', 'また次のページへ。'], 'close') });
  const [y, mo, dd] = date.split('-').map(Number); const dow = new Date(y, mo - 1, dd).getDay();
  return { no, date, title: `第${no}章　${mo}月${dd}日（${WD[dow]}）`, lines, empty: isEmpty, blank: date === todayISO() ? 'まだ白紙のページ。現在地を追って歩くと、歩いた分だけページが増え、本屋に寄ると物語が書き足されます。' : 'この日は白紙のページ。', m: rec.m || 0, v: rec.v || 0, pages: pagesOf(rec.m), earned: ((S.pgDay || {})[date] || 0) + pagesOf(rec.m), km: kmOf(rec.m), steps: stepsOf(rec.m), nVisits: vis.length, nStores: visited.size, nCards: cards.length, nRead: allReads().filter((r) => r.d === date).length, readMin: allReads().filter((r) => r.d === date).reduce((a, r) => a + (r.min || 0), 0) };
}
export function chapters(limit = 30) { const ds = activeDates(); return [...ds].reverse().slice(0, limit).map((d) => chapter(d, ds)); }
// ---- 月・年のふり返り（prefix は 'YYYY-MM' か 'YYYY'） ----
export function periodStats(prefix) {
  const vis = S.visits.filter((v) => v.d.startsWith(prefix));
  const days = new Set(vis.map((v) => v.d)), stores = new Set(vis.map((v) => v.s));
  const stampsNew = Object.values(S.stamps).filter((x) => x.d.startsWith(prefix)).length;
  const cards = S.cards.filter((c) => c.d.startsWith(prefix)).length;
  let m = 0; for (const [d, r] of Object.entries(S.days || {})) if (d.startsWith(prefix)) m += r.m || 0;
  let act = 0; for (const [d, n] of Object.entries(S.pgDay || {})) if (d.startsWith(prefix)) act += n || 0;
  const per = {}; vis.forEach((v) => { (per[v.s] = per[v.s] || new Set()).add(v.d); });
  const top = Object.entries(per).map(([id, s]) => ({ st: BYID.get(id), days: s.size, reg: G.regularInfo(id) })).filter((x) => x.st).sort((a, b) => b.days - a.days).slice(0, 3);
  const reads = allReads().filter((r) => r.d.startsWith(prefix));
  return { prefix, visitDays: days.size, visits: vis.length, stores: stores.size, stampsNew, cards, m, pages: pagesOf(m), earned: act + pagesOf(m), top, readN: reads.length, readMin: reads.reduce((a, r) => a + (r.min || 0), 0) };
}
export function monthsBack(n) { const out = []; const d = new Date(); d.setDate(1); for (let i = 0; i < n; i++) { out.unshift(monthKey(d)); d.setMonth(d.getMonth() - 1); } return out; }
