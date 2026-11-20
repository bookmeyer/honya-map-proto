// 店のページ（v0.26.0・サーバー 1.9.0）：書店員さんの1冊・いまのフェア・売場の写真・店の発信（SNS）・スタンプの写真・確かさの印
// ぶっくまさん 11/19「１冊だけでなく、複数写真公開できるように」「いま力を入れているフェアを載せたい」「Bで」（書名も来た人だけ）「シンプルに写真（画像）で」（スタンプ）
// 「行ったらなかったみたいなクレームにならないように。むしろみんなで作り上げたい」（確かさの印）
//  - 来る前（誰でも）：ヒント・ジャンル・名前の出し方・フェア・売場の写真・店の発信・スタンプの写真（api/shops.php・api/pic.php）
//  - 来たあと（その店の射程内でスタンプを押した端末だけ）：書名・著者・写真（api/pick.php。端末の番号と店の番号を POST で送る）
//  - 開いた1冊は、この端末に覚える（S.picks。写真は開いているあいだだけ）。サーバーに届かないときは、前回読んだ中身で動く
import { S, save } from './state.js?v=0.33.0';
import { todayISO, emit } from './util.js?v=0.33.0';
import { setShops, setStampData, pickOpen } from './data.js?v=0.33.0';
import { apiBase, deviceId, flush } from './events.js?v=0.33.0';

const CACHE_KEY = 'meguri_shops_v1';
const STAMP_KEY = 'meguri_stamp_imgs_v1';
const STAMP_MAX = 60; // 端末に覚えるスタンプの写真（押した店の分だけ）
const ID = /^[A-Za-z0-9_.:-]{1,40}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
export const GENRES = { lit: '小説・文芸', mys: 'ミステリー・SF・ファンタジー', ess: 'エッセイ・ノンフィクション', biz: 'ビジネス・自己啓発', hum: '人文・社会・思想', his: '歴史', sci: '科学・技術', life: '暮らし・料理・趣味', kid: '絵本・児童書', comic: 'マンガ・ライトノベル', poem: '詩歌・短歌・俳句', etc: 'そのほか' };
// 店の発信は X・Instagram・その他（11/19 ぶっくまさん。増やすときはサーバーの SHOP_SNS と、ここに足す）
export const SNS = { x: 'X', ig: 'Instagram', other: 'その他' };
export const SHOP = { map: new Map(), confirmed: new Set(), recent: new Set(), at: 0, ok: false };

const str = (x, n) => (typeof x === 'string' ? x.slice(0, n) : '');
const ids = (a, n) => (Array.isArray(a) ? a.filter((x) => Number.isInteger(x) && x > 0).slice(0, n) : []);
const https = (u) => (typeof u === 'string' && /^https:\/\/[^\s"'<>\\]+$/.test(u) && u.length <= 300 ? u : '');
// 届いた中身を確かめる（形のちがうもの・長すぎるものは入れない）
function clean(raw) {
  const m = new Map(); if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return m;
  for (const [id, v] of Object.entries(raw)) {
    if (!ID.test(id) || !v || typeof v !== 'object' || m.size >= 20000) continue;
    const o = {};
    if (v.pick && typeof v.pick === 'object' && str(v.pick.hint, 40)) o.pick = { who: str(v.pick.who, 20) || '書店員さん', hint: str(v.pick.hint, 40), genre: GENRES[v.pick.genre] ? v.pick.genre : '', pics: Number.isInteger(v.pick.pics) ? Math.max(0, Math.min(4, v.pick.pics)) : 0, v: Number.isInteger(v.pick.v) ? v.pick.v : 0, at: DAY.test(v.pick.at || '') ? v.pick.at : '' };
    if (Array.isArray(v.fairs)) { const fs = v.fairs.filter((f) => f && Number.isInteger(f.id) && str(f.name, 40)).slice(0, 3).map((f) => ({ id: f.id, name: str(f.name, 40), from: DAY.test(f.from || '') ? f.from : '', to: DAY.test(f.to || '') ? f.to : '', place: str(f.place, 40), say: str(f.say, 120), pics: ids(f.pics, 6), at: DAY.test(f.at || '') ? f.at : '' })).filter((f) => !f.to || f.to >= todayISO()); if (fs.length) o.fairs = fs; }
    if (v.shelf && typeof v.shelf === 'object') { const p = ids(v.shelf.pics, 6); if (p.length) o.shelf = { say: str(v.shelf.say, 60), pics: p, at: DAY.test(v.shelf.at || '') ? v.shelf.at : '' }; }
    if (Array.isArray(v.sns)) { const l = v.sns.filter((x) => x && SNS[x.k] && https(x.url)).slice(0, 6).map((x) => ({ k: x.k, url: x.url })); if (l.length) o.sns = l; }
    if (Number.isInteger(v.stamp) && v.stamp > 0) o.stamp = v.stamp;
    if (Object.keys(o).length) { if (DAY.test(v.up || '')) o.up = v.up; m.set(id, o); } // up＝この店でいちばん新しい公開の日（サーバー 1.9.3〜）
  }
  return m;
}
export const picUrl = (id) => new URL('pic.php?id=' + id, apiBase()).toString();
function apply(j) {
  if (!j || typeof j !== 'object') return;
  SHOP.map = clean(j.shops);
  SHOP.confirmed = new Set(Array.isArray(j.confirmed) ? j.confirmed.filter((x) => typeof x === 'string' && ID.test(x)) : []);
  SHOP.recent = new Set(Array.isArray(j.recent) ? j.recent.filter((x) => typeof x === 'string' && ID.test(x)) : []);
  setShops(SHOP.map, picUrl); emit('shops');
}
// 前回の中身ですぐ動き、サーバーから新しいものを読む
export async function loadShops() {
  try { const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); if (c && c.j && !SHOP.ok) apply(c.j); } catch (e) {}
  try {
    const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 10000);
    const r = await fetch(new URL('shops.php', apiBase()).toString(), { cache: 'no-cache', signal: ctl.signal }); clearTimeout(tm);
    if (!r.ok) return false;
    const j = await r.json(); if (!j || !j.ok) return false;
    apply(j); SHOP.ok = true; SHOP.at = Date.now();
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ j, at: SHOP.at })); } catch (e) {}
    return true;
  } catch (e) { return false; }
}
export const shopOf = (st) => (st && SHOP.map.get(st.i)) || null;

// ---- 確かさの印（v0.26.0）：いちばん確かなもの1つ。「地図データだけ」の店は、お出かけ前に営業時間を ----
export function trustOf(st) {
  if (!st || st.demo || st.custom) return null;
  if (SHOP.confirmed.has(st.i)) return { k: 'ok', t: '店が確かめた' };
  if (SHOP.recent.has(st.i)) return { k: 'ok', t: '最近スタンプが押された' };
  if (st.srv) return { k: 'ok', t: '本めぐりの運営が確かめた' };
  if (st.wk) return { k: 'map', t: '名簿にのっている店です（最新の営業は未確認・お出かけ前に営業時間を）' };
  if (st.sw) return { k: 'ok', t: `店のホームページ・SNSで確かめた${st.c && /^\d{4}-\d{2}/.test(st.c) ? `（${st.c.slice(0, 4)}年${Number(st.c.slice(5, 7))}月）` : ''}` };
  if (st.cf || st.x || st.ob) return { k: 'ok', t: `公式一覧で確かめた${st.c && /^\d{4}-\d{2}/.test(st.c) ? `（${st.c.slice(0, 4)}年${Number(st.c.slice(5, 7))}月）` : ''}` };
  return { k: 'map', t: '地図データだけ（お出かけ前に営業時間を）' };
}

// ---- 書店員さんの1冊：来た人だけ、書名と写真をサーバーにたずねる ----
const PICK_P = new Map(); const PHOTO = new Map(); // 店ごとの読んでいる途中／写真（開いているあいだだけ）
export const pickSeen = (st) => (st && S.picks && S.picks[st.i]) || null;
export const pickCount = () => Object.keys(S.picks || {}).length;
export function openPick(st) {
  const sp = shopOf(st) && shopOf(st).pick; if (!sp || !pickOpen(st)) return Promise.resolve(null);
  const have = pickSeen(st); if (have && have.v === sp.v) return Promise.resolve(have);
  if (PICK_P.has(st.i)) return PICK_P.get(st.i);
  const p = (async () => {
    try {
      await flush(); // 押したばかりのスタンプの記録を先に届ける
      const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 10000);
      const r = await fetch(new URL('pick.php', apiBase()).toString(), { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ device: deviceId(), store: st.i }), cache: 'no-store', signal: ctl.signal }); clearTimeout(tm);
      if (!r.ok) return have || null;
      const j = await r.json(); if (!j || !j.ok || typeof j.title !== 'string') return have || null;
      S.picks = S.picks || {};
      const first = !S.picks[st.i];
      S.picks[st.i] = { v: Number.isInteger(j.id) ? j.id : sp.v, title: str(j.title, 80), author: str(j.author, 60), isbn: str(j.isbn, 13), who: str(j.who, 20), shelf: str(j.shelf, 40), hint: str(j.hint, 40), pics: Number.isInteger(j.pics) ? Math.min(4, j.pics) : 0, d: (have && have.d) || todayISO() };
      save(); emit('records'); if (first) emit('pick-open', st.i);
      return S.picks[st.i];
    } catch (e) { return have || null; } finally { PICK_P.delete(st.i); }
  })();
  PICK_P.set(st.i, p); return p;
}
export async function pickPhoto(st, i) {
  const k = st.i + '#' + i; if (PHOTO.has(k)) return PHOTO.get(k);
  try {
    const r = await fetch(new URL('pick.php', apiBase()).toString(), { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ device: deviceId(), store: st.i, photo: i }), cache: 'no-store' });
    if (!r.ok) return '';
    const u = URL.createObjectURL(await r.blob()); PHOTO.set(k, u); return u;
  } catch (e) { return ''; }
}

// ---- スタンプの写真：シェアの画像に描くため、押した店の分は端末に覚える（data URL） ----
function loadStampCache() { try { const o = JSON.parse(localStorage.getItem(STAMP_KEY) || '{}'); for (const [id, d] of Object.entries(o)) if (/^\d+$/.test(id) && typeof d === 'string' && d.startsWith('data:image/')) setStampData(+id, d); } catch (e) {} }
loadStampCache();
export async function ensureStampData(st) {
  const sp = shopOf(st); if (!sp || !sp.stamp) return '';
  try {
    const o = JSON.parse(localStorage.getItem(STAMP_KEY) || '{}'); if (o[sp.stamp]) return o[sp.stamp];
    const r = await fetch(picUrl(sp.stamp), { mode: 'cors' }); if (!r.ok) return '';
    const b = await r.blob();
    const d = await new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result || '')); fr.onerror = () => ok(''); fr.readAsDataURL(b); });
    if (!d.startsWith('data:image/')) return '';
    setStampData(sp.stamp, d);
    if (S.stamps[st.i]) { const keys = Object.keys(o); if (keys.length >= STAMP_MAX) delete o[keys[0]]; o[sp.stamp] = d; try { localStorage.setItem(STAMP_KEY, JSON.stringify(o)); } catch (e) {} }
    return d;
  } catch (e) { return ''; }
}
