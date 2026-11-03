// イベント（v0.10）：管理画面で作った設定をサーバーから読み、期間・対象の店・限定の枠・お題・称号を決める
// サーバーに送るのは「匿名の番号・店番号・日時・射程内か・お試し歩きか・イベント」だけ。位置の座標・名前・メモは送らない
// 書店員さんの手書きのカードも、ここからサーバーに頼む（v0.16.1。その店で押した記録がある端末だけに渡る）
// 店の情報の報告を送り、運営が直した閉店・名前を受け取る（v0.17.0）
// サーバーに届かないときは、前回読んだ設定で動く。スタンプはいつでも押せる
import { EVENTS_API, APP_VER } from './config.js?v=0.17.0';
import { $, emit, prefOf, todayISO, on } from './util.js?v=0.17.0';
import { S, save } from './state.js?v=0.17.0';
import { isLib, setFixes } from './data.js?v=0.17.0';

export const EV = { list: [], permitted: new Set(), cards: new Set(), ok: false, at: 0 };
const CACHE_KEY = 'meguri_events_v1';
const OUTBOX_MAX = 300;
// 試すときだけ、別のサーバーを指せる（localStorage の meguri_api）
export function apiBase() { try { const o = localStorage.getItem('meguri_api'); if (o && /^https?:\/\//.test(o) && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return o; } catch (e) {} return EVENTS_API; } // 手元（localhost）だけ（v0.15.3）
const tms = (s) => { const x = Date.parse(s); return Number.isNaN(x) ? 0 : x; };
const STORE_ID = /^[A-Za-z0-9_.:-]{1,40}$/;
const HEX = /^#[0-9A-Fa-f]{6}$/; // 色は #000000 の形だけ（style に入るため。v0.15.3）
function valid(e) { return e && Number.isInteger(e.id) && typeof e.name === 'string' && tms(e.starts) && tms(e.ends) && e.frame && HEX.test(e.frame.color) && (!e.special || HEX.test(e.special.color)) && (!e.goal || (Number.isInteger(e.goal.count) && e.goal.count > 0 && typeof e.goal.title === 'string')); }
function apply(j) {
  if (!j || !Array.isArray(j.events)) return;
  EV.list = j.events.filter(valid).map((e) => Object.assign({}, e, { _stores: new Set(e.stores || []), _prefs: new Set(e.prefs || []) }));
  EV.permitted = new Set(Array.isArray(j.permitted) ? j.permitted : []);
  EV.cards = new Set(Array.isArray(j.cards) ? j.cards.filter((x) => typeof x === 'string' && STORE_ID.test(x)) : []); // 手書きのカードがある店（v0.16.1）
  applyFixes(j.fixes);
}
// 運営が報告を確かめて直した閉店・名前（v0.17.0）。形を確かめてから data.js に渡し、変わったときだけ地図を描き直す（main.js の 'fixes'）
function applyFixes(f) {
  const ok = f && typeof f === 'object';
  const closed = ok && Array.isArray(f.closed) ? f.closed.filter((x) => typeof x === 'string' && STORE_ID.test(x)).slice(0, 5000) : [];
  const rename = new Map(); // Map にする（"__proto__" などの名前で、ふつうの入れ物を壊さないように）
  if (ok && f.rename && typeof f.rename === 'object' && !Array.isArray(f.rename)) for (const [k, v] of Object.entries(f.rename)) if (STORE_ID.test(k) && typeof v === 'string' && v.trim() && rename.size < 5000) rename.set(k, v.trim().slice(0, 80));
  if (setFixes(closed, rename)) emit('fixes');
}
let evSeq = 0; // 読むのが重なったら、いちばん新しい返事だけ使う（v0.16.0：参加コードを変えた直後に、前の返事で上書きされることがあった）
export async function loadEvents() {
  const my = ++evSeq;
  if (!EV.at) { try { apply(JSON.parse(localStorage.getItem(CACHE_KEY) || 'null')); } catch (e) {} }
  try {
    const u = new URL('events.php', apiBase()); if (S.settings.joinCode) u.searchParams.set('code', S.settings.joinCode);
    const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 8000);
    const r = await fetch(u.toString(), { cache: 'no-cache', signal: ctl.signal }); clearTimeout(tm);
    if (!r.ok) throw new Error('http ' + r.status);
    const j = await r.json(); if (my !== evSeq) return; if (!j || !j.ok) throw new Error('ng');
    apply(j); EV.ok = true; try { localStorage.setItem(CACHE_KEY, JSON.stringify(j)); } catch (e) {}
  } catch (e) { if (my !== evSeq) return; EV.ok = false; }
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
  if (!st || st.demo || st.custom || st.closed) return false; // 閉店した店はイベントの対象にしない（v0.17.0）
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
  CARD_ERR.delete(st.i); save(); flushSoon();
}
let flushP = null, ftimer = null, retryMs = 60000;
export function flushSoon(ms = 1500) { clearTimeout(ftimer); ftimer = setTimeout(flush, ms); }
// まとめて送る（参加の記録と、店の報告）。つながらなかったときは、1分 → 2分 → … 10分おきに送り直す（アプリを開いているあいだ）。送っている途中に呼ばれたら、その終わりを待つ（v0.16.1）
export function flush() { if (!flushP) flushP = sendOutbox().finally(() => { flushP = null; }); return flushP; }
async function sendOutbox() {
  const logs = S.settings.sendLog !== false && (S.outbox || []).length > 0, reps = (S.repOut || []).length > 0; // 報告は、その人が「運営にも知らせる」を選んだものなので、参加の記録を送らない設定でも送る
  if (!logs && !reps) return;
  if (!navigator.onLine) { flushSoon(retryMs); return; }
  let failed = false;
  if (logs && !(await sendQueue(S.outbox, 'checkin.php', 50))) failed = true;
  if (reps && !(await sendQueue(S.repOut, 'report.php', 20))) failed = true;
  if (failed && ((S.outbox || []).length || (S.repOut || []).length)) { flushSoon(retryMs); retryMs = Math.min(retryMs * 2, 600000); } else retryMs = 60000;
}
// 1つの入れ物をまとめて送る。形のまちがい（400）は送り直しても通らないので捨てる。ほかのまちがいは残して、あとで送り直す
async function sendQueue(q, file, n) {
  try {
    while (q.length) {
      const batch = q.slice(0, n);
      const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 10000);
      const r = await fetch(new URL(file, apiBase()).toString(), { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ device: deviceId(), ver: APP_VER, items: batch }), signal: ctl.signal });
      clearTimeout(tm);
      if (r.status !== 400 && !r.ok) return false;
      q.splice(0, batch.length); save();
    }
    return true;
  } catch (e) { return false; }
}
// ---- 店の情報の報告（v0.17.0）：閉店している・名前が違う・地図にない店を、運営に知らせる ----
// 送るのは、店の番号・報告の種類・名前・ひとこと・（地図にない店だけ）その店の場所と、ランダムな番号。自分の位置は送らない
export function queueReport(r) {
  S.repOut = S.repOut || []; S.repOut.push(Object.assign({ at: new Date().toISOString() }, r));
  if (S.repOut.length > 50) S.repOut.splice(0, S.repOut.length - 50);
  save(); flushSoon(500);
}
export function setSendLog(on) { S.settings.sendLog = !!on; if (!on) S.outbox = []; CARD_ERR.clear(); save(); if (on) flushSoon(); }
// ---- 書店員さんの手書きのカード（v0.16.1） ----
// 写真はサーバーの中にしまってあり、その店の射程内でスタンプを押した記録がサーバーにある端末にだけ渡る（写真のアドレスを知っているだけでは見られない）
// 送るのは端末の番号と店の番号だけ（アドレスに入れないよう POST で）。写真は開いているあいだだけ覚える（端末にもブラウザの控えにも残さない）
export const hasCard = (st) => !!(st && st.rec) && (st.rec.photo === 'demo' || EV.cards.has(st.i));
const CARD_URL = new Map(), CARD_P = new Map(), CARD_ERR = new Map(); // 写真／読んでいる途中／うまくいかなかった（同じ店に何度も聞かない）
export const cardUrl = (id) => CARD_URL.get(id) || '';
export const cardErr = (id) => { const e = CARD_ERR.get(id); return e && Date.now() < e.until ? e.error : ''; };
export function loadCard(id) {
  if (CARD_URL.has(id)) return Promise.resolve({ url: CARD_URL.get(id) });
  if (S.settings.sendLog === false) return Promise.resolve({ error: 'off' });
  const e = CARD_ERR.get(id); if (e && Date.now() < e.until) return Promise.resolve({ error: e.error });
  if (CARD_P.has(id)) return CARD_P.get(id);
  const p = (async () => {
    let error = 'net';
    try {
      await flush(); // 押したばかりのスタンプの記録を先に届ける
      const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 15000);
      const r = await fetch(new URL('card.php', apiBase()).toString(), { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ device: deviceId(), store: id }), cache: 'no-store', signal: ctl.signal });
      if (r.ok && /^image\//.test(r.headers.get('content-type') || '')) { const url = URL.createObjectURL(await r.blob()); clearTimeout(tm); CARD_URL.set(id, url); return { url }; }
      clearTimeout(tm); const j = await r.json().catch(() => null); if (j && typeof j.error === 'string') error = j.error;
    } catch (err) {}
    if (error === 'stamp' && (S.outbox || []).some((x) => x.store === id)) error = 'net'; // 記録がまだ送れていないだけ
    CARD_ERR.set(id, { error, until: Date.now() + (error === 'net' ? 10000 : 60000) });
    return { error };
  })().finally(() => CARD_P.delete(id));
  CARD_P.set(id, p); return p;
}
