// 小さな道具
import { PREFS } from './config.js?v=0.5.2';

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const todayISO = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const fmtDate = (iso) => { const [y, m, d] = String(iso).split('-'); return `${y}年${+m}月${+d}日`; };
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
export function cleanAuthor(a) { return String(a).split(/\s+/).map((t) => t.replace(/,?\s*\d{4}-?(\d{4})?/g, '').replace(/,/g, '').trim()).filter(Boolean).join('、'); }
export const icon = (name, cls = '') => `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
export const stars = (r) => '★'.repeat(r) + '☆'.repeat(3 - r);

// 小さな出来事の配信（画面の部品どうしをゆるくつなぐ）
const subs = new Map();
export const on = (ev, fn) => { (subs.get(ev) || subs.set(ev, []).get(ev)).push(fn); return () => { const a = subs.get(ev); const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); }; };
export const emit = (ev, data) => { (subs.get(ev) || []).forEach((fn) => { try { fn(data); } catch (e) { console.error(ev, e); } }); };
