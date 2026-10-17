// 旅の記録：歩いた距離（ページ）・その日の物語・月のふり返り・行きたい店のお知らせ・投稿の記録・Googleマップの★の読み込み
// 位置は、アプリを開いて現在地を追っているあいだだけ使う（ブラウザの決まりで、閉じているあいだは測れない）
import { WALK, RANGE_M } from './config.js?v=0.7.3';
import { S, save } from './state.js?v=0.7.3';
import { STORES, BYID, rarityOf } from './data.js?v=0.7.3';
import * as G from './game.js?v=0.7.3';
import { dist, todayISO, prefOf, hash32, fmtDist, monthKey, emit } from './util.js?v=0.7.3';

function dayRec(d = todayISO()) { S.days = S.days || {}; const r = (S.days[d] = S.days[d] || { m: 0, v: 0 }); r.pass = r.pass || {}; r.alert = r.alert || {}; return r; }
export const pagesOf = (m) => Math.floor((m || 0) / WALK.pageM);
export const stepsOf = (m) => Math.round((m || 0) / WALK.stepM);
export const kmOf = (m) => ((m || 0) / 1000).toFixed((m || 0) < 10000 ? 1 : 0);
export const todayWalk = () => ((S.days || {})[todayISO()] || {}).m || 0;
export const totalWalk = () => Object.values(S.days || {}).reduce((a, r) => a + (r.m || 0), 0);
export const totalPages = () => pagesOf(totalWalk());

// ---- 歩いた距離 ----
// 位置の揺れ（誤差）で増えないよう、精度が悪い点は使わず、一定以上動いたときだけ足す。速すぎる移動は「乗り物」として別に数える
let last = null;
export function track(POS, jumpedNow) {
  if (POS.fake || POS.lat == null) { last = null; return; }
  const now = Date.now(), acc = POS.acc == null ? 999 : POS.acc;
  if (jumpedNow) { last = null; return; }
  if (acc > WALK.maxAccM) return;
  if (!last) { last = { lat: POS.lat, lon: POS.lon, t: now }; return; }
  const d = dist(last.lat, last.lon, POS.lat, POS.lon), dt = (now - last.t) / 1000;
  if (dt > WALK.gapS) { last = { lat: POS.lat, lon: POS.lon, t: now }; return; } // 間があいた（閉じていた）ら、その間は数えない
  if (d < Math.max(WALK.minMoveM, acc * 0.6)) return;
  const v = d / Math.max(dt, 1); const day = dayRec(); const volBefore = G.volume();
  if (v <= WALK.walkMaxMps) day.m = Math.round(day.m + d); else if (v <= WALK.rideMaxMps) day.v = Math.round((day.v || 0) + d);
  if (!day.t0) day.t0 = now; day.t1 = now;
  last = { lat: POS.lat, lon: POS.lon, t: now }; prune(); save();
  const volAfter = G.volume(); if (volAfter > volBefore) emit('volume', { after: volAfter });
}
function prune() { const keys = Object.keys(S.days || {}); if (keys.length <= 420) return; keys.sort(); for (const k of keys.slice(0, keys.length - 400)) delete S.days[k]; }

// ---- 行きたい店のお知らせ ----
// 段階：1＝設定の距離（1〜5km）に入った／2＝500m以内。同じ日に同じ段階は1回だけ。射程内（120m）はいつもの演出に任せる
export function checkWanted(POS) {
  const out = [];
  if (POS.lat == null || !S.wants.length) return out;
  const far = S.settings.wantAlertM || 2000; const day = dayRec(); let changed = false;
  for (const id of S.wants) {
    const st = BYID.get(id); if (!st) continue;
    const d = dist(POS.lat, POS.lon, st.la, st.lo);
    if (!POS.fake && d <= far) { const r = Math.round(d); if (day.pass[id] == null || r < day.pass[id]) { day.pass[id] = r; changed = true; } }
    if (S.settings.wantAlert === false) continue;
    const stage = d <= RANGE_M ? 3 : d <= WALK.wantNearM ? 2 : d <= far ? 1 : 0;
    if (stage && stage > (day.alert[id] || 0)) { day.alert[id] = stage; changed = true; if (stage < 3) out.push({ st, d, stage }); }
  }
  if (changed) save();
  return out.sort((a, b) => a.d - b.d);
}
export const wantsInBounds = (b) => S.wants.map((id) => BYID.get(id)).filter((st) => st && st.la >= b.s && st.la <= b.n && st.lo >= b.w && st.lo <= b.e);
export const wantsSorted = (lat, lon) => S.wants.map((id) => BYID.get(id)).filter(Boolean).map((st) => ({ st, d: dist(lat, lon, st.la, st.lo) })).sort((a, b) => a.d - b.d);

// ---- 投稿・シェアの記録 ----
export function addPost({ url, text, sid }) { S.posts = S.posts || []; const t = Date.now(); S.posts.push({ id: 'p' + t, t, d: todayISO(), url: url || '', text: text || '', s: sid || '' }); save(); }
export function deletePost(id) { S.posts = (S.posts || []).filter((p) => p.id !== id); save(); }
const SHARE_LBL = { stamp: 'スタンプの画像をシェアした。', regular: '常連度をシェアした。', card: 'カードの画像をシェアした。', profile: 'プレイヤーカードをシェアした。', story: 'この日の物語をシェアした。' };

// ---- その日の物語 ----
function activeDates() {
  const set = new Set();
  S.visits.forEach((v) => set.add(v.d)); S.cards.forEach((c) => set.add(c.d)); (S.posts || []).forEach((p) => set.add(p.d));
  for (const [d, r] of Object.entries(S.days || {})) if ((r.m || 0) >= WALK.pageM) set.add(d);
  return [...set].sort();
}
const WD = '日月火水木金土';
function regRankAt(id, date, inclusive) { const days = new Set(S.visits.filter((v) => v.s === id && v.near && (inclusive ? v.d <= date : v.d < date)).map((v) => v.d)).size; return { rank: G.regularRank(days), days }; }
export function chapter(date = todayISO()) {
  const dates = activeDates(); let no = dates.indexOf(date) + 1; if (!no) no = dates.filter((d) => d < date).length + 1;
  const rec = (S.days || {})[date] || { m: 0, v: 0, pass: {} };
  const vis = S.visits.filter((v) => v.d === date).sort((a, b) => a.t - b.t);
  const cards = S.cards.filter((c) => c.d === date).sort((a, b) => a.t - b.t);
  const posts = (S.posts || []).filter((p) => p.d === date);
  const shares = (S.shares || []).filter((p) => p.d === date && p.r !== 'saved');
  const rnd = (arr, k) => arr[hash32(date + '|' + k) % arr.length];
  const prefBefore = new Set(S.visits.filter((v) => v.near && v.d < date).map((v) => BYID.get(v.s)).filter(Boolean).map(prefOf));
  const seenPref = new Set(), seenReg = new Set();
  const events = [];
  for (const v of vis) {
    const st = BYID.get(v.s); const name = st ? st.n : v.n; const h = new Date(v.t).getHours();
    let s = `${h}時、${name}${v.near ? rnd(['へ。', 'の扉をくぐる。', 'に着いた。'], v.t) : 'に立ち寄った（記録だけ）。'}`;
    if (v.near && st) {
      const firstToday = vis.find((x) => x.s === v.s && x.near) === v;
      if (firstToday && S.stamps[v.s] && S.stamps[v.s].d === date) s += rarityOf(st) === 3 ? '周りに本屋のない、秘境の一軒。はじめてのスタンプを押した。' : 'はじめてのスタンプを押した。';
      if (firstToday && !seenReg.has(v.s)) { seenReg.add(v.s); const a = regRankAt(v.s, date, false), b = regRankAt(v.s, date, true); if (b.rank > a.rank && b.rank >= 2) s += `常連度は「${G.REGULAR_NAMES[b.rank - 1]}」に（${b.days}日目）。`; }
      const p = prefOf(st); if (!prefBefore.has(p) && !seenPref.has(p)) { seenPref.add(p); s += `はじめて${p}の本屋に入った。`; }
    }
    if (v.memo) s += `「${v.memo}」`;
    events.push({ t: v.t, s });
  }
  for (const c of cards) events.push({ t: c.t, s: `『${c.title}』と出会った（${c.sn}）。${c.why ? '——' + c.why : ''}` });
  for (const p of posts) events.push({ t: p.t, s: `Xに投稿した。${p.text ? '「' + p.text + '」' : ''}`, url: p.url, pid: p.id });
  for (const sh of shares) events.push({ t: sh.t, s: SHARE_LBL[sh.kind] || 'シェアした。' });
  events.sort((a, b) => a.t - b.t);
  const lines = [];
  if ((rec.m || 0) >= WALK.pageM) lines.push({ s: rnd([`この日は${kmOf(rec.m)}km、${pagesOf(rec.m)}ページぶん歩いた。`, `歩いた道のりは${kmOf(rec.m)}km。${pagesOf(rec.m)}ページぶんの一日。`, `${pagesOf(rec.m)}ページぶん（${kmOf(rec.m)}km）の道のり。`], 'open') });
  lines.push(...events);
  const visited = new Set(vis.map((v) => v.s));
  for (const [id, m] of Object.entries(rec.pass || {})) { if (visited.has(id)) continue; const st = BYID.get(id); if (st) lines.push({ s: `行きたかった${st.n}の${fmtDist(m)}そばを通った。${rnd(['次こそは。', '今度は寄り道を。', '覚えておこう。'], id)}` }); }
  const isEmpty = !lines.length;
  if (!isEmpty) lines.push({ s: rnd(['続きは、また明日。', '今日のしおりは、ここに。', 'また次のページへ。'], 'close') });
  const [y, mo, dd] = date.split('-').map(Number); const dow = new Date(y, mo - 1, dd).getDay();
  return { no, date, title: `第${no}章　${mo}月${dd}日（${WD[dow]}）`, lines, empty: isEmpty, blank: date === todayISO() ? 'まだ白紙のページ。現在地を追って歩くと、歩いた分だけページが増え、本屋に寄ると物語が書き足されます。' : 'この日は白紙のページ。', m: rec.m || 0, v: rec.v || 0, pages: pagesOf(rec.m), earned: ((S.pgDay || {})[date] || 0) + pagesOf(rec.m), km: kmOf(rec.m), steps: stepsOf(rec.m), nVisits: vis.length, nStores: visited.size, nCards: cards.length };
}
export function chapters(limit = 30) { return activeDates().reverse().slice(0, limit).map((d) => chapter(d)); }

// ---- 月・年のふり返り（prefix は 'YYYY-MM' か 'YYYY'） ----
export function periodStats(prefix) {
  const vis = S.visits.filter((v) => v.d.startsWith(prefix));
  const days = new Set(vis.map((v) => v.d)), stores = new Set(vis.map((v) => v.s));
  const stampsNew = Object.values(S.stamps).filter((x) => x.d.startsWith(prefix)).length;
  const cards = S.cards.filter((c) => c.d.startsWith(prefix)).length;
  let m = 0; for (const [d, r] of Object.entries(S.days || {})) if (d.startsWith(prefix)) m += r.m || 0;
  let act = 0; for (const [d, n] of Object.entries(S.pgDay || {})) if (d.startsWith(prefix)) act += n || 0;
  const per = {}; vis.forEach((v) => { (per[v.s] = per[v.s] || new Set()).add(v.d); });
  const top = Object.entries(per).map(([id, s]) => ({ st: BYID.get(id), days: s.size, reg: G.regularInfo(id) })).filter((x) => x.st).sort((a, b) => b.days - a.days).slice(0, 3);
  return { prefix, visitDays: days.size, visits: vis.length, stores: stores.size, stampsNew, cards, m, pages: pagesOf(m), earned: act + pagesOf(m), top };
}
export function monthsBack(n) { const out = []; const d = new Date(); d.setDate(1); for (let i = 0; i < n; i++) { out.unshift(monthKey(d)); d.setMonth(d.getMonth() - 1); } return out; }

// ---- Googleマップの保存リスト（Googleデータエクスポートのファイル）を読む ----
function csvRows(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim()));
}
function coordsFromUrl(u) { let s = String(u || ''); try { s = decodeURIComponent(s); } catch (e) {} const m = s.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) || s.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || s.match(/[?&](?:q|query|ll|center)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/); return m ? { lat: +m[1], lon: +m[2] } : null; }
function nameFromUrl(u) { const m = String(u || '').match(/\/maps\/place\/([^/@?]+)/); if (!m) return ''; try { return decodeURIComponent(m[1].replace(/\+/g, ' ')); } catch (e) { return ''; } }
export function parseGoogle(text) {
  text = String(text || '').replace(/^﻿/, ''); const out = [];
  if (/^\s*[{[]/.test(text)) {
    const j = JSON.parse(text); const feats = j.features || (Array.isArray(j) ? j : []);
    for (const f of feats) {
      const p = f.properties || {}; const L = p.location || p.Location || {}; let lat = null, lon = null;
      const g = f.geometry && f.geometry.coordinates; if (g && (+g[0] || +g[1])) { lon = +g[0]; lat = +g[1]; }
      const gc = L['Geo Coordinates']; if (lat == null && gc && (+gc.Latitude || +gc.Longitude)) { lat = +gc.Latitude; lon = +gc.Longitude; }
      const url = p.google_maps_url || p['Google Maps URL'] || ''; if (lat == null) { const c = coordsFromUrl(url); if (c) { lat = c.lat; lon = c.lon; } }
      const name = L.name || L['Business Name'] || p.Title || p.name || nameFromUrl(url);
      out.push({ name: String(name || '').trim(), address: L.address || L.Address || '', lat, lon, url });
    }
  } else {
    const rows = csvRows(text); if (!rows.length) return out; const head = rows[0].map((h) => String(h).trim().toLowerCase());
    const ix = (names) => head.findIndex((h) => names.includes(h));
    const iT = ix(['title', 'タイトル', '名前', 'name']), iU = ix(['url', 'リンク']), iN = ix(['note', 'メモ']);
    for (const r of rows.slice(1)) { const url = iU >= 0 ? r[iU] : ''; const c = coordsFromUrl(url); out.push({ name: String((iT >= 0 ? r[iT] : '') || nameFromUrl(url)).trim(), address: '', lat: c ? c.lat : null, lon: c ? c.lon : null, url, note: iN >= 0 ? r[iN] : '' }); }
  }
  return out.filter((x) => x.name || x.lat != null);
}
const nrm = (s) => String(s || '').normalize('NFKC').replace(/[\s　・･]/g, '').replace(/株式会社|有限会社/g, '').toLowerCase();
export const BOOKISH = /書店|書房|書林|本屋|本の|ブック|book|古書|古本|文庫|TSUTAYA|蔦屋/i;
function sim(a, b) { a = nrm(a); b = nrm(b); if (!a || !b) return 0; if (a === b) return 3; if (a.includes(b) || b.includes(a)) return Math.min(a.length, b.length) >= 4 ? 2 : Math.min(a.length, b.length) >= 3 ? 1 : 0; const bs = new Set(b); const as = new Set(a); let common = 0; for (const ch of as) if (bs.has(ch)) common++; return common / Math.max(as.size, 1) >= 0.6 ? 1 : 0; }
export function matchGoogle(places) {
  const hits = [], misses = [];
  for (const p of places) {
    let best = null;
    if (p.lat != null) {
      for (const st of STORES) {
        if (st.demo || Math.abs(st.la - p.lat) > 0.002 || Math.abs(st.lo - p.lon) > 0.0025) continue;
        const d = dist(p.lat, p.lon, st.la, st.lo); if (d > 150) continue; const s = sim(p.name, st.n);
        if (s > 0 || (d <= 40 && BOOKISH.test(p.name))) { const score = s * 100 - d; if (!best || score > best.score) best = { st, d, score }; }
      }
    }
    if (!best && p.name) {
      const cands = STORES.filter((st) => !st.demo && sim(p.name, st.n) >= 2); const exact = cands.filter((st) => nrm(st.n) === nrm(p.name));
      const pick = exact.length === 1 ? exact[0] : cands.length === 1 ? cands[0] : null;
      const dd = pick && p.lat != null ? dist(p.lat, p.lon, pick.la, pick.lo) : null;
      if (pick && (dd == null || dd <= 1000)) best = { st: pick, d: dd }; // 位置が分かる場所は、名前が同じでも1km以内のときだけ
    }
    if (best) hits.push({ p, st: best.st, d: best.d, want: S.wants.includes(best.st.i) });
    else misses.push(Object.assign({}, p, { bookish: BOOKISH.test(p.name) }));
  }
  const seen = new Set();
  return { hits: hits.filter((h) => (seen.has(h.st.i) ? false : (seen.add(h.st.i), true))), misses };
}
