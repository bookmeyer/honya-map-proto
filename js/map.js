// 地図（MapLibre）。店はピンの絵で表示し、固まり（クラスタ）でまとめ、状態は feature-state で軽く更新する
import { STYLE_LIGHT, STYLE_DARK, TERRITORY_M, RANGE_M } from './config.js?v=0.6.0';
import { circlePoly, emit } from './util.js?v=0.6.0';

export const M = { map: null, ready: false, theme: 'light' };
let storesGeo = { type: 'FeatureCollection', features: [] };
let territoryGeo = { type: 'FeatureCollection', features: [] };
let meGeo = { type: 'FeatureCollection', features: [] };
const stateCache = new Map(); // id → 最後に送った状態
let handlers = {};
let pulseRaf = null, pulseOn = false;

// ---- ピンの絵（canvasで描く。種類：plain ふつう／used 古書店／rare 秘境／stamped 押した／near 射程内） ----
const PIN = { plain: ['#fffaf0', '#e9e1d2', '#8f877a', '#9d9488'], used: ['#efeadf', '#d3cab8', '#6f6757', '#8a8275'], rare: ['#fff0b8', '#e6b93c', '#8a6610', '#b08a1e'], stamped: ['#ff9a7a', '#d6452b', '#ffffff', '#a8321c'], near: ['#ffe58f', '#e8a51e', '#ffffff', '#b07a10'] };
function starPath(g, cx, cy, R, r) { for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const rr = i % 2 ? r : R; const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr; if (i) g.lineTo(x, y); else g.moveTo(x, y); } g.closePath(); }
export function pinCanvas(kind, s = 2) {
  const W = 44, H = 56; const c = document.createElement('canvas'); c.width = W * s; c.height = H * s; const g = c.getContext('2d'); g.scale(s, s);
  const P = PIN[kind] || PIN.plain;
  const path = () => { g.beginPath(); g.moveTo(22, 53); g.bezierCurveTo(16, 42, 6, 33, 6, 21); g.arc(22, 21, 16, Math.PI, 0); g.bezierCurveTo(38, 33, 28, 42, 22, 53); g.closePath(); };
  g.save(); g.shadowColor = 'rgba(0,0,0,.28)'; g.shadowBlur = 5; g.shadowOffsetY = 2; path(); const gr = g.createLinearGradient(0, 4, 0, 50); gr.addColorStop(0, P[0]); gr.addColorStop(1, P[1]); g.fillStyle = gr; g.fill(); g.restore();
  path(); g.lineWidth = 2.5; g.strokeStyle = '#ffffff'; g.stroke(); path(); g.lineWidth = 1; g.strokeStyle = P[3]; g.stroke();
  g.beginPath(); g.arc(22, 21, 10.5, 0, Math.PI * 2); g.fillStyle = kind === 'stamped' || kind === 'near' ? '#ffffff' : 'rgba(255,255,255,.88)'; g.fill();
  g.lineCap = 'round'; g.lineJoin = 'round';
  if (kind === 'stamped') { g.strokeStyle = P[1]; g.lineWidth = 3; g.beginPath(); g.moveTo(16, 21.5); g.lineTo(20.5, 26); g.lineTo(29, 16.5); g.stroke(); }
  else if (kind === 'near') { g.fillStyle = P[1]; g.beginPath(); starPath(g, 22, 21.5, 7, 3.2); g.fill(); }
  else { g.strokeStyle = P[2]; g.lineWidth = 2.2; g.beginPath(); g.moveTo(15, 17); g.quadraticCurveTo(18.5, 15.5, 22, 17); g.lineTo(22, 27); g.quadraticCurveTo(18.5, 25.5, 15, 27); g.closePath(); g.moveTo(22, 17); g.quadraticCurveTo(25.5, 15.5, 29, 17); g.lineTo(29, 27); g.quadraticCurveTo(25.5, 25.5, 22, 27); g.closePath(); g.stroke(); }
  return c;
}
const pinImage = (kind) => { const c = pinCanvas(kind); return c.getContext('2d').getImageData(0, 0, c.width, c.height); };
export const pinDataURL = (kind, s = 3) => pinCanvas(kind, s).toDataURL();
function markImage() { // 行きたい☆
  const W = 24, s = 2; const c = document.createElement('canvas'); c.width = W * s; c.height = W * s; const g = c.getContext('2d'); g.scale(s, s);
  g.fillStyle = '#d9a521'; g.strokeStyle = '#fff'; g.lineWidth = 2; g.lineJoin = 'round'; g.beginPath(); starPath(g, 12, 12, 10, 4.5); g.fill(); g.stroke();
  return g.getImageData(0, 0, W * s, W * s);
}
const fs = (k, def = 0) => ['coalesce', ['feature-state', k], def];

function addLayers() {
  const map = M.map;
  for (const k of Object.keys(PIN)) if (!map.hasImage('pin-' + k)) map.addImage('pin-' + k, pinImage(k), { pixelRatio: 2 });
  if (!map.hasImage('mark-want')) map.addImage('mark-want', markImage(), { pixelRatio: 2 });
  map.addSource('territory', { type: 'geojson', data: territoryGeo });
  map.addLayer({ id: 'territory-fill', type: 'fill', source: 'territory', paint: { 'fill-color': '#d6452b', 'fill-opacity': ['interpolate', ['linear'], ['coalesce', ['get', 'rank'], 1], 1, 0.1, 5, 0.24] } });
  map.addLayer({ id: 'territory-line', type: 'line', source: 'territory', paint: { 'line-color': '#d6452b', 'line-opacity': 0.45, 'line-width': 1 } });
  map.addSource('me', { type: 'geojson', data: meGeo });
  map.addLayer({ id: 'me-acc', type: 'fill', source: 'me', filter: ['==', ['get', 'k'], 'acc'], paint: { 'fill-color': '#2b6cb0', 'fill-opacity': 0.10 } });
  map.addLayer({ id: 'me-range', type: 'line', source: 'me', filter: ['==', ['get', 'k'], 'range'], paint: { 'line-color': '#b8921f', 'line-width': 1.5, 'line-dasharray': [2, 2], 'line-opacity': 0.85 } });
  map.addSource('stores', { type: 'geojson', data: storesGeo, promoteId: 'id', cluster: true, clusterMaxZoom: 9, clusterRadius: 44 });
  map.addLayer({ id: 'clusters', type: 'circle', source: 'stores', filter: ['has', 'point_count'], paint: {
    'circle-color': ['step', ['get', 'point_count'], '#f0b9a9', 20, '#e3785c', 100, '#d6452b'],
    'circle-radius': ['step', ['get', 'point_count'], 14, 20, 18, 100, 24, 400, 30],
    'circle-opacity': 0.92, 'circle-stroke-width': 2.5, 'circle-stroke-color': '#ffffff' } });
  map.addLayer({ id: 'cluster-count', type: 'symbol', source: 'stores', filter: ['has', 'point_count'], layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Noto Sans Bold'], 'text-size': 12, 'text-allow-overlap': true }, paint: { 'text-color': '#ffffff' } });
  const unc = ['!', ['has', 'point_count']];
  map.addLayer({ id: 'feat-ring', type: 'circle', source: 'stores', filter: unc, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 10, 12, 15, 15, 22], 'circle-color': '#6d4fc3', 'circle-opacity': ['*', 0.12, fs('feat')], 'circle-stroke-color': '#6d4fc3', 'circle-stroke-width': 2, 'circle-stroke-opacity': ['*', 0.9, fs('feat')] } });
  map.addLayer({ id: 'stores-halo', type: 'circle', source: 'stores', filter: unc, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 8, 12, 12, 15, 18], 'circle-color': '#d6452b', 'circle-opacity': ['*', 0.16, ['min', 1, fs('st')]] } });
  map.addLayer({ id: 'near-pulse', type: 'circle', source: 'stores', filter: unc, paint: { 'circle-radius': 16, 'circle-color': '#b8921f', 'circle-opacity': ['*', 0.3, fs('near')] } });
  const sz = ['interpolate', ['linear'], ['zoom'], 8, 0.5, 12, 0.66, 15, 0.9];
  const sym = (image, size) => ({ 'icon-image': image, 'icon-size': size, 'icon-anchor': 'bottom', 'icon-allow-overlap': true, 'icon-ignore-placement': true });
  // 下から順：ふつうのピン（押した・射程内は透明に）→ 押したピン → 射程内のピン → 行きたい☆
  map.addLayer({ id: 'stores', type: 'symbol', source: 'stores', filter: unc, layout: sym(['case', ['==', ['get', 'r'], 3], 'pin-rare', ['==', ['get', 'u'], 1], 'pin-used', 'pin-plain'], sz), paint: { 'icon-opacity': ['case', ['any', ['==', fs('stamp'), 1], ['==', fs('near'), 1]], 0, ['==', fs('st'), 0], 0.92, 1] } });
  map.addLayer({ id: 'stores-stamped', type: 'symbol', source: 'stores', filter: unc, layout: sym('pin-stamped', sz), paint: { 'icon-opacity': ['case', ['all', ['==', fs('stamp'), 1], ['!=', fs('near'), 1]], 1, 0] } });
  map.addLayer({ id: 'stores-near', type: 'symbol', source: 'stores', filter: unc, layout: sym('pin-near', ['interpolate', ['linear'], ['zoom'], 8, 0.6, 12, 0.8, 15, 1.05]), paint: { 'icon-opacity': fs('near') } });
  map.addLayer({ id: 'stores-want', type: 'symbol', source: 'stores', filter: unc, layout: { 'icon-image': 'mark-want', 'icon-size': ['interpolate', ['linear'], ['zoom'], 8, 0.5, 15, 0.8], 'icon-anchor': 'bottom-left', 'icon-offset': [10, -34], 'icon-allow-overlap': true, 'icon-ignore-placement': true }, paint: { 'icon-opacity': fs('want') } });
  map.addLayer({ id: 'me-dot', type: 'circle', source: 'me', filter: ['==', ['get', 'k'], 'me'], paint: { 'circle-radius': 9, 'circle-color': ['case', ['==', ['get', 'fake'], 1], '#6d4fc3', '#2b6cb0'], 'circle-stroke-width': 3, 'circle-stroke-color': '#ffffff' } });
  for (const id of ['stores', 'stores-stamped', 'stores-near']) {
    map.on('click', id, (e) => { if (e.originalEvent._hit) return; const f = e.features && e.features[0]; if (f) { e.originalEvent._hit = true; handlers.onStoreClick && handlers.onStoreClick(f.properties.id); } });
    map.on('mouseenter', id, () => { map.getCanvas().style.cursor = 'pointer'; }); map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; });
  }
  map.on('click', 'clusters', (e) => { const f = e.features && e.features[0]; if (!f) return; e.originalEvent._hit = true; map.getSource('stores').getClusterExpansionZoom(f.properties.cluster_id, (err, z) => { if (!err) map.easeTo({ center: f.geometry.coordinates, zoom: Math.min(z + 0.5, 16) }); }); });
  map.on('mouseenter', 'clusters', () => { map.getCanvas().style.cursor = 'pointer'; }); map.on('mouseleave', 'clusters', () => { map.getCanvas().style.cursor = ''; });
  // 保存していた状態を入れ直す（スタイルを替えたときも）
  for (const [id, st] of stateCache) map.setFeatureState({ source: 'stores', id }, st);
}

function safeAddLayers() { try { addLayers(); } catch (e) { console.error('layers', e); window.__mapErr = String(e && e.message || e); } }
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
  storesGeo = { type: 'FeatureCollection', features: stores.map((s) => ({ type: 'Feature', id: s.i, geometry: { type: 'Point', coordinates: [s.lo, s.la] }, properties: { id: s.i, r: s.k == null ? (s.demo ? 3 : 2) : (s.k === 0 ? 3 : s.k <= 6 ? 2 : 1), u: s.u ? 1 : 0, custom: s.custom ? 1 : 0, demo: s.demo ? 1 : 0 } })) };
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
