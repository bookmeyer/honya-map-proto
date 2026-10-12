/* 本屋の地図（試作） v0.2 位置ゲー版
   - 地図：MapLibre + OpenFreeMap（無料・鍵なし）／店：OpenStreetMapの書店 ＋ 利用者が追加した店
   - 現在地を追い、店から120m以内に入ると「射程内」。印（その店だけの印・レア度つき）を手に入れる
   - 経験値・レベル・称号・今週のミッション・ご当地ラリー・印を持つ店のまわりが朱に塗られる
   - 記録はこの端末の localStorage だけ。位置は端末の中で距離を出すだけで、どこにも送らない
   - 本：ISBN → openBD（書影は参照表示のみ） */
'use strict';

const APP_VER = '0.2.0';
const KEY = 'honya_map_v2';
const RANGE_M = 120;          // 射程（m）
const TERRITORY_M = 200;      // 印を持つ店のまわりを塗る半径（m）
const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const XP = { shuFirst: 300, shuRepeat: 60, sumiFirst: 100, sumiRepeat: 20, card: 150, rare2: 100, rare3: 500, mission: 200, rally: 1000 };
const TITLES_STAMPS = [[1, 'はじめの一印'], [3, '本屋あるき'], [10, '本屋通'], [20, '本屋巡礼者'], [50, '本屋のぬし'], [100, '全国行脚']];
const TITLES_PREFS = [[2, '越境'], [5, '五県の旅人'], [10, '列島めぐり']];
const TITLES_USED = [[3, '古書の目利き']];

const PREFS = [
  ['北海道',43.064,141.347],['青森県',40.824,140.740],['岩手県',39.704,141.153],['宮城県',38.269,140.872],['秋田県',39.719,140.102],
  ['山形県',38.240,140.363],['福島県',37.750,140.468],['茨城県',36.342,140.447],['栃木県',36.566,139.884],['群馬県',36.391,139.061],
  ['埼玉県',35.857,139.649],['千葉県',35.605,140.123],['東京都',35.690,139.692],['神奈川県',35.448,139.643],['新潟県',37.903,139.024],
  ['富山県',36.695,137.211],['石川県',36.595,136.626],['福井県',36.065,136.222],['山梨県',35.664,138.568],['長野県',36.651,138.181],
  ['岐阜県',35.391,136.722],['静岡県',34.977,138.383],['愛知県',35.180,136.907],['三重県',34.730,136.509],['滋賀県',35.005,135.869],
  ['京都府',35.021,135.756],['大阪府',34.686,135.520],['兵庫県',34.691,135.183],['奈良県',34.685,135.833],['和歌山県',34.226,135.168],
  ['鳥取県',35.504,134.238],['島根県',35.472,133.051],['岡山県',34.662,133.934],['広島県',34.397,132.460],['山口県',34.186,131.471],
  ['徳島県',34.066,134.559],['香川県',34.340,134.043],['愛媛県',33.842,132.766],['高知県',33.560,133.531],['福岡県',33.606,130.418],
  ['佐賀県',33.249,130.299],['長崎県',32.745,129.874],['熊本県',32.790,130.742],['大分県',33.238,131.613],['宮崎県',31.911,131.424],
  ['鹿児島県',31.560,130.558],['沖縄県',26.212,127.681],
];
const DEMO_STORE = { i: 'demo1', n: '【見本】架空の本屋', la: 35.6812, lo: 139.7671, a: '（実在しません。公認店のページの見え方の見本）', p: '東京都', demo: 1,
  rec: { who: '書店員 Aさん（見本）', title: '『（見本）手放せない1冊』', say: '（見本）取材でうかがった書店員さんのひとことが、ご本人の言葉のまま入ります。', shelf: '文庫の新刊台（見本）' } };

// ---------- 状態 ----------
let S = { visits: [], cards: [], wants: [], custom: [], stamps: {}, xp: 0, claimed: {}, rallyDone: {} };
let STORES = [], RALLIES = [];
const BYID = new Map();
let map, mapReady = false;
let currentView = 'map', currentSub = 'stamps';
let scanStopper = null;
const POS = { lat: null, lon: null, acc: null, fake: false, watchId: null, at: 0, follow: false };
let nearest = [], inRange = new Set(), pulseTimer = null, pulseOn = false;

function load() { try { const j = JSON.parse(localStorage.getItem(KEY) || 'null'); if (j && typeof j === 'object') S = Object.assign({ visits: [], cards: [], wants: [], custom: [], stamps: {}, xp: 0, claimed: {}, rallyDone: {} }, j); } catch (e) { /* 初期状態 */ } }
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('保存できませんでした（端末の空きを確かめてください）'); } }

// ---------- 道具 ----------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const fmtDate = (iso) => { const [y, m, d] = iso.split('-'); return `${y}年${+m}月${+d}日`; };
function dist(lat1, lon1, lat2, lon2) { const R = 6371000, t = Math.PI / 180; const dLat = (lat2 - lat1) * t, dLon = (lon2 - lon1) * t; const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * t) * Math.cos(lat2 * t) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(a)); }
function bearing(lat1, lon1, lat2, lon2) { const t = Math.PI / 180; const y = Math.sin((lon2 - lon1) * t) * Math.cos(lat2 * t); const x = Math.cos(lat1 * t) * Math.sin(lat2 * t) - Math.sin(lat1 * t) * Math.cos(lat2 * t) * Math.cos((lon2 - lon1) * t); return ((Math.atan2(y, x) / t) + 360) % 360; }
const arrowOf = (b) => ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'][Math.round(b / 45) % 8];
const fmtDist = (m) => m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)}km`;
function hash32(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; }
function prefOf(st) { if (st.p) return st.p; let best = null, bd = Infinity; for (const [n, la, lo] of PREFS) { const d = (st.la - la) ** 2 + (st.lo - lo) ** 2; if (d < bd) { bd = d; best = n; } } return best; }
const visitsOf = (id) => S.visits.filter((v) => v.s === id);
const cardsOf = (id) => S.cards.filter((c) => c.s === id);
const hasStamp = (id) => !!S.stamps[id];
function stateOf(id) { const n = visitsOf(id).length + cardsOf(id).length; return n === 0 ? 0 : n >= 3 ? 2 : 1; }
let toastT; function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), 2800); }
function weekKey(d = new Date()) { const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const day = x.getUTCDay() || 7; x.setUTCDate(x.getUTCDate() + 4 - day); const y0 = new Date(Date.UTC(x.getUTCFullYear(), 0, 1)); return `${x.getUTCFullYear()}-W${String(Math.ceil(((x - y0) / 86400000 + 1) / 7)).padStart(2, '0')}`; }
function weekStartISO() { const d = new Date(); const day = d.getDay() || 7; d.setDate(d.getDate() - day + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

// ---------- レベル・称号 ----------
const levelOf = (xp) => Math.floor(Math.sqrt(Math.max(xp, 0) / 150)) + 1;
const xpForLevel = (lv) => (lv - 1) ** 2 * 150;
function renderLevel() { const lv = levelOf(S.xp), cur = xpForLevel(lv), next = xpForLevel(lv + 1); $('#lv-label').textContent = `Lv.${lv}`; $('#xp-fill').style.width = `${Math.round(((S.xp - cur) / (next - cur)) * 100)}%`; $('#xp-text').textContent = `${S.xp} XP`; }
function addXP(n) { const before = levelOf(S.xp); S.xp += n; const after = levelOf(S.xp); renderLevel(); return { before, after }; }
function earnedTitles() {
  const ids = Object.keys(S.stamps); const prefs = new Set(ids.map((id) => BYID.get(id)).filter(Boolean).map(prefOf)); const used = ids.filter((id) => (BYID.get(id) || {}).u).length;
  const out = [];
  TITLES_STAMPS.forEach(([n, t]) => out.push({ t, ok: ids.length >= n, need: `印${n}` }));
  TITLES_PREFS.forEach(([n, t]) => out.push({ t, ok: prefs.size >= n, need: `${n}県` }));
  TITLES_USED.forEach(([n, t]) => out.push({ t, ok: used >= n, need: `古書店${n}` }));
  RALLIES.forEach((r) => out.push({ t: r.title, ok: !!S.rallyDone[r.id], need: r.name }));
  return out;
}

// ---------- 印（その店だけの印） ----------
function rarityOf(st) { if (st.demo) return 3; const h = hash32(st.i); if (h % 97 === 0) return 3; if (st.u || !st.b) return 2; return 1; }
const starsOf = (r) => '★'.repeat(r) + '☆'.repeat(3 - r);
function shortName(n) { const s = n.replace(/\s+/g, '').replace(/(株式会社|有限会社)/g, ''); return s.slice(0, 4) || '本'; }
function stampSVG(st, collected, size = 96) {
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
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" aria-label="${esc(st.n)}の印">${rare}${outer}${inner}<text x="50" y="50" text-anchor="middle" dominant-baseline="central" writing-mode="tb" font-size="${text.length > 3 ? 16 : text.length > 2 ? 19 : 24}" font-weight="700" font-family="'Hiragino Mincho ProN','Yu Mincho',serif" fill="${fill}" style="letter-spacing:.05em">${text}</text></svg>`;
}

// ---------- 店データ ----------
async function loadData() {
  let base = []; try { const r = await fetch('data/bookstores.json', { cache: 'no-cache' }); if (r.ok) base = await r.json(); } catch (e) {}
  try { const r = await fetch('data/rallies.json', { cache: 'no-cache' }); if (r.ok) RALLIES = await r.json(); } catch (e) {}
  STORES = [DEMO_STORE, ...base, ...S.custom.map((c) => Object.assign({}, c, { custom: 1 }))];
  BYID.clear(); STORES.forEach((s) => BYID.set(s.i, s));
  if (!base.length) toast('店のデータが読み込めませんでした。見本と追加した店だけ出します');
}
function geojsonStores() { return { type: 'FeatureCollection', features: STORES.map((s) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [s.lo, s.la] }, properties: { id: s.i, st: stateOf(s.i), stamp: hasStamp(s.i) ? 1 : 0, want: S.wants.includes(s.i) ? 1 : 0, near: inRange.has(s.i) ? 1 : 0, custom: s.custom ? 1 : 0, demo: s.demo ? 1 : 0 } })) }; }
function circlePoly(lon, lat, m, n = 28) { const pts = []; const dLat = m / 111320, dLon = m / (111320 * Math.cos(lat * Math.PI / 180)); for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2; pts.push([lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)]); } return [pts]; }
function geojsonTerritory() { return { type: 'FeatureCollection', features: Object.keys(S.stamps).map((id) => BYID.get(id)).filter(Boolean).map((s) => ({ type: 'Feature', geometry: { type: 'Polygon', coordinates: circlePoly(s.lo, s.la, TERRITORY_M) }, properties: {} })) }; }
function geojsonMe() { if (POS.lat == null) return { type: 'FeatureCollection', features: [] }; return { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: circlePoly(POS.lon, POS.lat, Math.min(POS.acc || 0, 500)) }, properties: { k: 'acc' } }, { type: 'Feature', geometry: { type: 'Point', coordinates: [POS.lon, POS.lat] }, properties: { k: 'me', fake: POS.fake ? 1 : 0 } }] }; }
function refreshMap() { if (!mapReady) return; map.getSource('stores').setData(geojsonStores()); map.getSource('territory').setData(geojsonTerritory()); map.getSource('me').setData(geojsonMe()); }

// ---------- 地図 ----------
function initMap() {
  map = new maplibregl.Map({ container: 'map', style: STYLE_URL, center: [139.70, 35.68], zoom: 11, attributionControl: { compact: true } });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
  map.on('load', () => {
    map.addSource('territory', { type: 'geojson', data: geojsonTerritory() });
    map.addLayer({ id: 'territory-fill', type: 'fill', source: 'territory', paint: { 'fill-color': '#c8381f', 'fill-opacity': 0.13 } });
    map.addLayer({ id: 'territory-line', type: 'line', source: 'territory', paint: { 'line-color': '#c8381f', 'line-opacity': 0.5, 'line-width': 1 } });
    map.addSource('stores', { type: 'geojson', data: geojsonStores() });
    map.addLayer({ id: 'near-pulse', type: 'circle', source: 'stores', filter: ['==', ['get', 'near'], 1], paint: { 'circle-radius': 16, 'circle-color': '#c9a227', 'circle-opacity': 0.25 } });
    map.addLayer({ id: 'stores-halo', type: 'circle', source: 'stores', filter: ['>', ['get', 'st'], 0], paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 6, 10, 11, 14, 16], 'circle-color': '#c8381f', 'circle-opacity': 0.16 } });
    map.addLayer({ id: 'stores', type: 'circle', source: 'stores', paint: {
      'circle-radius': ['case', ['==', ['get', 'near'], 1], ['interpolate', ['linear'], ['zoom'], 10, 7, 14, 11], ['interpolate', ['linear'], ['zoom'], 4, 2.6, 8, 4, 11, 6, 14, 8.5]],
      'circle-color': ['case', ['==', ['get', 'stamp'], 1], '#c8381f', ['==', ['get', 'st'], 2], '#8e1d12', ['==', ['get', 'st'], 1], '#d9412a', '#b8b0a3'],
      'circle-opacity': ['case', ['==', ['get', 'st'], 0], ['case', ['==', ['get', 'near'], 1], 0.95, 0.6], 0.95],
      'circle-stroke-width': ['case', ['==', ['get', 'near'], 1], 3, ['==', ['get', 'want'], 1], 2.5, ['any', ['==', ['get', 'custom'], 1], ['==', ['get', 'demo'], 1]], 1.5, 0.6],
      'circle-stroke-color': ['case', ['==', ['get', 'near'], 1], '#c9a227', ['==', ['get', 'want'], 1], '#c9a227', ['any', ['==', ['get', 'custom'], 1], ['==', ['get', 'demo'], 1]], '#2b2622', '#ffffff'],
    } });
    map.addSource('me', { type: 'geojson', data: geojsonMe() });
    map.addLayer({ id: 'me-acc', type: 'fill', source: 'me', filter: ['==', ['get', 'k'], 'acc'], paint: { 'fill-color': '#2b6cb0', 'fill-opacity': 0.12 } });
    map.addLayer({ id: 'me-dot', type: 'circle', source: 'me', filter: ['==', ['get', 'k'], 'me'], paint: { 'circle-radius': 9, 'circle-color': ['case', ['==', ['get', 'fake'], 1], '#7c3aed', '#2b6cb0'], 'circle-stroke-width': 3, 'circle-stroke-color': '#ffffff' } });
    map.on('click', 'stores', (e) => { const f = e.features && e.features[0]; if (f) { e.originalEvent._hit = true; openSheet(f.properties.id); } });
    map.on('click', (e) => { if (e.originalEvent._hit) return; if (POS.fake) { setPos(e.lngLat.lat, e.lngLat.lng, 15, true); toast('ここにいることにしました'); } else closeSheet(); });
    map.on('mouseenter', 'stores', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'stores', () => { map.getCanvas().style.cursor = ''; });
    map.on('dragstart', () => { POS.follow = false; $('#btn-locate').classList.remove('on'); });
    mapReady = true; refreshMap();
  });
  map.on('error', (e) => { console.warn('map error', e && e.error); });
}
function flyTo(st, zoom = 15) { if (!mapReady) return; map.flyTo({ center: [st.lo, st.la], zoom: Math.max(map.getZoom(), zoom), speed: 1.2 }); }
function startPulse() { if (pulseTimer) return; pulseTimer = setInterval(() => { if (!mapReady || !map.getLayer('near-pulse')) return; pulseOn = !pulseOn; map.setPaintProperty('near-pulse', 'circle-radius', pulseOn ? 24 : 14); map.setPaintProperty('near-pulse', 'circle-opacity', pulseOn ? 0.12 : 0.32); }, 650); }
function stopPulse() { if (pulseTimer) { clearInterval(pulseTimer); pulseTimer = null; } }

// ---------- 現在地（本物とお試し） ----------
function setPos(lat, lon, acc, fake) {
  POS.lat = lat; POS.lon = lon; POS.acc = acc; POS.fake = fake; POS.at = Date.now();
  if (mapReady) { map.getSource('me').setData(geojsonMe()); if (POS.follow && !fake) map.easeTo({ center: [lon, lat], duration: 600 }); }
  updateNear();
}
function startWatch() {
  if (!navigator.geolocation) { toast('この端末では位置が使えません。「👣 お試し歩き」で試せます'); return; }
  if (POS.fake) setTrial(false);
  POS.follow = true; $('#btn-locate').classList.add('on'); toast('現在地を確かめています…');
  if (POS.watchId != null) { if (POS.lat != null && mapReady) map.flyTo({ center: [POS.lon, POS.lat], zoom: Math.max(map.getZoom(), 15) }); return; }
  let first = true;
  POS.watchId = navigator.geolocation.watchPosition((p) => {
    setPos(p.coords.latitude, p.coords.longitude, p.coords.accuracy, false);
    if (first && mapReady) { first = false; map.flyTo({ center: [p.coords.longitude, p.coords.latitude], zoom: 15 }); toast(`現在地（誤差 約${Math.round(p.coords.accuracy)}m）`); }
  }, (err) => { POS.watchId = null; $('#btn-locate').classList.remove('on'); toast(err && err.code === 1 ? '位置の許可がありません（ブラウザの設定で許可できます）。「👣 お試し歩き」でも試せます' : '位置が取れませんでした。「👣 お試し歩き」でも試せます'); }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
}
function setTrial(on) {
  POS.fake = on; $('#btn-trial').classList.toggle('on', on); $('#trial-banner').classList.toggle('hidden', !on); $('#btn-warp').classList.toggle('hidden', !on);
  if (on) { if (POS.watchId != null) { navigator.geolocation.clearWatch(POS.watchId); POS.watchId = null; } POS.follow = false; $('#btn-locate').classList.remove('on'); toast('お試し歩き：地図を押すと、そこにいることになります'); }
  else { POS.lat = null; POS.lon = null; if (mapReady) map.getSource('me').setData(geojsonMe()); updateNear(); }
}
function warp() {
  const pool = STORES.filter((s) => !s.demo); const st = pool[Math.floor(Math.random() * pool.length)];
  const lat = st.la + 0.0004, lon = st.lo + 0.0005; // 約60m 北東
  if (mapReady) map.jumpTo({ center: [lon, lat], zoom: 16 });
  setPos(lat, lon, 10, true); toast(`${st.n} の近くへワープしました`);
}
function updateNear() {
  const strip = $('#radar-items');
  if (POS.lat == null) { nearest = []; const had = inRange.size > 0; inRange = new Set(); strip.innerHTML = ''; stopPulse(); if (had) refreshMap(); renderRadar(); return; }
  const cand = []; for (const s of STORES) { if (Math.abs(s.la - POS.lat) > 0.03 || Math.abs(s.lo - POS.lon) > 0.036) continue; cand.push({ s, d: dist(POS.lat, POS.lon, s.la, s.lo) }); }
  cand.sort((a, b) => a.d - b.d); nearest = cand.slice(0, 30);
  const now = new Set(nearest.filter((x) => x.d <= RANGE_M).map((x) => x.s.i));
  const entered = [...now].filter((id) => !inRange.has(id));
  const changed = entered.length || [...inRange].some((id) => !now.has(id));
  inRange = now;
  if (entered.length) { try { if (navigator.vibrate) navigator.vibrate([60, 40, 60]); } catch (e) {} const first = BYID.get(entered[0]); toast(`📍 ${first.n}${entered.length > 1 ? ` ほか${entered.length - 1}店` : ''} が射程に入りました。印をもらえます`); }
  if (inRange.size) startPulse(); else stopPulse();
  if (changed) refreshMap();
  strip.innerHTML = nearest.slice(0, 8).map(({ s, d }) => `<div class="rchip ${d <= RANGE_M ? 'in' : ''}" data-id="${esc(s.i)}"><div class="n">${hasStamp(s.i) ? '🔴 ' : ''}${esc(s.n)}</div><div class="d">${d <= RANGE_M ? '射程内！' : `あと${fmtDist(d - RANGE_M)}`} ${arrowOf(bearing(POS.lat, POS.lon, s.la, s.lo))}</div></div>`).join('');
  $$('#radar-items .rchip').forEach((el) => el.addEventListener('click', () => openSheet(el.dataset.id)));
  renderRadar();
  const sheet = $('#sheet'); if (!sheet.classList.contains('hidden') && sheet.dataset.id) openSheet(sheet.dataset.id, true);
}
function renderRadar() {
  if (currentView !== 'radar') return;
  const st = $('#radar-status'), list = $('#radar-list');
  if (POS.lat == null) { st.textContent = '現在地がまだありません。地図の「◎」で追い始めるか、「👣」のお試し歩きで地図を押してください。'; list.innerHTML = ''; return; }
  st.innerHTML = `${POS.fake ? '<span class="badge blue">お試し</span>' : '<span class="badge blue">追跡中</span>'} ${POS.lat.toFixed(4)}, ${POS.lon.toFixed(4)}${POS.acc ? `　誤差 約${Math.round(POS.acc)}m` : ''}　射程内 <b>${inRange.size}</b>店`;
  list.innerHTML = nearest.map(({ s, d }) => `<div class="item ${d <= RANGE_M ? 'in' : ''}" data-id="${esc(s.i)}"><div class="main"><div class="name">${hasStamp(s.i) ? '🔴 ' : ''}${esc(s.n)}${s.u ? ' <span class="badge">古書店</span>' : ''}</div><div class="sub">${esc(s.a || prefOf(s))}　<span class="stars">${starsOf(rarityOf(s))}</span></div></div><div class="dist">${d <= RANGE_M ? '射程内' : fmtDist(d)} ${arrowOf(bearing(POS.lat, POS.lon, s.la, s.lo))}</div></div>`).join('') || '<div class="box muted">3kmの中に店がありません。</div>';
  $$('#radar-list .item').forEach((el) => el.addEventListener('click', () => openSheet(el.dataset.id)));
}

// ---------- 店のシート ----------
function openSheet(id, quiet) {
  const st = BYID.get(id); if (!st) return;
  const vs = visitsOf(id), cs = cardsOf(id), want = S.wants.includes(id), stamp = S.stamps[id], r = rarityOf(st);
  const d = POS.lat != null ? dist(POS.lat, POS.lon, st.la, st.lo) : null; const near = d != null && d <= RANGE_M;
  const badges = [];
  if (st.demo) badges.push('<span class="badge">見本（実在しません）</span>');
  if (st.custom) badges.push('<span class="badge">自分で追加</span>');
  if (st.u) badges.push('<span class="badge">古書店</span>');
  badges.push(stamp ? `<span class="badge shu">印あり ${fmtDate(stamp.d)}</span>` : vs.length ? `<span class="badge sumi">墨印 ${vs.length}回</span>` : '<span class="badge">まだ</span>');
  if (cs.length) badges.push(`<span class="badge">カード${cs.length}枚</span>`);
  if (want) badges.push('<span class="badge gold">行きたい</span>');
  if (near) badges.push('<span class="badge gold">射程内</span>');
  const rec = st.rec ? `<div class="staff"><div class="who">${esc(st.rec.who)}の手放せない1冊</div><div class="title">${esc(st.rec.title)}</div><div>${esc(st.rec.say)}</div><div class="muted small">棚：${esc(st.rec.shelf)}</div></div>` : '';
  const hist = vs.length ? `<div class="muted small" style="margin-top:8px">${vs.slice(-3).reverse().map((v) => `${fmtDate(v.d)}${v.near ? '（朱印）' : '（墨印）'}${v.memo ? '「' + esc(v.memo) + '」' : ''}`).join('<br>')}</div>` : '';
  const distText = d == null ? '現在地なし' : near ? `射程内（約${fmtDist(d)}）` : `ここから約${fmtDist(d)}（あと${fmtDist(d - RANGE_M)}で射程内）`;
  $('#sheet-body').innerHTML = `
    <div class="sheet-head"><div class="stamp-sm">${stampSVG(st, !!stamp, 72)}</div><div style="min-width:0"><h2>${esc(st.n)}</h2><div class="stars">${starsOf(r)} <span class="muted small">${r === 3 ? 'めったにない印' : r === 2 ? 'この街の印' : 'よくある印'}</span></div></div></div>
    <div style="margin-top:6px">${badges.join('')}</div>
    <div class="muted small">${esc(st.a || (st.custom ? '' : '住所の情報なし（地図データより）'))}　${esc(prefOf(st))}</div>
    <div class="muted small">${esc(distText)}</div>
    ${rec}${hist}
    <div class="actions">
      <button class="primary" data-act="checkin">${near ? (stamp ? '朱印をもう一度' : '印をもらう') : 'ここに来た（墨印）'}</button>
      <button data-act="card">この店で本と出会った</button>
      <button data-act="want">${want ? '☆ 行きたいを外す' : '☆ 行きたい'}</button>
    </div>`;
  $$('#sheet-body [data-act]').forEach((b) => b.addEventListener('click', () => {
    const a = b.dataset.act;
    if (a === 'checkin') startCheckin(st, near);
    else if (a === 'card') startCard(st);
    else { if (want) S.wants = S.wants.filter((x) => x !== id); else S.wants.push(id); save(); refreshMap(); openSheet(id, true); }
  }));
  const sheet = $('#sheet'); sheet.dataset.id = id; sheet.classList.remove('hidden');
  if (!quiet) { if (currentView !== 'map') switchView('map'); flyTo(st, 14); }
}
function closeSheet() { const s = $('#sheet'); s.classList.add('hidden'); s.dataset.id = ''; }
function openModal(html) { $('#modal-box').innerHTML = html; $('#modal').classList.remove('hidden'); $('#modal-box').scrollTop = 0; }
function closeModal() { if (scanStopper) { try { scanStopper(); } catch (e) {} scanStopper = null; } $('#modal').classList.add('hidden'); $('#modal-box').innerHTML = ''; }

// ---------- チェックイン → 印 ----------
function startCheckin(st, near) {
  const today = todayISO(); const stampedBefore = !!S.stamps[st.i]; const visitedToday = visitsOf(st.i).some((v) => v.d === today);
  const note = near ? (stampedBefore ? 'この店の印はもう持っています。もう一度押すと少し経験値が入ります。' : `射程内です。この店だけの印（${starsOf(rarityOf(st))}）を手に入れられます。`) : '店から離れています（位置がないか、射程の外）。墨印＝自己申告として記録します。印は手に入りません。';
  openModal(`
    <h2>${esc(st.n)}</h2>
    <div class="status ${near ? 'shu' : 'sumi'}">${esc(note)}</div>
    <div class="field"><label>一言メモ（任意・100字まで）</label><textarea id="ci-memo" maxlength="100" placeholder="例：文庫の棚が広い。店員さんの手書きPOPがよかった"></textarea></div>
    <div class="note">位置はこの画面の中で距離を出すためだけに使い、どこにも送りません。記録はこの端末の中だけに残ります。</div>
    <div class="actions"><button class="primary" id="ci-save">${near ? '印を押す' : '墨印で記録する'}</button><button class="ghost" id="ci-cancel">やめる</button></div>`);
  $('#ci-cancel').onclick = closeModal;
  $('#ci-save').onclick = () => {
    const memo = $('#ci-memo').value.trim();
    S.visits.push({ s: st.i, n: st.n, d: today, t: Date.now(), near, memo });
    let gain = 0; let isNew = false; const r = rarityOf(st);
    if (near) { if (!stampedBefore) { S.stamps[st.i] = { d: today, r }; isNew = true; gain += XP.shuFirst + (r === 3 ? XP.rare3 : r === 2 ? XP.rare2 : 0); } else gain += visitedToday ? 0 : XP.shuRepeat; }
    else gain += visitsOf(st.i).length <= 1 ? XP.sumiFirst : (visitedToday ? 0 : XP.sumiRepeat);
    const lv = addXP(gain); save(); refreshMap(); closeModal(); closeSheet();
    const rewards = checkMissionsAndRallies();
    showCapture(st, { gain, lv, isNew, near, rewards });
  };
}
function showCapture(st, { gain, lv, isNew, near, rewards }) {
  const r = rarityOf(st);
  $('#capture-box').innerHTML = `
    <div class="big">${stampSVG(st, near, 240)}</div>
    <h2>${near ? (isNew ? `${esc(st.n)}の印を手に入れた！` : `${esc(st.n)}に、また来た`) : `${esc(st.n)}に来た（墨印）`}</h2>
    <div class="stars">${near ? starsOf(r) : ''}</div>
    <div class="gain">+${gain} XP</div>
    ${lv.after > lv.before ? `<div class="lvup">レベルアップ！ Lv.${lv.after}</div>` : ''}
    ${rewards.map((x) => `<div class="lvup">${esc(x)}</div>`).join('')}
    <div class="actions" style="justify-content:center;margin-top:18px"><button class="primary" id="cp-card">この店で本と出会った → カード</button><button id="cp-close">閉じる</button></div>`;
  $('#capture').classList.remove('hidden');
  $('#cp-close').onclick = () => { $('#capture').classList.add('hidden'); openSheet(st.i, true); };
  $('#cp-card').onclick = () => { $('#capture').classList.add('hidden'); startCard(st); };
}

// ---------- ミッション・ラリー ----------
function missionDefs() {
  const ws = weekStartISO();
  const weekStamps = Object.entries(S.stamps).filter(([, v]) => v.d >= ws).map(([id]) => BYID.get(id)).filter(Boolean);
  const prefsBefore = new Set(Object.entries(S.stamps).filter(([, v]) => v.d < ws).map(([id]) => BYID.get(id)).filter(Boolean).map(prefOf));
  const newPrefs = new Set(weekStamps.map(prefOf).filter((p) => !prefsBefore.has(p)));
  return [
    { id: 'm1', name: '印を3つ集める', sub: '今週、射程内で押した朱印の数', cur: weekStamps.length, goal: 3 },
    { id: 'm2', name: '古書店で印を1つ', sub: '古書店のピンは「古書店」の札つき', cur: weekStamps.filter((s) => s.u).length, goal: 1 },
    { id: 'm3', name: '初めての県で印を1つ', sub: 'まだ印のない県の本屋へ', cur: newPrefs.size, goal: 1 },
    { id: 'm4', name: '本と出会う', sub: '今週、カードを1枚', cur: S.cards.filter((c) => c.d >= ws).length, goal: 1 },
  ];
}
function checkMissionsAndRallies() {
  const rewards = []; const wk = weekKey(); S.claimed[wk] = S.claimed[wk] || [];
  for (const m of missionDefs()) { if (m.cur >= m.goal && !S.claimed[wk].includes(m.id)) { S.claimed[wk].push(m.id); addXP(XP.mission); rewards.push(`ミッション達成「${m.name}」 +${XP.mission} XP`); } }
  for (const r of RALLIES) { if (!S.rallyDone[r.id] && r.stores.every((id) => hasStamp(id))) { S.rallyDone[r.id] = todayISO(); addXP(XP.rally); rewards.push(`ラリー制覇「${r.name}」 称号「${r.title}」 +${XP.rally} XP`); } }
  if (rewards.length) save();
  return rewards;
}
function renderMissions() {
  const wk = weekKey(); const claimed = S.claimed[wk] || []; $('#week-label').textContent = `（${wk}・月曜から）`;
  $('#mission-list').innerHTML = missionDefs().map((m) => { const done = m.cur >= m.goal; return `<div class="m ${done ? 'done' : ''}"><div class="h"><b>${done ? '✅ ' : ''}${esc(m.name)}</b><span class="muted small">${Math.min(m.cur, m.goal)}/${m.goal}${claimed.includes(m.id) ? `　+${XP.mission}XP` : ''}</span></div><div class="bar"><i style="width:${Math.min(100, Math.round((m.cur / m.goal) * 100))}%"></i></div><div class="sub">${esc(m.sub)}</div></div>`; }).join('');
  $('#rally-list').innerHTML = RALLIES.map((r) => { const got = r.stores.filter((id) => hasStamp(id)).length; const done = !!S.rallyDone[r.id]; return `<div class="m ${done ? 'done' : ''}"><div class="h"><b>${done ? '🏆 ' : ''}${esc(r.name)}</b><span class="muted small">${got}/${r.stores.length}</span></div><div class="bar"><i style="width:${Math.round((got / r.stores.length) * 100)}%"></i></div><div class="sub">${esc(r.desc)}　称号「${esc(r.title)}」</div><div class="sub" style="margin-top:4px">${r.stores.map((id) => { const s = BYID.get(id); return s ? `<span class="badge ${hasStamp(id) ? 'shu' : ''}">${esc(s.n)}</span>` : ''; }).join('')}</div><div class="actions"><button data-go="${esc(r.id)}">地図で見る</button></div></div>`; }).join('') || '<div class="box muted">ラリーのデータがありません。</div>';
  $$('#rally-list [data-go]').forEach((b) => b.addEventListener('click', () => { const r = RALLIES.find((x) => x.id === b.dataset.go); if (r && mapReady) { switchView('map'); map.flyTo({ center: [r.lo, r.la], zoom: 14.5 }); } }));
}

// ---------- カード（本との出会い） ----------
function startCard(st) {
  openModal(`
    <h2>この店で本と出会った</h2><p class="muted small">${esc(st.n)}</p>
    <div class="actions"><button class="primary" id="cd-scan">本の裏のバーコードを読む</button><button id="cd-manual">ISBNを入力する</button><button id="cd-free">本の名前を自分で書く</button><button class="ghost" id="cd-cancel">やめる</button></div>
    <div id="cd-area"></div>`);
  $('#cd-cancel').onclick = closeModal; $('#cd-manual').onclick = () => manualIsbn(st); $('#cd-free').onclick = () => cardForm(st, null); $('#cd-scan').onclick = () => scanIsbn(st);
}
function manualIsbn(st) {
  $('#cd-area').innerHTML = `<div class="field"><label>ISBN（978か979で始まる13桁。ハイフンは省いてよい）</label><input type="text" id="cd-isbn" inputmode="numeric" placeholder="9784..."></div><div class="actions"><button class="primary" id="cd-look">本をさがす</button></div><div id="cd-msg" class="muted small"></div>`;
  $('#cd-isbn').focus();
  const go = async () => { const isbn = $('#cd-isbn').value.replace(/[^0-9Xx]/g, ''); if (!/^97[89]\d{10}$/.test(isbn)) { $('#cd-msg').textContent = '13桁のISBNを入れてください'; return; } $('#cd-msg').textContent = 'openBDに問い合わせています…'; const b = await lookupIsbn(isbn); if (!b) { $('#cd-msg').textContent = 'この本の情報が見つかりませんでした。「本の名前を自分で書く」で続けられます。'; return; } cardForm(st, b); };
  $('#cd-look').onclick = go; $('#cd-isbn').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
}
function cleanAuthor(a) { return String(a).split(/\s+/).map((t) => t.replace(/,?\s*\d{4}-?(\d{4})?/g, '').replace(/,/g, '').trim()).filter(Boolean).join('、'); }
async function lookupIsbn(isbn) {
  try { const r = await fetch(`https://api.openbd.jp/v1/get?isbn=${isbn}`); const j = await r.json(); const s = j && j[0] && j[0].summary; if (!s) return null; return { isbn, title: s.title || '', author: cleanAuthor(s.author || ''), publisher: s.publisher || '', pubdate: s.pubdate || '', cover: s.cover || '' }; } catch (e) { return null; }
}
async function scanIsbn(st) {
  const area = $('#cd-area');
  area.innerHTML = `<video id="scanner" playsinline muted autoplay></video><div id="cd-msg" class="muted small">バーコード（978か979で始まる方）をカメラに向けてください</div><div class="actions"><button class="ghost" id="cd-stop">カメラを止める</button></div>`;
  const video = $('#scanner'); const msg = $('#cd-msg');
  let stopped = false; let stream = null; let reader = null;
  const stop = () => { stopped = true; try { if (reader && reader.reset) reader.reset(); } catch (e) {} if (stream) stream.getTracks().forEach((t) => t.stop()); };
  scanStopper = stop; $('#cd-stop').onclick = () => { stop(); area.innerHTML = ''; };
  const onCode = async (code) => { code = String(code).replace(/[^0-9]/g, ''); if (!/^97[89]\d{10}$/.test(code)) return false; stop(); msg.textContent = `読み取り：${code}。openBDに問い合わせています…`; const b = await lookupIsbn(code); cardForm(st, b || { isbn: code, title: '', author: '', publisher: '', cover: '' }); return true; };
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false }); video.srcObject = stream; await video.play(); }
  catch (e) { msg.textContent = 'カメラが使えませんでした（https でないか、許可されていません）。ISBNの入力で続けられます。'; return; }
  if ('BarcodeDetector' in window) {
    try { const det = new window.BarcodeDetector({ formats: ['ean_13'] }); const loop = async () => { if (stopped) return; try { const codes = await det.detect(video); for (const c of codes) { if (await onCode(c.rawValue)) return; } } catch (e) {} requestAnimationFrame(loop); }; loop(); return; } catch (e) { /* ZXingへ */ }
  }
  try {
    if (!window.ZXing) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    const hints = new Map(); hints.set(window.ZXing.DecodeHintType.POSSIBLE_FORMATS, [window.ZXing.BarcodeFormat.EAN_13]);
    reader = new window.ZXing.BrowserMultiFormatReader(hints, 300);
    reader.decodeFromStream(stream, video, (result) => { if (result && !stopped) onCode(result.getText()); });
  } catch (e) { msg.textContent = '読み取りの部品を読み込めませんでした。ISBNの入力で続けられます。'; }
}
function cardForm(st, b) {
  if (scanStopper) { try { scanStopper(); } catch (e) {} scanStopper = null; }
  const has = !!b && !!b.title;
  openModal(`
    <h2>カードを作る</h2>
    <div class="card-full">
      <div class="cover">${b && b.cover ? `<img src="${esc(b.cover)}" alt="" referrerpolicy="no-referrer">` : '<div class="notitle">表紙なし</div>'}</div>
      <div style="flex:1;min-width:0">
        ${has ? `<div><b>${esc(b.title)}</b></div><div class="muted small">${esc(b.author)}${b.publisher ? '／' + esc(b.publisher) : ''}</div>` : `<div class="field"><label>本の名前</label><input type="text" id="cd-title" placeholder="書名（わかれば著者も）"></div>`}
        <div class="muted small" style="margin-top:6px">${esc(st.n)}　${fmtDate(todayISO())}</div>
      </div>
    </div>
    <div class="field"><label>なぜ手に取ったか（任意・100字まで）</label><textarea id="cd-why" maxlength="100" placeholder="例：表紙の青に目がとまった。店員さんの手書きPOPに「泣いた」とあった"></textarea></div>
    <label class="chk"><input type="checkbox" id="cd-pub"> このカードを公開する（本番では「みんなの出会い」に流れます。試作では印が付くだけ）</label>
    <div class="note">表紙はopenBDから毎回表示するだけで、保存しません。記録はこの端末の中だけに残ります。</div>
    <div class="actions"><button class="primary" id="cd-save">カードにする（+${XP.card} XP）</button><button class="ghost" id="cd-cancel2">やめる</button></div>`);
  $('#cd-cancel2').onclick = closeModal;
  $('#cd-save').onclick = () => {
    const title = has ? b.title : ($('#cd-title') ? $('#cd-title').value.trim() : '');
    if (!title) { toast('本の名前を入れてください'); return; }
    S.cards.push({ id: 'c' + Date.now(), s: st.i, sn: st.n, d: todayISO(), t: Date.now(), isbn: b ? b.isbn : '', title, author: b ? b.author : '', publisher: b ? b.publisher : '', cover: b ? b.cover : '', why: $('#cd-why').value.trim(), pub: $('#cd-pub').checked ? 1 : 0 });
    const lv = addXP(XP.card); save(); refreshMap(); closeModal();
    const rewards = checkMissionsAndRallies();
    toast(`カードができました +${XP.card} XP${lv.after > lv.before ? `　レベルアップ！ Lv.${lv.after}` : ''}${rewards.length ? '　' + rewards[0] : ''}`);
    currentSub = 'cards'; switchView('zukan');
  };
}

// ---------- 図鑑 ----------
function renderZukan() {
  const ids = Object.keys(S.stamps); const visited = new Set([...S.visits.map((v) => v.s), ...S.cards.map((c) => c.s)]);
  const prefCount = {}; ids.forEach((id) => { const st = BYID.get(id); if (st) { const p = prefOf(st); prefCount[p] = (prefCount[p] || 0) + 1; } });
  $('#stats').innerHTML = [['印', ids.length], ['店', visited.size], ['カード', S.cards.length], ['都道府県', Object.keys(prefCount).length + '/47']].map(([l, n]) => `<div class="s"><div class="n">${n}</div><div class="l">${l}</div></div>`).join('');
  $('#titles').innerHTML = earnedTitles().map((t) => `<span class="t ${t.ok ? '' : 'off'}" title="${esc(t.need)}">${t.ok ? '🏅 ' : ''}${esc(t.t)}${t.ok ? '' : `（${esc(t.need)}）`}</span>`).join('');
  $$('.subtabs button').forEach((b) => b.classList.toggle('active', b.dataset.sub === currentSub));
  $$('.sub').forEach((el) => el.classList.toggle('active', el.id === 'sub-' + currentSub));
  const stamped = ids.map((id) => ({ st: BYID.get(id), d: S.stamps[id].d })).filter((x) => x.st).sort((a, b) => b.d.localeCompare(a.d));
  $('#stamp-grid').innerHTML = stamped.map(({ st, d }) => `<div class="st" data-id="${esc(st.i)}">${stampSVG(st, true, 84)}<div class="n">${esc(st.n)}</div><div class="n">${fmtDate(d)}</div></div>`).join('') || '<div class="box muted">まだ印はありません。店の射程内（120m）で「印をもらう」を押すと、ここに並びます。家で試すなら「👣 お試し歩き」→「⤴ ワープ」。</div>';
  $$('#stamp-grid .st').forEach((el) => el.addEventListener('click', () => openSheet(el.dataset.id)));
  renderCards();
  const md = todayISO().slice(5), y = new Date().getFullYear();
  const past = [...S.visits.filter((v) => v.d.slice(5) === md && +v.d.slice(0, 4) < y).map((v) => ({ y: +v.d.slice(0, 4), text: `${(BYID.get(v.s) || {}).n || v.n}に行った` })), ...S.cards.filter((c) => c.d.slice(5) === md && +c.d.slice(0, 4) < y).map((c) => ({ y: +c.d.slice(0, 4), text: `${c.sn}で『${c.title}』と出会った` }))];
  $('#anniv').innerHTML = past.length ? past.map((p) => `<div>${y - p.y}年前の今日、${esc(p.text)}</div>`).join('') : 'まだありません。来年のこの日に、今日の記録がここに出ます。';
  const rows = [...S.visits.map((v) => ({ t: v.t, d: v.d, id: v.s, html: `<div class="main"><div class="name">${esc((BYID.get(v.s) || {}).n || v.n)} <span class="badge ${v.near ? 'shu' : 'sumi'}">${v.near ? '朱印' : '墨印'}</span></div>${v.memo ? `<div class="sub">${esc(v.memo)}</div>` : ''}</div>` })), ...S.cards.map((c) => ({ t: c.t, d: c.d, id: c.s, html: `<div class="main"><div class="name">${esc(c.sn)} <span class="badge">カード</span></div><div class="sub">『${esc(c.title)}』</div></div>` }))].sort((a, b) => b.t - a.t);
  let last = '', html = ''; for (const r of rows) { if (r.d !== last) { html += `<div class="date">${fmtDate(r.d)}</div>`; last = r.d; } html += `<div class="item" data-id="${esc(r.id)}">${r.html}</div>`; }
  $('#visit-list').innerHTML = html || '<div class="box muted">まだ記録はありません。</div>';
  $$('#visit-list .item').forEach((el) => el.addEventListener('click', () => openSheet(el.dataset.id)));
  $('#prefs').innerHTML = PREFS.map(([n]) => { const c = prefCount[n] || 0; return `<div class="p ${c >= 3 ? 'v2' : c ? 'v1' : ''}" title="${esc(n)} ${c}">${esc(n.replace(/[都府県]$/, ''))}</div>`; }).join('');
}
function renderCards() {
  const g = $('#card-grid');
  if (!S.cards.length) { g.innerHTML = '<div class="box muted">まだカードはありません。店のページで「この店で本と出会った」を押すと、ここに増えます。</div>'; return; }
  g.innerHTML = S.cards.slice().reverse().map((c) => `<div class="card" data-id="${esc(c.id)}"><div class="cover">${c.cover ? `<img src="${esc(c.cover)}" alt="" referrerpolicy="no-referrer" loading="lazy">` : `<div class="notitle">${esc(c.title)}</div>`}</div><div class="stampmark">出会</div><div class="meta"><b>${esc(c.title)}</b>${esc(c.sn)}<br>${fmtDate(c.d)}${c.pub ? '・公開' : ''}</div></div>`).join('');
  $$('#card-grid .card').forEach((el) => el.addEventListener('click', () => openCard(el.dataset.id)));
}
function openCard(id) {
  const c = S.cards.find((x) => x.id === id); if (!c) return;
  openModal(`
    <h2>カード</h2>
    <div class="card-full"><div class="cover">${c.cover ? `<img src="${esc(c.cover)}" alt="" referrerpolicy="no-referrer">` : '<div class="notitle">表紙なし</div>'}</div>
      <div style="flex:1;min-width:0"><div><b>${esc(c.title)}</b></div><div class="muted small">${esc(c.author)}${c.publisher ? '／' + esc(c.publisher) : ''}</div><div style="margin-top:8px">${esc(c.sn)}</div><div class="muted small">${fmtDate(c.d)}${c.pub ? '・公開' : '・自分だけ'}</div>${c.why ? `<div class="why">${esc(c.why)}</div>` : ''}</div></div>
    <div class="actions"><button class="primary" id="cv-img">画像にする</button><button id="cv-store">店を地図で見る</button><button class="danger" id="cv-del">消す</button><button class="ghost" id="cv-close">閉じる</button></div><div id="cv-out"></div>`);
  $('#cv-close').onclick = closeModal; $('#cv-store').onclick = () => { closeModal(); openSheet(c.s); };
  $('#cv-del').onclick = () => { $('#cv-out').innerHTML = `<div class="status sumi">このカードを消しますか？ 戻せません。</div><div class="actions"><button class="danger" id="cv-del2">消す</button><button class="ghost" id="cv-del0">やめる</button></div>`; $('#cv-del0').onclick = () => { $('#cv-out').innerHTML = ''; }; $('#cv-del2').onclick = () => { S.cards = S.cards.filter((x) => x.id !== id); save(); refreshMap(); closeModal(); renderZukan(); toast('消しました'); }; };
  $('#cv-img').onclick = () => cardImage(c);
}
async function cardImage(c) {
  const W = 720, H = 960, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  g.fillStyle = '#f6f1e8'; g.fillRect(0, 0, W, H); g.strokeStyle = '#d9d0c2'; g.lineWidth = 4; g.strokeRect(24, 24, W - 48, H - 48);
  let coverDrawn = false;
  if (c.cover) { try { const img = await new Promise((res, rej) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = rej; im.src = c.cover; }); const ch = 480, cw = Math.round(ch * img.width / img.height); g.drawImage(img, (W - cw) / 2, 60, cw, ch); coverDrawn = true; } catch (e) {} }
  g.fillStyle = '#2b2622'; g.textAlign = 'center';
  const wrap = (text, max) => { const lines = []; let cur = ''; for (const ch of text) { if (g.measureText(cur + ch).width > max) { lines.push(cur); cur = ch; } else cur += ch; } if (cur) lines.push(cur); return lines; };
  let y = coverDrawn ? 600 : 220;
  g.font = 'bold 34px sans-serif'; wrap(c.title, W - 120).slice(0, 2).forEach((l) => { g.fillText(l, W / 2, y); y += 44; });
  g.font = '22px sans-serif'; g.fillStyle = '#6b625a'; if (c.author) { g.fillText(c.author, W / 2, y); y += 36; }
  y += 10; g.font = 'bold 28px sans-serif'; g.fillStyle = '#2b2622'; g.fillText(c.sn, W / 2, y); y += 40; g.font = '22px sans-serif'; g.fillStyle = '#6b625a'; g.fillText(fmtDate(c.d), W / 2, y); y += 44;
  if (c.why) { g.font = '24px sans-serif'; g.fillStyle = '#2b2622'; wrap(c.why, W - 140).slice(0, 4).forEach((l) => { g.fillText(l, W / 2, y); y += 34; }); }
  g.save(); g.translate(W - 120, H - 120); g.rotate(-0.15); g.strokeStyle = '#c8381f'; g.lineWidth = 6; g.beginPath(); g.arc(0, 0, 54, 0, Math.PI * 2); g.stroke(); g.fillStyle = '#c8381f'; g.font = 'bold 30px sans-serif'; g.fillText('出会', 0, 11); g.restore();
  try {
    const blob = await new Promise((res) => cv.toBlob(res, 'image/png')); if (!blob) throw new Error('noblob');
    const file = new File([blob], `card-${c.d}.png`, { type: 'image/png' });
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: c.title }); return; }
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000);
    $('#cv-out').innerHTML = `<p class="muted small">画像を保存しました（${file.name}）。</p>`;
  } catch (e) { $('#cv-out').innerHTML = '<p class="muted small">画像にできませんでした（表紙の画像が外部のため、ブラウザが書き出しを止めることがあります）。</p>'; }
}

// ---------- さがす・追加・バックアップ ----------
function searchStores(q) { const words = q.trim().split(/[\s　]+/).filter(Boolean); if (!words.length) return []; return STORES.filter((s) => { const hay = (s.n || '') + ' ' + (s.a || '') + ' ' + prefOf(s); return words.every((w) => hay.includes(w)); }).slice(0, 20); }
function setupSearch() {
  const inp = $('#search'), res = $('#search-results');
  inp.addEventListener('input', () => { if (!inp.value.trim()) { res.classList.add('hidden'); res.innerHTML = ''; return; } const hits = searchStores(inp.value);
    res.innerHTML = hits.map((s) => `<div class="item" data-id="${esc(s.i)}">${esc(s.n)}<div class="muted small">${esc(s.a || prefOf(s))}</div></div>`).join('') || '<div class="item muted">見つかりません。✎ で地図に追加できます</div>'; res.classList.remove('hidden');
    $$('#search-results .item[data-id]').forEach((el) => el.addEventListener('click', () => { res.classList.add('hidden'); inp.value = ''; const st = BYID.get(el.dataset.id); openSheet(st.i); flyTo(st, 15); })); });
  inp.addEventListener('blur', () => setTimeout(() => res.classList.add('hidden'), 200));
}
function startAdd() {
  const c = mapReady ? map.getCenter() : { lat: 35.68, lng: 139.77 };
  openModal(`<h2>地図にない本屋を追加</h2><p class="muted small">追加した店はこの端末の記録にだけ使えます（本番では確認のあと地図に載ります。店名は文字だけ）。</p>
    <div class="field"><label>店の名前</label><input type="text" id="ad-name" placeholder="例：○○書店 △△店"></div><label class="chk"><input type="checkbox" id="ad-used"> 古書店</label>
    <div class="field"><label>場所</label><label class="chk"><input type="radio" name="ad-pos" value="center" checked> いま地図の真ん中（${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}）</label><label class="chk"><input type="radio" name="ad-pos" value="here" ${POS.lat == null ? 'disabled' : ''}> いまいる場所</label></div>
    <div class="actions"><button class="primary" id="ad-save">追加する</button><button class="ghost" id="ad-cancel">やめる</button></div>`);
  $('#ad-cancel').onclick = closeModal; $('#ad-name').focus();
  $('#ad-save').onclick = () => { const n = $('#ad-name').value.trim(); if (!n) { toast('店の名前を入れてください'); return; } let la = c.lat, lo = c.lng; if ($('input[name=ad-pos]:checked').value === 'here' && POS.lat != null) { la = POS.lat; lo = POS.lon; }
    const st = { i: 'u' + Date.now(), n, la: +la.toFixed(5), lo: +lo.toFixed(5), u: $('#ad-used').checked ? 1 : undefined }; S.custom.push(st); save(); const full = Object.assign({}, st, { custom: 1 }); STORES.push(full); BYID.set(st.i, full); refreshMap(); updateNear(); closeModal(); toast('追加しました'); openSheet(st.i); };
}
function setupBackup() {
  const area = $('#backup-area');
  const empty = () => ({ visits: [], cards: [], wants: [], custom: [], stamps: {}, xp: 0, claimed: {}, rallyDone: {} });
  $('#btn-export').onclick = () => { const blob = new Blob([JSON.stringify({ app: 'honya-map', ver: APP_VER, at: new Date().toISOString(), data: S }, null, 1)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `honya-map-${todayISO()}.json`; a.click(); toast('書き出しました'); };
  $('#file-import').addEventListener('change', async (e) => { const f = e.target.files[0]; if (!f) return; try { const j = JSON.parse(await f.text()); const d = j.data || j; if (!d || !Array.isArray(d.visits)) throw new Error('bad');
      area.innerHTML = `<div class="status sumi">読み込むと、いまの記録（印${Object.keys(S.stamps).length}・カード${S.cards.length}）は置き換わります。</div><div class="actions"><button class="primary" id="bk-ok">置き換える</button><button class="ghost" id="bk-no">やめる</button></div>`;
      $('#bk-no').onclick = () => { area.innerHTML = ''; }; $('#bk-ok').onclick = async () => { S = Object.assign(empty(), d); save(); await loadData(); refreshMap(); renderZukan(); renderLevel(); area.innerHTML = ''; toast('読み込みました'); };
    } catch (err) { toast('読み込めませんでした（この試作で書き出したファイルを選んでください）'); } e.target.value = ''; });
  $('#btn-clear').onclick = () => { area.innerHTML = `<div class="status sumi">この端末の記録（印・訪問・カード・行きたい・追加した店・経験値）をすべて消します。戻せません。</div><div class="actions"><button class="danger" id="bk-clear2">消す</button><button class="ghost" id="bk-clear0">やめる</button></div>`; $('#bk-clear0').onclick = () => { area.innerHTML = ''; }; $('#bk-clear2').onclick = async () => { S = empty(); save(); await loadData(); refreshMap(); renderZukan(); renderLevel(); area.innerHTML = ''; toast('消しました'); }; };
}

// ---------- 画面の切り替え・起動 ----------
function switchView(v) {
  currentView = v;
  $$('.view').forEach((el) => el.classList.toggle('active', el.id === 'view-' + v));
  $$('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.view === v));
  if (v !== 'map') closeSheet();
  if (v === 'zukan') renderZukan(); if (v === 'mission') renderMissions(); if (v === 'radar') renderRadar();
  if (v === 'map' && mapReady) setTimeout(() => map.resize(), 50);
}
async function main() {
  load(); $('#ver').textContent = APP_VER; renderLevel();
  await loadData();
  initMap(); setupSearch(); setupBackup();
  $$('#tabs button').forEach((b) => b.addEventListener('click', () => switchView(b.dataset.view)));
  $$('.subtabs button').forEach((b) => b.addEventListener('click', () => { currentSub = b.dataset.sub; renderZukan(); }));
  $('#sheet-close').onclick = closeSheet;
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
  $('#btn-add').onclick = startAdd; $('#btn-locate').onclick = startWatch; $('#btn-trial').onclick = () => setTrial(!POS.fake); $('#btn-warp').onclick = warp;
  if ('serviceWorker' in navigator && location.protocol === 'https:') { navigator.serviceWorker.register('sw.js').catch(() => {}); }
}
main();
