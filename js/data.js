// 本屋・図書館・ラリーのデータ。スタンプ（その店だけの絵柄）の見た目もここ
import { DEMO_STORE } from './config.js?v=0.9.0';
import { S } from './state.js?v=0.9.0';
import { esc, hash32, prefOf, weekKey, sleep } from './util.js?v=0.9.0';

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
  const [base, libs, rallies] = await Promise.all([fetchJSON('data/bookstores.json'), fetchJSON('data/libraries.json'), fetchJSON('data/rallies.json')]);
  baseLoaded = Array.isArray(base) && base.length > 0; LIBS = Array.isArray(libs) ? libs : [];
  RALLIES = Array.isArray(rallies) ? rallies : [];
  rebuild(baseLoaded ? base : []);
  return { ok: baseLoaded, count: STORES.length };
}
let BASE = [], LIBS = [];
export const isLib = (st) => !!st && st.t === 'l';
export const placeWord = (st) => (isLib(st) ? '図書館' : '店');
export function rebuild(base) {
  if (base) BASE = base;
  const libs = S.settings.showLib === false ? [] : LIBS;
  STORES = [DEMO_STORE, ...BASE, ...libs, ...S.custom.map((c) => Object.assign({}, c, { custom: 1 }))].filter((s) => !S.hidden[s.i]).map((s) => (S.renames && S.renames[s.i] ? Object.assign({}, s, { n: S.renames[s.i].n, fix: 1 }) : s));
  BYID.clear(); STORES.forEach((s) => BYID.set(s.i, s));
  computeFeatured();
}
export function computeFeatured() {
  const wk = weekKey(); const byPref = {};
  // 今週の推し店は本屋だけ（図書館・見本・自分で足した店は入れない）
  for (const s of STORES) { if (s.demo || s.custom || s.t === 'l') continue; const p = prefOf(s); (byPref[p] = byPref[p] || []).push(s); }
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

// ---- レア度（秘境度） ----
export function rarityOf(st) { if (st.demo) return 3; const k = st.k == null ? 3 : st.k; return k === 0 ? 3 : k <= 6 ? 2 : 1; }
export function rarityText(st) { const r = rarityOf(st); if (st.demo) return 'めったにないスタンプ（見本）'; if (st.k == null) return '街のスタンプ'; const w = isLib(st) ? '図書館' : '本屋', u = isLib(st) ? '館' : '店'; return r === 3 ? `秘境スタンプ（周り5kmに${w}なし）` : r === 2 ? `街のスタンプ（周り5kmに${w} ${st.k}${u}）` : `ふつうのスタンプ（周り5kmに${w} ${st.k}${u}）`; }
export const rarityName = (r) => (r === 3 ? '秘境' : r === 2 ? '街' : '並');

// ---- スタンプの見た目 ----
// 店ごとに、形（角丸・丸・六角）・地の色（6色）・絵柄（本にまつわる12種）が決まる。白いふち＋墨の輪郭の「シール」（v0.9 ポップ・ラリー）
const INKS = [['#FF6A48', '#1B1B1B'], ['#2F9BFF', '#FFFFFF'], ['#4FC07A', '#1B1B1B'], ['#FFD447', '#1B1B1B'], ['#A86CFF', '#FFFFFF'], ['#FF7AB6', '#1B1B1B']]; // 地の色・絵柄の色
const BURST = '99,50 88.8,66.1 84.7,84.7 66.1,88.8 50,99 33.9,88.8 15.3,84.7 11.2,66.1 1,50 11.2,33.9 15.3,15.3 33.9,11.2 50,1 66.1,11.2 84.7,15.3 88.8,33.9'; // 秘境スタンプの光の輪
const PICTS = [
  '<path d="M4 8q8-4 16 0v24q-8-4-16 0z"/><path d="M20 8q8-4 16 0v24q-8-4-16 0z"/>', // 開いた本
  '<rect x="6" y="25" width="28" height="8" rx="2"/><rect x="9" y="15" width="24" height="8" rx="2"/><rect x="12" y="5" width="20" height="8" rx="2"/>', // 積んだ本
  '<rect x="4" y="4" width="32" height="32" rx="3"/><path d="M11 10v26M18 7v29M25 12v24M31 9v27"/>', // 本棚
  '<path d="M11 4h18v32l-9-7-9 7z"/>', // しおり
  '<circle cx="12" cy="25" r="7"/><circle cx="28" cy="25" r="7"/><path d="M19 25h2M5 24l-2-9M35 24l2-9"/>', // 眼鏡
  '<path d="M14 5h12l5 15H9zM20 20v12M12 34h16"/>', // ランプ
  '<path d="M8 15h22v11a8 8 0 0 1-8 8h-6a8 8 0 0 1-8-8z"/><path d="M30 18h3a4 4 0 0 1 0 8h-3M14 5q2 3 0 6M21 5q2 3 0 6"/>', // コーヒー
  '<path d="M4 20 36 6 26 36l-6-12zM20 24 36 6"/>', // 紙ひこうき
  '<path d="M8 32 30 10l4 4L12 36zM8 32l-1 5 5-1M26 14l4 4"/>', // 鉛筆
  '<path d="M22 6a14 14 0 1 0 12 20A11 11 0 0 1 22 6z"/><path d="M31 7l1.4 3 3.2.4-2.3 2.2.6 3.2-2.9-1.6-2.9 1.6.6-3.2-2.3-2.2 3.2-.4z"/>', // 月と星
  '<path d="M8 32C8 14 20 6 34 6c0 16-10 26-26 26z"/><path d="M8 32c8-8 14-14 22-22"/>', // 葉
  '<path d="M4 22a16 16 0 0 1 32 0zM20 22v10a4 4 0 0 1-8 0M20 6v-2"/>', // 傘
];
function shortName(n) {
  const s = String(n).replace(/(株式会社|有限会社|\(株\)|（株）)/g, '').trim().split(/[\s　]+/)[0] || '本';
  let out = '', w = 0; for (const ch of s) { const cw = /[ -~]/.test(ch) ? 0.6 : 1; if (w + cw > 6.2) break; out += ch; w += cw; } return { text: out || '本', w };
}
const hsl = (h, s, l) => `hsl(${h} ${Math.max(0, Math.min(100, s))}% ${Math.max(0, Math.min(100, l))}%)`;
export function stampInk(st) { const h = hash32(st.i); const [main, pic] = INKS[(h >>> 16) % INKS.length]; return { main, dark: '#1B1B1B', light: '#FFFFFF', pic }; }
export function stampSVG(st, collected, size = 96, opts = {}) {
  const h = hash32(st.i); const shape = h % 3; const pict = PICTS[(h >>> 8) % PICTS.length]; const [main, picCol] = INKS[(h >>> 16) % INKS.length]; const r = rarityOf(st); const rank = opts.rank || 0;
  const id = 'k' + h.toString(36) + (collected ? 'c' : 'u') + (opts.sfx || '');
  const EDGE = '#1B1B1B'; const fill = collected ? main : '#ECE6DA', pic = collected ? picCol : '#BDB5A8', edge = collected ? EDGE : '#A69E91', nameCol = collected ? EDGE : '#A69E91';
  const outer = shape === 0 ? '<rect x="8" y="8" width="84" height="84" rx="22"/>' : shape === 1 ? '<circle cx="50" cy="50" r="42"/>' : '<path d="M50 7L87 28v44L50 93 13 72V28z"/>';
  const { text, w } = shortName(st.n); const fs = w <= 3 ? 15 : w <= 4 ? 13 : w <= 5 ? 11.5 : 10.5;
  // 秘境（★3）は檸檬の光の輪、街（★2）は白い二重のふち
  const ring = !collected ? '' : r === 3 ? `<polygon points="${BURST}" fill="#FFD447" stroke="${EDGE}" stroke-width="1.5" stroke-linejoin="round"/>` : r === 2 ? `<g transform="translate(50 50) scale(1.1) translate(-50 -50)" fill="#FFFFFF" stroke="${EDGE}" stroke-width="1.5">${outer}</g>` : '';
  const star = (x, y, s, f) => `<path transform="translate(${x} ${y}) scale(${s})" fill="${f}" stroke="${EDGE}" stroke-width="1.4" stroke-linejoin="round" d="M0-9l2.6 5.4 6 .8-4.4 4.2 1.1 5.9L0 4.5l-5.3 2.8 1.1-5.9-4.4-4.2 6-.8z"/>`;
  const crown = (x, y, s, f) => `<g transform="translate(${x} ${y}) scale(${s})"><path fill="${f}" stroke="${EDGE}" stroke-width="1.4" stroke-linejoin="round" d="M-9 6l-3-11 6 4 6-9 6 9 6-4-3 11z"/></g>`;
  const marks = collected ? (rank >= 4 ? crown(78, 15, 0.85, '#FFD447') : rank >= 3 ? crown(78, 15, 0.72, '#FFFFFF') : rank >= 2 ? star(79, 15, 0.6, '#FFFFFF') : '') : '';
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" aria-label="${esc(st.n)}のスタンプ"><defs><clipPath id="c${id}">${outer}</clipPath></defs>${ring}<g fill="none" stroke="#FFFFFF" stroke-width="7" stroke-linejoin="round">${outer}</g><g fill="${fill}" stroke="${edge}" stroke-width="2.5" stroke-linejoin="round"${collected ? '' : ' stroke-dasharray="5 3"'}>${outer}</g><ellipse cx="38" cy="22" rx="22" ry="9" fill="#fff" opacity="${collected ? '.22' : '.3'}" clip-path="url(#c${id})"/><g transform="translate(30 15)" fill="none" stroke="${pic}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">${pict}</g><rect x="13" y="63" width="74" height="19" rx="9.5" fill="#FFFFFF" stroke="${edge}" stroke-width="1.5"/><text x="50" y="72.5" text-anchor="middle" dominant-baseline="central" font-size="${fs}" font-family="'Mochiy Pop P One','Zen Maru Gothic','Hiragino Sans',sans-serif" fill="${nameCol}">${esc(text)}</text>${marks}</svg>`;
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
