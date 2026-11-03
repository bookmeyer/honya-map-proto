// 記録（この端末の中だけ）。版の違いを吸収して読み込み、まとめて書き込む
import { SKINS, MAP_SKINS, STORAGE_KEY, LEGACY_KEYS, APP_VER } from './config.js?v=0.18.2';
import { $, emit, debounce } from './util.js?v=0.18.2';

export const empty = () => ({
  v: 4, visits: [], cards: [], wants: [], custom: [], stamps: {}, pg: 0, pgDay: {},
  claimedW: {}, claimedD: {}, rallyDone: {}, featDone: {}, looks: {},
  hidden: {}, renames: {}, days: {}, posts: [], shares: [], reading: [], trips: [], trip: null, seen: 0, lastPos: null, shareCount: 0, evLog: {}, evTitles: [], outbox: [], repOut: [],
  settings: { theme: 'light', sound: true, avatar: '', handle: '', wantAlert: true, wantAlertM: 2000, dev: '', joinCode: '', sendLog: true, privacyV10: 0 }, createdAt: Date.now(),
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
function sanitize(o) {
  for (const k of ['visits', 'cards', 'wants', 'custom', 'posts', 'shares', 'reading', 'trips', 'reads', 'evTitles', 'outbox', 'repOut']) if (!Array.isArray(o[k])) o[k] = [];
  for (const k of ['stamps', 'pgDay', 'claimedW', 'claimedD', 'rallyDone', 'featDone', 'looks', 'hidden', 'renames', 'days', 'evLog']) o[k] = plain(o[k]);
  for (const k of ['pg', 'seen', 'shareCount']) o[k] = num(o[k]);
  const ok = (x) => x && typeof x === 'object';
  o.visits = o.visits.filter((v) => ok(v) && isDay(v.d) && typeof v.s === 'string');
  o.cards = o.cards.filter((c) => ok(c) && isDay(c.d));
  o.custom = o.custom.filter((c) => ok(c) && typeof c.i === 'string' && num(c.la, NaN) === c.la && num(c.lo, NaN) === c.lo);
  o.posts = o.posts.filter((p) => ok(p) && isDay(p.d) && typeof p.url === 'string' && POST_RE.test(p.url));
  o.reading = o.reading.filter((b) => ok(b) && typeof b.id === 'string' && isDay(b.d)).map((b) => Object.assign(b, { done: isDay(b.done) ? b.done : '', dm: isDay(b.dm) ? b.dm : '' }));
  o.reads = o.reads.filter((r) => ok(r) && isDay(r.d)).map((r) => Object.assign(r, { min: num(r.min), pg: num(r.pg), t0: num(r.t0), t1: num(r.t1), p0: isPt(r.p0) ? r.p0 : null, p1: isPt(r.p1) ? r.p1 : null, pl: ok(r.pl) && ['store', 'move', 'stay'].includes(r.pl.k) ? { k: r.pl.k, s: String(r.pl.s || ''), n: String(r.pl.n || ''), m: num(r.pl.m) } : null }));
  o.trips = o.trips.filter((g) => ok(g) && isDay(g.d)).map((g) => Object.assign(g, { min: num(g.min), m: num(g.m) }));
  o.evTitles = o.evTitles.filter((x) => ok(x) && isDay(x.d));
  const str = (x, n) => (typeof x === 'string' ? x.slice(0, n) : ''); // まだ送れていない店の報告（v0.17.0）
  o.repOut = o.repOut.filter((r) => ok(r) && ['closed', 'rename', 'add'].includes(r.kind) && typeof r.store === 'string').slice(-50).map((r) => ({ kind: r.kind, store: str(r.store, 40), orig: str(r.orig, 80), name: str(r.name, 80), note: str(r.note, 200), lat: num(r.lat, null), lon: num(r.lon, null), place: str(r.place, 8), at: str(r.at, 40) }));
  for (const [k, v] of Object.entries(o.stamps)) if (!ok(v) || !isDay(v.d)) delete o.stamps[k];
  for (const [k, v] of Object.entries(o.days)) if (!isDay(k) || !ok(v)) delete o.days[k]; else { v.m = num(v.m); v.v = num(v.v); }
  for (const [k, v] of Object.entries(o.pgDay)) if (!isDay(k)) delete o.pgDay[k]; else o.pgDay[k] = num(v);
  for (const [k, v] of Object.entries(o.evLog)) if (!ok(v) || !ok(v.frame) || !HEX.test(v.frame.color) || (v.special && !(ok(v.special) && HEX.test(v.special.color))) || (v.goal && !(ok(v.goal) && Number.isInteger(v.goal.count)))) delete o.evLog[k];
  if (o.gimport) o.gimport = ok(o.gimport) ? { n: num(o.gimport.n), d: isDay(o.gimport.d) ? o.gimport.d : '' } : null;
  o.trip = ok(o.trip) && num(o.trip.t, NaN) === o.trip.t ? Object.assign(o.trip, { p0: isPt(o.trip.p0) ? o.trip.p0 : null }) : null;
  o.lastPos = ok(o.lastPos) && num(o.lastPos.lat, NaN) === o.lastPos.lat && num(o.lastPos.lon, NaN) === o.lastPos.lon ? { lat: o.lastPos.lat, lon: o.lastPos.lon } : null;
  if (o.lastBook != null && typeof o.lastBook !== 'string') delete o.lastBook;
  const s = o.settings;
  s.avatar = typeof s.avatar === 'string' && s.avatar.length < 400000 && AVATAR_RE.test(s.avatar) ? s.avatar : '';
  s.handle = typeof s.handle === 'string' ? s.handle.slice(0, 20) : '';
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
  // v0.9.1：明るい見た目が基本。これまでの「自動」は一度だけ「明」に置き換える（端末が暗い設定だと、アプリまで暗くなっていたため）。自分で選び直した「自動」はそのまま
  if (out.settings.theme === 'auto' && !out.settings.themeV9) out.settings.theme = 'light';
  out.settings.themeV9 = 1;
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
export function reset() { const seen = S.seen, settings = S.settings; S = empty(); S.seen = seen; S.settings = settings; try { localStorage.removeItem('meguri_events_v1'); localStorage.removeItem('meguri_api'); } catch (e) {} saveNow(); emit('replaced'); return S; } // イベントの控え・試しの受け口も消す（v0.15.3）
export function exportJSON() { return JSON.stringify({ app: 'honya-map', ver: APP_VER, at: new Date().toISOString(), data: S }, null, 1); }
export function parseImport(text) { const j = JSON.parse(text); const d = j.data || j; if (!d || !Array.isArray(d.visits)) throw new Error('bad'); return d; }
