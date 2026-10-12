// 地図（MapLibre）。店は固まり（クラスタ）で表示し、状態は feature-state で軽く更新する
import { STYLE_LIGHT, STYLE_DARK, TERRITORY_M, RANGE_M } from './config.js';
import { circlePoly, emit } from './util.js';

export const M = { map: null, ready: false, theme: 'light' };
let storesGeo = { type: 'FeatureCollection', features: [] };
let territoryGeo = { type: 'FeatureCollection', features: [] };
let meGeo = { type: 'FeatureCollection', features: [] };
const stateCache = new Map(); // id → 最後に送った状態
let handlers = {};
let pulseRaf = null, pulseOn = false;

function stampMarkImage() {
  const s = 64, c = document.createElement('canvas'); c.width = s; c.height = s; const g = c.getContext('2d');
  g.strokeStyle = '#ffffff'; g.lineWidth = 6; g.beginPath(); g.arc(s / 2, s / 2, 22, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = '#c8381f'; g.lineWidth = 4; g.beginPath(); g.arc(s / 2, s / 2, 22, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#c8381f'; g.font = 'bold 26px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('印', s / 2, s / 2 + 1);
  return g.getImageData(0, 0, s, s);
}
const fs = (k, def = 0) => ['coalesce', ['feature-state', k], def];

function addLayers() {
  const map = M.map;
  if (!map.hasImage('stamp-mark')) map.addImage('stamp-mark', stampMarkImage(), { pixelRatio: 2 });
  map.addSource('territory', { type: 'geojson', data: territoryGeo });
  map.addLayer({ id: 'territory-fill', type: 'fill', source: 'territory', paint: { 'fill-color': '#c8381f', 'fill-opacity': 0.12 } });
  map.addLayer({ id: 'territory-line', type: 'line', source: 'territory', paint: { 'line-color': '#c8381f', 'line-opacity': 0.45, 'line-width': 1 } });
  map.addSource('me', { type: 'geojson', data: meGeo });
  map.addLayer({ id: 'me-acc', type: 'fill', source: 'me', filter: ['==', ['get', 'k'], 'acc'], paint: { 'fill-color': '#2b6cb0', 'fill-opacity': 0.10 } });
  map.addLayer({ id: 'me-range', type: 'line', source: 'me', filter: ['==', ['get', 'k'], 'range'], paint: { 'line-color': '#b8921f', 'line-width': 1.5, 'line-dasharray': [2, 2], 'line-opacity': 0.85 } });
  map.addSource('stores', { type: 'geojson', data: storesGeo, promoteId: 'id', cluster: true, clusterMaxZoom: 9, clusterRadius: 44 });
  map.addLayer({ id: 'clusters', type: 'circle', source: 'stores', filter: ['has', 'point_count'], paint: {
    'circle-color': ['step', ['get', 'point_count'], '#d9a89b', 20, '#cf6f55', 100, '#c8381f'],
    'circle-radius': ['step', ['get', 'point_count'], 14, 20, 18, 100, 24, 400, 30],
    'circle-opacity': 0.9, 'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff' } });
  map.addLayer({ id: 'cluster-count', type: 'symbol', source: 'stores', filter: ['has', 'point_count'], layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Noto Sans Bold'], 'text-size': 12, 'text-allow-overlap': true }, paint: { 'text-color': '#ffffff' } });
  const unc = ['!', ['has', 'point_count']];
  map.addLayer({ id: 'feat-ring', type: 'circle', source: 'stores', filter: unc, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 10, 12, 15, 15, 22], 'circle-color': '#6d4fc3', 'circle-opacity': ['*', 0.12, fs('feat')], 'circle-stroke-color': '#6d4fc3', 'circle-stroke-width': 2, 'circle-stroke-opacity': ['*', 0.9, fs('feat')] } });
  map.addLayer({ id: 'stores-halo', type: 'circle', source: 'stores', filter: unc, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 8, 12, 12, 15, 18], 'circle-color': '#c8381f', 'circle-opacity': ['*', 0.16, ['min', 1, fs('st')]] } });
  map.addLayer({ id: 'near-pulse', type: 'circle', source: 'stores', filter: unc, paint: { 'circle-radius': 16, 'circle-color': '#b8921f', 'circle-opacity': ['*', 0.3, fs('near')] } });
  map.addLayer({ id: 'stores', type: 'circle', source: 'stores', filter: unc, paint: {
    // 拡大率ごとの半径。射程内は大きく、秘境（★3）は少し大きく（zoomの式は一番外側に置く決まり）
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, ['case', ['==', fs('near'), 1], 7, ['==', ['get', 'r'], 3], 5, 4], 12, ['case', ['==', fs('near'), 1], 10, ['==', ['get', 'r'], 3], 7.5, 6.5], 15, ['case', ['==', fs('near'), 1], 13, ['==', ['get', 'r'], 3], 10, 9]],
    'circle-color': ['case', ['==', fs('stamp'), 1], '#c8381f', ['==', fs('near'), 1], '#c9a227', ['==', fs('st'), 2], '#a52d18', ['==', fs('st'), 1], '#d9412a', ['==', ['get', 'r'], 3], '#8f7a3a', ['==', ['get', 'u'], 1], '#9a8f80', '#b8b0a3'],
    'circle-opacity': ['case', ['==', fs('st'), 0], ['case', ['==', fs('near'), 1], 0.98, 0.72], 0.98],
    'circle-stroke-width': ['case', ['==', fs('near'), 1], 3, ['==', fs('feat'), 1], 2.5, ['==', fs('want'), 1], 2.5, ['any', ['==', ['get', 'custom'], 1], ['==', ['get', 'demo'], 1]], 1.5, 1],
    'circle-stroke-color': ['case', ['==', fs('near'), 1], '#b8921f', ['==', fs('feat'), 1], '#6d4fc3', ['==', fs('want'), 1], '#b8921f', ['any', ['==', ['get', 'custom'], 1], ['==', ['get', 'demo'], 1]], '#231f1c', '#ffffff'] } });
  map.addLayer({ id: 'stores-stamp', type: 'symbol', source: 'stores', filter: unc, layout: { 'icon-image': 'stamp-mark', 'icon-size': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 15, 0.8], 'icon-allow-overlap': true, 'icon-ignore-placement': true }, paint: { 'icon-opacity': fs('stamp') } });
  map.addLayer({ id: 'me-dot', type: 'circle', source: 'me', filter: ['==', ['get', 'k'], 'me'], paint: { 'circle-radius': 9, 'circle-color': ['case', ['==', ['get', 'fake'], 1], '#6d4fc3', '#2b6cb0'], 'circle-stroke-width': 3, 'circle-stroke-color': '#ffffff' } });
  map.on('click', 'stores', (e) => { const f = e.features && e.features[0]; if (f) { e.originalEvent._hit = true; handlers.onStoreClick && handlers.onStoreClick(f.properties.id); } });
  map.on('click', 'clusters', (e) => { const f = e.features && e.features[0]; if (!f) return; e.originalEvent._hit = true; map.getSource('stores').getClusterExpansionZoom(f.properties.cluster_id, (err, z) => { if (!err) map.easeTo({ center: f.geometry.coordinates, zoom: Math.min(z + 0.5, 16) }); }); });
  map.on('mouseenter', 'stores', () => { map.getCanvas().style.cursor = 'pointer'; }); map.on('mouseleave', 'stores', () => { map.getCanvas().style.cursor = ''; });
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
export function setTerritory(stores) { territoryGeo = { type: 'FeatureCollection', features: stores.map((s) => ({ type: 'Feature', geometry: { type: 'Polygon', coordinates: circlePoly(s.lo, s.la, TERRITORY_M) }, properties: {} })) }; if (M.ready) M.map.getSource('territory').setData(territoryGeo); }
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
