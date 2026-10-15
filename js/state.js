// 記録（この端末の中だけ）。版の違いを吸収して読み込み、まとめて書き込む
import { STORAGE_KEY, LEGACY_KEYS, INK, APP_VER } from './config.js?v=0.6.1';
import { debounce, emit } from './util.js?v=0.6.1';

export const empty = () => ({
  v: 3, visits: [], cards: [], wants: [], custom: [], stamps: {}, xp: 0,
  claimedW: {}, claimedD: {}, rallyDone: {}, featDone: {}, looks: {},
  hidden: {}, renames: {}, seen: 0, lastPos: null, ink: { n: INK.max, at: Date.now() }, shareCount: 0,
  settings: { theme: 'auto', sound: true, haptic: true, avatar: '' }, createdAt: Date.now(),
});
export let S = empty();

function ensure(j) {
  const base = empty(); const out = Object.assign(base, j || {});
  out.settings = Object.assign(base.settings, (j && j.settings) || {});
  out.ink = Object.assign(base.ink, (j && j.ink) || {});
  if (j && j.claimed && !j.claimedW) out.claimedW = j.claimed; // 旧版
  out.v = 3; return out;
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
export function reset() { const seen = S.seen, settings = S.settings; S = empty(); S.seen = seen; S.settings = settings; saveNow(); emit('replaced'); return S; }
export function exportJSON() { return JSON.stringify({ app: 'honya-map', ver: APP_VER, at: new Date().toISOString(), data: S }, null, 1); }
export function parseImport(text) { const j = JSON.parse(text); const d = j.data || j; if (!d || !Array.isArray(d.visits)) throw new Error('bad'); return d; }

// インク：時間で回復する
export function inkNow() { const elapsed = Date.now() - (S.ink.at || Date.now()); const gained = Math.floor(elapsed / INK.rechargeMs); const n = Math.min(INK.max, (S.ink.n || 0) + gained); if (gained > 0) { S.ink.n = n; S.ink.at = (S.ink.at || Date.now()) + gained * INK.rechargeMs; if (n >= INK.max) S.ink.at = Date.now(); save(); } return n; }
export function inkUse() { const n = inkNow(); if (n <= 0) return false; if (n === INK.max) S.ink.at = Date.now(); S.ink.n = n - 1; save(); return true; }
export function inkRefill() { S.ink.n = INK.max; S.ink.at = Date.now(); save(); }
export function inkNextMs() { const n = inkNow(); if (n >= INK.max) return 0; return Math.max(0, (S.ink.at || Date.now()) + INK.rechargeMs - Date.now()); }
