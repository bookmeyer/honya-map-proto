// Googleマップの保存リスト（Googleデータエクスポートの CSV・JSON）を読み、本屋と照らし合わせる（v0.12）
import { dist } from './util.js?v=0.19.0';
import { S } from './state.js?v=0.19.0';
import { STORES } from './data.js?v=0.19.0';
import { center } from './map.js?v=0.19.0';

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
