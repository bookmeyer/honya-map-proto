/* 本屋の地図（試作） v0.3 位置ゲー版
   - 地図：MapLibre + OpenFreeMap（無料・鍵なし）／店：OpenStreetMapの書店 ＋ 利用者が追加した店
   - 現在地を追い、店から120m以内に入ると「射程内」。その店だけの印（秘境度でレア度）を手に入れる
   - 経験値・レベル・称号・今週のミッション・今週の推し店・ご当地ラリー・印を持つ店のまわりを朱に塗る
   - 印1つでガチャ券1枚 → 本のガチャ → 読みたい棚 → 本屋でその本と出会うとボーナス
   - 記録はこの端末の localStorage だけ。位置は端末の中で距離を出すだけで、どこにも送らない
   - 本：ISBN → openBD（書影は参照表示のみ） */
'use strict';

const APP_VER = '0.3.0';
const KEY = 'honya_map_v2';
const RANGE_M = 120;          // 射程（m）
const SENSE_M = 400;          // ここから近づくほど演出が強まる（m）
const TERRITORY_M = 200;      // 印を持つ店のまわりを塗る半径（m）
const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const XP = { shuFirst: 300, shuRepeat: 60, sumiFirst: 100, sumiRepeat: 20, card: 400, cardInStore: 200, cardWanted: 300, rare2: 100, rare3: 500, feat: 500, mission: 200, rally: 1000 };
const TITLES_STAMPS = [[1, 'はじめの一印'], [3, '本屋あるき'], [10, '本屋通'], [20, '本屋巡礼者'], [50, '本屋のぬし'], [100, '全国行脚']];
const TITLES_PREFS = [[2, '越境'], [5, '五県の旅人'], [10, '列島めぐり']];
const TITLES_USED = [[3, '古書の目利き']];
const TITLES_RARE = [[3, '秘境の本屋さがし']];

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
const DEMO_STORE = { i: 'demo1', n: '【見本】架空の本屋', la: 35.6812, lo: 139.7671, a: '（実在しません。公認店のページの見え方の見本）', p: '東京都', demo: 1, k: 0,
  rec: { who: '書店員 Aさん（見本）', title: '『（見本）手放せない1冊』', say: '（見本）取材でうかがった書店員さんのひとことが、ご本人の言葉のまま入ります。', shelf: '文庫の新刊台（見本）' } };

// ---------- 状態 ----------
const EMPTY = () => ({ visits: [], cards: [], wants: [], custom: [], stamps: {}, xp: 0, claimed: {}, rallyDone: {}, featDone: {}, tickets: 0, wantBooks: [], met: [], hidden: {}, seen: 0, lastPos: null });
let S = EMPTY();
let STORES = [], RALLIES = [], GACHA_ISBNS = [];
const BYID = new Map();
const FEAT = new Map();   // 県 → 今週の推し店の id
let map, mapReady = false;
let currentView = 'map', currentSub = 'stamps';
let scanStopper = null;
const POS = { lat: null, lon: null, acc: null, fake: false, watchId: null, at: 0, follow: false };
let nearest = [], inRange = new Set(), pulseTimer = null, pulseOn = false, lastBuzz = 0;

function load() { try { const j = JSON.parse(localStorage.getItem(KEY) || 'null'); if (j && typeof j === 'object') S = Object.assign(EMPTY(), j); } catch (e) { /* 初期状態 */ } }
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
function vibrate(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} }

// ---------- レベル・称号 ----------
const levelOf = (xp) => Math.floor(Math.sqrt(Math.max(xp, 0) / 150)) + 1;
const xpForLevel = (lv) => (lv - 1) ** 2 * 150;
const frameOf = (lv) => lv >= 8 ? 3 : lv >= 5 ? 2 : lv >= 3 ? 1 : 0;
function renderLevel() { const lv = levelOf(S.xp), cur = xpForLevel(lv), next = xpForLevel(lv + 1); $('#lv-label').textContent = `Lv.${lv}`; $('#xp-fill').style.width = `${Math.round(((S.xp - cur) / (next - cur)) * 100)}%`; $('#xp-text').textContent = `${S.xp} XP`; const got = earnedTitles().filter((t) => t.ok); $('#lv-title').textContent = got.length ? got[got.length - 1].t : ''; }
function addXP(n) { const before = levelOf(S.xp); S.xp += n; const after = levelOf(S.xp); renderLevel(); return { before, after }; }
function earnedTitles() {
  const ids = Object.keys(S.stamps); const sts = ids.map((id) => BYID.get(id)).filter(Boolean); const prefs = new Set(sts.map(prefOf)); const used = sts.filter((s) => s.u).length; const rare = sts.filter((s) => rarityOf(s) === 3).length;
  const out = [];
  TITLES_STAMPS.forEach(([n, t]) => out.push({ t, ok: ids.length >= n, need: `印${n}` }));
  TITLES_PREFS.forEach(([n, t]) => out.push({ t, ok: prefs.size >= n, need: `${n}県` }));
  TITLES_USED.forEach(([n, t]) => out.push({ t, ok: used >= n, need: `古書店${n}` }));
  TITLES_RARE.forEach(([n, t]) => out.push({ t, ok: rare >= n, need: `秘境の印${n}` }));
  RALLIES.forEach((r) => out.push({ t: r.title, ok: !!S.rallyDone[r.id], need: r.name }));
  return out;
}

// ---------- 印（その店だけの印）：レア度は秘境度（周り5kmの本屋の数）から ----------
function rarityOf(st) { if (st.demo) return 3; const k = st.k == null ? 3 : st.k; return k === 0 ? 3 : k <= 6 ? 2 : 1; }
const starsOf = (r) => '★'.repeat(r) + '☆'.repeat(3 - r);
function rarityText(st) { const r = rarityOf(st); if (st.demo) return 'めったにない印（見本）'; if (st.k == null) return 'この街の印'; return r === 3 ? '秘境の印（周り5kmに本屋なし）' : r === 2 ? `この街の印（周り5kmに本屋 ${st.k}店）` : `よくある印（周り5kmに本屋 ${st.k}店）`; }
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

// ---------- 店データ・今週の推し店 ----------
async function loadData() {
  let base = []; try { const r = await fetch('data/bookstores.json', { cache: 'no-cache' }); if (r.ok) base = await r.json(); } catch (e) {}
  try { const r = await fetch('data/rallies.json', { cache: 'no-cache' }); if (r.ok) RALLIES = await r.json(); } catch (e) {}
  try { const r = await fetch('data/gacha_books.json', { cache: 'no-cache' }); if (r.ok) GACHA_ISBNS = (await r.json()).isbns || []; } catch (e) {}
  STORES = [DEMO_STORE, ...base, ...S.custom.map((c) => Object.assign({}, c, { custom: 1 }))].filter((s) => !S.hidden[s.i]);
  BYID.clear(); STORES.forEach((s) => BYID.set(s.i, s));
  computeFeatured();
  if (!base.length) toast('店のデータが読み込めませんでした。見本と追加した店だけ出します');
}
function computeFeatured() {
  const wk = weekKey(); const byPref = {};
  for (const s of STORES) { if (s.demo || s.custom) continue; const p = prefOf(s); (byPref[p] = byPref[p] || []).push(s); }
  FEAT.clear();
  for (const [p, arr] of Object.entries(byPref)) { arr.sort((a, b) => (a.i < b.i ? -1 : 1)); FEAT.set(p, arr[hash32(wk + '|' + p) % arr.length].i); }
}
const isFeat = (id) => { for (const v of FEAT.values()) if (v === id) return true; return false; };
function geojsonStores() { return { type: 'FeatureCollection', features: STORES.map((s) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [s.lo, s.la] }, properties: { id: s.i, st: stateOf(s.i), stamp: hasStamp(s.i) ? 1 : 0, want: S.wants.includes(s.i) ? 1 : 0, near: inRange.has(s.i) ? 1 : 0, feat: isFeat(s.i) ? 1 : 0, r: rarityOf(s), custom: s.custom ? 1 : 0, demo: s.demo ? 1 : 0 } })) }; }
function circlePoly(lon, lat, m, n = 28) { const pts = []; const dLat = m / 111320, dLon = m / (111320 * Math.cos(lat * Math.PI / 180)); for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2; pts.push([lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)]); } return [pts]; }
function geojsonTerritory() { return { type: 'FeatureCollection', features: Object.keys(S.stamps).map((id) => BYID.get(id)).filter(Boolean).map((s) => ({ type: 'Feature', geometry: { type: 'Polygon', coordinates: circlePoly(s.lo, s.la, TERRITORY_M) }, properties: {} })) }; }
function geojsonMe() { if (POS.lat == null) return { type: 'FeatureCollection', features: [] }; return { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: circlePoly(POS.lon, POS.lat, Math.min(POS.acc || 0, 500)) }, properties: { k: 'acc' } }, { type: 'Feature', geometry: { type: 'Polygon', coordinates: circlePoly(POS.lon, POS.lat, RANGE_M) }, properties: { k: 'range' } }, { type: 'Feature', geometry: { type: 'Point', coordinates: [POS.lon, POS.lat] }, properties: { k: 'me', fake: POS.fake ? 1 : 0 } }] }; }
function refreshMap() { if (!mapReady) return; map.getSource('stores').setData(geojsonStores()); map.getSource('territory').setData(geojsonTerritory()); map.getSource('me').setData(geojsonMe()); }

// ---------- 地図 ----------
function initMap() {
  const lp = S.lastPos; const center = lp ? [lp.lon, lp.lat] : [137.5, 37.3]; const zoom = lp ? 14 : 5;
  map = new maplibregl.Map({ container: 'map', style: STYLE_URL, center, zoom, attributionControl: { compact: true }, preserveDrawingBuffer: true });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
  map.on('load', () => {
    map.addSource('territory', { type: 'geojson', data: geojsonTerritory() });
    map.addLayer({ id: 'territory-fill', type: 'fill', source: 'territory', paint: { 'fill-color': '#c8381f', 'fill-opacity': 0.13 } });
    map.addLayer({ id: 'territory-line', type: 'line', source: 'territory', paint: { 'line-color': '#c8381f', 'line-opacity': 0.5, 'line-width': 1 } });
    map.addSource('me', { type: 'geojson', data: geojsonMe() });
    map.addLayer({ id: 'me-acc', type: 'fill', source: 'me', filter: ['==', ['get', 'k'], 'acc'], paint: { 'fill-color': '#2b6cb0', 'fill-opacity': 0.10 } });
    map.addLayer({ id: 'me-range', type: 'line', source: 'me', filter: ['==', ['get', 'k'], 'range'], paint: { 'line-color': '#c9a227', 'line-width': 1.5, 'line-dasharray': [2, 2], 'line-opacity': 0.8 } });
    map.addSource('stores', { type: 'geojson', data: geojsonStores() });
    map.addLayer({ id: 'near-pulse', type: 'circle', source: 'stores', filter: ['==', ['get', 'near'], 1], paint: { 'circle-radius': 16, 'circle-color': '#c9a227', 'circle-opacity': 0.25 } });
    map.addLayer({ id: 'feat-ring', type: 'circle', source: 'stores', filter: ['==', ['get', 'feat'], 1], paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 8, 10, 14, 14, 20], 'circle-color': '#7c3aed', 'circle-opacity': 0.12, 'circle-stroke-color': '#7c3aed', 'circle-stroke-width': 2 } });
    map.addLayer({ id: 'stores-halo', type: 'circle', source: 'stores', filter: ['>', ['get', 'st'], 0], paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 6, 10, 11, 14, 16], 'circle-color': '#c8381f', 'circle-opacity': 0.16 } });
    map.addLayer({ id: 'stores', type: 'circle', source: 'stores', paint: {
      'circle-radius': ['case', ['==', ['get', 'near'], 1], ['interpolate', ['linear'], ['zoom'], 10, 7, 14, 11], ['==', ['get', 'r'], 3], ['interpolate', ['linear'], ['zoom'], 4, 3.2, 8, 5, 11, 7, 14, 9.5], ['interpolate', ['linear'], ['zoom'], 4, 2.6, 8, 4, 11, 6, 14, 8.5]],
      'circle-color': ['case', ['==', ['get', 'stamp'], 1], '#c8381f', ['==', ['get', 'st'], 2], '#8e1d12', ['==', ['get', 'st'], 1], '#d9412a', ['==', ['get', 'r'], 3], '#8f7a3a', '#b8b0a3'],
      'circle-opacity': ['case', ['==', ['get', 'st'], 0], ['case', ['==', ['get', 'near'], 1], 0.95, 0.65], 0.95],
      'circle-stroke-width': ['case', ['==', ['get', 'near'], 1], 3, ['==', ['get', 'feat'], 1], 2.5, ['==', ['get', 'want'], 1], 2.5, ['any', ['==', ['get', 'custom'], 1], ['==', ['get', 'demo'], 1]], 1.5, 0.6],
      'circle-stroke-color': ['case', ['==', ['get', 'near'], 1], '#c9a227', ['==', ['get', 'feat'], 1], '#7c3aed', ['==', ['get', 'want'], 1], '#c9a227', ['any', ['==', ['get', 'custom'], 1], ['==', ['get', 'demo'], 1]], '#2b2622', '#ffffff'],
    } });
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
  S.lastPos = { lat: +lat.toFixed(4), lon: +lon.toFixed(4) }; save();
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
function warp(target) {
  let st = target;
  if (!st) { const pool = STORES.filter((s) => !s.demo && !hasStamp(s.i)); st = pool[Math.floor(Math.random() * pool.length)]; }
  const lat = st.la + 0.0004, lon = st.lo + 0.0005; // 約60m 北東
  if (mapReady) map.jumpTo({ center: [lon, lat], zoom: 16 });
  setPos(lat, lon, 10, true); toast(`${st.n} の近くへワープしました`);
}
function setGlow(d) {
  const g = $('#glow'); if (d == null || d > SENSE_M) { g.className = 'glow'; g.style.opacity = 0; return; }
  if (d <= RANGE_M) { g.className = 'glow'; g.style.opacity = 0; return; }
  const t = (d - RANGE_M) / (SENSE_M - RANGE_M); // 0=すぐそこ 1=遠い
  g.className = 'glow beat'; g.style.setProperty('--beat', `${(0.35 + t * 1.3).toFixed(2)}s`); g.style.opacity = (0.25 + (1 - t) * 0.75).toFixed(2);
  const gap = 350 + t * 1500; if (Date.now() - lastBuzz > gap) { lastBuzz = Date.now(); vibrate(18); }
}
function updateNear() {
  const strip = $('#radar-items'); const quest = $('#first-quest');
  if (POS.lat == null) { nearest = []; const had = inRange.size > 0; inRange = new Set(); strip.innerHTML = ''; quest.classList.add('hidden'); stopPulse(); setGlow(null); if (had) refreshMap(); renderRadar(); return; }
  const cand = []; for (const s of STORES) { if (Math.abs(s.la - POS.lat) > 0.03 || Math.abs(s.lo - POS.lon) > 0.036) continue; cand.push({ s, d: dist(POS.lat, POS.lon, s.la, s.lo) }); }
  cand.sort((a, b) => a.d - b.d); nearest = cand.slice(0, 30);
  const now = new Set(nearest.filter((x) => x.d <= RANGE_M).map((x) => x.s.i));
  const entered = [...now].filter((id) => !inRange.has(id));
  const changed = entered.length || [...inRange].some((id) => !now.has(id));
  inRange = now;
  if (entered.length) { vibrate([60, 40, 60, 40, 120]); const g = $('#glow'); g.className = 'glow gold'; g.style.opacity = '1'; setTimeout(() => { if (g.className === 'glow gold') { g.className = 'glow'; g.style.opacity = '0'; } }, 900); const first = BYID.get(entered[0]); toast(`📍 ${first.n}${entered.length > 1 ? ` ほか${entered.length - 1}店` : ''} が射程に入りました。印をもらえます`); }
  else { const nd = nearest.find((x) => !hasStamp(x.s.i)); setGlow(nd ? nd.d : null); }
  if (inRange.size) startPulse(); else stopPulse();
  if (changed) refreshMap();
  // 最初のクエスト：いちばん近い「まだ」の店
  const target = nearest.find((x) => !hasStamp(x.s.i));
  if (target && !inRange.size) { quest.classList.remove('hidden'); quest.innerHTML = `いちばん近い本屋 <b>${esc(target.s.n)}</b> まで あと${fmtDist(Math.max(0, target.d - RANGE_M))} ${arrowOf(bearing(POS.lat, POS.lon, target.s.la, target.s.lo))}`; quest.onclick = () => openSheet(target.s.i); } else quest.classList.add('hidden');
  strip.innerHTML = nearest.slice(0, 8).map(({ s, d }) => `<div class="rchip ${d <= RANGE_M ? 'in' : ''}" data-id="${esc(s.i)}"><div class="n">${hasStamp(s.i) ? '🔴 ' : ''}${isFeat(s.i) ? '👑 ' : ''}${esc(s.n)}</div><div class="d">${d <= RANGE_M ? '射程内！' : `あと${fmtDist(d - RANGE_M)}`} ${arrowOf(bearing(POS.lat, POS.lon, s.la, s.lo))} <span class="stars">${'★'.repeat(rarityOf(s))}</span></div></div>`).join('');
  $$('#radar-items .rchip').forEach((el) => el.addEventListener('click', () => openSheet(el.dataset.id)));
  renderRadar();
  const sheet = $('#sheet'); if (!sheet.classList.contains('hidden') && sheet.dataset.id) openSheet(sheet.dataset.id, true);
}
function renderRadar() {
  if (currentView !== 'radar') return;
  const st = $('#radar-status'), list = $('#radar-list');
  if (POS.lat == null) { st.textContent = '現在地がまだありません。地図の「◎」で追い始めるか、「👣」のお試し歩きで地図を押してください。'; list.innerHTML = ''; return; }
  st.innerHTML = `${POS.fake ? '<span class="badge blue">お試し</span>' : '<span class="badge blue">追跡中</span>'} ${POS.lat.toFixed(4)}, ${POS.lon.toFixed(4)}${POS.acc ? `　誤差 約${Math.round(POS.acc)}m` : ''}　射程内 <b>${inRange.size}</b>店`;
  list.innerHTML = nearest.map(({ s, d }) => `<div class="item ${d <= RANGE_M ? 'in' : ''}" data-id="${esc(s.i)}"><div class="main"><div class="name">${hasStamp(s.i) ? '🔴 ' : ''}${isFeat(s.i) ? '<span class="crown">👑</span> ' : ''}${esc(s.n)}${s.u ? ' <span class="badge">古書店</span>' : ''}</div><div class="sub">${esc(s.a || prefOf(s))}　<span class="stars">${starsOf(rarityOf(s))}</span></div></div><div class="dist">${d <= RANGE_M ? '射程内' : fmtDist(d)} ${arrowOf(bearing(POS.lat, POS.lon, s.la, s.lo))}</div></div>`).join('') || '<div class="box muted">3kmの中に店がありません。</div>';
  $$('#radar-list .item').forEach((el) => el.addEventListener('click', () => openSheet(el.dataset.id)));
}

// ---------- 店のシート ----------
function openSheet(id, quiet) {
  const st = BYID.get(id); if (!st) return;
  const vs = visitsOf(id), cs = cardsOf(id), want = S.wants.includes(id), stamp = S.stamps[id], r = rarityOf(st), feat = isFeat(st.i);
  const d = POS.lat != null ? dist(POS.lat, POS.lon, st.la, st.lo) : null; const near = d != null && d <= RANGE_M;
  const badges = [];
  if (st.demo) badges.push('<span class="badge">見本（実在しません）</span>');
  if (st.custom) badges.push('<span class="badge">自分で追加</span>');
  if (feat) badges.push(`<span class="badge feat">👑 今週の推し店（${esc(prefOf(st))}）</span>`);
  if (st.u) badges.push('<span class="badge">古書店</span>');
  badges.push(stamp ? `<span class="badge shu">印あり ${fmtDate(stamp.d)}</span>${stamp.trial ? '<span class="badge trial">体験</span>' : ''}` : vs.length ? `<span class="badge sumi">墨印 ${vs.length}回</span>` : '<span class="badge">まだ</span>');
  if (cs.length) badges.push(`<span class="badge">カード${cs.length}枚</span>`);
  if (want) badges.push('<span class="badge gold">行きたい</span>');
  if (near) badges.push('<span class="badge gold">射程内</span>');
  const rec = st.rec ? `<div class="staff"><div class="who">${esc(st.rec.who)}の手放せない1冊</div><div class="title">${esc(st.rec.title)}</div><div>${esc(st.rec.say)}</div><div class="muted small">棚：${esc(st.rec.shelf)}</div></div>` : '';
  const hist = vs.length ? `<div class="muted small" style="margin-top:8px">${vs.slice(-3).reverse().map((v) => `${fmtDate(v.d)}${v.near ? '（朱印）' : '（墨印）'}${v.memo ? '「' + esc(v.memo) + '」' : ''}`).join('<br>')}</div>` : '';
  const distText = d == null ? '現在地なし' : near ? `射程内（約${fmtDist(d)}）` : `ここから約${fmtDist(d)}（あと${fmtDist(d - RANGE_M)}で射程内）`;
  $('#sheet-body').innerHTML = `
    <div class="sheet-head"><div class="stamp-sm">${stampSVG(st, !!stamp, 72)}</div><div style="min-width:0"><h2>${esc(st.n)}</h2><div class="stars">${starsOf(r)} <span class="muted small">${esc(rarityText(st))}</span></div></div></div>
    <div style="margin-top:6px">${badges.join('')}</div>
    <div class="muted small">${esc(st.a || (st.custom ? '' : '住所の情報なし（地図データより）'))}　${esc(prefOf(st))}</div>
    <div class="muted small">${esc(distText)}</div>
    ${rec}${hist}
    <div class="actions">
      <button class="primary" data-act="checkin">${near ? (stamp ? '朱印をもう一度' : `印をもらう${feat ? '（+${XP.feat}）' : ''}`) : 'ここに来た（墨印）'}</button>
      <button data-act="card">この店で本と出会った</button>
      <button data-act="want">${want ? '☆ 行きたいを外す' : '☆ 行きたい'}</button>
      ${stamp ? '<button data-act="share">印をシェア</button>' : ''}
      ${POS.fake && !near ? '<button data-act="warp">⤴ この店へワープ</button>' : ''}
      ${st.demo || st.custom ? '' : '<button class="ghost" data-act="report">本屋ではない／閉店</button>'}
    </div><div id="sheet-extra"></div>`;
  $$('#sheet-body [data-act]').forEach((b) => b.addEventListener('click', () => {
    const a = b.dataset.act;
    if (a === 'checkin') startCheckin(st, near);
    else if (a === 'card') startCard(st);
    else if (a === 'share') shareStamp(st);
    else if (a === 'warp') warp(st);
    else if (a === 'report') reportStore(st);
    else { if (want) S.wants = S.wants.filter((x) => x !== id); else S.wants.push(id); save(); refreshMap(); openSheet(id, true); }
  }));
  const sheet = $('#sheet'); sheet.dataset.id = id; sheet.classList.remove('hidden');
  if (!quiet) { if (currentView !== 'map') switchView('map'); flyTo(st, 14); }
}
function closeSheet() { const s = $('#sheet'); s.classList.add('hidden'); s.dataset.id = ''; }
function openModal(html) { $('#modal-box').innerHTML = html; $('#modal').classList.remove('hidden'); $('#modal-box').scrollTop = 0; }
function closeModal() { if (scanStopper) { try { scanStopper(); } catch (e) {} scanStopper = null; } $('#modal').classList.add('hidden'); $('#modal-box').innerHTML = ''; }
function reportStore(st) {
  const x = $('#sheet-extra'); x.innerHTML = `<div class="status sumi">この店を地図から外しますか？（この端末だけ。本番では確認のうえ直します）</div><div class="actions"><button class="danger" id="rp-ok">外す</button><button class="ghost" id="rp-no">やめる</button></div>`;
  $('#rp-no').onclick = () => { x.innerHTML = ''; };
  $('#rp-ok').onclick = () => { S.hidden[st.i] = { d: todayISO(), n: st.n }; save(); STORES = STORES.filter((s) => s.i !== st.i); BYID.delete(st.i); computeFeatured(); refreshMap(); updateNear(); closeSheet(); toast(`${st.n} を外しました（図鑑の「帳」から戻せます）`); };
}

// ---------- チェックイン → 印 ----------
function startCheckin(st, near) {
  const today = todayISO(); const stampedBefore = !!S.stamps[st.i]; const visitedToday = visitsOf(st.i).some((v) => v.d === today);
  const feat = isFeat(st.i); const wk = weekKey(); const featGot = (S.featDone[wk] || []).includes(st.i);
  const note = near ? (stampedBefore ? 'この店の印はもう持っています。もう一度押すと少し経験値が入ります。' : `射程内です。この店だけの印（${starsOf(rarityOf(st))}）を手に入れられます。${feat && !featGot ? ` 今週の推し店なので +${XP.feat} XP。` : ''}`) : '店から離れています（位置がないか、射程の外）。墨印＝自己申告として記録します。印は手に入りません。';
  openModal(`
    <h2>${esc(st.n)}</h2>
    <div class="status ${near ? 'shu' : 'sumi'}">${esc(note)}</div>
    <div class="field"><label>一言メモ（任意・100字まで）</label><textarea id="ci-memo" maxlength="100" placeholder="例：文庫の棚が広い。店員さんの手書きPOPがよかった"></textarea></div>
    <div class="note">位置はこの画面の中で距離を出すためだけに使い、どこにも送りません。記録はこの端末の中だけに残ります。</div>
    <div class="actions"><button class="primary" id="ci-save">${near ? '印を押す' : '墨印で記録する'}</button><button class="ghost" id="ci-cancel">やめる</button></div>`);
  $('#ci-cancel').onclick = closeModal;
  $('#ci-save').onclick = () => {
    const memo = $('#ci-memo').value.trim();
    S.visits.push({ s: st.i, n: st.n, d: today, t: Date.now(), near, memo, trial: POS.fake ? 1 : 0 });
    let gain = 0; let isNew = false; let ticket = 0; const r = rarityOf(st); const extras = [];
    if (near) {
      if (!stampedBefore) { S.stamps[st.i] = { d: today, r, trial: POS.fake ? 1 : 0 }; isNew = true; gain += XP.shuFirst + (r === 3 ? XP.rare3 : r === 2 ? XP.rare2 : 0); ticket = 1; S.tickets += 1; }
      else gain += visitedToday ? 0 : XP.shuRepeat;
      if (feat && !featGot) { S.featDone[wk] = S.featDone[wk] || []; S.featDone[wk].push(st.i); gain += XP.feat; extras.push(`👑 今週の推し店 +${XP.feat} XP`); }
    } else gain += visitsOf(st.i).length <= 1 ? XP.sumiFirst : (visitedToday ? 0 : XP.sumiRepeat);
    const lv = addXP(gain); save(); refreshMap(); closeModal(); closeSheet();
    const rewards = [...extras, ...checkMissionsAndRallies()];
    showCapture(st, { gain, lv, isNew, near, rewards, ticket });
  };
}
function showCapture(st, { gain, lv, isNew, near, rewards, ticket }) {
  const r = rarityOf(st);
  $('#capture-box').innerHTML = `
    <div class="big">${stampSVG(st, near, 240)}</div>
    <h2>${near ? (isNew ? `${esc(st.n)}の印を手に入れた！` : `${esc(st.n)}に、また来た`) : `${esc(st.n)}に来た（墨印）`}</h2>
    <div class="stars">${near ? starsOf(r) + ' ' + esc(rarityText(st)) : ''}</div>
    <div class="gain">+${gain} XP${ticket ? `　🎟 ガチャ券 +${ticket}` : ''}</div>
    ${lv.after > lv.before ? `<div class="lvup">レベルアップ！ Lv.${lv.after}</div>` : ''}
    ${rewards.map((x) => `<div class="lvup">${esc(x)}</div>`).join('')}
    <div class="actions" style="justify-content:center;margin-top:18px">
      <button class="primary wide" id="cp-card">この店で本と出会った → カード（+${XP.card}〜）</button>
      ${near ? '<button id="cp-share">印をシェア</button>' : ''}
      ${ticket ? '<button id="cp-gacha">🎟 ガチャを引く</button>' : ''}
      <button id="cp-close">閉じる</button>
    </div>`;
  $('#capture').classList.remove('hidden');
  $('#cp-close').onclick = () => { $('#capture').classList.add('hidden'); openSheet(st.i, true); };
  $('#cp-card').onclick = () => { $('#capture').classList.add('hidden'); startCard(st); };
  if ($('#cp-share')) $('#cp-share').onclick = () => shareStamp(st);
  if ($('#cp-gacha')) $('#cp-gacha').onclick = () => { $('#capture').classList.add('hidden'); startGacha(); };
}

// ---------- 印のシェア画像 ----------
function svgToImage(svg) { return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); }); }
async function shareStamp(st) {
  const W = 1080, H = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  g.fillStyle = '#f6f1e8'; g.fillRect(0, 0, W, H);
  // 地図の切り抜き（描ければ）
  let mapDrawn = false;
  if (mapReady) { try { const mc = map.getCanvas(); const side = Math.min(mc.width, mc.height); g.save(); g.beginPath(); g.roundRect ? g.roundRect(60, 60, W - 120, W - 120, 28) : g.rect(60, 60, W - 120, W - 120); g.clip(); g.drawImage(mc, (mc.width - side) / 2, (mc.height - side) / 2, side, side, 60, 60, W - 120, W - 120); g.restore(); mapDrawn = true; } catch (e) { mapDrawn = false; } }
  if (!mapDrawn) { g.fillStyle = '#efe7d9'; g.fillRect(60, 60, W - 120, W - 120); }
  g.strokeStyle = '#d9d0c2'; g.lineWidth = 4; g.strokeRect(60, 60, W - 120, W - 120);
  try { const im = await svgToImage(stampSVG(st, true, 360)); g.save(); g.translate(W - 60 - 190, W - 60 - 190); g.rotate(-0.12); g.shadowColor = 'rgba(0,0,0,.25)'; g.shadowBlur = 24; g.drawImage(im, -180, -180, 360, 360); g.restore(); } catch (e) {}
  g.fillStyle = '#2b2622'; g.textAlign = 'left'; g.font = 'bold 56px sans-serif';
  const name = st.n.length > 14 ? st.n.slice(0, 14) + '…' : st.n; g.fillText(name, 60, W + 40);
  g.font = '34px sans-serif'; g.fillStyle = '#6b625a'; g.fillText(`${prefOf(st)}　${starsOf(rarityOf(st))}　${rarityText(st)}`, 60, W + 96);
  g.fillText(`${fmtDate((S.stamps[st.i] || {}).d || todayISO())}　印 ${Object.keys(S.stamps).length}個目`, 60, W + 146);
  g.font = 'bold 30px sans-serif'; g.fillStyle = '#c8381f'; g.fillText('本屋の地図（試作）', 60, H - 70);
  try {
    const blob = await new Promise((res) => cv.toBlob(res, 'image/png')); if (!blob) throw new Error('noblob');
    const file = new File([blob], `honya-${st.i}.png`, { type: 'image/png' });
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: `${st.n}の印`, text: `${st.n}の印を手に入れた #本屋の地図` }); return; }
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000); toast('画像を保存しました');
  } catch (e) { if (e && e.name === 'AbortError') return; toast('画像にできませんでした'); }
}

// ---------- ガチャ（印1つ＝券1枚）と読みたい棚 ----------
function startGacha() {
  if (!S.tickets) { toast('ガチャ券がありません。印を1つ手に入れると1枚もらえます'); return; }
  if (!GACHA_ISBNS.length) { toast('ガチャの本のデータがありません'); return; }
  openModal(`<h2>本のガチャ</h2><p class="muted small">🎟 ガチャ券 ${S.tickets}枚。出た本は「読みたい棚」に入り、本屋でその本と出会う（買ってバーコードを読む）と +${XP.cardWanted} XP。</p><div class="capsule"></div><div id="gc-out" class="muted small" style="text-align:center">カプセルを開けています…</div>`);
  S.tickets -= 1; save();
  const pool = GACHA_ISBNS.filter((i) => !S.wantBooks.some((w) => w.isbn === i) && !S.met.includes(i)); const isbn = (pool.length ? pool : GACHA_ISBNS)[Math.floor(Math.random() * (pool.length ? pool.length : GACHA_ISBNS.length))];
  const t0 = Date.now();
  lookupIsbn(isbn).then((b) => {
    const wait = Math.max(0, 2200 - (Date.now() - t0));
    setTimeout(() => {
      if (!$('#gc-out')) return;
      const book = b || { isbn, title: `ISBN ${isbn}`, author: '', publisher: '', cover: '' };
      vibrate([30, 30, 80]);
      $('#modal-box').innerHTML = `<h2>出た！</h2><div class="book-hit"><div class="cover">${book.cover ? `<img src="${esc(book.cover)}" alt="" referrerpolicy="no-referrer">` : '<div class="notitle">表紙なし</div>'}</div><div style="flex:1;min-width:0"><div><b>${esc(book.title)}</b></div><div class="muted small">${esc(book.author)}${book.publisher ? '／' + esc(book.publisher) : ''}</div><div class="muted small" style="margin-top:6px">${S.wantBooks.some((w) => w.isbn === isbn) ? 'もう棚にあります' : ''}</div></div></div>
        <div class="actions"><button class="primary" id="gc-keep">読みたい棚に入れる</button>${S.tickets ? '<button id="gc-again">もう1回（🎟 残り ' + S.tickets + '）</button>' : ''}<button class="ghost" id="gc-close">閉じる</button></div>`;
      $('#gc-keep').onclick = () => { if (!S.wantBooks.some((w) => w.isbn === isbn)) S.wantBooks.push({ isbn, title: book.title, author: book.author, publisher: book.publisher, cover: book.cover, at: todayISO() }); save(); closeModal(); toast('読みたい棚に入れました'); currentSub = 'want'; switchView('zukan'); };
      $('#gc-close').onclick = closeModal; if ($('#gc-again')) $('#gc-again').onclick = startGacha;
    }, wait);
  });
}
function renderWant() {
  const g = $('#want-grid');
  if (!S.wantBooks.length) { g.innerHTML = '<div class="box muted">まだありません。印を手に入れるとガチャ券がもらえ、ミッションの画面で引けます。</div>'; return; }
  g.innerHTML = S.wantBooks.slice().reverse().map((w) => `<div class="card" data-isbn="${esc(w.isbn)}"><div class="cover">${w.cover ? `<img src="${esc(w.cover)}" alt="" referrerpolicy="no-referrer" loading="lazy">` : `<div class="notitle">${esc(w.title)}</div>`}</div><div class="meta"><b>${esc(w.title)}</b>${esc(w.author)}<br>出会うと +${XP.cardWanted} XP</div></div>`).join('');
  $$('#want-grid .card').forEach((el) => el.addEventListener('click', () => { const w = S.wantBooks.find((x) => x.isbn === el.dataset.isbn); if (!w) return; openModal(`<h2>${esc(w.title)}</h2><p class="muted small">${esc(w.author)}${w.publisher ? '／' + esc(w.publisher) : ''}　ISBN ${esc(w.isbn)}</p><p class="muted small">本屋でこの本を買って、店のページの「この店で本と出会った」でバーコードを読むと、ボーナス +${XP.cardWanted} XP。</p><div class="actions"><button class="danger" id="wb-del">棚から外す</button><button class="ghost" id="wb-close">閉じる</button></div>`); $('#wb-close').onclick = closeModal; $('#wb-del').onclick = () => { S.wantBooks = S.wantBooks.filter((x) => x.isbn !== w.isbn); save(); closeModal(); renderZukan(); }; }));
}

// ---------- ミッション・推し店・ラリー ----------
function missionDefs() {
  const ws = weekStartISO(); const wk = weekKey();
  const weekStamps = Object.entries(S.stamps).filter(([, v]) => v.d >= ws).map(([id]) => BYID.get(id)).filter(Boolean);
  const prefsBefore = new Set(Object.entries(S.stamps).filter(([, v]) => v.d < ws).map(([id]) => BYID.get(id)).filter(Boolean).map(prefOf));
  const newPrefs = new Set(weekStamps.map(prefOf).filter((p) => !prefsBefore.has(p)));
  return [
    { id: 'm1', name: '印を3つ集める', sub: '今週、射程内で押した朱印の数', cur: weekStamps.length, goal: 3 },
    { id: 'm2', name: '古書店で印を1つ', sub: '古書店のピンは「古書店」の札つき', cur: weekStamps.filter((s) => s.u).length, goal: 1 },
    { id: 'm3', name: '初めての県で印を1つ', sub: 'まだ印のない県の本屋へ', cur: newPrefs.size, goal: 1 },
    { id: 'm4', name: '本と出会う', sub: '今週、カードを1枚', cur: S.cards.filter((c) => c.d >= ws).length, goal: 1 },
    { id: 'm5', name: '今週の推し店で印を1つ', sub: '👑 の店（県ごとに1店）', cur: (S.featDone[wk] || []).length, goal: 1 },
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
  $('#gacha-box').innerHTML = `<div><div class="t">🎟 ガチャ券 ${S.tickets}枚</div><div class="n">印1つにつき1枚。本が1冊出て「読みたい棚」へ</div></div><button class="primary" id="btn-gacha" ${S.tickets ? '' : 'disabled'}>ガチャを引く</button>`;
  $('#btn-gacha').onclick = startGacha;
  $('#mission-list').innerHTML = missionDefs().map((m) => { const done = m.cur >= m.goal; return `<div class="m ${done ? 'done' : ''}"><div class="h"><b>${done ? '✅ ' : ''}${esc(m.name)}</b><span class="muted small">${Math.min(m.cur, m.goal)}/${m.goal}${claimed.includes(m.id) ? `　+${XP.mission}XP` : ''}</span></div><div class="bar"><i style="width:${Math.min(100, Math.round((m.cur / m.goal) * 100))}%"></i></div><div class="sub">${esc(m.sub)}</div></div>`; }).join('');
  // 推し店：現在地に近い順（なければ県名順）に8つ
  let feats = [...FEAT.entries()].map(([p, id]) => ({ p, s: BYID.get(id) })).filter((x) => x.s);
  if (POS.lat != null) feats.sort((a, b) => dist(POS.lat, POS.lon, a.s.la, a.s.lo) - dist(POS.lat, POS.lon, b.s.la, b.s.lo)); else feats.sort((a, b) => PREFS.findIndex((x) => x[0] === a.p) - PREFS.findIndex((x) => x[0] === b.p));
  $('#feat-list').innerHTML = feats.slice(0, 8).map(({ p, s }) => `<div class="item" data-id="${esc(s.i)}"><div class="main"><div class="name"><span class="crown">👑</span> ${esc(s.n)}${(S.featDone[wk] || []).includes(s.i) ? ' <span class="badge shu">済</span>' : ''}</div><div class="sub">${esc(p)}　${esc(s.a || '')}</div></div><div class="dist">${POS.lat != null ? fmtDist(dist(POS.lat, POS.lon, s.la, s.lo)) : ''}</div></div>`).join('') + (feats.length > 8 ? `<div class="muted small" style="padding:6px 4px">ほか${feats.length - 8}県。地図では紫の輪で出ます。</div>` : '');
  $$('#feat-list .item').forEach((el) => el.addEventListener('click', () => openSheet(el.dataset.id)));
  $('#rally-list').innerHTML = RALLIES.map((r) => { const got = r.stores.filter((id) => hasStamp(id)).length; const done = !!S.rallyDone[r.id]; return `<div class="m ${done ? 'done' : ''}"><div class="h"><b>${done ? '🏆 ' : ''}${esc(r.name)}</b><span class="muted small">${got}/${r.stores.length}</span></div><div class="bar"><i style="width:${Math.round((got / r.stores.length) * 100)}%"></i></div><div class="sub">${esc(r.desc)}　称号「${esc(r.title)}」</div><div class="sub" style="margin-top:4px">${r.stores.map((id) => { const s = BYID.get(id); return s ? `<span class="badge ${hasStamp(id) ? 'shu' : ''}">${esc(s.n)}</span>` : ''; }).join('')}</div><div class="actions"><button data-go="${esc(r.id)}">地図で見る</button></div></div>`; }).join('') || '<div class="box muted">ラリーのデータがありません。</div>';
  $$('#rally-list [data-go]').forEach((b) => b.addEventListener('click', () => { const r = RALLIES.find((x) => x.id === b.dataset.go); if (r && mapReady) { switchView('map'); map.flyTo({ center: [r.lo, r.la], zoom: 14.5 }); } }));
}

// ---------- カード（本との出会い） ----------
function startCard(st) {
  openModal(`
    <h2>この店で本と出会った</h2><p class="muted small">${esc(st.n)}</p>
    <div class="note">カードは +${XP.card} XP。今日この店で印を押していれば「店で出会った」+${XP.cardInStore}、読みたい棚の本なら +${XP.cardWanted}。</div>
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
  const has = !!b && !!b.title; const today = todayISO();
  const inStore = !!(S.stamps[st.i] && S.stamps[st.i].d === today) || visitsOf(st.i).some((v) => v.d === today && v.near);
  const wanted = !!(b && b.isbn && S.wantBooks.some((w) => w.isbn === b.isbn));
  const total = XP.card + (inStore ? XP.cardInStore : 0) + (wanted ? XP.cardWanted : 0);
  openModal(`
    <h2>カードを作る</h2>
    <div class="card-full">
      <div class="cover">${b && b.cover ? `<img src="${esc(b.cover)}" alt="" referrerpolicy="no-referrer">` : '<div class="notitle">表紙なし</div>'}</div>
      <div style="flex:1;min-width:0">
        ${has ? `<div><b>${esc(b.title)}</b></div><div class="muted small">${esc(b.author)}${b.publisher ? '／' + esc(b.publisher) : ''}</div>` : `<div class="field"><label>本の名前</label><input type="text" id="cd-title" placeholder="書名（わかれば著者も）"></div>`}
        <div class="muted small" style="margin-top:6px">${esc(st.n)}　${fmtDate(today)}</div>
        <div class="muted small">${inStore ? '🏪 店で出会った +' + XP.cardInStore : ''} ${wanted ? '📚 読みたい棚の本 +' + XP.cardWanted : ''}</div>
      </div>
    </div>
    <div class="field"><label>なぜ手に取ったか（任意・100字まで）</label><textarea id="cd-why" maxlength="100" placeholder="例：表紙の青に目がとまった。店員さんの手書きPOPに「泣いた」とあった"></textarea></div>
    <label class="chk"><input type="checkbox" id="cd-pub"> このカードを公開する（本番では「みんなの出会い」に流れます。試作では印が付くだけ）</label>
    <div class="note">表紙はopenBDから毎回表示するだけで、保存しません。記録はこの端末の中だけに残ります。</div>
    <div class="actions"><button class="primary" id="cd-save">カードにする（+${total} XP）</button><button class="ghost" id="cd-cancel2">やめる</button></div>`);
  $('#cd-cancel2').onclick = closeModal;
  $('#cd-save').onclick = () => {
    const title = has ? b.title : ($('#cd-title') ? $('#cd-title').value.trim() : '');
    if (!title) { toast('本の名前を入れてください'); return; }
    S.cards.push({ id: 'c' + Date.now(), s: st.i, sn: st.n, d: today, t: Date.now(), isbn: b ? b.isbn : '', title, author: b ? b.author : '', publisher: b ? b.publisher : '', cover: b ? b.cover : '', why: $('#cd-why').value.trim(), pub: $('#cd-pub').checked ? 1 : 0 });
    if (wanted) { S.wantBooks = S.wantBooks.filter((w) => w.isbn !== b.isbn); S.met.push(b.isbn); }
    const lv = addXP(total); save(); refreshMap(); closeModal();
    const rewards = checkMissionsAndRallies();
    toast(`カードができました +${total} XP${lv.after > lv.before ? `　レベルアップ！ Lv.${lv.after}` : ''}${rewards.length ? '　' + rewards[0] : ''}`);
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
  const fr = frameOf(levelOf(S.xp));
  const stamped = ids.map((id) => ({ st: BYID.get(id), d: S.stamps[id].d, trial: S.stamps[id].trial })).filter((x) => x.st).sort((a, b) => b.d.localeCompare(a.d));
  $('#stamp-grid').innerHTML = (stamped.length ? `<div class="frame-note" style="grid-column:1/-1">${fr ? `Lv.${levelOf(S.xp)} の額縁：${['', '銅', '銀', '金'][fr]}（Lv.3で銅、5で銀、8で金）` : 'Lv.3になると印に額縁が付きます'}</div>` : '') + stamped.map(({ st, d, trial }) => `<div class="st f${fr}" data-id="${esc(st.i)}">${stampSVG(st, true, 84)}<div class="n">${esc(st.n)}</div><div class="n">${fmtDate(d)}${trial ? '・体験' : ''}</div></div>`).join('') || '<div class="box muted">まだ印はありません。店の射程内（120m）で「印をもらう」を押すと、ここに並びます。家で試すなら「👣 お試し歩き」→「⤴ ワープ」。</div>';
  $$('#stamp-grid .st').forEach((el) => el.addEventListener('click', () => openSheet(el.dataset.id)));
  renderWant(); renderCards();
  const md = todayISO().slice(5), y = new Date().getFullYear();
  const past = [...S.visits.filter((v) => v.d.slice(5) === md && +v.d.slice(0, 4) < y).map((v) => ({ y: +v.d.slice(0, 4), text: `${(BYID.get(v.s) || {}).n || v.n}に行った` })), ...S.cards.filter((c) => c.d.slice(5) === md && +c.d.slice(0, 4) < y).map((c) => ({ y: +c.d.slice(0, 4), text: `${c.sn}で『${c.title}』と出会った` }))];
  $('#anniv').innerHTML = past.length ? past.map((p) => `<div>${y - p.y}年前の今日、${esc(p.text)}</div>`).join('') : 'まだありません。来年のこの日に、今日の記録がここに出ます。';
  const rows = [...S.visits.map((v) => ({ t: v.t, d: v.d, id: v.s, html: `<div class="main"><div class="name">${esc((BYID.get(v.s) || {}).n || v.n)} <span class="badge ${v.near ? 'shu' : 'sumi'}">${v.near ? '朱印' : '墨印'}</span>${v.trial ? '<span class="badge trial">体験</span>' : ''}</div>${v.memo ? `<div class="sub">${esc(v.memo)}</div>` : ''}</div>` })), ...S.cards.map((c) => ({ t: c.t, d: c.d, id: c.s, html: `<div class="main"><div class="name">${esc(c.sn)} <span class="badge">カード</span></div><div class="sub">『${esc(c.title)}』</div></div>` }))].sort((a, b) => b.t - a.t);
  let last = '', html = ''; for (const r of rows) { if (r.d !== last) { html += `<div class="date">${fmtDate(r.d)}</div>`; last = r.d; } html += `<div class="item" data-id="${esc(r.id)}">${r.html}</div>`; }
  $('#visit-list').innerHTML = html || '<div class="box muted">まだ記録はありません。</div>';
  $$('#visit-list .item').forEach((el) => el.addEventListener('click', () => openSheet(el.dataset.id)));
  const hid = Object.keys(S.hidden); $('#hidden-info').innerHTML = hid.length ? `${hid.length}件（${hid.slice(0, 5).map((id) => esc(S.hidden[id].n || id)).join('、')}${hid.length > 5 ? '…' : ''}）<button class="ghost" id="btn-unhide">すべて戻す</button>` : 'ありません';
  if ($('#btn-unhide')) $('#btn-unhide').onclick = async () => { S.hidden = {}; save(); await loadData(); refreshMap(); updateNear(); renderZukan(); toast('戻しました'); };
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
  } catch (e) { if (e && e.name === 'AbortError') return; $('#cv-out').innerHTML = '<p class="muted small">画像にできませんでした（表紙の画像が外部のため、ブラウザが書き出しを止めることがあります）。</p>'; }
}

// ---------- さがす・追加・バックアップ ----------
function searchStores(q) { const words = q.trim().split(/[\s　]+/).filter(Boolean); if (!words.length) return []; return STORES.filter((s) => { const hay = (s.n || '') + ' ' + (s.a || '') + ' ' + prefOf(s); return words.every((w) => hay.includes(w)); }).slice(0, 20); }
function setupSearch() {
  const inp = $('#search'), res = $('#search-results');
  inp.addEventListener('input', () => { if (!inp.value.trim()) { res.classList.add('hidden'); res.innerHTML = ''; return; } const hits = searchStores(inp.value);
    res.innerHTML = hits.map((s) => `<div class="item" data-id="${esc(s.i)}">${isFeat(s.i) ? '👑 ' : ''}${esc(s.n)} <span class="stars">${'★'.repeat(rarityOf(s))}</span><div class="muted small">${esc(s.a || prefOf(s))}</div></div>`).join('') || '<div class="item muted">見つかりません。✎ で地図に追加できます</div>'; res.classList.remove('hidden');
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
  $('#btn-export').onclick = () => { const blob = new Blob([JSON.stringify({ app: 'honya-map', ver: APP_VER, at: new Date().toISOString(), data: S }, null, 1)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `honya-map-${todayISO()}.json`; a.click(); toast('書き出しました'); };
  $('#file-import').addEventListener('change', async (e) => { const f = e.target.files[0]; if (!f) return; try { const j = JSON.parse(await f.text()); const d = j.data || j; if (!d || !Array.isArray(d.visits)) throw new Error('bad');
      area.innerHTML = `<div class="status sumi">読み込むと、いまの記録（印${Object.keys(S.stamps).length}・カード${S.cards.length}）は置き換わります。</div><div class="actions"><button class="primary" id="bk-ok">置き換える</button><button class="ghost" id="bk-no">やめる</button></div>`;
      $('#bk-no').onclick = () => { area.innerHTML = ''; }; $('#bk-ok').onclick = async () => { S = Object.assign(EMPTY(), d); save(); await loadData(); refreshMap(); renderZukan(); renderLevel(); area.innerHTML = ''; toast('読み込みました'); };
    } catch (err) { toast('読み込めませんでした（この試作で書き出したファイルを選んでください）'); } e.target.value = ''; });
  $('#btn-clear').onclick = () => { area.innerHTML = `<div class="status sumi">この端末の記録（印・訪問・カード・行きたい・追加した店・経験値・ガチャ券）をすべて消します。戻せません。</div><div class="actions"><button class="danger" id="bk-clear2">消す</button><button class="ghost" id="bk-clear0">やめる</button></div>`; $('#bk-clear0').onclick = () => { area.innerHTML = ''; }; $('#bk-clear2').onclick = async () => { S = EMPTY(); S.seen = 1; save(); await loadData(); refreshMap(); renderZukan(); renderLevel(); area.innerHTML = ''; toast('消しました'); }; };
}

// ---------- 最初の案内 ----------
function onboarding() {
  openModal(`<h2>本屋の地図へようこそ</h2>
    <div class="note">本屋に近づくとピンが光り、その店だけの<b>印</b>がもらえます。印は4,152種類、周りに本屋が少ない「秘境」ほどレア。印1つでガチャ券1枚、本が1冊出て「読みたい棚」へ。本屋でその本と出会う（買ってバーコードを読む）とボーナス。</div>
    <div class="note">位置はこの端末の中で距離を出すためだけに使い、どこにも送りません。記録もこの端末の中だけです。</div>
    <div class="actions"><button class="primary wide" id="ob-geo">現在地から始める</button><button class="wide" id="ob-trial">👣 お試し歩きで始める（家で試す）</button><button class="ghost" id="ob-later">あとで</button></div>`);
  const done = () => { S.seen = 1; S.tickets += 1; save(); closeModal(); toast('🎟 最初のガチャ券を1枚どうぞ（ミッションの画面で引けます）'); };
  $('#ob-geo').onclick = () => { done(); startWatch(); };
  $('#ob-trial').onclick = () => { done(); setTrial(true); warp(); };
  $('#ob-later').onclick = () => { done(); };
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
  load(); $('#ver').textContent = APP_VER;
  await loadData(); renderLevel();
  initMap(); setupSearch(); setupBackup();
  $$('#tabs button').forEach((b) => b.addEventListener('click', () => switchView(b.dataset.view)));
  $$('.subtabs button').forEach((b) => b.addEventListener('click', () => { currentSub = b.dataset.sub; renderZukan(); }));
  $('#sheet-close').onclick = closeSheet;
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
  $('#btn-add').onclick = startAdd; $('#btn-locate').onclick = startWatch; $('#btn-trial').onclick = () => setTrial(!POS.fake); $('#btn-warp').onclick = () => warp();
  if ('serviceWorker' in navigator && location.protocol === 'https:') { navigator.serviceWorker.register('sw.js').catch(() => {}); }
  if (!S.seen) onboarding();
}
main();
