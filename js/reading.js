// 読書：いま読んでいる本・読書の時間（はじめる〜おわる）・どこで読んだか・前回の本。画面は reading_ui.js
// 中の名前は v0.14 の「移動読書」のなごり：S.trip＝いま計っている読書／S.reads＝おわった読書／S.trips の read=1＝v0.14.0〜0.14.3 の読書の記録（allReads でいっしょに数える）
import { READ } from './config.js?v=0.22.1';
import { emit, todayISO, dist, fmtDist, on, fmtDate, fmtMin } from './util.js?v=0.22.1';
import { S, save } from './state.js?v=0.22.1';
import { POS } from './position.js?v=0.22.1';
import { STORES, BYID } from './data.js?v=0.22.1';
import * as G from './game.js?v=0.22.1';

// 読書を取り消す（「読んでいなかった」）。v0.14.3 までの記録（店と店のあいだに入れていた分）にも使える
export function undoRead(id) {
  const r = (S.reads || []).find((x) => x.id === id); if (r && !r.off) { r.off = 1; if (r.pg) G.addPages(-r.pg); save(); emit('records'); return true; }
  const g = (S.trips || []).find((x) => x.id === id); if (!g || !g.read) return false; g.read = 0; if (g.pg) { G.addPages(-g.pg); g.pg = 0; } save(); emit('records'); return true;
}
// いま読んでいる本（何冊でも）。カードから入れると「どこで出会ったか」がつながる
const sameTitle = (a, b) => String(a || '').normalize('NFKC').replace(/\s/g, '') === String(b || '').normalize('NFKC').replace(/\s/g, '');
export const reading = () => (S.reading || []).filter((b) => !b.done);
export const finished = () => (S.reading || []).filter((b) => b.done).sort((x, y) => (y.tDone || 0) - (x.tDone || 0));
// 読書の記録：「読書をはじめる」から「おわる」までの時間（v0.14.4）。v0.14.3 までの記録（店と店のあいだに入れていた分）もふくめる
export const allReads = () => [...(S.reads || []).filter((r) => !r.off).map((r) => ({ id: r.id, d: r.d, t: r.t0, min: r.min, book: r.book, title: r.title })), ...(S.trips || []).filter((g) => g.read).map((g) => ({ id: g.id, d: g.d, t: g.t, min: g.min || 0, book: g.book, title: g.title }))];
export const readTimes = (id) => allReads().filter((r) => r.book === id).length;
export const readMinOf = (id) => allReads().filter((r) => r.book === id).reduce((a, r) => a + (r.min || 0), 0);
export const inReading = (c) => reading().some((b) => b.card === c.id || (c.isbn && b.isbn === c.isbn) || sameTitle(b.title, c.title));
export function addReading(book) {
  S.reading = S.reading || [];
  const ex = S.reading.find((b) => !b.done && ((book.card && b.card === book.card) || (book.isbn && b.isbn === book.isbn) || sameTitle(b.title, book.title))); if (ex) return ex;
  const c = book.card ? S.cards.find((x) => x.id === book.card) : book.isbn ? S.cards.slice().reverse().find((x) => x.isbn === book.isbn) : null; const t = Date.now();
  const b = { id: 'b' + t, title: book.title, author: book.author || '', isbn: book.isbn || '', cover: book.cover || '', card: c ? c.id : '', s: c ? c.s : '', sn: c ? c.sn : '', dm: c ? c.d : '', d: todayISO(), t, done: '', tDone: 0 };
  S.reading.push(b); save(); emit('records'); return b;
}
export const readingFromCard = (c) => addReading({ title: c.title, author: c.author, isbn: c.isbn, cover: c.cover, card: c.id });
export function finishReading(id) { const b = (S.reading || []).find((x) => x.id === id); if (!b || b.done) return null; const read = S.trip && S.trip.book === id ? endTrip() : null; /* 読書中なら、ここまでの時間を残して終える（v0.15.1。前は記録せずに消えていた） */ b.done = todayISO(); b.tDone = Date.now(); if (S.lastBook === id) S.lastBook = ''; save(); emit('records'); return { book: b, read: read && read.min >= 1 ? read : null }; } // 本と、ここまでの読書（1分より短いときは null）
export function unfinishReading(id) { const b = (S.reading || []).find((x) => x.id === id); if (!b) return; b.done = ''; b.tDone = 0; save(); emit('records'); }
export function dropReading(id) { S.reading = (S.reading || []).filter((x) => x.id !== id); if (S.trip && S.trip.book === id) S.trip.book = ''; /* 読書は続ける（本だけ外す。v0.15.1） */ if (S.lastBook === id) S.lastBook = ''; save(); emit('trip'); emit('records'); }
// 読書中：はじめてから12時間を過ぎたものは、押したまま忘れたものとして流す
export function activeTrip() { if (S.trip && Date.now() - S.trip.t > 12 * 3600 * 1000) { S.trip = null; save(); } return S.trip || null; }
export const tripMin = (tr = S.trip) => (tr ? Math.floor((Date.now() - tr.t) / 60000) : 0);
// どこで読んだか（v0.15.0）：「読書をはじめる」と「おわる」はアプリを開いて押すので、その2か所だけはわかる（閉じていたあいだの道のりはわからない）
// 本屋・図書館のそば（100m）＝「○○のそばで」／はじめとおわりが1km以上＝「移動しながら」／ほか＝「その場で」。場所は端末の中だけ。設定で止められる（S.settings.readPlace）
const PLACE = { nearM: 100, moveM: 1000 };
const placeOn = () => S.settings.readPlace !== false;
function herePos(maxAge = 120000) { return placeOn() && !POS.fake && POS.lat != null && Date.now() - POS.at < maxAge ? [+POS.lat.toFixed(4), +POS.lon.toFixed(4)] : null; }
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
// 読書をはじめる（地図のボタンから、どこでも。本も読みかたも選ばない）。出発した店＝今日さいごにスタンプを押した店（2時間以内）。同じ店でもう一度押しても終わらないため
export function startTrip(bookId = '') {
  const today = todayISO(); let from = '', fn = '';
  const lv = G.lastNearVisitToday(); if (lv && Date.now() - lv.t < 2 * 3600 * 1000) { from = lv.s; fn = (BYID.get(lv.s) || lv).n || ''; }
  if (bookId) S.lastBook = bookId;
  S.trip = { from, fn, d: today, t: Date.now(), book: bookId || lastBook(), p0: herePos() }; save(); emit('trip');
}
// 読書中に、読んでいる本をえらぶ（えらばなくてよい）
export function setTripBook(id) { const tr = activeTrip(); if (!tr) return; tr.book = id || ''; S.lastBook = id || ''; save(); emit('trip'); }
// 前回の本（v0.15.1 ぶっくまさん「毎回選ぶのではなく、前回の本を覚えておいて」）：前の読書で読んでいた本で、そのままはじめる。外した本・読み終えた本は使わない
// 前の読書で本を外していたら、本なしのまま。S.lastBook がまだない人は、いちばん新しい読書の記録の本
function lastBook() { const id = S.lastBook !== undefined ? S.lastBook : ([...(S.reads || [])].reverse().find((r) => !r.off && r.book) || {}).book || ''; return id && reading().some((b) => b.id === id) ? id : ''; }
export function cancelTrip() { S.trip = null; save(); emit('trip'); }
// 読書を終える（「おわる」・おわるを押し忘れて次の本屋に着いたとき）。読んだ時間だけページ（1分で1ページ・1回60ページまで）。1分より短いときは記録しない
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
