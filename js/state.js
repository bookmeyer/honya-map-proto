// 記録（この端末の中だけ）。版の違いを吸収して読み込み、まとめて書き込む
import { SKINS, MAP_SKINS, STORAGE_KEY, LEGACY_KEYS, APP_VER, PROFILE_Q } from './config.js?v=0.34.1';
import { $, emit, debounce } from './util.js?v=0.34.1';

export const empty = () => ({
  v: 4, visits: [], cards: [], wants: [], custom: [], stamps: {}, pg: 0, pgDay: {},
  claimedW: {}, claimedD: {}, rallyDone: {}, featDone: {}, looks: {},
  hidden: {}, renames: {}, days: {}, posts: [], shares: [], reading: [], trips: [], trip: null, seen: 0, lastPos: null, shareCount: 0, evLog: {}, evTitles: [], outbox: [], repOut: [], actOut: [], meetOut: [], attrOut: [], reported: [], picks: {}, mapFix: {}, mapAdd: {},
  settings: { theme: 'light', sound: false, avatar: '', handle: '', wantAlert: true, wantAlertM: 2000, dev: '', joinCode: '', privacyV10: 0 }, createdAt: Date.now(),
});
export let S = empty();
// 読み込んだ記録の確かめ（v0.15.3 セキュリティ）：__proto__ などの名前は入れない・入れ物の型・日付・数・アイコン・URL・座標・着せ替えの名前
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const plain = (x) => { if (!x || typeof x !== 'object' || Array.isArray(x)) return {}; const o = {}; for (const k of Object.keys(x)) if (!BAD_KEYS.has(k)) o[k] = x[k]; return o; };
const isDay = (x) => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x);
const num = (x, d = 0) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
const isPt = (p) => Array.isArray(p) && p.length === 2 && p.every((x) => typeof x === 'number' && Number.isFinite(x));
const HEX = /^#[0-9A-Fa-f]{6}$/;
const POST_RE = /^https?:\/\/(www\.|mobile\.)?(x|twitter)\.com\//i;
const AVATAR_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
function cleanProfile(p) {
  if (!p || typeof p !== 'object' || !p.a || typeof p.a !== 'object') return null;
  const a = {};
  for (const q of PROFILE_Q) {
    const v = p.a[q.k];
    if (q.pref) { if (typeof v === 'string' && /^(0[1-9]|[1-3]\d|4[0-7])$/.test(v)) a[q.k] = v; continue; }
    const codes = new Set(q.o.map((x) => x[0]));
    if (q.max) { if (Array.isArray(v)) { const arr = [...new Set(v.filter((x) => codes.has(x)))].slice(0, q.max); if (arr.length) a[q.k] = arr; } } else if (codes.has(v)) a[q.k] = v;
  }
  return { a, d: isDay(p.d) ? p.d : '', send: Object.keys(a).length > 0 }; // v0.20.1：答えがあれば、統計データとして送る
}
function sanitize(o) {
  for (const k of ['visits', 'cards', 'wants', 'custom', 'posts', 'shares', 'reading', 'trips', 'reads', 'evTitles', 'outbox', 'repOut', 'actOut', 'meetOut', 'attrOut', 'reported']) if (!Array.isArray(o[k])) o[k] = [];
  for (const k of ['stamps', 'pgDay', 'claimedW', 'claimedD', 'rallyDone', 'featDone', 'looks', 'hidden', 'renames', 'days', 'evLog', 'picks', 'mapFix', 'mapAdd']) o[k] = plain(o[k]);
  for (const k of ['pg', 'seen', 'shareCount']) o[k] = num(o[k]);
  const ok = (x) => x && typeof x === 'object';
  o.visits = o.visits.filter((v) => ok(v) && isDay(v.d) && typeof v.s === 'string');
  o.cards = o.cards.filter((c) => ok(c) && isDay(c.d));
  o.custom = o.custom.filter((c) => ok(c) && typeof c.i === 'string' && num(c.la, NaN) === c.la && num(c.lo, NaN) === c.lo);
  o.posts = o.posts.filter((p) => ok(p) && isDay(p.d) && typeof p.url === 'string' && POST_RE.test(p.url));
  o.reading = o.reading.filter((b) => ok(b) && typeof b.id === 'string' && isDay(b.d)).map((b) => Object.assign(b, { done: isDay(b.done) ? b.done : '', dm: isDay(b.dm) ? b.dm : '', sato: isDay(b.sato) ? b.sato : '', tSato: num(b.tSato) })); // sato＝本の里帰りの日（v0.24.0）
  o.reads = o.reads.filter((r) => ok(r) && isDay(r.d)).map((r) => Object.assign(r, { min: num(r.min), pg: num(r.pg), t0: num(r.t0), t1: num(r.t1), p0: isPt(r.p0) ? r.p0 : null, p1: isPt(r.p1) ? r.p1 : null, pl: ok(r.pl) && ['store', 'move', 'stay'].includes(r.pl.k) ? { k: r.pl.k, s: String(r.pl.s || ''), n: String(r.pl.n || ''), m: num(r.pl.m) } : null }));
  o.trips = o.trips.filter((g) => ok(g) && isDay(g.d)).map((g) => Object.assign(g, { min: num(g.min), m: num(g.m) }));
  o.evTitles = o.evTitles.filter((x) => ok(x) && isDay(x.d));
  const str = (x, n) => (typeof x === 'string' ? x.slice(0, n) : ''); // まだ送れていない店の報告（v0.17.0）
  o.repOut = o.repOut.filter((r) => ok(r) && ['closed', 'rename', 'add'].includes(r.kind) && typeof r.store === 'string').slice(-50).map((r) => ({ kind: r.kind, store: str(r.store, 40), orig: str(r.orig, 80), name: str(r.name, 80), note: str(r.note, 200), lat: num(r.lat, null), lon: num(r.lon, null), place: str(r.place, 8), at: str(r.at, 40) }));
  o.actOut = o.actOut.filter((x) => ok(x) && ['open', 'read', 'done', 'sato', 'tabi'].includes(x.k) && typeof x.id === 'string' && /^[a-z][0-9a-z-]{1,23}$/.test(x.id)).slice(-500).map((x) => ((x.k === 'tabi' && ['open', 'share'].includes(x.sub)) || (x.k === 'open' && ['app', 'web', 'home', 'pc'].includes(x.sub)) ? { k: x.k, id: x.id, at: str(x.at, 40), sub: x.sub } : { k: x.k, id: x.id, at: str(x.at, 40) })); // まだ送れていない読書と使い方の記録（v0.25.0）
  o.meetOut = o.meetOut.filter((x) => ok(x) && typeof x.store === 'string' && typeof x.isbn === 'string').slice(-200).map((x) => ({ store: str(x.store, 40), isbn: str(x.isbn, 13), at: str(x.at, 40) })); // 出会った本（v0.26.0・端末の番号なしで送る）
  o.attrOut = o.attrOut.filter((x) => ok(x) && /^97[89]\d{10}$/.test(x.isbn) && /^\d{4}-\d{2}$/.test(x.m)).slice(-200).map((x) => ({ isbn: x.isbn, m: x.m, gen: /^(10|20|30|40|50|60|70)$/.test(x.gen) ? x.gen : '', sex: /^[fmxn]$/.test(x.sex) ? x.sex : '', after: num(x.after) })); // 出会った本の世代・性別（v0.29.0・店と日なし）
  o.reported = o.reported.filter((r) => ok(r) && typeof r.k === 'string').slice(-300).map((r) => ({ k: str(r.k, 10), s: str(r.s, 40), la: num(r.la, null), lo: num(r.lo, null), d: isDay(r.d) ? r.d : '' })); // 送った報告（地図守り）
  for (const [k, v] of Object.entries(o.picks)) { if (!ok(v) || typeof v.title !== 'string') { delete o.picks[k]; continue; } o.picks[k] = { v: num(v.v), title: str(v.title, 80), author: str(v.author, 60), isbn: str(v.isbn, 13), who: str(v.who, 20), shelf: str(v.shelf, 40), hint: str(v.hint, 40), pics: num(v.pics), d: isDay(v.d) ? v.d : '' }; } // 開いた書店員さんの1冊（v0.26.0）
  for (const [k, v] of Object.entries(o.stamps)) if (!ok(v) || !isDay(v.d)) delete o.stamps[k];
  for (const [k, v] of Object.entries(o.days)) if (!isDay(k) || !ok(v)) delete o.days[k]; else { v.m = num(v.m); v.v = num(v.v); }
  for (const [k, v] of Object.entries(o.pgDay)) if (!isDay(k)) delete o.pgDay[k]; else o.pgDay[k] = num(v);
  for (const [k, v] of Object.entries(o.evLog)) if (!ok(v) || !ok(v.frame) || !HEX.test(v.frame.color) || (v.special && !(ok(v.special) && HEX.test(v.special.color))) || (v.goal && !(ok(v.goal) && Number.isInteger(v.goal.count)))) delete o.evLog[k];
  if (o.gimport) o.gimport = ok(o.gimport) ? { n: num(o.gimport.n), d: isDay(o.gimport.d) ? o.gimport.d : '' } : null;
  o.trip = ok(o.trip) && num(o.trip.t, NaN) === o.trip.t ? Object.assign(o.trip, { p0: isPt(o.trip.p0) ? o.trip.p0 : null }) : null;
  o.lastPos = ok(o.lastPos) && num(o.lastPos.lat, NaN) === o.lastPos.lat && num(o.lastPos.lon, NaN) === o.lastPos.lon ? { lat: o.lastPos.lat, lon: o.lastPos.lon } : null;
  if (o.lastBook != null && typeof o.lastBook !== 'string') delete o.lastBook;
  o.profile = cleanProfile(o.profile); // プロフィール（v0.20.0）：決まったコードだけ残す
  if (o.titleAt != null) { if (!ok(o.titleAt)) delete o.titleAt; else for (const [k, v] of Object.entries(o.titleAt)) if (!/^[a-z0-9_]{1,40}$/i.test(k) || !(typeof v === 'number' && Number.isFinite(v))) delete o.titleAt[k]; } // 称号をもらった時（v0.34.0）
  o.profOut = ok(o.profOut) && ['put', 'del'].includes(o.profOut.op) ? { op: o.profOut.op } : null;
  const s = o.settings;
  s.avatar = typeof s.avatar === 'string' && s.avatar.length < 400000 && AVATAR_RE.test(s.avatar) ? s.avatar : '';
  s.handle = typeof s.handle === 'string' ? s.handle.slice(0, 20) : '';
  if (s.avatarKind != null && !(typeof s.avatarKind === 'string' && /^[a-z]{1,12}$/.test(s.avatarKind))) delete s.avatarKind; // アイコンの種類（v0.21.0）
  if (s.openDay != null && !isDay(s.openDay)) delete s.openDay; // その日に開いたことを送った日（v0.25.0）
  if (s.moveId != null && !(typeof s.moveId === 'string' && /^[0-9a-f]{64}$/.test(s.moveId))) delete s.moveId; // 引き継ぎコードで移したか（v0.28.0）
  for (const k of ['moveAt', 'moved', 'homeAsk', 'dayN']) if (s[k] != null && !(typeof s[k] === 'number' && Number.isFinite(s[k]))) delete s[k];
  for (const k of ['dayLast', 'pfLater']) if (s[k] != null && !isDay(s[k])) delete s[k]; // 開いた日を数える・9つの質問を「あとで」にした日（v0.33.0。端末の中だけ）
  if (s.movedStay != null && s.movedStay !== 1) delete s.movedStay;
  if (s.meetAttr != null && typeof s.meetAttr !== 'boolean') delete s.meetAttr; // 出会った本に世代と性別を添える（v0.29.0。はじめはオン）
  s.joinCode = typeof s.joinCode === 'string' && /^[a-z0-9_-]{2,40}$/.test(s.joinCode) ? s.joinCode : '';
  s.wantAlertM = num(s.wantAlertM, 2000);
  if (!['light', 'dark', 'auto'].includes(s.theme)) s.theme = 'light';
  if (s.skin != null && !Object.hasOwn(SKINS, s.skin)) delete s.skin;
  if (s.mapSkin != null && !Object.hasOwn(MAP_SKINS, s.mapSkin)) delete s.mapSkin;
}
function ensure(j) {
  const src = plain(j); const out = Object.assign(empty(), src);
  out.settings = Object.assign(empty().settings, plain(src.settings)); // ふつうの値の上に、読み込んだ設定を重ねる（v0.15.3：前は読み込んだ設定だけになっていた）
  delete out.ink; // インクは廃止（v0.8.6）
  delete out.settings.sendLog; // 参加の記録のオン・オフは廃止（v0.22.2。いつも送る）
  // v0.9.1：明るい見た目が基本。これまでの「自動」は一度だけ「明」に置き換える（端末が暗い設定だと、アプリまで暗くなっていたため）。自分で選び直した「自動」はそのまま
  if (out.settings.theme === 'auto' && !out.settings.themeV9) out.settings.theme = 'light';
  out.settings.themeV9 = 1;
  // v0.23.0：音は最初「なし」に（本屋さんや図書館は静かな場所なので。テストプレイの声「マナーモードでも鳴る」）。いま使っている人も一度だけ「なし」に戻す。そのあと自分でONにしたものはそのまま
  if (!out.settings.soundV23) { out.settings.sound = false; out.settings.soundV23 = 1; }
  if (j && j.claimed && !j.claimedW) out.claimedW = j.claimed; // 旧版
  if (j && j.pg == null && j.xp != null) out.pg = Math.round(j.xp / 10); // 経験値（XP）→ ページ（10分の1）
  delete out.xp;
  sanitize(out);
  out.v = 4; return out;
}
export function load() {
  let j = null;
  try { j = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (e) { j = null; }
  if (!j) { for (const k of LEGACY_KEYS) { try { const old = JSON.parse(localStorage.getItem(k) || 'null'); if (old && typeof old === 'object') { j = old; break; } } catch (e) {} } }
  S = ensure(j);
  return S;
}
const write = () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(S)); emit('saved'); } catch (e) { emit('save-error', e); } };
export const save = debounce(write, 150);
export const saveNow = write;
export function replace(data) { S = ensure(data); saveNow(); emit('replaced'); return S; }
export function reset() { const seen = S.seen, settings = S.settings, sent = !!(S.profile && S.profile.send); S = empty(); S.seen = seen; S.settings = settings; if (sent) S.profOut = { op: 'del' }; /* 運営に送ったプロフィールも消す（v0.20.0。端末の番号は同じまま） */ try { localStorage.removeItem('meguri_events_v1'); localStorage.removeItem('meguri_api'); } catch (e) {} saveNow(); emit('replaced'); return S; } // イベントの控え・試しの受け口も消す（v0.15.3）
export function exportJSON() { return JSON.stringify({ app: 'honya-map', ver: APP_VER, at: new Date().toISOString(), data: S }, null, 1); }
export function parseImport(text) { const j = JSON.parse(text); const d = j.data || j; if (!d || !Array.isArray(d.visits)) throw new Error('bad'); return d; }
