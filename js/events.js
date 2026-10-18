// イベント（v0.10）：管理画面で作った設定をサーバーから読み、期間・対象の店・限定の枠・お題・称号を決める
// サーバーに送るのは「匿名の番号・店番号・日時・射程内か・お試し歩きか・イベント」だけ。位置の座標・名前・メモは送らない
// サーバーに届かないときは、前回読んだ設定で動く。スタンプはいつでも押せる
import { APP_VER, EVENTS_API } from './config.js?v=0.10.0';
import { S, save } from './state.js?v=0.10.0';
import { isLib } from './data.js?v=0.10.0';
import { prefOf, todayISO, emit } from './util.js?v=0.10.0';

export const EV = { list: [], permitted: new Set(), ok: false, at: 0 };
const CACHE_KEY = 'meguri_events_v1';
const OUTBOX_MAX = 300;

// 試すときだけ、別のサーバーを指せる（localStorage の meguri_api）
export function apiBase() { try { const o = localStorage.getItem('meguri_api'); if (o && /^https?:\/\//.test(o)) return o; } catch (e) {} return EVENTS_API; }
const tms = (s) => { const x = Date.parse(s); return Number.isNaN(x) ? 0 : x; };

function valid(e) { return e && Number.isInteger(e.id) && typeof e.name === 'string' && tms(e.starts) && tms(e.ends) && e.frame && typeof e.frame.color === 'string'; }
function apply(j) {
  if (!j || !Array.isArray(j.events)) return;
  EV.list = j.events.filter(valid).map((e) => Object.assign({}, e, { _stores: new Set(e.stores || []), _prefs: new Set(e.prefs || []) }));
  EV.permitted = new Set(Array.isArray(j.permitted) ? j.permitted : []);
}

export async function loadEvents() {
  if (!EV.at) { try { apply(JSON.parse(localStorage.getItem(CACHE_KEY) || 'null')); } catch (e) {} }
  try {
    const u = new URL('events.php', apiBase()); if (S.settings.joinCode) u.searchParams.set('code', S.settings.joinCode);
    const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 8000);
    const r = await fetch(u.toString(), { cache: 'no-cache', signal: ctl.signal }); clearTimeout(tm);
    if (!r.ok) throw new Error('http ' + r.status);
    const j = await r.json(); if (!j || !j.ok) throw new Error('ng');
    apply(j); EV.ok = true; try { localStorage.setItem(CACHE_KEY, JSON.stringify(j)); } catch (e) {}
  } catch (e) { EV.ok = false; }
  EV.at = Date.now(); emit('events');
}

export const isLive = (e, now = Date.now()) => tms(e.starts) <= now && now <= tms(e.ends);
export const isSoon = (e, now = Date.now()) => now < tms(e.starts);
export const liveEvents = () => EV.list.filter((e) => isLive(e));
export const soonEvents = () => EV.list.filter((e) => isSoon(e));
export const endedEvents = () => EV.list.filter((e) => Date.now() > tms(e.ends));
export const daysLeft = (e) => Math.max(0, Math.ceil((tms(e.ends) - Date.now()) / 86400000));
export const daysUntil = (e) => Math.max(0, Math.ceil((tms(e.starts) - Date.now()) / 86400000));

// この店が、このイベントの対象か
export function isTarget(e, st) {
  if (!st || st.demo || st.custom) return false;
  switch (e.target) {
    case 'all': return true;
    case 'books': return !isLib(st);
    case 'used': return !!st.u;
    case 'libs': return isLib(st);
    case 'permitted': return EV.permitted.has(st.i);
    case 'selected': return e._stores.has(st.i);
    case 'prefs': return e._prefs.has(prefOf(st));
    default: return false;
  }
}
// 地図に輪を出すのは、対象がしぼられたイベントだけ（「すべて」「本屋だけ」などは出さない）
export const narrow = (e) => e.target === 'permitted' || e.target === 'selected';
export const frameFor = (e, st) => (e.special && EV.permitted.has(st.i) ? e.special : e.frame);
export function targetText(e) {
  return { all: 'どの本屋・図書館でも', books: 'どの本屋でも', used: '古書店で', libs: '図書館で', permitted: `参加店（${EV.permitted.size}店）で`, selected: `選ばれた${e._stores.size}店で`, prefs: `${[...e._prefs].join('・')}の本屋・図書館で` }[e.target] || '';
}

// スタンプを押した・来た記録を残したとき。枠・お題の進み・称号を返す
export function onCheckin(st, { near, trial }) {
  const out = { frames: [], titles: [], progress: [] };
  if (!st || st.demo || st.custom) return out;
  const evs = liveEvents().filter((e) => isTarget(e, st));
  queueCheckin(st, near, trial, evs.map((e) => e.id));
  if (!near || trial) return out; // 限定の枠は、店の射程内で押したスタンプだけ（お試し歩きでは付けない）
  S.evLog = S.evLog || {}; const d = todayISO();
  for (const e of evs) {
    const log = (S.evLog[e.id] = S.evLog[e.id] || { s: {} });
    Object.assign(log, { name: e.name, frame: e.frame, special: e.special || null, starts: e.starts, ends: e.ends, goal: e.goal || null, hashtag: e.hashtag || '' }); // 終わったあとも枠を出せるように覚えておく
    const fr = frameFor(e, st);
    if (!log.s[st.i]) log.s[st.i] = { d, sp: fr === e.special ? 1 : 0 };
    out.frames.push(Object.assign({ ev: e.name, sp: fr === e.special ? 1 : 0 }, fr));
    const n = Object.keys(log.s).length;
    if (e.goal) {
      out.progress.push({ name: e.name, n, goal: e.goal.count });
      S.evTitles = S.evTitles || [];
      if (n >= e.goal.count && !S.evTitles.some((x) => x.id === e.id)) { S.evTitles.push({ id: e.id, name: e.goal.title, d }); out.titles.push(e.goal.title); }
    }
  }
  out.frames.sort((a, b) => b.sp - a.sp); // 特別な枠を先に（めぐり帳と同じ選び方）
  save(); emit('records'); return out;
}

// この店のスタンプに付ける枠。いちばん新しい日のもの → 同じ日なら特別な枠 → 先に始まったイベント（押したときの画面と同じ選び方）
export function storeFrame(id) {
  const logs = S.evLog || {}; let best = null;
  for (const k of Object.keys(logs)) {
    const L = logs[k]; const x = L.s && L.s[id]; if (!x) continue;
    const c = { d: x.d, sp: x.sp && L.special ? 1 : 0, st: tms(L.starts), id: +k, fr: x.sp && L.special ? L.special : L.frame, name: L.name, tag: L.hashtag };
    if (!best || c.d > best.d || (c.d === best.d && (c.sp > best.sp || (c.sp === best.sp && (c.st < best.st || (c.st === best.st && c.id < best.id)))))) best = c;
  }
  return best && best.fr ? Object.assign({ ev: best.name, hashtag: best.tag || '' }, best.fr) : null;
}
// そのイベントで押したときの枠（イベントのカードに並べる用）
export function frameIn(evId, id) { const L = (S.evLog || {})[evId]; const x = L && L.s && L.s[id]; if (!x) return null; const fr = x.sp && L.special ? L.special : L.frame; return fr ? Object.assign({ ev: L.name }, fr) : null; }
export const evCount = (id) => Object.keys(((S.evLog || {})[id] || {}).s || {}).length;

// ---- 参加コード（お試しの人に渡すURLの ?join=） ----
export function takeJoinParam() {
  const p = new URLSearchParams(location.search); const raw = p.get('join'); if (raw == null) return null;
  p.delete('join'); const q = p.toString(); try { history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash); } catch (e) {}
  const code = raw.trim().toLowerCase(); if (!/^[a-z0-9_-]{2,40}$/.test(code)) return null;
  const isNew = S.settings.joinCode !== code; S.settings.joinCode = code; save(); return { code, isNew };
}
export function setJoinCode(code) { S.settings.joinCode = code; save(); return loadEvents(); }

// ---- 送る（匿名） ----
function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join(''); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
export function deviceId() { if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(S.settings.dev || '')) { S.settings.dev = uuid(); save(); } return S.settings.dev; }
function queueCheckin(st, near, trial, ids) {
  if (S.settings.sendLog === false) return;
  S.outbox = S.outbox || []; S.outbox.push({ store: st.i, at: new Date().toISOString(), near: near ? 1 : 0, trial: trial ? 1 : 0, events: ids });
  if (S.outbox.length > OUTBOX_MAX) S.outbox.splice(0, S.outbox.length - OUTBOX_MAX);
  save(); flushSoon();
}
let flushing = false, ftimer = null, retryMs = 60000;
export function flushSoon(ms = 1500) { clearTimeout(ftimer); ftimer = setTimeout(flush, ms); }
// まとめて送る。つながらなかったときは、1分 → 2分 → … 10分おきに送り直す（アプリを開いているあいだ）
export async function flush() {
  if (!S.outbox || !S.outbox.length || S.settings.sendLog === false) return;
  if (flushing) { flushSoon(5000); return; }
  if (!navigator.onLine) { flushSoon(retryMs); return; }
  flushing = true; let failed = false;
  try {
    while (S.outbox.length) {
      const batch = S.outbox.slice(0, 50);
      const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 10000);
      const r = await fetch(new URL('checkin.php', apiBase()).toString(), { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ device: deviceId(), ver: APP_VER, items: batch }), signal: ctl.signal });
      clearTimeout(tm);
      if (r.status === 400) { S.outbox.splice(0, batch.length); save(); continue; } // 形のまちがい：送り直しても通らない
      if (!r.ok) { failed = true; break; }
      S.outbox.splice(0, batch.length); save();
    }
  } catch (e) { failed = true; } finally { flushing = false; }
  if (failed && S.outbox.length) { flushSoon(retryMs); retryMs = Math.min(retryMs * 2, 600000); } else retryMs = 60000;
}
export function setSendLog(on) { S.settings.sendLog = !!on; if (!on) S.outbox = []; save(); if (on) flushSoon(); }
