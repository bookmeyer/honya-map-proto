// 旅の記録：歩いた距離（ページ）・その日の物語・月のふり返り・行きたい店のお知らせ・投稿の記録・Googleマップの★の読み込み・店と店のあいだ・移動読書・いま読んでいる本
// 位置は、アプリを開いて現在地を追っているあいだだけ使う（ブラウザの決まりで、閉じているあいだは測れない）。閉じていたあいだの道のりは、次の店でスタンプを押したときに、前の店からのまっすぐの距離で足す（v0.14）
import { WALK, RANGE_M, SEG, READ } from './config.js?v=0.15.0';
import { S, save } from './state.js?v=0.15.0';
import { STORES, BYID, rarityOf } from './data.js?v=0.15.0';
import * as G from './game.js?v=0.15.0';
import { dist, todayISO, prefOf, hash32, fmtDist, fmtDate, monthKey, emit, on } from './util.js?v=0.15.0';
import { POS } from './position.js?v=0.15.0';

function dayRec(d = todayISO()) { S.days = S.days || {}; const r = (S.days[d] = S.days[d] || { m: 0, v: 0 }); r.pass = r.pass || {}; r.alert = r.alert || {}; return r; }
export const pagesOf = (m) => Math.floor((m || 0) / WALK.pageM);
export const stepsOf = (m) => Math.round((m || 0) / WALK.stepM);
export const kmOf = (m) => ((m || 0) / 1000).toFixed((m || 0) < 10000 ? 1 : 0);
export const todayWalk = () => ((S.days || {})[todayISO()] || {}).m || 0;
export const totalWalk = () => Object.values(S.days || {}).reduce((a, r) => a + (r.m || 0), 0);
export const totalPages = () => pagesOf(totalWalk());

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
export const wantsInBounds = (b) => S.wants.map((id) => BYID.get(id)).filter((st) => st && st.la >= b.s && st.la <= b.n && st.lo >= b.w && st.lo <= b.e);
export const wantsSorted = (lat, lon) => S.wants.map((id) => BYID.get(id)).filter(Boolean).map((st) => ({ st, d: dist(lat, lon, st.la, st.lo) })).sort((a, b) => a.d - b.d);

// ---- 投稿・シェアの記録 ----
export function addPost({ url, text, sid }) { S.posts = S.posts || []; const t = Date.now(); S.posts.push({ id: 'p' + t, t, d: todayISO(), url: url || '', text: text || '', s: sid || '' }); save(); }
export function deletePost(id) { S.posts = (S.posts || []).filter((p) => p.id !== id); save(); }
const SHARE_LBL = { stamp: 'スタンプの画像をシェアした。', regular: '常連度をシェアした。', card: 'カードの画像をシェアした。', profile: 'プレイヤーカードをシェアした。', story: 'この日の物語をシェアした。' };

// ---- 店と店のあいだ・移動読書・いま読んでいる本（v0.14） ----
// 次の店でスタンプを押したときに呼ぶ（G.checkin より先）。前の店から、まだ数えていない道のりを歩いたページに足す。前の店からあとの移動読書も、まとめて見せる
export function arrive(st, { near, trial }) {
  if (!near || trial || st.demo) return null;
  const now = Date.now(), today = todayISO();
  let pv = null; for (let i = S.visits.length - 1; i >= 0; i--) { const v = S.visits[i]; if (v.d !== today) break; if (v.near && !v.trial) { pv = v; break; } }
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
// 移動読書を取り消す（「読んでいなかった」）。v0.14.3 までの記録（店と店のあいだに入れていた分）にも使える
export function undoRead(id) {
  const r = (S.reads || []).find((x) => x.id === id); if (r && !r.off) { r.off = 1; if (r.pg) G.addPages(-r.pg); save(); emit('records'); return true; }
  const g = (S.trips || []).find((x) => x.id === id); if (!g || !g.read) return false; g.read = 0; if (g.pg) { G.addPages(-g.pg); g.pg = 0; } save(); emit('records'); return true;
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
// いま読んでいる本（何冊でも）。カードから入れると「どこで出会ったか」がつながる
const sameTitle = (a, b) => String(a || '').normalize('NFKC').replace(/\s/g, '') === String(b || '').normalize('NFKC').replace(/\s/g, '');
export const reading = () => (S.reading || []).filter((b) => !b.done);
export const finished = () => (S.reading || []).filter((b) => b.done).sort((x, y) => (y.tDone || 0) - (x.tDone || 0));
// 移動読書の記録：「今から移動読書」から「おわる」までの時間（v0.14.4）。v0.14.3 までの記録（店と店のあいだに入れていた分）もふくめる
export const allReads = () => [...(S.reads || []).filter((r) => !r.off).map((r) => ({ id: r.id, d: r.d, t: r.t0, min: r.min, book: r.book, title: r.title })), ...(S.trips || []).filter((g) => g.read).map((g) => ({ id: g.id, d: g.d, t: g.t, min: g.min || 0, book: g.book, title: g.title }))];
export const readTimes = (id) => allReads().filter((r) => r.book === id).length;
export const readMinOf = (id) => allReads().filter((r) => r.book === id).reduce((a, r) => a + (r.min || 0), 0);
export const fmtMin = (m) => (m >= 60 ? `${Math.floor(m / 60)}時間${m % 60 ? `${m % 60}分` : ''}` : `${m}分`);
export const inReading = (c) => reading().some((b) => b.card === c.id || (c.isbn && b.isbn === c.isbn) || sameTitle(b.title, c.title));
export function addReading(book) {
  S.reading = S.reading || [];
  const ex = S.reading.find((b) => !b.done && ((book.card && b.card === book.card) || (book.isbn && b.isbn === book.isbn) || sameTitle(b.title, book.title))); if (ex) return ex;
  const c = book.card ? S.cards.find((x) => x.id === book.card) : book.isbn ? S.cards.slice().reverse().find((x) => x.isbn === book.isbn) : null; const t = Date.now();
  const b = { id: 'b' + t, title: book.title, author: book.author || '', isbn: book.isbn || '', cover: book.cover || '', card: c ? c.id : '', s: c ? c.s : '', sn: c ? c.sn : '', dm: c ? c.d : '', d: todayISO(), t, done: '', tDone: 0 };
  S.reading.push(b); save(); emit('records'); return b;
}
export const readingFromCard = (c) => addReading({ title: c.title, author: c.author, isbn: c.isbn, cover: c.cover, card: c.id });
export function finishReading(id) { const b = (S.reading || []).find((x) => x.id === id); if (!b || b.done) return null; b.done = todayISO(); b.tDone = Date.now(); if (S.trip && S.trip.book === id) S.trip = null; save(); emit('records'); return b; }
export function unfinishReading(id) { const b = (S.reading || []).find((x) => x.id === id); if (!b) return; b.done = ''; b.tDone = 0; save(); emit('records'); }
export function dropReading(id) { S.reading = (S.reading || []).filter((x) => x.id !== id); if (S.trip && S.trip.book === id) S.trip = null; save(); emit('records'); }
// 移動読書中：はじめてから12時間を過ぎたものは、押したまま忘れたものとして流す
export function activeTrip() { if (S.trip && Date.now() - S.trip.t > 12 * 3600 * 1000) { S.trip = null; save(); } return S.trip || null; }
export const tripMin = (tr = S.trip) => (tr ? Math.floor((Date.now() - tr.t) / 60000) : 0);
// どこで読んだか（v0.15.0）：「読書をはじめる」と「おわる」はアプリを開いて押すので、その2か所だけはわかる（閉じていたあいだの道のりはわからない）
// 本屋・図書館のそば（100m）＝「○○のそばで」／はじめとおわりが1km以上＝「移動しながら」／ほか＝「その場で」。場所は端末の中だけ。設定で止められる（S.settings.readPlace）
const PLACE = { nearM: 100, moveM: 1000 };
const placeOn = () => S.settings.readPlace !== false;
function herePos(maxAge = 120000) { return placeOn() && !POS.fake && POS.lat != null && Date.now() - POS.at < maxAge ? [+POS.lat.toFixed(5), +POS.lon.toFixed(5)] : null; }
function nearStore(p) { if (!p) return null; let best = null, bd = PLACE.nearM; for (const s of STORES) { if (s.demo) continue; const d = dist(p[0], p[1], s.la, s.lo); if (d <= bd) { bd = d; best = s; } } return best; }
export function placeOf(p0, p1) {
  if (!p0 && !p1) return null;
  if (p0 && p1) { const m = dist(p0[0], p0[1], p1[0], p1[1]); if (m >= PLACE.moveM) return { k: 'move', m: Math.round(m) }; }
  const s = nearStore(p0) || nearStore(p1); return s ? { k: 'store', s: s.i, n: s.n } : { k: 'stay' };
}
export const placeText = (pl) => (!pl ? '' : pl.k === 'store' ? `${pl.n}のそばで` : pl.k === 'move' ? `移動しながら ${fmtDist(pl.m)}` : 'その場で'); // お知らせ・地図の印用（物語は「移動しながら（6km）、」）
// 押したときに位置がまだ届いていなければ、すぐあとに届いた位置を使う（はじめ＝2分・おわり＝3分まで）
on('pos', () => {
  if (POS.fake || POS.lat == null || !placeOn()) return; let ch = false;
  const tr = S.trip; if (tr && !tr.p0 && Date.now() - tr.t < 120000) { tr.p0 = herePos(); ch = true; }
  const r = (S.reads || [])[(S.reads || []).length - 1];
  if (r && r.p1wait) { if (Date.now() - r.t1 < 180000) { r.p1 = herePos(); r.pl = placeOf(r.p0, r.p1); } delete r.p1wait; ch = true; }
  if (ch) { save(); emit('records'); }
});
// 地図の「読んだ場所」：はじめた所に印。移動しながら読んだときは、おわった所までの点線も
export const readSpots = () => (placeOn() ? (S.reads || []).filter((r) => !r.off && r.p0) : []).map((r) => ({ id: r.id, p0: r.p0, p1: r.pl && r.pl.k === 'move' ? r.p1 : null,
  label: `${fmtDate(r.d)} ${new Date(r.t0).getHours()}時　${r.title ? `『${r.title}』を` : '本を'}${fmtMin(r.min)}${r.pl ? `（${placeText(r.pl)}）` : ''}` }));
// 移動読書をはじめる（地図のボタンから、どこでも。本も読みかたも選ばない）。出発した店＝今日さいごにスタンプを押した店（2時間以内）。同じ店でもう一度押しても終わらないため
export function startTrip(bookId = '') {
  const today = todayISO(); let from = '', fn = '';
  for (let i = S.visits.length - 1; i >= 0; i--) { const v = S.visits[i]; if (v.d !== today) break; if (v.near && !v.trial) { if (Date.now() - v.t < 2 * 3600 * 1000) { from = v.s; fn = (BYID.get(v.s) || v).n || ''; } break; } }
  S.trip = { from, fn, d: today, t: Date.now(), book: bookId || '', p0: herePos() }; save(); emit('trip');
}
// 移動読書中に、読んでいる本をえらぶ（えらばなくてよい）
export function setTripBook(id) { const tr = activeTrip(); if (!tr) return; tr.book = id || ''; save(); emit('trip'); }
export function cancelTrip() { S.trip = null; save(); emit('trip'); }
// 移動読書を終える（「おわる」・おわるを押し忘れて次の本屋に着いたとき）。読んだ時間だけページ（1分で1ページ・1回60ページまで）。1分より短いときは記録しない
export function endTrip(at = Date.now(), auto = false, endPos = null) {
  const tr = S.trip; if (!tr) return null; S.trip = null;
  const min = Math.min(READ.maxMin, Math.floor((at - tr.t) / 60000));
  if (min < 1) { save(); emit('trip'); return { min: 0 }; }
  const bk = tr.book ? (S.reading || []).find((b) => b.id === tr.book) : null;
  const r = { id: 'r' + at, d: todayISO(new Date(tr.t)), t0: tr.t, t1: at, min, pg: Math.min(READ.maxPg, Math.round(min * READ.pgPerMin)), book: bk ? bk.id : '', title: bk ? bk.title : '', from: tr.from || '', fn: tr.fn || '', auto: auto ? 1 : 0 };
  if (placeOn()) { r.p0 = tr.p0 || null; r.p1 = endPos || herePos(60000); r.pl = placeOf(r.p0, r.p1); if (!r.p1) r.p1wait = 1; } // どこで読んだか（v0.15.0）
  S.reads = S.reads || []; S.reads.push(r); if (S.reads.length > 1000) S.reads.splice(0, S.reads.length - 1000);
  G.addPages(r.pg); save(); emit('trip'); emit('records'); return r;
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
export function chapter(date = todayISO()) {
  const dates = activeDates(); let no = dates.indexOf(date) + 1; if (!no) no = dates.filter((d) => d < date).length + 1;
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
  for (const b of (S.reading || []).filter((x) => x.done === date)) { const n = readTimes(b.id); const days = b.dm ? Math.round((Date.parse(date) - Date.parse(b.dm)) / 864e5) : -1; events.push({ t: b.tDone || 0, s: `『${b.title}』を読み終えた。${b.sn ? (days > 0 ? `${b.sn}で出会ってから${days}日。` : `${b.sn}で出会ったその日に。`) : ''}${n ? `本屋と本屋のあいだで${n}回読んだ。` : ''}` }); }
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
export function chapters(limit = 30) { return activeDates().reverse().slice(0, limit).map((d) => chapter(d)); }

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

// ---- Googleマップの保存リスト（Googleデータエクスポートのファイル）を読む ----
function csvRows(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim()));
}
function coordsFromUrl(u) { let s = String(u || ''); try { s = decodeURIComponent(s); } catch (e) {} const m = s.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) || s.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || s.match(/[?&](?:q|query|ll|center)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/); return m ? { lat: +m[1], lon: +m[2] } : null; }
function nameFromUrl(u) { const m = String(u || '').match(/\/maps\/place\/([^/@?]+)/); if (!m) return ''; try { return decodeURIComponent(m[1].replace(/\+/g, ' ')); } catch (e) { return ''; } }
export function parseGoogle(text) {
  text = String(text || '').replace(/^﻿/, ''); const out = [];
  if (/^\s*[{[]/.test(text)) {
    const j = JSON.parse(text); const feats = j.features || (Array.isArray(j) ? j : []);
    for (const f of feats) {
      const p = f.properties || {}; const L = p.location || p.Location || {}; let lat = null, lon = null;
      const g = f.geometry && f.geometry.coordinates; if (g && (+g[0] || +g[1])) { lon = +g[0]; lat = +g[1]; }
      const gc = L['Geo Coordinates']; if (lat == null && gc && (+gc.Latitude || +gc.Longitude)) { lat = +gc.Latitude; lon = +gc.Longitude; }
      const url = p.google_maps_url || p['Google Maps URL'] || ''; if (lat == null) { const c = coordsFromUrl(url); if (c) { lat = c.lat; lon = c.lon; } }
      const name = L.name || L['Business Name'] || p.Title || p.name || nameFromUrl(url);
      out.push({ name: String(name || '').trim(), address: L.address || L.Address || '', lat, lon, url });
    }
  } else {
    const rows = csvRows(text); if (!rows.length) return out; const head = rows[0].map((h) => String(h).trim().toLowerCase());
    const ix = (names) => head.findIndex((h) => names.includes(h));
    const iT = ix(['title', 'タイトル', '名前', 'name']), iU = ix(['url', 'リンク']), iN = ix(['note', 'メモ']);
    for (const r of rows.slice(1)) { const url = iU >= 0 ? r[iU] : ''; const c = coordsFromUrl(url); out.push({ name: String((iT >= 0 ? r[iT] : '') || nameFromUrl(url)).trim(), address: '', lat: c ? c.lat : null, lon: c ? c.lon : null, url, note: iN >= 0 ? r[iN] : '' }); }
  }
  return out.filter((x) => x.name || x.lat != null);
}
const nrm = (s) => String(s || '').normalize('NFKC').replace(/[\s　・･]/g, '').replace(/株式会社|有限会社/g, '').toLowerCase();
export const BOOKISH = /書店|書房|書林|本屋|本の|ブック|book|古書|古本|文庫|TSUTAYA|蔦屋/i;
function sim(a, b) { a = nrm(a); b = nrm(b); if (!a || !b) return 0; if (a === b) return 3; if (a.includes(b) || b.includes(a)) return Math.min(a.length, b.length) >= 4 ? 2 : Math.min(a.length, b.length) >= 3 ? 1 : 0; const bs = new Set(b); const as = new Set(a); let common = 0; for (const ch of as) if (bs.has(ch)) common++; return common / Math.max(as.size, 1) >= 0.6 ? 1 : 0; }
export function matchGoogle(places) {
  const hits = [], misses = [];
  for (const p of places) {
    let best = null;
    if (p.lat != null) {
      for (const st of STORES) {
        if (st.demo || Math.abs(st.la - p.lat) > 0.002 || Math.abs(st.lo - p.lon) > 0.0025) continue;
        const d = dist(p.lat, p.lon, st.la, st.lo); if (d > 150) continue; const s = sim(p.name, st.n);
        if (s > 0 || (d <= 40 && BOOKISH.test(p.name))) { const score = s * 100 - d; if (!best || score > best.score) best = { st, d, score }; }
      }
    }
    if (!best && p.name) {
      const cands = STORES.filter((st) => !st.demo && sim(p.name, st.n) >= 2); const exact = cands.filter((st) => nrm(st.n) === nrm(p.name));
      const pick = exact.length === 1 ? exact[0] : cands.length === 1 ? cands[0] : null;
      const dd = pick && p.lat != null ? dist(p.lat, p.lon, pick.la, pick.lo) : null;
      if (pick && (dd == null || dd <= 1000)) best = { st: pick, d: dd }; // 位置が分かる場所は、名前が同じでも1km以内のときだけ
    }
    if (best) hits.push({ p, st: best.st, d: best.d, want: S.wants.includes(best.st.i) });
    else misses.push(Object.assign({}, p, { bookish: BOOKISH.test(p.name) }));
  }
  const seen = new Set();
  return { hits: hits.filter((h) => (seen.has(h.st.i) ? false : (seen.add(h.st.i), true))), misses };
}
