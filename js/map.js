// 地図（MapLibre）。店はピンの絵で表示し、固まり（クラスタ）でまとめ、状態は feature-state で軽く更新する
import { STYLE_LIGHT, STYLE_DARK, TERRITORY_M, RANGE_M } from './config.js?v=0.9.2';
import { circlePoly, emit } from './util.js?v=0.9.2';

export const M = { map: null, ready: false, theme: 'light' };
let storesGeo = { type: 'FeatureCollection', features: [] };
let territoryGeo = { type: 'FeatureCollection', features: [] };
let meGeo = { type: 'FeatureCollection', features: [] };
const stateCache = new Map(); // id → 最後に送った状態
let handlers = {};
let pulseRaf = null, pulseOn = false;

// ---- ピンの絵（canvasで描く。種類：plain ふつう／used 古書店／rare 秘境／stamped 押した／near 射程内／lib 図書館） ----
// v0.9 ポップ・ラリー：白いふち＋墨の輪郭の「シール」。本屋＝朱／古書店＝茶／秘境＝墨に檸檬の星／図書館＝空／押した店＝若草にチェック／射程内＝朱に檸檬の光の輪
const PIN = { plain: ['#FF6A48', '#FFFFFF'], used: ['#B9794A', '#FFFFFF'], rare: ['#1B1B1B', '#FFD447'], stamped: ['#4FC07A', '#FFFFFF'], near: ['#FF6A48', '#FFFFFF'], lib: ['#2F9BFF', '#FFFFFF'] };
const EDGE = '#1B1B1B';
function starPath(g, cx, cy, R, r) { for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const rr = i % 2 ? r : R; const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr; if (i) g.lineTo(x, y); else g.moveTo(x, y); } g.closePath(); }
export function pinCanvas(kind, s = 2) {
  const halo = kind === 'near'; const W = halo ? 64 : 44, H = halo ? 72 : 56; const ox = halo ? 10 : 0, oy = halo ? 16 : 0;
  const c = document.createElement('canvas'); c.width = W * s; c.height = H * s; const g = c.getContext('2d'); g.scale(s, s);
  const [fill, glyph] = PIN[kind] || PIN.plain; g.lineJoin = 'round'; g.lineCap = 'round';
  if (halo) { // 檸檬の光の輪（16の角）。動かない
    g.beginPath(); for (let i = 0; i < 16; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 8; const rr = i % 2 ? 22 : 28; const x = 32 + Math.cos(a) * rr, y = 37 + Math.sin(a) * rr; if (i) g.lineTo(x, y); else g.moveTo(x, y); } g.closePath();
    g.fillStyle = '#FFD447'; g.fill(); g.lineWidth = 1.5; g.strokeStyle = EDGE; g.stroke();
  }
  const path = () => { g.beginPath(); g.moveTo(22 + ox, 53 + oy); g.bezierCurveTo(16 + ox, 42 + oy, 6 + ox, 33 + oy, 6 + ox, 21 + oy); g.arc(22 + ox, 21 + oy, 16, Math.PI, 0); g.bezierCurveTo(38 + ox, 33 + oy, 28 + ox, 42 + oy, 22 + ox, 53 + oy); g.closePath(); };
  path(); g.lineWidth = 5; g.strokeStyle = '#FFFFFF'; g.stroke(); // シールの白いふち
  path(); g.fillStyle = fill; g.fill(); g.lineWidth = 1.8; g.strokeStyle = EDGE; g.stroke();
  const cx = 22 + ox, cy = 21 + oy;
  if (kind === 'stamped') { g.strokeStyle = glyph; g.lineWidth = 3.2; g.beginPath(); g.moveTo(cx - 6.5, cy + 0.5); g.lineTo(cx - 1.5, cy + 5.5); g.lineTo(cx + 7, cy - 4.5); g.stroke(); }
  else if (kind === 'rare') { g.fillStyle = glyph; g.beginPath(); starPath(g, cx, cy + 0.5, 8, 3.6); g.fill(); }
  else if (kind === 'lib') { g.fillStyle = glyph; g.beginPath(); g.moveTo(cx - 8, cy - 2); g.lineTo(cx, cy - 7.5); g.lineTo(cx + 8, cy - 2); g.lineTo(cx + 8, cy - 0.5); g.lineTo(cx - 8, cy - 0.5); g.closePath(); g.fill(); g.fillRect(cx - 7, cy + 1, 2.6, 6.5); g.fillRect(cx - 1.3, cy + 1, 2.6, 6.5); g.fillRect(cx + 4.4, cy + 1, 2.6, 6.5); g.fillRect(cx - 8, cy + 8, 16, 1.6); }
  else { g.fillStyle = glyph; g.fillRect(cx - 7, cy - 6, 6, 12); g.fillRect(cx + 1, cy - 6, 6, 12); } // 開いた本（2つの白い四角）
  return c;
}
const pinImage = (kind) => { const c = pinCanvas(kind); return c.getContext('2d').getImageData(0, 0, c.width, c.height); };
export const pinDataURL = (kind, s = 3) => pinCanvas(kind, s).toDataURL();
function markImage() { // 行きたい（檸檬のハート）
  const W = 26, s = 2; const c = document.createElement('canvas'); c.width = W * s; c.height = W * s; const g = c.getContext('2d'); g.scale(s, s);
  const heart = () => { g.beginPath(); g.moveTo(13, 22); g.bezierCurveTo(5, 16, 3, 12, 3, 9); g.bezierCurveTo(3, 5.5, 6, 3.5, 8.5, 3.5); g.bezierCurveTo(10.5, 3.5, 12.2, 4.6, 13, 6.2); g.bezierCurveTo(13.8, 4.6, 15.5, 3.5, 17.5, 3.5); g.bezierCurveTo(20, 3.5, 23, 5.5, 23, 9); g.bezierCurveTo(23, 12, 21, 16, 13, 22); g.closePath(); };
  g.lineJoin = 'round'; heart(); g.lineWidth = 4; g.strokeStyle = '#FFFFFF'; g.stroke(); heart(); g.fillStyle = '#FFD447'; g.fill(); g.lineWidth = 1.6; g.strokeStyle = EDGE; g.stroke();
  return g.getImageData(0, 0, W * s, W * s);
}
const fs = (k, def = 0) => ['coalesce', ['feature-state', k], def];

// ---- 自分のアイコン（現在地に出す。写真は端末の中だけ） ----
let avatar = null; // { blue: ImageData, purple: ImageData }
const loadImg = (src) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
function ringImage(im, color) {
  const W = 60, s = 2; const c = document.createElement('canvas'); c.width = W * s; c.height = W * s; const g = c.getContext('2d'); g.scale(s, s);
  g.save(); g.shadowColor = 'rgba(0,0,0,.3)'; g.shadowBlur = 6; g.shadowOffsetY = 2; g.beginPath(); g.arc(30, 30, 25, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill(); g.restore();
  g.save(); g.beginPath(); g.arc(30, 30, 22, 0, Math.PI * 2); g.clip(); g.drawImage(im, 8, 8, 44, 44); g.restore();
  g.lineWidth = 3.5; g.strokeStyle = color; g.beginPath(); g.arc(30, 30, 24, 0, Math.PI * 2); g.stroke();
  return g.getImageData(0, 0, W * s, W * s);
}
function avatarLayer(map) {
  if (!avatar) return;
  for (const k of ['blue', 'purple']) { const name = 'me-avatar-' + k; if (map.hasImage(name)) map.updateImage(name, avatar[k]); else map.addImage(name, avatar[k], { pixelRatio: 2 }); }
  if (!map.getLayer('me-avatar')) map.addLayer({ id: 'me-avatar', type: 'symbol', source: 'me', filter: ['==', ['get', 'k'], 'me'], layout: { 'icon-image': ['case', ['==', ['get', 'fake'], 1], 'me-avatar-purple', 'me-avatar-blue'], 'icon-size': 1, 'icon-allow-overlap': true, 'icon-ignore-placement': true } });
  else map.setLayoutProperty('me-avatar', 'visibility', 'visible');
}
export async function setAvatar(dataUrl) {
  if (!dataUrl) { avatar = null; if (M.ready && M.map.getLayer('me-avatar')) M.map.setLayoutProperty('me-avatar', 'visibility', 'none'); return; }
  try { const im = await loadImg(dataUrl); avatar = { blue: ringImage(im, '#2F9BFF'), purple: ringImage(im, '#A86CFF') }; } catch (e) { avatar = null; return; }
  if (M.ready) avatarLayer(M.map);
}

function addLayers() {
  const map = M.map;
  for (const k of Object.keys(PIN)) if (!map.hasImage('pin-' + k)) map.addImage('pin-' + k, pinImage(k), { pixelRatio: 2 });
  if (!map.hasImage('mark-want')) map.addImage('mark-want', markImage(), { pixelRatio: 2 });
  map.addSource('territory', { type: 'geojson', data: territoryGeo });
  map.addLayer({ id: 'territory-fill', type: 'fill', source: 'territory', paint: { 'fill-color': '#4FC07A', 'fill-opacity': ['interpolate', ['linear'], ['coalesce', ['get', 'rank'], 1], 1, 0.14, 5, 0.3] } });
  map.addLayer({ id: 'territory-line', type: 'line', source: 'territory', paint: { 'line-color': '#4FC07A', 'line-opacity': 0.8, 'line-width': 1.5, 'line-dasharray': [2, 1.5] } });
  map.addSource('me', { type: 'geojson', data: meGeo });
  map.addLayer({ id: 'me-acc', type: 'fill', source: 'me', filter: ['==', ['get', 'k'], 'acc'], paint: { 'fill-color': '#2F9BFF', 'fill-opacity': 0.12 } });
  map.addLayer({ id: 'me-range', type: 'line', source: 'me', filter: ['==', ['get', 'k'], 'range'], paint: { 'line-color': '#2F9BFF', 'line-width': 1.5, 'line-dasharray': [2, 2], 'line-opacity': 0.85 } });
  map.addSource('stores', { type: 'geojson', data: storesGeo, promoteId: 'id', cluster: true, clusterMaxZoom: 9, clusterRadius: 44 });
  map.addLayer({ id: 'clusters', type: 'circle', source: 'stores', filter: ['has', 'point_count'], paint: {
    'circle-color': ['step', ['get', 'point_count'], '#FFD447', 20, '#FF6A48', 100, '#E04E2E'],
    'circle-radius': ['step', ['get', 'point_count'], 14, 20, 18, 100, 24, 400, 30],
    'circle-opacity': 1, 'circle-stroke-width': 2.5, 'circle-stroke-color': '#1B1B1B' } });
  map.addLayer({ id: 'cluster-count', type: 'symbol', source: 'stores', filter: ['has', 'point_count'], layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Noto Sans Bold'], 'text-size': 12, 'text-allow-overlap': true }, paint: { 'text-color': '#1B1B1B' } });
  const unc = ['!', ['has', 'point_count']];
  map.addLayer({ id: 'feat-ring', type: 'circle', source: 'stores', filter: unc, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 10, 12, 15, 15, 22], 'circle-color': '#A86CFF', 'circle-opacity': ['*', 0.12, fs('feat')], 'circle-stroke-color': '#A86CFF', 'circle-stroke-width': 2, 'circle-stroke-opacity': ['*', 0.9, fs('feat')] } });
  map.addLayer({ id: 'stores-halo', type: 'circle', source: 'stores', filter: unc, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 8, 12, 12, 15, 18], 'circle-color': '#FF6A48', 'circle-opacity': ['*', 0.16, ['min', 1, fs('st')]] } });
  map.addLayer({ id: 'near-pulse', type: 'circle', source: 'stores', filter: unc, paint: { 'circle-radius': 16, 'circle-color': '#FFD447', 'circle-opacity': ['*', 0.3, fs('near')] } });
  const sz = ['interpolate', ['linear'], ['zoom'], 8, 0.5, 12, 0.66, 15, 0.9];
  const sym = (image, size) => ({ 'icon-image': image, 'icon-size': size, 'icon-anchor': 'bottom', 'icon-allow-overlap': true, 'icon-ignore-placement': true });
  // 下から順：ふつうのピン（押した・射程内は透明に）→ 押したピン → 射程内のピン → 行きたい☆
  map.addLayer({ id: 'stores', type: 'symbol', source: 'stores', filter: unc, layout: sym(['case', ['==', ['get', 'l'], 1], 'pin-lib', ['==', ['get', 'r'], 3], 'pin-rare', ['==', ['get', 'u'], 1], 'pin-used', 'pin-plain'], sz), paint: { 'icon-opacity': ['case', ['any', ['==', fs('stamp'), 1], ['==', fs('near'), 1]], 0, ['==', fs('st'), 0], 0.92, 1] } });
  map.addLayer({ id: 'stores-stamped', type: 'symbol', source: 'stores', filter: unc, layout: sym('pin-stamped', sz), paint: { 'icon-opacity': ['case', ['all', ['==', fs('stamp'), 1], ['!=', fs('near'), 1]], 1, 0] } });
  map.addLayer({ id: 'stores-near', type: 'symbol', source: 'stores', filter: unc, layout: sym('pin-near', ['interpolate', ['linear'], ['zoom'], 8, 0.6, 12, 0.8, 15, 1.05]), paint: { 'icon-opacity': fs('near') } });
  map.addLayer({ id: 'stores-want', type: 'symbol', source: 'stores', filter: unc, layout: { 'icon-image': 'mark-want', 'icon-size': ['interpolate', ['linear'], ['zoom'], 8, 0.5, 15, 0.8], 'icon-anchor': 'bottom-left', 'icon-offset': [10, -34], 'icon-allow-overlap': true, 'icon-ignore-placement': true }, paint: { 'icon-opacity': fs('want') } });
  map.addLayer({ id: 'me-dot', type: 'circle', source: 'me', filter: ['==', ['get', 'k'], 'me'], paint: { 'circle-radius': 9, 'circle-color': ['case', ['==', ['get', 'fake'], 1], '#A86CFF', '#FFFFFF'], 'circle-stroke-width': 2.5, 'circle-stroke-color': '#1B1B1B' } });
  avatarLayer(map); // 自分のアイコンがあれば、現在地の点の上に
  for (const id of ['stores', 'stores-stamped', 'stores-near']) {
    map.on('click', id, (e) => { if (e.originalEvent._hit) return; const f = e.features && e.features[0]; if (f) { e.originalEvent._hit = true; handlers.onStoreClick && handlers.onStoreClick(f.properties.id); } });
    map.on('mouseenter', id, () => { map.getCanvas().style.cursor = 'pointer'; }); map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; });
  }
  map.on('click', 'clusters', (e) => { const f = e.features && e.features[0]; if (!f) return; e.originalEvent._hit = true; map.getSource('stores').getClusterExpansionZoom(f.properties.cluster_id, (err, z) => { if (!err) map.easeTo({ center: f.geometry.coordinates, zoom: Math.min(z + 0.5, 16) }); }); });
  map.on('mouseenter', 'clusters', () => { map.getCanvas().style.cursor = 'pointer'; }); map.on('mouseleave', 'clusters', () => { map.getCanvas().style.cursor = ''; });
  // 保存していた状態を入れ直す（スタイルを替えたときも）
  for (const [id, st] of stateCache) map.setFeatureState({ source: 'stores', id }, st);
}

// 地図にもともと出ている店・お寺などの印は消す（本屋・図書館のピンと紛れるため）。駅とバス停の印は残す
function hideBasePoi() { for (const id of ['poi_r1', 'poi_r7', 'poi_r20']) { try { if (M.map.getLayer(id)) M.map.setLayoutProperty(id, 'visibility', 'none'); } catch (e) {} } }
// 地図の下地を「ポップ」に合わせる（明るいときだけ）：クリームの地・白い細い道・檸檬の大通り・空色の水・若草の公園
function tintBase() {
  if (M.theme !== 'light') return; const map = M.map; const set = (id, prop, v) => { try { if (map.getLayer(id)) map.setPaintProperty(id, prop, v); } catch (e) {} };
  set('background', 'background-color', '#FBEFD6'); set('landuse_residential', 'fill-color', '#F6E6C8'); set('building', 'fill-color', '#EFD9B0'); set('building-3d', 'fill-extrusion-color', '#EFD9B0');
  for (const id of ['landuse_pitch', 'landuse_track', 'landuse_cemetery']) set(id, 'fill-color', '#DDEBC4'); set('landuse_hospital', 'fill-color', '#FBE3E3'); set('landuse_school', 'fill-color', '#F3ECC4');
  set('park', 'fill-color', '#BFE8A8'); set('park_outline', 'line-color', '#A9DE91'); set('landcover_wood', 'fill-color', '#B7E39F'); set('landcover_grass', 'fill-color', '#BFE8A8'); set('landcover_sand', 'fill-color', '#F7EAB8');
  set('water', 'fill-color', '#9FD6F5'); for (const id of ['waterway_river', 'waterway_other', 'waterway_tunnel']) set(id, 'line-color', '#9FD6F5');
  for (const p of ['road', 'bridge', 'tunnel']) {
    for (const k of ['minor', 'service_track', 'street', 'path_pedestrian']) set(`${p}_${k}`, 'line-color', '#FFFFFF');
    for (const k of ['minor_casing', 'service_track_casing', 'street_casing', 'path_pedestrian_casing']) set(`${p}_${k}`, 'line-color', '#E3CFA6');
    for (const k of ['secondary_tertiary', 'trunk_primary', 'link', 'motorway_link']) set(`${p}_${k}`, 'line-color', '#FFD447');
    for (const k of ['secondary_tertiary_casing', 'trunk_primary_casing', 'link_casing', 'motorway_link_casing']) set(`${p}_${k}`, 'line-color', '#C9A227');
    set(`${p}_motorway`, 'line-color', '#FFB84D'); set(`${p}_motorway_casing`, 'line-color', '#B8761A');
    for (const k of ['major_rail', 'major_rail_hatching', 'transit_rail', 'transit_rail_hatching']) set(`${p}_${k}`, 'line-color', '#7A7369');
  }
  for (const id of ['highway-name-minor', 'highway-name-major', 'highway-name-path']) set(id, 'text-color', '#5A554D');
}
function safeAddLayers() { try { hideBasePoi(); tintBase(); addLayers(); } catch (e) { console.error('layers', e); window.__mapErr = String(e && e.message || e); } }
export function initMap({ center, zoom, theme = 'light', onStoreClick, onMapClick, onDrag }) {
  handlers = { onStoreClick, onMapClick, onDrag }; M.theme = theme;
  const map = new maplibregl.Map({ container: 'map', style: theme === 'dark' ? STYLE_DARK : STYLE_LIGHT, center, zoom, attributionControl: false, preserveDrawingBuffer: true, maxZoom: 18 });
  M.map = map;
  map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
  map.on('load', () => { safeAddLayers(); M.ready = true; emit('map-ready'); });
  map.on('click', (e) => { if (e.originalEvent._hit) return; handlers.onMapClick && handlers.onMapClick(e.lngLat); });
  map.on('dragstart', () => { handlers.onDrag && handlers.onDrag(); });
  map.on('error', (e) => { console.warn('map', e && e.error && e.error.message); });
  return map;
}
export function setTheme(theme) {
  if (!M.map || theme === M.theme) return; M.theme = theme; M.ready = false;
  M.map.once('style.load', () => { safeAddLayers(); M.ready = true; emit('map-ready'); resize(); });
  M.map.setStyle(theme === 'dark' ? STYLE_DARK : STYLE_LIGHT, { diff: false }); // 差分更新だと 'style.load' が来ず、自作の層が戻らない
}
export function setStores(stores) {
  storesGeo = { type: 'FeatureCollection', features: stores.map((s) => ({ type: 'Feature', id: s.i, geometry: { type: 'Point', coordinates: [s.lo, s.la] }, properties: { id: s.i, r: s.k == null ? (s.demo ? 3 : 2) : (s.k === 0 ? 3 : s.k <= 6 ? 2 : 1), u: s.u ? 1 : 0, l: s.t === 'l' ? 1 : 0, custom: s.custom ? 1 : 0, demo: s.demo ? 1 : 0 } })) };
  if (M.ready) M.map.getSource('stores').setData(storesGeo);
}
export function setStates(next) { // Map<id, {stamp, near, feat, want, st}>
  for (const [id, st] of next) {
    const prev = stateCache.get(id);
    if (prev && prev.stamp === st.stamp && prev.near === st.near && prev.feat === st.feat && prev.want === st.want && prev.st === st.st) continue;
    stateCache.set(id, st); if (M.ready) M.map.setFeatureState({ source: 'stores', id }, st);
  }
  const anyNear = [...stateCache.values()].some((s) => s.near); if (anyNear) startPulse(); else stopPulse();
}
// 押した店のまわりを塗る。常連度が高い店ほど広く・濃く（s.rad と s.rank）
export function setTerritory(stores) { territoryGeo = { type: 'FeatureCollection', features: stores.map((s) => ({ type: 'Feature', geometry: { type: 'Polygon', coordinates: circlePoly(s.lo, s.la, s.rad || TERRITORY_M) }, properties: { rank: s.rank || 1 } })) }; if (M.ready) M.map.getSource('territory').setData(territoryGeo); }
export function setMe(POS) {
  meGeo = POS.lat == null ? { type: 'FeatureCollection', features: [] } : { type: 'FeatureCollection', features: [
    { type: 'Feature', geometry: { type: 'Polygon', coordinates: circlePoly(POS.lon, POS.lat, Math.min(POS.acc || 0, 500)) }, properties: { k: 'acc' } },
    { type: 'Feature', geometry: { type: 'Polygon', coordinates: circlePoly(POS.lon, POS.lat, RANGE_M) }, properties: { k: 'range' } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [POS.lon, POS.lat] }, properties: { k: 'me', fake: POS.fake ? 1 : 0 } }] };
  if (M.ready) M.map.getSource('me').setData(meGeo);
}
function startPulse() { if (pulseRaf) return; const t0 = performance.now(); const loop = (t) => { if (!M.ready || !M.map.getLayer('near-pulse')) { pulseRaf = requestAnimationFrame(loop); return; } const s = (Math.sin((t - t0) / 320) + 1) / 2; M.map.setPaintProperty('near-pulse', 'circle-radius', 14 + s * 14); M.map.setPaintProperty('near-pulse', 'circle-opacity', ['*', 0.36 - s * 0.26, fs('near')]); pulseRaf = requestAnimationFrame(loop); }; pulseRaf = requestAnimationFrame(loop); pulseOn = true; }
function stopPulse() { if (pulseRaf) cancelAnimationFrame(pulseRaf); pulseRaf = null; if (pulseOn && M.ready && M.map.getLayer('near-pulse')) { M.map.setPaintProperty('near-pulse', 'circle-radius', 16); M.map.setPaintProperty('near-pulse', 'circle-opacity', ['*', 0.3, fs('near')]); } pulseOn = false; }
export function flyTo(lon, lat, zoom, opts = {}) { if (!M.map) return; M.map.flyTo(Object.assign({ center: [lon, lat], zoom: Math.max(M.map.getZoom(), zoom), speed: 1.2 }, opts)); }
export function jumpTo(lon, lat, zoom) { if (M.map) M.map.jumpTo({ center: [lon, lat], zoom }); }
export function easeTo(lon, lat) { if (M.map) M.map.easeTo({ center: [lon, lat], duration: 600 }); }
export function center() { return M.map ? M.map.getCenter() : { lat: 35.68, lng: 139.77 }; }
export function snapshot() { try { return M.ready ? M.map.getCanvas() : null; } catch (e) { return null; } }
export function resize() { if (!M.map) return; const r = () => { try { M.map.resize(); } catch (e) {} }; r(); setTimeout(r, 60); setTimeout(r, 400); }
