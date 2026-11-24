// 小さな道具
import { PREFS } from './config.js?v=0.37.9';

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const todayISO = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const fmtDate = (iso) => { const [y, m, d] = String(iso).split('-').map((x) => parseInt(x, 10)); return Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d) ? `${y}年${m}月${d}日` : ''; }; // 数だけを出す（v0.15.3：読み込んだ記録の日付に文字が入っていても画面に出さない）
export const fmtMin = (m) => (m >= 60 ? `${Math.floor(m / 60)}時間${m % 60 ? `${m % 60}分` : ''}` : `${m}分`);
export const fmtDist = (m) => (m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)}km`);
export function dist(lat1, lon1, lat2, lon2) { const R = 6371000, t = Math.PI / 180; const dLat = (lat2 - lat1) * t, dLon = (lon2 - lon1) * t; const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * t) * Math.cos(lat2 * t) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(a)); }
export function bearing(lat1, lon1, lat2, lon2) { const t = Math.PI / 180; const y = Math.sin((lon2 - lon1) * t) * Math.cos(lat2 * t); const x = Math.cos(lat1 * t) * Math.sin(lat2 * t) - Math.sin(lat1 * t) * Math.cos(lat2 * t) * Math.cos((lon2 - lon1) * t); return ((Math.atan2(y, x) / t) + 360) % 360; }
export const arrowOf = (b) => ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'][Math.round(b / 45) % 8];
export function hash32(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; }
export function prefOf(st) { if (st.p) return st.p; let best = null, bd = Infinity; for (const [n, la, lo] of PREFS) { const d = (st.la - la) ** 2 + (st.lo - lo) ** 2; if (d < bd) { bd = d; best = n; } } return best; }
export function weekKey(d = new Date()) { const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const day = x.getUTCDay() || 7; x.setUTCDate(x.getUTCDate() + 4 - day); const y0 = new Date(Date.UTC(x.getUTCFullYear(), 0, 1)); return `${x.getUTCFullYear()}-W${String(Math.ceil(((x - y0) / 86400000 + 1) / 7)).padStart(2, '0')}`; }
export function weekStartISO(d = new Date()) { const x = new Date(d); const day = x.getDay() || 7; x.setDate(x.getDate() - day + 1); return todayISO(x); }
export const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
export function circlePoly(lon, lat, m, n = 28) { const pts = []; const dLat = m / 111320, dLon = m / (111320 * Math.cos(lat * Math.PI / 180)); for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2; pts.push([lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)]); } return [pts]; }
export function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
export const icon = (name, cls = '') => `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
export const gmapDir = (st) => `https://www.google.com/maps/dir/?api=1&destination=${(+st.la).toFixed(6)},${(+st.lo).toFixed(6)}&travelmode=${(document.documentElement.dataset.travel || 'transit')}`; // きほんは公共交通機関（設定で 歩き・車 に変えられる・v0.32.1）
// Googleマップでお店そのものを開く（営業時間・定休日を見るため。店名＋住所か県で探す。Google の情報を取り込むのではなく開くだけ）
export const gmapPlace = (st) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([st.n, st.a || st.aa || prefOf(st)].filter(Boolean).join(' '))}`;
export const stars = (r) => '★'.repeat(r) + '☆'.repeat(3 - r);
// ホーム画面のアイコンから開いているか（iPhone は navigator.standalone）
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
// スマホの種類（ホーム画面への追加のしかたを出し分ける）。パソコンは ''
export const mobileOS = () => { const ua = navigator.userAgent || ''; if (/iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios'; return /Android/.test(ua) ? 'android' : ''; };
// SNSなどのアプリの中のブラウザなら、その名前（わからないアプリは 'app'）。ふつうのブラウザ・ホーム画面のアイコンなら ''（v0.28.0。v0.33.0 で start_ui.js から移した）
const IN_APP = [[/\bLine\//i, 'LINE'], [/Instagram/, 'Instagram'], [/FBAN|FBAV|FB_IAB|FBIOS/, 'Facebook'], [/musical_ly|BytedanceWebview|TikTok/i, 'TikTok'], [/Twitter/i, 'X'], [/YJApp/i, 'Yahoo! JAPAN'], [/KAKAOTALK/i, 'カカオトーク'], [/\bGSA\//, 'Google']];
export function inAppName(ua = navigator.userAgent || '') {
  if (isStandalone()) return '';
  for (const [re, n] of IN_APP) if (re.test(ua)) return n;
  const os = mobileOS();
  if (os === 'android' && /; wv\)/.test(ua)) return 'app'; // Android のアプリの中の画面（WebView）
  if (os === 'ios' && /iPhone|iPad|iPod/.test(ua) && !/Safari\//.test(ua)) return 'app'; // iPhone のアプリの中の画面（Safari の名前が入らない）
  return '';
}
// どこで開いたか（v0.33.0）：app＝SNSなどのアプリの中／home＝ホーム画面のアイコン／web＝スマホのブラウザ／pc＝パソコン
export const openedVia = () => (isStandalone() ? 'home' : inAppName() ? 'app' : mobileOS() ? 'web' : 'pc');
// 小さな出来事の配信（画面の部品どうしをゆるくつなぐ）
const subs = new Map();
export const on = (ev, fn) => { (subs.get(ev) || subs.set(ev, []).get(ev)).push(fn); return () => { const a = subs.get(ev); const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); }; };
export const emit = (ev, data) => { (subs.get(ev) || []).forEach((fn) => { try { fn(data); } catch (e) { console.error(ev, e); } }); };
