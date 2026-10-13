// 店・ラリーのデータ。印（その店だけの印）の見た目もここ
import { DEMO_STORE } from './config.js?v=0.5.2';
import { S } from './state.js?v=0.5.2';
import { esc, hash32, prefOf, weekKey, sleep } from './util.js?v=0.5.2';

export let STORES = [];
export let RALLIES = [];
export const BYID = new Map();
export const FEAT = new Map(); // 県 → 今週の推し店の id
let baseLoaded = false;

async function fetchJSON(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url, { cache: 'no-cache' }); if (r.ok) return await r.json(); } catch (e) {}
    await sleep(400 * (i + 1));
  }
  return null;
}
export async function loadAll() {
  const [base, rallies] = await Promise.all([fetchJSON('data/bookstores.json'), fetchJSON('data/rallies.json')]);
  baseLoaded = Array.isArray(base) && base.length > 0;
  RALLIES = Array.isArray(rallies) ? rallies : [];
  rebuild(baseLoaded ? base : []);
  return { ok: baseLoaded, count: STORES.length };
}
let BASE = [];
export function rebuild(base) {
  if (base) BASE = base;
  STORES = [DEMO_STORE, ...BASE, ...S.custom.map((c) => Object.assign({}, c, { custom: 1 }))].filter((s) => !S.hidden[s.i]).map((s) => (S.renames && S.renames[s.i] ? Object.assign({}, s, { n: S.renames[s.i].n, fix: 1 }) : s));
  BYID.clear(); STORES.forEach((s) => BYID.set(s.i, s));
  computeFeatured();
}
export function computeFeatured() {
  const wk = weekKey(); const byPref = {};
  for (const s of STORES) { if (s.demo || s.custom) continue; const p = prefOf(s); (byPref[p] = byPref[p] || []).push(s); }
  FEAT.clear();
  for (const [p, arr] of Object.entries(byPref)) { arr.sort((a, b) => (a.i < b.i ? -1 : 1)); FEAT.set(p, arr[hash32(wk + '|' + p) % arr.length].i); }
}
export const isFeat = (id) => { for (const v of FEAT.values()) if (v === id) return true; return false; };
export function search(q, limit = 20) {
  const words = q.trim().split(/[\s　]+/).filter(Boolean); if (!words.length) return [];
  return STORES.filter((s) => { const hay = (s.n || '') + ' ' + (s.a || '') + ' ' + prefOf(s); return words.every((w) => hay.includes(w)); }).slice(0, limit);
}
export function addCustom(st) { S.custom.push(st); const full = Object.assign({}, st, { custom: 1 }); STORES.push(full); BYID.set(st.i, full); }
export function hideStore(st) { S.hidden[st.i] = { d: new Date().toISOString().slice(0, 10), n: st.n }; STORES = STORES.filter((s) => s.i !== st.i); BYID.delete(st.i); computeFeatured(); }
export function unhideAll() { S.hidden = {}; S.renames = {}; rebuild(); }
export function renameStore(st, name) { S.renames[st.i] = { n: name, old: st.n, d: new Date().toISOString().slice(0, 10) }; rebuild(); }
export const DATA_DATE = '2026-10-12';

// ---- 印 ----
export function rarityOf(st) { if (st.demo) return 3; const k = st.k == null ? 3 : st.k; return k === 0 ? 3 : k <= 6 ? 2 : 1; }
export function rarityText(st) { const r = rarityOf(st); if (st.demo) return 'めったにない印（見本）'; if (st.k == null) return 'この街の印'; return r === 3 ? '秘境の印（周り5kmに本屋なし）' : r === 2 ? `この街の印（周り5kmに本屋 ${st.k}店）` : `よくある印（周り5kmに本屋 ${st.k}店）`; }
export const rarityName = (r) => (r === 3 ? '秘境' : r === 2 ? '街' : '並');
function shortName(n) { const s = n.replace(/\s+/g, '').replace(/(株式会社|有限会社)/g, ''); return s.slice(0, 4) || '本'; }
export function stampSVG(st, collected, size = 96) {
  const h = hash32(st.i); const hue = h % 360; const shape = (h >>> 8) % 3; const pat = (h >>> 16) % 3; const r = rarityOf(st);
  const col = collected ? `hsl(${hue} 58% 40%)` : '#c9c2b6'; const col2 = collected ? `hsl(${(hue + 40) % 360} 60% 55%)` : '#d9d3c8';
  const gold = '#c9a227'; const dash = collected ? '' : ' stroke-dasharray="4 3"';
  let outer = '';
  if (shape === 0) outer = `<circle cx="50" cy="50" r="46" fill="none" stroke="${col}" stroke-width="4"${dash}/>`;
  else if (shape === 1) outer = `<rect x="6" y="6" width="88" height="88" rx="14" fill="none" stroke="${col}" stroke-width="4"${dash}/>`;
  else outer = `<polygon points="30,5 70,5 95,30 95,70 70,95 30,95 5,70 5,30" fill="none" stroke="${col}" stroke-width="4"${dash}/>`;
  let inner = '';
  if (pat === 0) inner = `<circle cx="50" cy="50" r="38" fill="none" stroke="${col2}" stroke-width="1.5"/>`;
  else if (pat === 1) inner = `<circle cx="50" cy="50" r="40" fill="none" stroke="${col2}" stroke-width="1.5"/><circle cx="50" cy="50" r="36" fill="none" stroke="${col2}" stroke-width="1"/>`;
  else inner = `<circle cx="50" cy="50" r="38" fill="none" stroke="${col2}" stroke-width="2" stroke-dasharray="2 5"/>`;
  const rare = r === 3 ? `<circle cx="50" cy="50" r="49" fill="none" stroke="${collected ? gold : '#ddd5c3'}" stroke-width="2"/>` : r === 2 ? `<circle cx="50" cy="50" r="48.5" fill="none" stroke="${col2}" stroke-width="1"/>` : '';
  const text = esc(shortName(st.n)); const fill = collected ? col : '#b5ada0';
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" aria-label="${esc(st.n)}の印">${rare}${outer}${inner}<text x="50" y="50" text-anchor="middle" dominant-baseline="central" writing-mode="tb" font-size="${text.length > 3 ? 16 : text.length > 2 ? 19 : 24}" font-weight="700" font-family="'Shippori Mincho','Hiragino Mincho ProN','Yu Mincho',serif" fill="${fill}" style="letter-spacing:.05em">${text}</text></svg>`;
}

// ---- 本（openBD） ----
const bookCache = new Map();
export async function lookupIsbn(isbn) {
  if (bookCache.has(isbn)) return bookCache.get(isbn);
  try {
    const r = await fetch(`https://api.openbd.jp/v1/get?isbn=${isbn}`); const j = await r.json(); const s = j && j[0] && j[0].summary; if (!s) { bookCache.set(isbn, null); return null; }
    const b = { isbn, title: s.title || '', author: cleanAuthor(s.author || ''), publisher: s.publisher || '', pubdate: s.pubdate || '', cover: s.cover || '' };
    bookCache.set(isbn, b); return b;
  } catch (e) { return null; }
}
function cleanAuthor(a) { return String(a).split(/\s+/).map((t) => t.replace(/,?\s*\d{4}-?(\d{4})?/g, '').replace(/,/g, '').trim()).filter(Boolean).join('、'); }
